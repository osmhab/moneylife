"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { Shield, RefreshCw, AlertTriangle, Activity, Flag, Dumbbell } from "lucide-react";
import { toast } from "sonner";

type HealthDoc = Record<string, any> & { id: string };

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
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

export default function AdminClientHealthClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HealthDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/health", window.location.origin);
      url.searchParams.set("uid", uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur API");

      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      setError(e?.message || "Erreur");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    fetchHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const latest = items[0] || null;

  const flags = useMemo(() => {
    const gf = latest?.globalFlags || {};
    return {
      hasChronicDisease: !!gf.hasChronicDisease,
      hasPsychHistory: !!gf.hasPsychHistory,
      hasSeriousAccident: !!gf.hasSeriousAccident,
      hasRiskSports: !!gf.hasRiskSports,
    };
  }, [latest]);

  const cases = useMemo(() => {
    const arr = latest?.cases;
    return Array.isArray(arr) ? arr : [];
  }, [latest]);

  const riskSports = useMemo(() => {
    const arr = latest?.riskSports;
    return Array.isArray(arr) ? arr : [];
  }, [latest]);

  const updatedAt = latest?.updatedAt;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-muted flex items-center justify-center">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">Santé (lecture seule)</div>
              <div className="text-xs text-muted-foreground">
                {loading ? "Chargement…" : latest ? `MAJ ${formatTs(updatedAt)}` : "Aucun questionnaire"}
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            fetchHealth();
            toast("Refresh", { description: "Santé mise à jour." });
          }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {!loading && !latest ? (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Aucun dossier santé
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ce client n’a pas encore rempli de questionnaire santé/lifestyle 3e pilier (ou aucun doc dans
            <span className="font-mono"> health_lifestyle_3epilier</span>).
          </CardContent>
        </Card>
      ) : null}

      {latest ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Résumé */}
          <Card className="rounded-2xl lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-4 w-4" />
                Résumé
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {flags.hasChronicDisease ? (
                  <Badge className="rounded-full">Maladie chronique</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    Pas de chronique
                  </Badge>
                )}

                {flags.hasPsychHistory ? (
                  <Badge className="rounded-full">Historique psy</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    Pas de psy
                  </Badge>
                )}

                {flags.hasSeriousAccident ? (
                  <Badge className="rounded-full">Accident sérieux</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    Pas d’accident sérieux
                  </Badge>
                )}

                {flags.hasRiskSports ? (
                  <Badge className="rounded-full">Sports à risque</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    Pas de sport à risque
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="text-xs text-muted-foreground">
                Doc ID: <span className="font-mono text-foreground">{latest.id}</span>
              </div>

              <div className="text-xs text-muted-foreground">
                Dernière MAJ: <span className="font-medium text-foreground">{formatTs(updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Cas médicaux */}
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Cas médicaux ({cases.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cases.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun cas médical enregistré.</div>
              ) : (
                <div className="space-y-3">
                  {cases.map((c: any) => (
                    <div key={c.id || Math.random()} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {c.title || "Cas"}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({c.category || "—"})
                          </span>
                        </div>
                        {c.facts?.ongoing ? (
                          <Badge className="rounded-full">En cours</Badge>
                        ) : (
                          <Badge variant="secondary" className="rounded-full">
                            Terminé
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Diagnostic</div>
                          <div className="font-medium">{c.facts?.diagnosis || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Période</div>
                          <div className="font-medium">
                            {(c.facts?.startDate || "—") +
                              " → " +
                              (c.facts?.ongoing ? "en cours" : c.facts?.endDate || "—")}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Traitements</div>
                          <div className="font-medium">{c.facts?.treatments || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Arrêt travail (mois)</div>
                          <div className="font-medium">
                            {Number.isFinite(c.facts?.workStopMonths) ? c.facts.workStopMonths : "—"}
                          </div>
                        </div>
                      </div>

                      {Array.isArray(c.rawNotes) && c.rawNotes.length > 0 ? (
                        <>
                          <Separator className="my-3" />
                          <div className="text-xs text-muted-foreground mb-1">Notes brutes</div>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {c.rawNotes.slice(0, 5).map((n: string, idx: number) => (
                              <li key={idx}>{n}</li>
                            ))}
                          </ul>
                          {c.rawNotes.length > 5 ? (
                            <div className="text-xs text-muted-foreground mt-2">
                              +{c.rawNotes.length - 5} autres notes…
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sports à risque */}
          <Card className="rounded-2xl lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="h-4 w-4" />
                Sports à risque ({riskSports.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskSports.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun sport à risque déclaré.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {riskSports.map((s: any) => (
                    <div key={s.id || Math.random()} className="rounded-xl border p-3">
                      <div className="font-medium">{s.label || "Sport"}</div>
                      <div className="text-xs text-muted-foreground">{s.category || "—"}</div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Niveau</div>
                          <div className="font-medium">{s.facts?.level || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Fréquence/an</div>
                          <div className="font-medium">
                            {Number.isFinite(s.facts?.frequencyPerYear) ? s.facts.frequencyPerYear : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Depuis</div>
                          <div className="font-medium">
                            {Number.isFinite(s.facts?.sinceYear) ? s.facts.sinceYear : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Accidents</div>
                          <div className="font-medium">{s.facts?.hasAccidentHistory ? "Oui" : "Non"}</div>
                        </div>
                      </div>

                      {Array.isArray(s.rawNotes) && s.rawNotes.length > 0 ? (
                        <>
                          <Separator className="my-3" />
                          <div className="text-xs text-muted-foreground mb-1">Notes</div>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {s.rawNotes.slice(0, 3).map((n: string, idx: number) => (
                              <li key={idx}>{n}</li>
                            ))}
                          </ul>
                          {s.rawNotes.length > 3 ? (
                            <div className="text-xs text-muted-foreground mt-2">
                              +{s.rawNotes.length - 3} autres notes…
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {items.length > 1 ? (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Historique ({items.length} docs)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Plusieurs documents trouvés. L’UI affiche le plus récent (index 0).
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}