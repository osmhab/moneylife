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

export type AccidentSurvivorsInput = {
  annualSalaryAvs: number;
  nOrphans: number;              // orphelins "simples" (15%)
  nDoubleOrphans?: number;       // orphelins de père et mère (25%)
  avsAiSurvivorsMonthlyTotal?: number; // total AVS/AI survivants connu
  spouseHasRight: boolean;       // conditions LAA réalisées
};
export function computeAccidentSurvivorsMonthly(inp: AccidentSurvivorsInput, regs: RegsLaa) {
  const base = insuredEarnings(inp.annualSalaryAvs, regs);
  const laa = regs.laa.survivors;
  // Nominaux LAA
  let spouseAnnual = inp.spouseHasRight ? pct(base, laa.spouse_pct) : 0;
  const orphanAnnual = inp.nOrphans * pct(base, laa.orphan_pct);
  const doubleAnnual = (inp.nDoubleOrphans ?? 0) * pct(base, laa.double_orphan_pct);
  let nominalTotal = spouseAnnual + orphanAnnual + doubleAnnual;
  const famCap = pct(base, laa.family_cap_pct); // 70%
  if (nominalTotal > famCap) {
    const ratio = famCap / nominalTotal;
    spouseAnnual *= ratio;
    // réparti proportionnellement entre catégories
    const orphanAnnualAdj = orphanAnnual * ratio;
    const doubleAnnualAdj = doubleAnnual * ratio;
    nominalTotal = spouseAnnual + orphanAnnualAdj + doubleAnnualAdj;
  }
  // Coordination avec AVS/AI survivants (rente complémentaire LAA)
  const avsAnnual = (inp.avsAiSurvivorsMonthlyTotal ?? 0) * 12;
  const overallCap = pct(base, laa.with_avs_ai_overall_cap_pct); // 90%
  const complementAnnual = Math.max(0, overallCap - avsAnnual);
  const laaPayAnnual = Math.min(nominalTotal, complementAnnual);

  // Répartition pro rata des montants LAA payés (selon structure nominale)
  const prorata = nominalTotal > 0 ? laaPayAnnual / nominalTotal : 0;
  return {
    insuredAnnual: base,
    spouseMonthly: round((spouseAnnual * prorata) / 12),
    orphansMonthlyTotal: round(((orphanAnnual + doubleAnnual) * prorata) / 12),
    laaMonthlyTotal: round(laaPayAnnual / 12),
    avsMonthlyTotal: round(avsAnnual / 12),
    overallCapMonthly: round(overallCap / 12)
  };
}

export function computeAccidentDailyAllowance(annualSalaryAvs: number, regs: RegsLaa) {
  const base = insuredEarnings(annualSalaryAvs, regs);
  const daily = round((pct(base, regs.laa.daily_allowance.pct_of_insured_earnings) / 365));
  return { insuredAnnual: base, dailyAllowance: daily, startsFromDay: regs.laa.daily_allowance.start_from_day };
}
