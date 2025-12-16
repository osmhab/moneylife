// app/dashboard/configs/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";

import { AppSidebar } from "../../components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import RequireAuth from "../../profil/_client/RequireAuth";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  ArrowLeft,
  Layers,
  Clock,
  PiggyBank,
  ShieldHalf,
} from "lucide-react";

type OfferStatus = "nouvelle" | "en_cours" | "en_attente_client" | "terminee";

interface ClientOfferRequest {
  id: string;
  type: string | null;
  createdAt: Date | null;
  status: OfferStatus;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  totalRiskPremium: number | null;
  netSavingsPremium: number | null;
  adminOffersStatus?: "saved" | "sent";
}

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

function formatDate(date: Date | null) {
  if (!date) return "Date inconnue";
  return date.toLocaleDateString("fr-CH");
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

function formatType(type: string | null) {
  if (type === "3a") return "3e pilier lié (3a)";
  if (type === "3b") return "3e pilier libre (3b)";
  return type || "Type non renseigné";
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
      return "En attente du client";
    case "terminee":
      return "Terminée";
    default:
      return status;
  }
}

function adminStatusLabel(status?: "saved" | "sent") {
  if (status === "sent") return "Envoyée au client";
  if (status === "saved") return "Brouillon interne";
  return "Non envoyée";
}

export default function DashboardConfigsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ClientOfferRequest[]>([]);
  const [userReady, setUserReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login?from=/dashboard/configs");
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
            createdAt,
            status: (d.status as OfferStatus) ?? "nouvelle",
            premiumAmount:
              typeof d.premiumAmount === "number"
                ? d.premiumAmount
                : (d.premiumAmount as number) ?? null,
            premiumFrequency: d.premiumFrequency ?? null,
            totalRiskPremium:
              typeof d.totalRiskPremium === "number"
                ? d.totalRiskPremium
                : (d.totalRiskPremium as number) ?? null,
            netSavingsPremium:
              typeof d.netSavingsPremium === "number"
                ? d.netSavingsPremium
                : (d.netSavingsPremium as number) ?? null,
            adminOffersStatus: d.adminOffersStatus,
          });
        });

        setRequests(items);
        if (items.length > 0) {
          setSelectedId((prev) => prev ?? items[0].id);
        }
      } catch (e) {
        console.error("[Configs] Erreur chargement configurations:", e);
        toast.error("Impossible de charger vos configurations pour le moment.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const isLoading = loading || !userReady;

  const groupedByYear = useMemo(() => {
    const map = new Map<number, ClientOfferRequest[]>();
    for (const req of requests) {
      const year = req.createdAt ? req.createdAt.getFullYear() : 0;
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(req);
    }
    // tri des années décroissant
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => [year, list] as [number, ClientOfferRequest[]]);
  }, [requests]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Espace client
                </span>
                <h1 className="text-sm font-semibold leading-tight">
                  Mes configurations 3e pilier
                </h1>
              </div>
            </div>
          </header>

          {/* Contenu */}
          <main className="p-4 md:p-6">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
                <div className="grid gap-4 md:grid-cols-[260px,1fr]">
                  <div className="h-64 rounded-md bg-muted animate-pulse" />
                  <div className="h-64 rounded-md bg-muted animate-pulse" />
                </div>
              </div>
            ) : requests.length === 0 ? (
              <Card className="border-dashed border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    Aucune configuration enregistrée
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Dès que vous aurez créé une configuration 3e pilier dans le
                    configurateur, elle apparaîtra ici.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/configurateur/3epilier")}
                    className="mt-2 inline-flex items-center gap-1 text-[11px]"
                  >
                    <Layers className="h-3 w-3" />
                    Aller au configurateur 3e pilier
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-[260px,1fr]">
                {/* Sidebar arborescente des configs */}
                <aside className="rounded-lg border bg-muted/30 p-2 text-xs">
                  <div className="flex items-center gap-2 px-1 pb-2 border-b border-muted-foreground/10">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium">
                        Mes configurations
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {requests.length} configuration
                        {requests.length > 1 ? "s" : ""} enregistrée
                        {requests.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-3">
                    {groupedByYear.map(([year, list]) => (
                      <div key={year} className="space-y-1">
                        <p className="px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {year === 0 ? "Sans date" : year}
                        </p>
                        <div className="space-y-1 pl-1">
                          {list.map((req) => {
                            const isSelected = req.id === selectedId;
                            return (
                              <button
                                key={req.id}
                                type="button"
                                onClick={() => setSelectedId(req.id)}
                                className={cn(
                                  "w-full rounded-md px-2 py-1.5 text-left text-[11px] transition flex flex-col gap-0.5",
                                  isSelected
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-background hover:bg-muted"
                                )}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="truncate font-medium">
                                    {formatType(req.type)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 text-[10px] opacity-90">
                                  {req.createdAt && (
                                    <span>
                                      {formatDate(req.createdAt)}
                                    </span>
                                  )}
                                  {req.premiumAmount != null && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        {req.premiumFrequency === "monthly"
                                          ? `${req.premiumAmount.toLocaleString(
                                              "fr-CH"
                                            )} CHF/mois`
                                          : `${req.premiumAmount.toLocaleString(
                                              "fr-CH"
                                            )} CHF/an`}
                                      </span>
                                    </>
                                  )}
                                  {req.adminOffersStatus && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        {adminStatusLabel(
                                          req.adminOffersStatus
                                        )}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>

                {/* Détail de la config sélectionnée */}
                <section className="space-y-3">
                  {selected ? (
                    <Card className="border border-primary/10">
                      <CardHeader className="space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
                            <Layers className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                              Configuration {selected.id.slice(0, 8)}…
                              <Badge
                                variant={statusBadgeVariant(selected.status)}
                                className="text-[9px]"
                              >
                                {statusLabel(selected.status)}
                              </Badge>
                              {selected.adminOffersStatus && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px]"
                                >
                                  {adminStatusLabel(
                                    selected.adminOffersStatus
                                  )}
                                </Badge>
                              )}
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{formatType(selected.type)}</span>
                              {selected.createdAt && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDateTime(selected.createdAt)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs md:text-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-md bg-muted/40 p-2">
                            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                              <PiggyBank className="h-3 w-3" />
                              Prime souhaitée
                            </p>
                            <p className="text-sm font-semibold">
                              {selected.premiumAmount != null
                                ? selected.premiumFrequency === "monthly"
                                  ? `${selected.premiumAmount.toLocaleString(
                                      "fr-CH"
                                    )} CHF/mois`
                                  : `${selected.premiumAmount.toLocaleString(
                                      "fr-CH"
                                    )} CHF/an`
                                : "Non renseignée"}
                            </p>
                          </div>

                          <div className="rounded-md bg-muted/40 p-2">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Primes de risque max. (estimation)
                            </p>
                            <p className="text-sm font-semibold">
                              {formatMoney(
                                selected.totalRiskPremium,
                                "CHF/an"
                              )}
                            </p>
                          </div>

                          <div className="rounded-md bg-muted/40 p-2">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Part épargne nette
                            </p>
                            <p className="text-sm font-semibold">
                              {formatMoney(
                                selected.netSavingsPremium,
                                "CHF/an"
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="pt-1 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-[11px] inline-flex items-center gap-1"
                            onClick={() => router.push("/dashboard/offres")}
                          >
                            Voir les offres liées
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-[11px] inline-flex items-center gap-1"
                            onClick={() =>
                              router.push("/configurateur/3epilier")
                            }
                          >
                            Modifier ma configuration
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="py-6 text-xs text-muted-foreground">
                        Sélectionnez une configuration dans la colonne de gauche
                        pour voir le détail.
                      </CardContent>
                    </Card>
                  )}
                </section>
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}