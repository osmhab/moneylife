"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  DocumentData,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { AppSidebar } from "../../../components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import RequireAuth from "../../../profil/_client/RequireAuth";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import {
  ArrowLeft,
  PiggyBank,
  Clock,
  FileText,
} from "lucide-react";

type OfferStatus = "nouvelle" | "en_cours" | "en_attente_client" | "terminee";

interface ClientOfferRequest {
  id: string;
  type: string | null;
  offerName?: string | null;
  createdAt: Date | null;
  status: OfferStatus;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  adminOffersStatus?: "saved" | "sent";
}

function toDate(value: any): Date | null {
  if (!value && value !== 0) return null;
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

function formatDateTime(date: Date | null) {
  if (!date) return "Date inconnue";
  return `${date.toLocaleDateString("fr-CH")} · ${date.toLocaleTimeString(
    "fr-CH",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

function formatMoney(value: number | null, suffix: string = "CHF") {
  if (value == null) return "Non renseigné";
  return `${value.toLocaleString("fr-CH")} ${suffix}`;
}

function statusBadgeVariant(
  status: OfferStatus
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "nouvelle":
      return "outline";
    case "en_cours":
      return "outline";
    case "en_attente_client":
      return "secondary";
    case "terminee":
      return "default";
    default:
      return "outline";
  }
}

function statusLabel(status: OfferStatus) {
  switch (status) {
    case "nouvelle":
      return "En préparation";
    case "en_cours":
      return "En cours de traitement";
    case "en_attente_client":
      return "En attente de réponse";
    case "terminee":
      return "Finalisée";
    default:
      return status;
  }
}

function adminStatusLabel(status?: "saved" | "sent") {
  if (status === "sent") return "Envoyée";
  if (status === "saved") return "Brouillon (non publiée)";
  return "En préparation";
}

export default function DashboardOffersPendingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ClientOfferRequest[]>([]);
  const [userReady, setUserReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login?from=/dashboard/offres/en-preparation");
        return;
      }
      setUserReady(true);
      try {
        const q = query(
          collection(db, "offers_requests_3e"),
          where("clientUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const items: ClientOfferRequest[] = [];

        snap.forEach((docSnap) => {
          const d = docSnap.data() as DocumentData;
          const createdAt = toDate(d.createdAt);

          items.push({
            id: docSnap.id,
            type: d.type ?? null,
            offerName:
              d.configSnapshot?.offerName ??
              d.offerName ??
              null,
            createdAt,
            status: (d.status as OfferStatus) ?? "nouvelle",
            premiumAmount:
              typeof d.premiumAmount === "number"
                ? d.premiumAmount
                : (d.premiumAmount as number) ?? null,
            premiumFrequency: d.premiumFrequency ?? null,
            adminOffersStatus: d.adminOffersStatus,
          });
        });

        setRequests(items);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const isLoading = loading || !userReady;

  const pendingRequests = requests.filter(
    (r) => r.adminOffersStatus !== "sent"
  );

  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Espace client
                </span>
                <h1 className="text-sm font-semibold leading-tight">
                  Mes offres – En attente
                </h1>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="p-4 md:p-6 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
                <div className="space-y-3">
                  <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
                  <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
                </div>
              </div>
            ) : pendingRequests.length === 0 ? (
              <Card className="border-dashed border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Aucune offre en préparation
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Vous n&apos;avez actuellement aucune demande en cours de
                    traitement chez MoneyLife.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/dashboard/offres")}
                    className="mt-2 inline-flex items-center gap-1 text-[11px]"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voir mes offres reçues
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-amber-200/70 bg-amber-50/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Offres en préparation
                  </CardTitle>
                  <p className="text-[11px] text-amber-900/80">
                    Ces demandes ont été envoyées. Il faut un certain pour les traiter.
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-md border bg-background overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead>Statut</TableHead>
                          <TableHead>Nom de l&apos;offre</TableHead>
                          <TableHead>Prime</TableHead>
                          <TableHead>Date de création</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.map((r) => (
                          <TableRow key={r.id} className="text-[11px]">
                            <TableCell>
                              <span className="inline-flex items-center gap-1">
                                <Badge
                                  variant={statusBadgeVariant(r.status)}
                                  className="text-[9px]"
                                >
                                  {statusLabel(r.status)}
                                </Badge>
                                {r.adminOffersStatus && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px]"
                                  >
                                    {adminStatusLabel(r.adminOffersStatus)}
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">
                              {r.offerName ||
                                `Configuration ${r.id.slice(0, 6)}…`}
                            </TableCell>
                            <TableCell>
                              {r.premiumAmount != null
                                ? formatMoney(
                                    r.premiumAmount,
                                    r.premiumFrequency === "monthly"
                                      ? "CHF/mois"
                                      : "CHF/an"
                                  )
                                : "Non renseignée"}
                            </TableCell>
                            <TableCell>
                              {formatDateTime(r.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}