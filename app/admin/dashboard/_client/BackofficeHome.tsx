"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Inbox,
  Clock,
  Send,
  CheckCircle2,
  User2,
  ShieldHalf,
  ChevronRight,
} from "lucide-react";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type OfferRequestStatus =
  | "nouvelle"
  | "en_cours"
  | "en_attente_client"
  | "terminee";

interface OfferRequestRow {
  id: string;
  clientName: string;
  createdAtLabel: string;
  createdAtDate: Date | null;
  status: OfferRequestStatus;
  primeMensuelle: number | null;
  compagnie?: string;
  typeProduit: string; // ex: "3e pilier assurance"
}

// ----------------- Helpers dates -----------------

function toDate(value: any): Date | null {
  if (!value && value !== 0) return null;

  // Firestore Timestamp
  // @ts-ignore
  if (typeof value?.toDate === "function") {
    // @ts-ignore
    const d: Date = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function formatDateTime(date: Date | null): string {
  if (!date) return "";
  const dateStr = date.toLocaleDateString("fr-CH");
  const timeStr = date.toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} ${timeStr}`;
}

function getDateGroupLabel(date: Date, today: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round(
    (d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === -1) return "Hier";
  if (diffDays <= -2 && diffDays >= -7) return "Cette semaine";

  // Sinon, on affiche juste la date
  return d.toLocaleDateString("fr-CH");
}

function formatStatusLabel(status: OfferRequestStatus): string {
  switch (status) {
    case "nouvelle":
      return "Nouvelle demande";
    case "en_cours":
      return "En cours de traitement";
    case "en_attente_client":
      return "En attente du client";
    case "terminee":
      return "Terminée";
  }
}

function statusBadgeVariant(
  status: OfferRequestStatus
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "nouvelle":
      return "destructive"; // urgent
    case "en_cours":
      return "default";
    case "en_attente_client":
      return "secondary";
    case "terminee":
      return "outline";
  }
}

// ----------------- Hook Firestore -----------------

function useOfferRequestsFromFirestore() {
  const [requests, setRequests] = useState<OfferRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "offers_requests_3e"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows: OfferRequestRow[] = snapshot.docs.map((doc) => {
          const d: any = doc.data();

          const fromContact =
            d.contact &&
            [d.contact.firstName, d.contact.lastName]
              .filter(Boolean)
              .join(" ");

          const clientName: string =
            d.clientName || fromContact || "Client inconnu";

          const createdAtDate = toDate(d.createdAt);
          const createdAtLabel = formatDateTime(createdAtDate);

          const rawStatus = (d.status as OfferRequestStatus) ?? "nouvelle";
          const status: OfferRequestStatus = [
            "nouvelle",
            "en_cours",
            "en_attente_client",
            "terminee",
          ].includes(rawStatus)
            ? rawStatus
            : "nouvelle";

          const primeMensuelle =
            typeof d.premiumAmount === "number"
              ? d.premiumAmount
              : typeof d.primeMensuelle === "number"
              ? d.primeMensuelle
              : null;

          const compagnie =
            d.compagnie ?? d.company ?? d.insurer ?? d.assureur ?? undefined;

          const typeProduit =
            d.typeProduit ?? d.productType ?? d.type ?? "3e pilier";

          return {
            id: doc.id,
            clientName,
            createdAtLabel,
            createdAtDate,
            status,
            primeMensuelle,
            compagnie,
            typeProduit,
          };
        });

        setRequests(rows);
        setLoading(false);
      },
      (error) => {
        console.error("Erreur Firestore offers_requests_3e:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { requests, loading };
}

// ----------------- Composant principal -----------------

export default function BackofficeHome() {
  const { requests, loading } = useOfferRequestsFromFirestore();

  const stats = useMemo(() => {
    const total = requests.length;
    const nouvelles = requests.filter((r) => r.status === "nouvelle").length;
    const enCours = requests.filter((r) => r.status === "en_cours").length;
    const enAttente = requests.filter(
      (r) => r.status === "en_attente_client"
    ).length;
    const terminees = requests.filter((r) => r.status === "terminee").length;

    return { total, nouvelles, enCours, enAttente, terminees };
  }, [requests]);

  const grouped = useMemo(() => {
    if (requests.length === 0) return [];

    const today = new Date();
    const map = new Map<
      string,
      { label: string; rows: OfferRequestRow[]; sortDate: number; priority: number }
    >();

    for (const row of requests) {
      const date = row.createdAtDate;
      const safeDate = date ?? new Date(0);
      const groupLabel = date
        ? getDateGroupLabel(date, today)
        : "Date inconnue";

      const priority =
        groupLabel === "Aujourd'hui"
          ? 3
          : groupLabel === "Hier"
          ? 2
          : groupLabel === "Cette semaine"
          ? 1
          : 0;

      const existing = map.get(groupLabel);
      if (!existing) {
        map.set(groupLabel, {
          label: groupLabel,
          rows: [row],
          sortDate: safeDate.getTime(),
          priority,
        });
      } else {
        existing.rows.push(row);
        // on garde la plus récente comme référence pour le tri
        if (safeDate.getTime() > existing.sortDate) {
          existing.sortDate = safeDate.getTime();
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.sortDate - a.sortDate;
    });
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Titre + sous-titre */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Demandes d&apos;offres 3e pilier
        </h2>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble des demandes à traiter pour les clients MoneyLife.
        </p>
      </div>

      {/* Cartes de stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Nouvelles demandes
            </CardTitle>
            <Inbox className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "…" : stats.nouvelles}
            </div>
            <p className="text-xs text-muted-foreground">
              À prendre en charge en priorité
            </p>
          </CardContent>
        </Card>

        <Card className="border border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              En cours de traitement
            </CardTitle>
            <Clock className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "…" : stats.enCours}
            </div>
            <p className="text-xs text-muted-foreground">
              Dossiers sur lesquels vous travaillez
            </p>
          </CardContent>
        </Card>

        <Card className="border border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              En attente du client
            </CardTitle>
            <Send className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "…" : stats.enAttente}
            </div>
            <p className="text-xs text-muted-foreground">
              Offres envoyées, en attente de réponse
            </p>
          </CardContent>
        </Card>

        <Card className="border border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Dossiers terminés
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "…" : stats.terminees}
            </div>
            <p className="text-xs text-muted-foreground">
              Contrats signés ou dossiers clôturés
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Liste des demandes */}
      <Card className="border border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldHalf className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">Demandes récentes</CardTitle>
              <p className="text-xs text-muted-foreground">
                Les dernières demandes d&apos;offres 3e pilier à traiter.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {loading ? "Chargement…" : `${stats.total} demandes au total`}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading && requests.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Chargement des demandes…
            </div>
          ) : !loading && requests.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Aucune demande pour l&apos;instant.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Type de produit
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Compagnie / Prime
                  </TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Créé le
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => (
                  <React.Fragment key={group.label}>
                    {/* Ligne de groupe (Aujourd'hui / Hier / etc.) */}
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="bg-muted/60 text-[11px] font-semibold uppercase tracking-wide"
                      >
                        {group.label === "Aujourd'hui" ? (
                          <span className="inline-flex items-center gap-2">
                            <Badge
                              variant="default"
                              className="h-5 px-2 text-[10px] font-semibold"
                            >
                              Aujourd&apos;hui
                            </Badge>
                            <span className="text-muted-foreground">
                              Demandes reçues aujourd&apos;hui
                            </span>
                          </span>
                        ) : group.label === "Hier" ? (
                          <span>Hier</span>
                        ) : (
                          <span>{group.label}</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Lignes de données */}
                    {group.rows.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono text-xs md:text-sm">
                          {req.id}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <User2 className="h-4 w-4 text-muted-foreground" />
                            <span>{req.clientName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {req.typeProduit}
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {req.compagnie ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {req.compagnie}
                              </span>
                              {req.primeMensuelle != null && (
                                <span className="text-muted-foreground">
                                  {req.primeMensuelle.toLocaleString("fr-CH")}{" "}
                                  CHF/mois
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">
                              À compléter
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusBadgeVariant(req.status)}
                            className="text-[10px] md:text-xs"
                          >
                            {formatStatusLabel(req.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {req.createdAtLabel}
                        </TableCell>
                        <TableCell className="text-right">
                        <Link href={`/admin/dashboard/${req.id}`}>
                            <Button
                            variant="outline"
                            size="sm"
                            className="inline-flex items-center gap-1 text-xs"
                            >
                            Ouvrir
                            <ChevronRight className="h-3 w-3" />
                            </Button>
                        </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}