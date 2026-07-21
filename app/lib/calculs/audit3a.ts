// app/lib/calculs/audit3a.ts
// MoneyLife — Audit 3a engine (pure calculations, no UI)
// Notes:
// - We do NOT expose any % return to the user; only CHF outputs.
// - Assumptions are intentionally conservative and can be tuned later.
// - Health assumption: good health, non-smoker (as requested).

export type Audit3aContractType = "bank" | "insurance";

export type Audit3aObjective = "maximize" | "secure" | "both";

export type Audit3aWaitingPeriod = "3m" | "12m" | "24m";

export type Audit3aFundsAnswer = "yes" | "no" | "unknown";

export type Audit3aInsuranceCovers = {
  hasDeath: boolean;
  deathCapitalCHF?: number; // required if hasDeath, else ignored
  deathUnknown?: boolean; // if true, use internal default

  hasInvalidity: boolean;
  invalidityAnnuityPerYearCHF?: number; // required if hasInvalidity, else ignored
  invalidityUnknown?: boolean; // if true, use internal default

  hasPremiumWaiver: boolean;
  waiverWaiting?: Audit3aWaitingPeriod;
  waiverUnknown?: boolean; // if true, use internal default waiting

  noneSelected?: boolean; // explicit "I have no insurance"
  dontKnowSelected?: boolean; // explicit "I don't know"
};

export type Audit3aInputs = {
  contractType: Audit3aContractType;

  age: number; // 18..65
  monthlyContributionCHF: number; // 0..600+ (we accept any >=0)
  yearsContributed: number; // 0..40

  investedInFunds: Audit3aFundsAnswer; // unknown treated as "no" internally (requested)

  // Only relevant when contractType === "insurance"
  covers?: Audit3aInsuranceCovers;

  objective: Audit3aObjective;
};

export type Audit3aInternalAssumptions = {
  retirementAge: number; // fixed 65
  moneylifeNetRate: number; // 0.07 internal
  bankNetRate: number; // 5% gross - 1.3% fees = 3.7% net internal
  insuranceNetRate: number; // internal conservative net for surrender / projection
  surrenderHaircut: number; // reduce FV to estimate surrender value
  // Insurance risk pricing defaults (simple + tunable)
  defaultDeathCapitalCHF: number;
  defaultInvalidityAnnuityPerYearCHF: number;
  // Starting year for "future contributions in MoneyLife scenario"
  moneylifeContribStartYear: number; // 2026
};

export type Audit3aOutputs = {
  contractType: Audit3aContractType;

  // Key insights displayed to user (CHF only)
  estimatedValueTodayCHF: number;
  estimatedValueAtRetirementCHF: number;
  estimatedImprovementWithMoneyLifeCHF: number;

  // Useful breakdown for UI (can be shown or hidden)
  breakdown?: {
    // For insurance
    monthlyRiskPremiumCHF?: number;
    monthlySavingsPremiumCHF?: number;
    inferredCovers?: {
      assumedPremiumWaiverBecauseUnknown?: boolean;
    };
  };

  // Meta for debugging / logging (do not show to user)
  _meta: {
    age: number;
    yearsRemaining: number;
    assumptions: Audit3aInternalAssumptions;
  };
};

const DEFAULT_ASSUMPTIONS: Audit3aInternalAssumptions = {
  retirementAge: 65,
  moneylifeNetRate: 0.07,
  bankNetRate: 0.037,
  insuranceNetRate: 0.025,
  surrenderHaircut: 0.92,

  defaultDeathCapitalCHF: 100_000,
  defaultInvalidityAnnuityPerYearCHF: 8_000,

  moneylifeContribStartYear: 2026,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundCHF(n: number) {
  // round to nearest CHF
  return Math.round(n);
}

/**
 * Future Value of an annuity with annual contributions.
 * We use end-of-year contributions for simplicity and stability.
 */
function fvAnnuityAnnual(contribAnnual: number, rate: number, years: number) {
  if (years <= 0) return 0;
  if (rate <= 0) return contribAnnual * years;
  return contribAnnual * ((Math.pow(1 + rate, years) - 1) / rate);
}

/**
 * Future value of annual contrib for 'yearsAlready', assuming contrib happens end-of-year.
 * For "value today", we use this approximation consistently across products.
 */
function estimateValueTodayFromAnnualContrib(contribAnnual: number, rate: number, yearsAlready: number) {
  const y = clamp(yearsAlready, 0, 60);
  return fvAnnuityAnnual(contribAnnual, rate, y);
}

/**
 * Simple age-based factor for risk pricing.
 * Tunable. We keep it smooth and conservative.
 */
function ageFactor(age: number) {
  // 18..65 => roughly 0.7 .. 2.2
  const a = clamp(age, 18, 65);
  return 0.7 + (a - 18) * (1.5 / (65 - 18));
}

/**
 * Estimate monthly premium for death cover (capital).
 * Rate expressed as CHF per 1000 CHF of capital per year.
 */
function estimateDeathRiskMonthly(age: number, deathCapitalCHF: number) {
  const cap = Math.max(0, deathCapitalCHF);
  // base annual rate per 1000: ~0.35 CHF at younger ages, increasing with age
  const basePer1000PerYear = 0.35 * ageFactor(age);
  const annual = (cap / 1000) * basePer1000PerYear;
  return annual / 12;
}

/**
 * Estimate monthly premium for invalidity annuity cover.
 * Rate expressed as % of annuity per year.
 */
function estimateInvalidityRiskMonthly(age: number, annuityPerYearCHF: number) {
  const ann = Math.max(0, annuityPerYearCHF);
  // base rate as fraction of annuity: ~0.6%..1.6% depending on age
  const baseRate = 0.006 * ageFactor(age); // 0.4%..1.3% approx
  const annual = ann * baseRate;
  return annual / 12;
}

/**
 * Estimate monthly premium for premium waiver.
 * We model it as a % of savings premium, adjusted by waiting period.
 */
function estimatePremiumWaiverMonthly(savingsMonthly: number, waiting: Audit3aWaitingPeriod) {
  const s = Math.max(0, savingsMonthly);

  // waiting factor: shorter waiting => higher risk => higher premium
  const waitingFactor =
    waiting === "3m" ? 1.0 :
    waiting === "12m" ? 0.72 :
    0.55; // 24m

  // base waiver rate: ~5%..7% of savings premium (monthly)
  const base = 0.06; // 6% default
  return s * base * waitingFactor;
}

function normalizeInsuranceCovers(
  contractType: Audit3aContractType,
  covers: Audit3aInsuranceCovers | undefined,
  assumptions: Audit3aInternalAssumptions
): { normalized: Audit3aInsuranceCovers; inferred: { assumedPremiumWaiverBecauseUnknown: boolean } } {
  const inferred = { assumedPremiumWaiverBecauseUnknown: false };

  if (contractType !== "insurance") {
    return { normalized: covers ?? ({} as Audit3aInsuranceCovers), inferred };
  }

  const c = covers ?? ({} as Audit3aInsuranceCovers);

  // If user explicitly said "none", keep it.
  const none = Boolean(c.noneSelected);

  // If user selected "I don't know", we assume at least premium waiver (requested).
  const dontKnow = Boolean(c.dontKnowSelected);

  let hasPremiumWaiver = Boolean(c.hasPremiumWaiver);
  let waiverWaiting: Audit3aWaitingPeriod | undefined = c.waiverWaiting;

  if (!none && (dontKnow || c.waiverUnknown)) {
    hasPremiumWaiver = true;
    waiverWaiting = waiverWaiting ?? "3m";
    inferred.assumedPremiumWaiverBecauseUnknown = true;
  }

  // Defaults for unknown amounts if selected
  const hasDeath = Boolean(c.hasDeath) && !none;
  const deathCapitalCHF =
    hasDeath
      ? (c.deathUnknown ? assumptions.defaultDeathCapitalCHF : (c.deathCapitalCHF ?? assumptions.defaultDeathCapitalCHF))
      : undefined;

  const hasInvalidity = Boolean(c.hasInvalidity) && !none;
  const invalidityAnnuityPerYearCHF =
    hasInvalidity
      ? (c.invalidityUnknown ? assumptions.defaultInvalidityAnnuityPerYearCHF : (c.invalidityAnnuityPerYearCHF ?? assumptions.defaultInvalidityAnnuityPerYearCHF))
      : undefined;

  const normalized: Audit3aInsuranceCovers = {
    hasDeath,
    deathCapitalCHF,
    hasInvalidity,
    invalidityAnnuityPerYearCHF,
    hasPremiumWaiver: hasPremiumWaiver && !none,
    waiverWaiting: (hasPremiumWaiver && !none) ? (c.waiverUnknown ? "3m" : (waiverWaiting ?? "3m")) : undefined,
    noneSelected: none,
    dontKnowSelected: dontKnow,
  };

  return { normalized, inferred };
}

/**
 * Main entry point.
 */
export function computeAudit3a(input: Audit3aInputs, custom?: Partial<Audit3aInternalAssumptions>): Audit3aOutputs {
  const assumptions: Audit3aInternalAssumptions = { ...DEFAULT_ASSUMPTIONS, ...(custom ?? {}) };

  const age = clamp(input.age, 18, assumptions.retirementAge);
  const yearsAlready = clamp(input.yearsContributed, 0, 60);

  const yearsRemaining = Math.max(0, assumptions.retirementAge - age);

  const monthlyTotal = Math.max(0, input.monthlyContributionCHF);
  const annualTotal = monthlyTotal * 12;

  const investedInFundsInternal = input.investedInFunds === "unknown" ? "no" : input.investedInFunds;

  if (input.contractType === "bank") {
    // Value today estimated with bank net rate (internal)
    const valueToday = estimateValueTodayFromAnnualContrib(annualTotal, assumptions.bankNetRate, yearsAlready);

    // Projection to retirement: existing value + future annual contributions
    const valueAtRetirement =
      valueToday * Math.pow(1 + assumptions.bankNetRate, yearsRemaining) +
      fvAnnuityAnnual(annualTotal, assumptions.bankNetRate, yearsRemaining);

    // MoneyLife scenario uses 7% with contributions from 2026 onward.
    // Since current date is Jan 2026, we treat it as starting now for simplicity:
    // BUT you explicitly want from Jan 1, 2026; we keep it consistent by using yearsRemaining only.
    const moneylifeValueAtRetirement =
      valueToday * Math.pow(1 + assumptions.moneylifeNetRate, yearsRemaining) +
      fvAnnuityAnnual(annualTotal, assumptions.moneylifeNetRate, yearsRemaining);

    const improvement = Math.max(0, moneylifeValueAtRetirement - valueAtRetirement);

    return {
      contractType: "bank",
      estimatedValueTodayCHF: roundCHF(valueToday),
      estimatedValueAtRetirementCHF: roundCHF(valueAtRetirement),
      estimatedImprovementWithMoneyLifeCHF: roundCHF(improvement),
      _meta: {
        age,
        yearsRemaining,
        assumptions,
      },
    };
  }

  // ---- INSURANCE ----
  const { normalized, inferred } = normalizeInsuranceCovers(input.contractType, input.covers, assumptions);

  // Step 1: estimate risk premiums
  const deathMonthly = normalized.hasDeath
    ? estimateDeathRiskMonthly(age, normalized.deathCapitalCHF ?? assumptions.defaultDeathCapitalCHF)
    : 0;

  const invalidityMonthly = normalized.hasInvalidity
    ? estimateInvalidityRiskMonthly(age, normalized.invalidityAnnuityPerYearCHF ?? assumptions.defaultInvalidityAnnuityPerYearCHF)
    : 0;

  // We estimate waiver as % of savings; but savings depends on risk => iterate once:
  // First pass: assume savings = total
  const waiting = normalized.hasPremiumWaiver ? (normalized.waiverWaiting ?? "3m") : "3m";
  const waiverMonthlyPass1 = normalized.hasPremiumWaiver ? estimatePremiumWaiverMonthly(monthlyTotal, waiting) : 0;

  // Risk pass1
  let riskMonthly = deathMonthly + invalidityMonthly + waiverMonthlyPass1;

  // Cap risk at total
  riskMonthly = Math.min(riskMonthly, monthlyTotal);

  // Savings monthly (what really compounds)
  let savingsMonthly = Math.max(0, monthlyTotal - riskMonthly);

  // Second pass: recompute waiver based on savingsMonthly (more coherent)
  const waiverMonthlyPass2 = normalized.hasPremiumWaiver ? estimatePremiumWaiverMonthly(savingsMonthly, waiting) : 0;

  riskMonthly = deathMonthly + invalidityMonthly + waiverMonthlyPass2;
  riskMonthly = Math.min(riskMonthly, monthlyTotal);
  savingsMonthly = Math.max(0, monthlyTotal - riskMonthly);

  const annualSavings = savingsMonthly * 12;

  // Step 2: estimate surrender value today:
  // - Compound savings contributions at insurance net rate
  // - Apply a haircut to reflect surrender / fees / guarantees
  const fvSavings = estimateValueTodayFromAnnualContrib(annualSavings, assumptions.insuranceNetRate, yearsAlready);
  const surrenderToday = fvSavings * assumptions.surrenderHaircut;

  // Step 3: project current contract to retirement using insurance net rate,
  // based on surrenderToday + future annual savings (keeping risk aside).
  const valueAtRetirement =
    surrenderToday * Math.pow(1 + assumptions.insuranceNetRate, yearsRemaining) +
    fvAnnuityAnnual(annualSavings, assumptions.insuranceNetRate, yearsRemaining);

  // Step 4: MoneyLife scenario (7%):
  // - Invest surrender value today at 7% to retirement
  // - Add annual savings contributions (same as now) until retirement at 7%
  const moneylifeValueAtRetirement =
    surrenderToday * Math.pow(1 + assumptions.moneylifeNetRate, yearsRemaining) +
    fvAnnuityAnnual(annualSavings, assumptions.moneylifeNetRate, yearsRemaining);

  const improvement = Math.max(0, moneylifeValueAtRetirement - valueAtRetirement);

  return {
    contractType: "insurance",
    estimatedValueTodayCHF: roundCHF(surrenderToday),
    estimatedValueAtRetirementCHF: roundCHF(valueAtRetirement),
    estimatedImprovementWithMoneyLifeCHF: roundCHF(improvement),
    breakdown: {
      monthlyRiskPremiumCHF: roundCHF(riskMonthly),
      monthlySavingsPremiumCHF: roundCHF(savingsMonthly),
      inferredCovers: inferred,
    },
    _meta: {
      age,
      yearsRemaining,
      assumptions: {
        ...assumptions,
        // keep internal-only (no UI)
      },
    },
  };
}