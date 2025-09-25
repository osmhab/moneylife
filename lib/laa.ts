// lib/laa.ts
import { db } from '@/lib/firebaseAdmin';

export type RegsLaa = {
  year: number; currency: string;
  laa: {
    insured_earnings_max: number;
    daily_allowance: { pct_of_insured_earnings: number; start_from_day: number; };
    disability: { pct_at_full_invalidity: number; min_degree_for_pension: number; };
    survivors: {
      spouse_pct: number; orphan_pct: number; double_orphan_pct: number;
      family_cap_pct: number; with_avs_ai_overall_cap_pct: number;
    };
    coverage_rules: { non_occupational_covered_if_weekly_hours_gte: number; };
    coordination: { invalidity_ai_laa_cap_pct: number; };
  };
};

const round = (x: number) => Math.round(x);
const pct = (x: number, p: number) => (x * p) / 100;

export async function loadRegsLaa(year = 2025): Promise<RegsLaa> {
  const snap = await db.collection('regs_laa').doc(String(year)).get();
  if (!snap.exists) throw new Error(`regs_laa/${year} introuvable`);
  return snap.data() as RegsLaa;
}

export function insuredEarnings(annualSalaryAvs: number, regs: RegsLaa) {
  return Math.min(annualSalaryAvs, regs.laa.insured_earnings_max);
}

export type AccidentInvalidityInput = {
  annualSalaryAvs: number; degreeInvalidityPct: number; // 0..100
  aiMonthly?: number; // rente AI mensuelle effective (si connue)
};
export function computeAccidentInvalidityMonthly(inp: AccidentInvalidityInput, regs: RegsLaa) {
  const base = insuredEarnings(inp.annualSalaryAvs, regs);
  const nominalAnnual = pct(base, regs.laa.disability.pct_at_full_invalidity) * (inp.degreeInvalidityPct / 100);
  const aiAnnual = (inp.aiMonthly ?? 0) * 12;
  const capAnnual = pct(base, regs.laa.coordination.invalidity_ai_laa_cap_pct); // 90%
  const laaAnnual = Math.max(0, Math.min(nominalAnnual, capAnnual - aiAnnual));
  return {
    insuredAnnual: base,
    nominalMonthly: round(nominalAnnual / 12),
    coordinatedMonthly: round(laaAnnual / 12),
    aiMonthly: round(inp.aiMonthly ?? 0),
    totalMonthly: round((laaAnnual / 12) + (inp.aiMonthly ?? 0)),
    capMonthly: round(capAnnual / 12)
  };
}

/** v4.2 : plus de "double orphelin" en entrée.
 *  On ne distingue plus simple/double côté UI ; on applique le cap famille (70%) puis la coordination 90%.
 */
export type AccidentSurvivorsInput = {
  annualSalaryAvs: number;
  nOrphans: number;                    // nombre d'enfants à charge
  avsAiSurvivorsMonthlyTotal?: number; // total AVS/AI survivants connu (mensuel)
  spouseHasRight: boolean;             // conditions LAA réalisées
};
export function computeAccidentSurvivorsMonthly(inp: AccidentSurvivorsInput, regs: RegsLaa) {
  const base = insuredEarnings(inp.annualSalaryAvs, regs);
  const laa = regs.laa.survivors;

  // Nominaux LAA (conjoint + orphelins)
  let spouseAnnual = inp.spouseHasRight ? pct(base, laa.spouse_pct) : 0;
  let orphansAnnual = Math.max(0, inp.nOrphans) * pct(base, laa.orphan_pct);

  // Cap famille 70% sur la part LAA
  const famCapAnnual = pct(base, laa.family_cap_pct);
  let nominalTotalAnnual = spouseAnnual + orphansAnnual;
  if (nominalTotalAnnual > famCapAnnual) {
    const ratio = famCapAnnual / nominalTotalAnnual;
    spouseAnnual *= ratio;
    orphansAnnual *= ratio;
    nominalTotalAnnual = famCapAnnual;
  }

  // Coordination avec AVS/AI survivants (cap global 90% selon réglages survivants)
  const avsAnnual = (inp.avsAiSurvivorsMonthlyTotal ?? 0) * 12;
  const overallCapAnnual = pct(base, laa.with_avs_ai_overall_cap_pct); // souvent 90%
  const laaPayAnnual = Math.min(nominalTotalAnnual, Math.max(0, overallCapAnnual - avsAnnual));

  // Répartition pro rata des montants LAA payés (selon structure nominale)
  const prorata = nominalTotalAnnual > 0 ? laaPayAnnual / nominalTotalAnnual : 0;

  return {
    insuredAnnual: base,
    spouseMonthly: round((spouseAnnual * prorata) / 12),
    orphansMonthlyTotal: round((orphansAnnual * prorata) / 12),
    laaMonthlyTotal: round(laaPayAnnual / 12),
    avsMonthlyTotal: round(avsAnnual / 12),
    overallCapMonthly: round(overallCapAnnual / 12)
  };
}

export function computeAccidentDailyAllowance(annualSalaryAvs: number, regs: RegsLaa) {
  const base = insuredEarnings(annualSalaryAvs, regs);
  const daily = round((pct(base, regs.laa.daily_allowance.pct_of_insured_earnings) / 365));
  return { insuredAnnual: base, dailyAllowance: daily, startsFromDay: regs.laa.daily_allowance.start_from_day };
}
