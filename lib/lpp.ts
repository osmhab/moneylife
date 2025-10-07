// lib/lpp.ts
// Calculs LPP : salaire coordonné, bonifications minimales, survivants minima,
// META (taux de conversion min) + ***minima invalidité LPP (conforme loi, sans intérêts)***.

import { getRegs } from '@/lib/regs'

/* =========================
 * Types (contexte survivants)
 * ========================= */
export type SurvivorContext = {
  maritalStatus:
    | 'celibataire'
    | 'marie'
    | 'mariee'
    | 'divorce'
    | 'divorcee'
    | 'partenariat_enregistre'
    | 'concubinage'
  hasChild?: boolean
  ageAtWidowhood?: number
  marriageYears?: number
  registeredPartnershipYears?: number
  cohabitationYears?: number
  beneficiaryDesignationOnFile?: boolean
  hasCommonChildOrMaintenanceDuty?: boolean
  remarriedOrNewRegPartner?: boolean
  newMarriageOrNewRegPartner?: boolean
  childAge?: number
  inTraining?: boolean
}

/* =========================
 * Types (analyse LPP globale)
 * ========================= */
export type LppAnalysisArgs = {
  year: number
  annualSalary: number
  employmentRate: number // 0..1
  age: number
  /** "Dernière rente" (invalidité ou retraite) servant de base aux survivants LPP minima */
  referenceMonthlyPension: number
  useAdaptiveCoordination?: boolean
  survivorContext: SurvivorContext
}

export type LppAnalysis = {
  year: number
  currency: 'CHF'
  coordinatedSalary: number
  savingsCredit: { pct: number; annual: number }
  survivor: {
    amounts: {
      widowWidowerMonthly: number
      orphanMonthly: number
    }
  }
  meta: {
    convMinPct: number
    coordination: {
      deductionUsed: number
      min: number
      max: number
      adaptive: boolean
    }
  }
}

/* ===========================================
 * Types (minima invalidité LPP — conforme loi)
 * =========================================== */
export type LppInvalidityMinArgs = {
  year: number
  /** âge actuel (années pleines) au moment de la naissance du droit */
  ageYears: number
  /** 'F' | 'M' (optionnel) si tes regs différencient l’âge de référence */
  sex?: 'F' | 'M'
  /** salaire coordonné (part obligatoire) utilisé pour les bonifications futures */
  coordinatedSalary: number
  /** avoir de vieillesse LPP acquis au moment de la naissance du droit */
  currentAssets?: number
}

export type LppInvalidityMinResult = {
  /** Avoir extrapolé ***sans intérêts*** (acquis + somme des bonifs futures) */
  projectedAssetsAtRefAge_NoInterest: number
  /** Rente annuelle min (100%) = 6.8% * avoir extrapolé */
  invalidityAnnualMin: number
  /** Rente mensuelle min (100%) */
  invalidityMonthlyMin: number
  /** Rente d’enfant d’invalide (par enfant) = 20% de la rente d’invalidité */
  childMonthlyMin: number
  assumptions: {
    convMinPct: number
    retirementAge: number
    yearsUntilRef: number
  }
}

/* ==============
 * Utils internes
 * ============== */
function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x))
}
function roundCHF(x: number) {
  return Math.round(x)
}

/**
 * Renvoie le % de bonification vieillesse (7/10/15/18) applicable pour un âge donné,
 * à partir de regs.lpp.savings_credits_min si présent, sinon fallback légal 7/10/15/18.
 */
function getSavingsCreditPctForAge(regs: any, age: number): number {
  const credits = regs?.lpp?.savings_credits_min ?? regs?.lpp?.savings_credits
  if (Array.isArray(credits)) {
    // format attendu: [{ age_from, age_to, percent_of_coordinated_salary }, ...]
    const band = credits.find(
      (b: any) =>
        age >= Number(b?.age_from ?? -1) && age <= Number(b?.age_to ?? 10_000)
    )
    const pct = band?.percent_of_coordinated_salary
    if (pct != null) return Number(pct)
  }
  // Fallback minimal légal si le JSON n’a pas les bandes
  if (age < 25) return 0
  if (age <= 34) return 7
  if (age <= 44) return 10
  if (age <= 54) return 15
  return 18
}

/* ===========================================
 * 1) Analyse LPP (coordination, bonifs, survivants minima)
 * =========================================== */
export async function computeLppAnalysis(args: LppAnalysisArgs): Promise<LppAnalysis> {
  const regs = getRegs('lpp', args.year)
  const survRegs = getRegs('lpp_survivants', args.year)

  // ---- Coordination (part obligatoire)
  const limits = regs?.lpp?.limits_annual ?? {}
  const entryThreshold = Number(limits.entry_threshold ?? 22680)
  const coordDeduction = Number(limits.coordination_deduction ?? 26460)
  const csMin = Number(limits.coordinated_salary_min ?? 3780)
  const csMax = Number(limits.coordinated_salary_max ?? 64260)

  // Option "adaptive" (désactivée par défaut dans regs 2025)
  const adaptiveCfg = regs?.lpp?.coordination_rules?.adaptive_optional ?? { enabled: false }
  let deductionUsed = coordDeduction
  if (args.useAdaptiveCoordination && adaptiveCfg?.enabled) {
    // Exemple simplifié basé sur JSON (si présent)
    const avsMax = Number(
      regs?.lpp?.coordination_rules?.adaptive_optional?.avs_max_annual_pension ?? 30240
    )
    const cand = Math.min(0.30 * args.annualSalary, 0.875 * avsMax) * args.employmentRate
    deductionUsed = Math.round(cand)
  }

  let coordinatedSalary = clamp(args.annualSalary - deductionUsed, csMin, csMax)
  if (args.annualSalary < entryThreshold) {
    coordinatedSalary = 0 // hors LPP obligatoire
  }

  // ---- Bonifications vieillesse (minima) pour l'année courante
  const creditPct = getSavingsCreditPctForAge(regs, args.age)
  const creditAnnual = roundCHF((creditPct / 100) * coordinatedSalary)

  // ---- Survivants LPP (minima)
  // Règles: 60% conjoint, 20% orphelin, sur la "dernière rente (invalidité ou vieillesse)"
  const widPct = Number(survRegs?.lpp_survivants?.amounts_minima?.widow_widower_pct ?? 60)
  const orpPct = Number(survRegs?.lpp_survivants?.amounts_minima?.orphan_pct ?? 20)
  const widowWidowerMonthly = roundCHF(args.referenceMonthlyPension * (widPct / 100))
  const orphanMonthly = roundCHF(args.referenceMonthlyPension * (orpPct / 100))

  // ---- Taux de conversion minimal pour méta
  const convMinPct = Number(
    regs?.lpp?.minimum_conversion_rate?.at_reference_age_pct ?? 6.8
  )

  return {
    year: args.year,
    currency: 'CHF',
    coordinatedSalary,
    savingsCredit: { pct: creditPct, annual: creditAnnual },
    survivor: {
      amounts: { widowWidowerMonthly, orphanMonthly },
    },
    meta: {
      convMinPct,
      coordination: {
        deductionUsed,
        min: csMin,
        max: csMax,
        adaptive: !!(args.useAdaptiveCoordination && adaptiveCfg?.enabled),
      },
    },
  }
}

/* ==========================================================
 * 2) Minima invalidité LPP — ***conforme loi, sans intérêts***
 *    - Avoir extrapolé = avoir acquis + somme des bonifs futures (SANS intérêts)
 *    - Rente invalidité = 6.8% * avoir extrapolé
 *    - Rente enfant d’invalide = 20% de la rente d’invalidité
 * ========================================================== */
export function computeLppInvalidityMinima(
  args: LppInvalidityMinArgs
): LppInvalidityMinResult {
  const regs = getRegs('lpp', args.year)

  // Taux de conversion minimal (ex. 6.8%)
  const convMinPct: number = Number(
    regs?.lpp?.minimum_conversion_rate?.at_reference_age_pct ?? 6.8
  )

  // Âge de référence: tente un unisexe puis sex-spécifique, sinon 65
  const retirementAge: number = Number(
    regs?.lpp?.retirement_age_unisex ??
      (args.sex === 'F'
        ? regs?.lpp?.retirement_age_female
        : regs?.lpp?.retirement_age_male) ??
      regs?.lpp?.retirement_age ??
      65
  )

  const yearsUntilRef = Math.max(0, Math.floor(retirementAge - args.ageYears))

  // 1) Avoir acquis (tel quel, ***sans*** intérêts futurs)
  const acquired = Math.max(0, args.currentAssets ?? 0)

  // 2) Somme des bonifications futures (***sans*** intérêts), basées sur le salaire coordonné
  let futureCreditsNoInterest = 0
  for (let y = 0; y < yearsUntilRef; y++) {
    const ageNext = args.ageYears + y + 1
    const pct = getSavingsCreditPctForAge(regs, ageNext) / 100
    futureCreditsNoInterest += Math.max(0, args.coordinatedSalary) * pct
  }

  // 3) Avoir extrapolé SANS intérêts
  const projectedNoInterest = roundCHF(acquired + futureCreditsNoInterest)

  // 4) Rente d’invalidité minimale (100%) = convMinPct * avoir extrapolé
  const invalidityAnnualMin = roundCHF(projectedNoInterest * (convMinPct / 100))
  const invalidityMonthlyMin = roundCHF(invalidityAnnualMin / 12)

  // 5) Rente d’enfant d’invalide = 20% de la rente d’invalidité
  const childMonthlyMin = roundCHF(invalidityMonthlyMin * 0.20)

  return {
    projectedAssetsAtRefAge_NoInterest: projectedNoInterest,
    invalidityAnnualMin,
    invalidityMonthlyMin,
    childMonthlyMin,
    assumptions: { convMinPct, retirementAge, yearsUntilRef },
  }
}
