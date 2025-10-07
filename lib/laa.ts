// lib/laa.ts
// Calculs LAA locaux (IJ, invalidité coordonnée AI/LAA, survivants coordonnés)

import { getRegs } from '@/lib/regs'

function roundCHF(x: number) { return Math.round(x) }

export async function loadRegsLaa(year: number) {
  return getRegs('laa', year)
}

export function computeAccidentDailyAllowance(annualSalaryAvs: number, regs: any) {
  const laa = regs?.laa ?? {}
  const insuredMax = laa.insured_earnings_max ?? 148200
  const pct = (laa.daily_allowance?.pct_of_insured_earnings ?? 80) / 100
  const startFromDay = laa.daily_allowance?.start_from_day ?? 3

  const insuredAnnual = Math.min(annualSalaryAvs, insuredMax)
  // IJ ≈ 80% / 365 (approche)
  const amountPerDay = roundCHF((insuredAnnual * pct) / 365)

  return {
    insuredAnnual,
    dailyAllowance: amountPerDay,
    startsFromDay: startFromDay,
  }
}

export function computeAccidentInvalidityMonthly(
  params: { annualSalaryAvs: number; degreeInvalidityPct: number; aiMonthly: number },
  regs: any
) {
  const laa = regs?.laa ?? {}
  const insuredMax = laa.insured_earnings_max ?? 148200
  const pctFull = (laa.disability?.pct_at_full_invalidity ?? 80) / 100
  const overallCapPct = (laa.coordination?.invalidity_ai_laa_cap_pct ?? 90) / 100

  const insuredAnnual = Math.min(params.annualSalaryAvs, insuredMax)
  const nominalAnnual = insuredAnnual * pctFull * (params.degreeInvalidityPct / 100)
  const nominalMonthly = nominalAnnual / 12

  // Cap global AVS+LAA (mensuel)
  const capMonthly = (insuredAnnual * overallCapPct) / 12
  const coordinatedMonthly = Math.max(0, Math.min(nominalMonthly, capMonthly - (params.aiMonthly ?? 0)))
  const totalMonthly = (params.aiMonthly ?? 0) + coordinatedMonthly

  return {
    insuredAnnual,
    nominalMonthly: roundCHF(nominalMonthly),
    coordinatedMonthly: roundCHF(coordinatedMonthly),
    aiMonthly: roundCHF(params.aiMonthly ?? 0),
    totalMonthly: roundCHF(totalMonthly),
    capMonthly: roundCHF(capMonthly),
  }
}

export function computeAccidentSurvivorsMonthly(
  params: { annualSalaryAvs: number; spouseHasRight: boolean; nOrphans: number; avsAiSurvivorsMonthlyTotal: number },
  regs: any
) {
  const laa = regs?.laa ?? {}
  const insuredMax = laa.insured_earnings_max ?? 148200
  const spousePct = (laa.survivors?.spouse_pct ?? 40) / 100
  const orphanPct = (laa.survivors?.orphan_pct ?? 15) / 100
  const familyCapPct = (laa.survivors?.family_cap_pct ?? 70) / 100
  const overallCapPct = (laa.survivors?.with_avs_ai_overall_cap_pct ?? 90) / 100

  const insuredAnnual = Math.min(params.annualSalaryAvs, insuredMax)
  const monthlyBase = insuredAnnual / 12

  const spouseMonthly = params.spouseHasRight ? monthlyBase * spousePct : 0
  const orphansMonthlyTotal = monthlyBase * orphanPct * (params.nOrphans ?? 0)

  // Cap famille LAA
  const familyCapMonthly = monthlyBase * familyCapPct
  const laaPre = Math.min(spouseMonthly + orphansMonthlyTotal, familyCapMonthly)

  // Cap global AVS+LAA
  const overallCapMonthly = monthlyBase * overallCapPct
  const laaMonthlyTotal = Math.max(0, Math.min(laaPre, overallCapMonthly - (params.avsAiSurvivorsMonthlyTotal ?? 0)))

  return {
    insuredAnnual,
    spouseMonthly: roundCHF(spouseMonthly),
    orphansMonthlyTotal: roundCHF(orphansMonthlyTotal),
    laaMonthlyTotal: roundCHF(laaMonthlyTotal),
    avsMonthlyTotal: roundCHF(params.avsAiSurvivorsMonthlyTotal ?? 0),
    overallCapMonthly: roundCHF(overallCapMonthly),
  }
}
