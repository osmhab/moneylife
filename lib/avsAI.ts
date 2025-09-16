// lib/avsAI.ts
import { db } from '@/lib/firebaseAdmin';

export type AvsAiRow = {
  income: number;
  oldAgeInvalidity: number; // base vieillesse/invalidité (mensuel)
  widowWidower: number;     // veuf/veuve (mensuel)
  orphan60: number;         // orphelin 60% (mensuel)
  child40: number;          // enfant 40% (mensuel)
};

export type AvsAiScale = {
  year: number;
  scale: '44';
  currency: 'CHF' | string;
  rows: AvsAiRow[];
};

export type CareerCoeff = 1 | 0.75 | 0.5 | 0.25;

export type AvsAiResult = {
  baseIncomeMatched: number;
  coeff: CareerCoeff;
  oldAge65: number;     // vieillesse 65 (mensuel)
  invalidity: number;   // invalidité (mensuel)
  widowWidower: number; // veuf/veuve (mensuel)
  orphan: number;       // orphelin (60%, mensuel)
  child: number;        // par enfant (40%, mensuel)
};

function nearestRow(rows: AvsAiRow[], annualIncome: number) {
  let best = rows[0], diff = Math.abs(rows[0].income - annualIncome);
  for (const r of rows) {
    const d = Math.abs(r.income - annualIncome);
    if (d < diff) { best = r; diff = d; }
  }
  return best;
}
const applyCoeff = (x: number, c: CareerCoeff) => Math.round(x * c);

export async function computeAvsAiMonthly(
  annualIncome: number,
  { year = 2025, coeffCarriere = 1 as CareerCoeff }: { year?: number; coeffCarriere?: CareerCoeff }
): Promise<AvsAiResult> {
  const snap = await db.collection('regs_avs_ai').doc(String(year)).get();
  if (!snap.exists) throw new Error(`regs_avs_ai/${year} absent`);
  const scale = snap.data() as AvsAiScale;
  if (!scale?.rows?.length) throw new Error('Barème AVS/AI vide');

  const row = nearestRow(scale.rows, annualIncome);

  return {
    baseIncomeMatched: row.income,
    coeff: coeffCarriere,
    oldAge65:     applyCoeff(row.oldAgeInvalidity, coeffCarriere),
    invalidity:   applyCoeff(row.oldAgeInvalidity, coeffCarriere),
    widowWidower: applyCoeff(row.widowWidower,  coeffCarriere),
    orphan:       applyCoeff(row.orphan60,      coeffCarriere),
    child:        applyCoeff(row.child40,       coeffCarriere),
  };
}
