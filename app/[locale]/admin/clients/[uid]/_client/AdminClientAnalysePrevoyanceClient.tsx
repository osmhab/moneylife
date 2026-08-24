"use client";

// Outil d'analyse prévoyance CONSEILLER (onglet CRM).
// Pré-remplit depuis la fiche client, laisse le conseiller ajuster, puis lance
// l'analyse SYNCHRONE (POST /api/admin/analyse) et affiche :
//  • une vue SIMPLE (score + cartes de risque, lisible d'un coup d'œil)
//  • un accordéon « Détail complet » (couches, 1er pilier) pour aller plus loin.

import * as React from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { ENUM_EtatCivil } from "@/lib/core/enums";
import { Calculator, Loader2, Plus, Trash2, AlertTriangle, ShieldCheck } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

const fmt = (n: any) =>
  Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");

type AnyObj = Record<string, any>;

export default function AdminClientAnalysePrevoyanceClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  const [client, setClient] = React.useState<AnyObj>({});
  const [plans, setPlans] = React.useState<AnyObj[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<AnyObj | null>(null);
  const [lppEstimation, setLppEstimation] = React.useState<AnyObj | null>(null);
  const [detailRentes, setDetailRentes] = React.useState<AnyObj | null>(null);
  const [lppMinimum, setLppMinimum] = React.useState(false);
  const [debutMode, setDebutMode] = React.useState<"annee" | "age">("annee");

  const setField = (k: string, v: any) => setClient((c) => ({ ...c, [k]: v }));

  // ── Chargement du contexte (données perso + plans) ────────────────────────
  React.useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/analyse/context?uid=${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Chargement impossible");
        setClient(data.client || {});
        setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // ── Lancement de l'analyse ────────────────────────────────────────────────
  async function runAnalyse() {
    setRunning(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/analyse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client, plans, lppMinimum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Analyse impossible");
      setAnalysis(data.analysis);
      setLppEstimation(data.lppEstimation || null);
      setDetailRentes(data.detailRentes || null);
    } catch (e: any) {
      setError(e?.message || "Erreur d'analyse");
      setAnalysis(null);
    } finally {
      setRunning(false);
    }
  }

  // ── Édition des enfants ───────────────────────────────────────────────────
  const enfants: AnyObj[] = Array.isArray(client.Enter_enfants) ? client.Enter_enfants : [];
  const setEnfants = (arr: AnyObj[]) => setField("Enter_enfants", arr);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du dossier…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 text-indigo-600" />
        <h2 className="text-lg font-semibold">Analyse prévoyance</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ───────────── FORMULAIRE ───────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Situation du client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom">
                <Input value={client.Enter_prenom || ""} onChange={(e) => setField("Enter_prenom", e.target.value)} />
              </Field>
              <Field label="Nom">
                <Input value={client.Enter_nom || ""} onChange={(e) => setField("Enter_nom", e.target.value)} />
              </Field>
            </div>

            <Field label="Date de naissance (JJ.MM.AAAA)">
              <Input
                placeholder="15.06.1985"
                value={client.Enter_dateNaissance || ""}
                onChange={(e) => setField("Enter_dateNaissance", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Salaire annuel (CHF)">
                <Input
                  type="number"
                  value={client.Enter_salaireAnnuel ?? ""}
                  onChange={(e) => setField("Enter_salaireAnnuel", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Taux d'occupation (%)">
                <Input
                  type="number"
                  value={client.Enter_tauxOccupation ?? 100}
                  onChange={(e) => setField("Enter_tauxOccupation", Number(e.target.value) || 0)}
                />
              </Field>
            </div>

            <Field label="État civil">
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={String(client.Enter_etatCivil ?? 0)}
                onChange={(e) => setField("Enter_etatCivil", Number(e.target.value))}
              >
                {Object.entries(ENUM_EtatCivil as AnyObj).map(([code, label]) => (
                  <option key={code} value={code}>
                    {String(label)}
                  </option>
                ))}
              </select>
            </Field>

            {/* Enfants */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Enfants (date de naissance)</Label>
              {enfants.map((enf, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="JJ.MM.AAAA"
                    value={enf.Enter_dateNaissance || ""}
                    onChange={(e) => {
                      const next = [...enfants];
                      next[i] = { ...next[i], Enter_dateNaissance: e.target.value };
                      setEnfants(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEnfants(enfants.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnfants([...enfants, { Enter_dateNaissance: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Ajouter un enfant
              </Button>
            </div>

            {/* LPP */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Affilié LPP (2e pilier)</span>
              <Switch
                checked={!!client.Enter_Affilie_LPP}
                onCheckedChange={(v) => setField("Enter_Affilie_LPP", v)}
              />
            </div>

            {client.Enter_Affilie_LPP && (
              <div className="space-y-3 rounded-md border p-3">
                {/* Choix : certificat réel vs estimation au minimum légal */}
                <div className="flex items-center justify-between">
                  <span className="text-sm">Estimer au minimum légal (pas de certificat)</span>
                  <Switch checked={lppMinimum} onCheckedChange={setLppMinimum} />
                </div>

                {lppMinimum ? (
                  <div className="space-y-3">
                    {/* Choix : renseigner par année OU par âge de début d'activité */}
                    <div className="inline-flex rounded-md border p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setDebutMode("annee");
                          setField("Enter_ageDebutActivite", 0);
                        }}
                        className={`px-3 py-1 rounded ${debutMode === "annee" ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
                      >
                        Année
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDebutMode("age");
                          setField("Enter_anneeDebutActivite", 0);
                        }}
                        className={`px-3 py-1 rounded ${debutMode === "age" ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
                      >
                        Âge
                      </button>
                    </div>

                    {debutMode === "annee" ? (
                      <Field label="Année de début d'activité">
                        <Input
                          type="number"
                          placeholder="2010"
                          value={client.Enter_anneeDebutActivite || ""}
                          onChange={(e) => setField("Enter_anneeDebutActivite", Number(e.target.value) || 0)}
                        />
                      </Field>
                    ) : (
                      <Field label="Âge au début d'activité">
                        <Input
                          type="number"
                          placeholder="22"
                          value={client.Enter_ageDebutActivite || ""}
                          onChange={(e) => setField("Enter_ageDebutActivite", Number(e.target.value) || 0)}
                        />
                      </Field>
                    )}

                    <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Estimation au strict minimum légal LPP (salaire supposé constant).
                      Les cotisations épargne LPP démarrent à 25 ans : un début avant 25 ans
                      (18, 19…) donne le même minimum. À remplacer par le certificat réel dès que possible.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Certificat LPP (montants annuels)
                    </div>
                    <MoneyField label="Avoir de vieillesse (actuel)" k="Enter_avoirVieillesseTotal" client={client} setField={setField} />
                    <MoneyField label="Capital projeté à 65 ans" k="Enter_lppCapitalProjete65" client={client} setField={setField} />
                    <MoneyField label="Rente vieillesse à 65" k="Enter_rentevieillesseLPP65" client={client} setField={setField} />
                    <MoneyField label="Rente invalidité" k="Enter_renteInvaliditeMaladie" client={client} setField={setField} />
                    <MoneyField label="Rente conjoint" k="Enter_renteConjointLPP" client={client} setField={setField} />
                    <MoneyField label="Rente orphelin" k="Enter_renteOrphelinLPP" client={client} setField={setField} />
                  </div>
                )}
              </div>
            )}

            <Button onClick={runAnalyse} disabled={running} className="w-full">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
              Lancer l'analyse
            </Button>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>

        {/* ───────────── RÉSULTAT ───────────── */}
        <div className="space-y-4">
          {!analysis ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground text-sm">
                Renseignez la situation puis lancez l'analyse pour voir les lacunes de prévoyance.
              </CardContent>
            </Card>
          ) : (
            <ResultView analysis={analysis} lppEstimation={lppEstimation} detailRentes={detailRentes} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyField({
  label,
  k,
  client,
  setField,
}: {
  label: string;
  k: string;
  client: AnyObj;
  setField: (k: string, v: any) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={client[k] ?? ""}
        onChange={(e) => setField(k, Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function ResultView({
  analysis,
  lppEstimation,
  detailRentes,
}: {
  analysis: AnyObj;
  lppEstimation?: AnyObj | null;
  detailRentes?: AnyObj | null;
}) {
  const score = Math.round(Number(analysis.totalScore) || 0);
  const scoreColor = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600";

  const cards = [
    { key: "retraite", label: "Retraite", card: analysis.retraite, unit: "/mois" },
    { key: "invaliditeMaladie", label: "Invalidité (maladie)", card: analysis.invaliditeMaladie, unit: "/mois" },
    { key: "invaliditeAccident", label: "Invalidité (accident)", card: analysis.invaliditeAccident, unit: "/mois" },
    { key: "deces", label: "Décès", card: analysis.deces, unit: "" },
  ].filter((c) => c.card);

  return (
    <div className="space-y-4">
      {/* Score global */}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <div className="text-sm text-muted-foreground">Score de prévoyance global</div>
            <div className={`text-4xl font-bold ${scoreColor}`}>{score}<span className="text-lg text-muted-foreground">/100</span></div>
          </div>
          <ShieldCheck className={`h-10 w-10 ${scoreColor}`} />
        </CardContent>
      </Card>

      {/* Estimation LPP minimum légal (si utilisée) — transparence sur les hypothèses */}
      {lppEstimation?.assujetti && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-sm text-amber-800">
                2e pilier estimé au minimum légal (pas le certificat réel)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <EstLine label="Salaire coordonné" v={lppEstimation.salaireCoordonne} />
            <EstLine label="Avoir actuel" v={lppEstimation.avoirActuel} />
            <EstLine label="Capital à 65" v={lppEstimation.capitalProjete65} />
            <EstLine label="Rente vieillesse/an" v={lppEstimation.renteVieillesse65} />
            <EstLine label="Rente invalidité/an" v={lppEstimation.renteInvalidite} />
            <EstLine label="Rente conjoint/an" v={lppEstimation.renteConjoint} />
          </CardContent>
        </Card>
      )}

      {/* Cartes de risque — vue simple */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ key, label, card, unit }) => {
          const besoin = Number(card.besoin) || 0;
          const couv = Number(card.couverture) || 0;
          const lacune = Number(card.lacune) || 0;
          const pct = besoin > 0 ? Math.min(100, Math.round((couv / besoin) * 100)) : 0;
          const ok = lacune < Math.max(1, besoin * 0.02);
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <Badge variant={ok ? "default" : "destructive"} className={ok ? "bg-emerald-600" : ""}>
                    {ok ? "Couvert" : "Lacune"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={pct} className="h-2" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Besoin" value={fmt(besoin) + unit} />
                  <Metric label="Couverture" value={fmt(couv) + unit} />
                  <Metric label="Lacune" value={fmt(lacune) + unit} danger={!ok} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Accordéon — détail complet */}
      <Accordion type="single" collapsible>
        <AccordionItem value="detail">
          <AccordionTrigger className="text-sm">Détail complet</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-8 pt-2">
              {detailRentes ? (
                <>
                  <RenteBreakdown
                    title="En cas d'invalidité — rentes perçues (par mois)"
                    scenarios={detailRentes.invalidite}
                    detail={detailRentes}
                    avsLabel="AI"
                    adultLabel="Vous"
                    accent="#f97316"
                  />
                  <RenteBreakdown
                    title="En cas de décès — rentes des survivants (par mois)"
                    scenarios={detailRentes.deces}
                    detail={detailRentes}
                    avsLabel="AVS"
                    adultLabel="Conjoint (veuf/veuve)"
                    accent="#f43f5e"
                  />
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Détail des rentes indisponible.</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// Détail des rentes d'un risque (invalidité ou décès) : tableau par pilier
// (AVS/AI + LPP) avec rente adulte + une ligne PAR ENFANT (décochable), total qui
// se recalcule, et un graphique temporel où le total baisse quand chaque enfant
// sort de charge (18 ans) jusqu'à la retraite.
function RenteBreakdown({
  title,
  scenarios,
  detail,
  avsLabel,
  adultLabel,
  accent,
}: {
  title: string;
  scenarios: AnyObj[];
  detail: AnyObj;
  avsLabel: string;
  adultLabel: string;
  accent: string;
}) {
  const maxEnfants: number = detail.maxEnfants || 0;
  const childrenEndYears: number[] = detail.childrenEndYears || [];
  const currentYear: number = detail.currentYear;
  const retirementYear: number = detail.retirementYear;

  // Cases décochées (what-if manuel).
  const [unchecked, setUnchecked] = React.useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setUnchecked((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const checkedCount = Math.max(0, maxEnfants - unchecked.size);
  const sc = scenarios[checkedCount] || scenarios[0] || { adulte: { avs: 0, lpp: 0 }, parEnfant: { avs: 0, lpp: 0 }, total: 0 };
  const avsTotal = sc.adulte.avs + checkedCount * sc.parEnfant.avs;
  const lppTotal = sc.adulte.lpp + checkedCount * sc.parEnfant.lpp;

  // Données du graphique : total mensuel par année (baisse quand un enfant sort de charge).
  const nbEligibleAt = (year: number) =>
    Math.min(maxEnfants, childrenEndYears.filter((y) => y > year).length);
  const chartData: AnyObj[] = [];
  for (let y = currentYear; y <= retirementYear; y++) {
    const s = scenarios[nbEligibleAt(y)] || scenarios[0];
    chartData.push({ year: y, total: s?.total || 0 });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 text-sm font-semibold" style={{ color: accent }}>{title}</div>

      {/* Tableau par pilier */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-medium pb-1"></th>
            <th className="text-right font-medium pb-1">{avsLabel}</th>
            <th className="text-right font-medium pb-1">LPP</th>
            <th className="text-right font-medium pb-1">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-1.5">{adultLabel}</td>
            <td className="py-1.5 text-right">{fmt(sc.adulte.avs)}</td>
            <td className="py-1.5 text-right">{fmt(sc.adulte.lpp)}</td>
            <td className="py-1.5 text-right font-medium">{fmt(sc.adulte.avs + sc.adulte.lpp)}</td>
          </tr>
          {Array.from({ length: maxEnfants }).map((_, i) => {
            const on = !unchecked.has(i);
            return (
              <tr key={i} className={`border-t ${on ? "" : "opacity-40"}`}>
                <td className="py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={on} onCheckedChange={() => toggle(i)} />
                    Enfant {i + 1}
                  </label>
                </td>
                <td className="py-1.5 text-right">{on ? fmt(sc.parEnfant.avs) : "—"}</td>
                <td className="py-1.5 text-right">{on ? fmt(sc.parEnfant.lpp) : "—"}</td>
                <td className="py-1.5 text-right font-medium">
                  {on ? fmt(sc.parEnfant.avs + sc.parEnfant.lpp) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 font-semibold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right">{fmt(avsTotal)}</td>
            <td className="py-1.5 text-right">{fmt(lppTotal)}</td>
            <td className="py-1.5 text-right" style={{ color: accent }}>{fmt(avsTotal + lppTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Graphique temporel : le total baisse à mesure que les enfants sortent de charge (18 ans) */}
      {maxEnfants > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] text-muted-foreground">
            Évolution du total jusqu'à la retraite (les enfants sortent de charge à 18 ans)
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id={`g-${accent}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => fmt(v)} />
                <Tooltip
                  formatter={(v: any) => [fmt(v) + " /mois", "Total"]}
                  labelFormatter={(l) => `Année ${l}`}
                />
                <Area type="stepAfter" dataKey="total" stroke={accent} strokeWidth={2} fill={`url(#g-${accent})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function EstLine({ label, v }: { label: string; v: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-amber-700/80">{label}</span>
      <span className="font-medium text-amber-900">{fmt(v)}</span>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
