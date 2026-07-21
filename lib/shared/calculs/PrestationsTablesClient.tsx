// app/lib/calculs/PrestationsTablesClient.tsx
"use client";

import * as React from "react";

/** ========= Hypothèses =========
 * - Besoin annuel = salaireAnnuel (100%)
 * - On affiche 3 cas: Invalidité, Décès, Retraite
 * - On attend les prestations "mensuelles" en entrée (ai/lpp/laa), on calcule l'annuel (x12)
 * - Aucune dépendance à d'autres composants, juste Tailwind via classes utilitaires
 */

export type Breakdown = {
  aiMonthly?: number;            // AVS/AI pour invalidité/décès/retraite (selon contexte)
  lppMonthly?: number;           // LPP (invalidité/décès/retraite)
  laaMonthly?: number;           // LAA (accident) si applicable
  otherMonthly?: number;         // Joker (ex: 3a rente, collectif, etc.)
  childrenMonthlyTotal?: number; // somme mensuelle des rentes pour enfants (toutes sources)
};

export type Scenario = {
  monthly: Breakdown;            // Prestations mensuelles (par composante)
  label?: string;                // ex: "Invalidité (maladie/accident)"
  /** Si true, la ligne "Enfants (total)" est affichée mais EXCLUE des totaux. */
  excludeChildrenFromTotal?: boolean;
};

export type PrestationsTablesProps = {
  salaireAnnuel: number; // Besoin annuel = 100% de ce salaire
  invalidite?: Scenario;
  deces?: Scenario;
  retraite?: Scenario;
  className?: string;
};

/* ====== Helpers ====== */
function chf(n?: number) {
  if (n == null || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(n);
}
const toYear = (m?: number) => (m ?? 0) * 12;

function sumMonthly(b?: Breakdown, excludeChildren?: boolean) {
  if (!b) return 0;
  return (
    (b.aiMonthly ?? 0) +
    (b.lppMonthly ?? 0) +
    (b.laaMonthly ?? 0) +
    (b.otherMonthly ?? 0) +
    (excludeChildren ? 0 : (b.childrenMonthlyTotal ?? 0))
  );
}

/* ====== Vue tableau réutilisable ====== */
function ScenarioTable({
  title,
  needAnnual,
  data,
}: {
  title: string;
  needAnnual: number;
  data?: Scenario;
}) {
  const aiA = toYear(data?.monthly.aiMonthly);
  const lppA = toYear(data?.monthly.lppMonthly);
  const laaA = toYear(data?.monthly.laaMonthly);
  const otherA = toYear(data?.monthly.otherMonthly);
  const childrenA = toYear(data?.monthly.childrenMonthlyTotal);

  const totalMonthly = sumMonthly(data?.monthly, data?.excludeChildrenFromTotal);
  const totalAnnual = toYear(totalMonthly);
  const gapAnnual = Math.max(0, needAnnual - totalAnnual);
  const surplusAnnual = Math.max(0, totalAnnual - needAnnual);

  return (
    <div className="rounded-xl border bg-white/60 dark:bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">
          Besoin annuel (100%) : <span className="font-medium">{chf(needAnnual)} CHF/an</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Prestation</th>
              <th className="py-2 pr-3">Mensuel</th>
              <th className="py-2 pr-3">Annuel</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-3">AVS/AI</td>
              <td className="py-2 pr-3">{chf(data?.monthly.aiMonthly)} CHF/mois</td>
              <td className="py-2 pr-3">{chf(aiA)} CHF/an</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">LPP</td>
              <td className="py-2 pr-3">{chf(data?.monthly.lppMonthly)} CHF/mois</td>
              <td className="py-2 pr-3">{chf(lppA)} CHF/an</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">LAA (accident)</td>
              <td className="py-2 pr-3">{chf(data?.monthly.laaMonthly)} CHF/mois</td>
              <td className="py-2 pr-3">{chf(laaA)} CHF/an</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">Enfants (total)</td>
              <td className="py-2 pr-3">{chf(data?.monthly.childrenMonthlyTotal)} CHF/mois</td>
              <td className="py-2 pr-3">{chf(childrenA)} CHF/an</td>
            </tr>
            <tr>
              <td className="py-2 pr-3">Autres</td>
              <td className="py-2 pr-3">{chf(data?.monthly.otherMonthly)} CHF/mois</td>
              <td className="py-2 pr-3">{chf(otherA)} CHF/an</td>
            </tr>
            <tr className="border-t">
              <td className="py-2 pr-3 font-medium">Total prestations</td>
              <td className="py-2 pr-3 font-medium">{chf(totalMonthly)} CHF/mois</td>
              <td className="py-2 pr-3 font-medium">{chf(totalAnnual)} CHF/an</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Résumé lacune / surplus */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Lacune (si &gt; 0)</div>
          <div className="text-lg font-semibold text-amber-700 dark:text-amber-300">
            {chf(gapAnnual)} CHF/an
          </div>
        </div>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Surplus (si &gt; 0)</div>
          <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
            {chf(surplusAnnual)} CHF/an
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====== Composant principal ====== */
export default function PrestationsTablesClient({
  salaireAnnuel,
  invalidite,
  deces,
  retraite,
  className,
}: PrestationsTablesProps) {
  const needAnnual = Math.max(0, Math.round(salaireAnnuel || 0));

  return (
    <div className={className ?? "space-y-6"}>
      {invalidite && (
        <ScenarioTable
          title={invalidite.label ?? "Invalidité"}
          needAnnual={needAnnual}
          data={invalidite}
        />
      )}

      {deces && (
        <ScenarioTable
          title={deces.label ?? "Décès"}
          needAnnual={needAnnual}
          data={deces}
        />
      )}

      {retraite && (
        <ScenarioTable
          title={retraite.label ?? "Retraite"}
          needAnnual={needAnnual}
          data={retraite}
        />
      )}
    </div>
  );
}