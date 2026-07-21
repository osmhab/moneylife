"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ConfigRow = {
  id: string;
  uid?: string;

  type?: string; // "3a" | "3b"
  status?: string; // "draft" | "locked" | "offers_requested"
  premiumAmount?: number;
  premiumFrequency?: string; // monthly/yearly
  startDate?: string; // YYYY-MM-DD
  endAge?: number;

  deathFixed?: { enabled?: boolean; capital?: number };
  deathDecreasing?: { enabled?: boolean; capitalInitial?: number; durationYears?: number };
  disabilityAnnuities?: Array<{ enabled?: boolean; annualRente?: number; startAge?: number; waitingPeriod?: number }>;
  premiumWaiver?: { enabled?: boolean; waitingPeriod?: number };

  savings?: {
    withFunds?: boolean;
    investmentProfile?: string;
    expectedReturnPct?: number;
    transferAmount3a?: number;
  };

  createdAt?: number;
  updatedAt?: number;
};

type StatusFilter = "all" | "draft" | "locked" | "offers_requested";

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

function formatMoneyCHF(n?: number) {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  try {
    return v.toLocaleString("fr-CH") + " CHF";
  } catch {
    return String(v) + " CHF";
  }
}

function formatTs(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return "—";
  try {
    return new Date(ts).toLocaleString("fr-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function statusBadge(status?: string) {
  if (status === "offers_requested") return { label: "Offres demandées", variant: "default" as const };
  if (status === "locked") return { label: "Verrouillé", variant: "secondary" as const };
  if (status === "draft") return { label: "Brouillon", variant: "secondary" as const };
  return { label: status || "—", variant: "secondary" as const };
}

export default function AdminClientConfig3aClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ConfigRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/config-3a", window.location.origin);
      url.searchParams.set("uid", uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur API");

      setItems(Array.isArray(j?.items) ? (j.items as ConfigRow[]) : []);
    } catch (e: any) {
      setError(e?.message || "Erreur");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const filteredItems = useMemo(() => {
    return items.filter((c) => (statusFilter === "all" ? true : c.status === statusFilter));
  }, [items, statusFilter]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const n3a = filteredItems.filter((x) => x.type === "3a").length;
    const n3b = filteredItems.filter((x) => x.type === "3b").length;
    return { total, n3a, n3b };
  }, [filteredItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-muted flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">Config 3a / 3b</div>
              <div className="text-xs text-muted-foreground">
                {loading ? "Chargement…" : `${stats.total} config(s) • 3a: ${stats.n3a} • 3b: ${stats.n3b}`}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[210px] rounded-xl">
              <SelectValue placeholder="Filtrer statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="locked">Verrouillés</SelectItem>
              <SelectItem value="offers_requested">Offres demandées</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="secondary"
            onClick={() => {
              fetchConfigs();
              toast("Refresh", { description: "Configurations mises à jour." });
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {!loading && filteredItems.length === 0 ? (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Aucune configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Aucun résultat pour ce filtre.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredItems.map((c) => {
          const sb = statusBadge(c.status);
          const hasRisk =
            !!c.deathFixed?.enabled ||
            !!c.deathDecreasing?.enabled ||
            !!(Array.isArray(c.disabilityAnnuities) && c.disabilityAnnuities.some((x) => x?.enabled)) ||
            !!c.premiumWaiver?.enabled;

          const savings = c.savings ?? {};

          return (
            <Card key={c.id} className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {c.type === "3a" ? "3a" : c.type === "3b" ? "3b" : "Config"}{" "}
                      <span className="text-xs text-muted-foreground font-mono">#{c.id}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      MAJ {formatTs(c.updatedAt || c.createdAt)}
                    </div>
                  </div>
                  <Badge variant={sb.variant} className="rounded-full">
                    {sb.label}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Prime</div>
                    <div className="font-medium">
                      {formatMoneyCHF(c.premiumAmount)}{" "}
                      <span className="text-xs text-muted-foreground">/ {c.premiumFrequency || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Début</div>
                    <div className="font-medium">{c.startDate || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Fin (âge)</div>
                    <div className="font-medium">{Number.isFinite(Number(c.endAge)) ? c.endAge : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Risques</div>
                    <div className="font-medium">{hasRisk ? "Oui" : "Non"}</div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Décès fixe</div>
                    <div className="font-medium">
                      {c.deathFixed?.enabled ? formatMoneyCHF(c.deathFixed?.capital) : "Non"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Décès décroissant</div>
                    <div className="font-medium">
                      {c.deathDecreasing?.enabled
                        ? `${formatMoneyCHF(c.deathDecreasing?.capitalInitial)} • ${
                            Number.isFinite(Number(c.deathDecreasing?.durationYears)) ? c.deathDecreasing?.durationYears : "—"
                          } ans`
                        : "Non"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Rente invalidité</div>
                    <div className="font-medium">
                      {Array.isArray(c.disabilityAnnuities) && c.disabilityAnnuities.some((x) => x?.enabled)
                        ? `${c.disabilityAnnuities.filter((x) => x?.enabled).length} rente(s)`
                        : "Non"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Libération primes</div>
                    <div className="font-medium">{c.premiumWaiver?.enabled ? "Oui" : "Non"}</div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Épargne / fonds</div>
                    <div className="font-medium">
                      {savings.withFunds ? `Fonds • ${savings.investmentProfile || "—"}` : "Compte (sans fonds)"}
                    </div>
                    {Number.isFinite(Number(savings.expectedReturnPct)) ? (
                      <div className="text-xs text-muted-foreground">Rendement projeté: {savings.expectedReturnPct}%</div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Transfert 3a</div>
                    <div className="font-medium">
                      {Number.isFinite(Number(savings.transferAmount3a))
                        ? formatMoneyCHF(savings.transferAmount3a)
                        : "—"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        Note: cette page lit la collection <span className="font-mono">configs</span> filtrée par{" "}
        <span className="font-mono">uid</span>. Si tes configs 3e pilier sont stockées ailleurs (ex:{" "}
        <span className="font-mono">clients/{uid}/configs</span>), dis-le et on adaptera l’API.
      </div>
    </div>
  );
}