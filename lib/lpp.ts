// lib/lpp.ts
import { db } from '@/lib/firebaseAdmin';

/* =========================
 * Types Firestore
 * ========================= */

type SavingsCreditBand = { age_from: number; age_to: number; percent_of_coordinated_salary: number };

export type RegsLpp = {
  year: number;
  currency: string;
  lpp: {
    limits_annual: {
      entry_threshold: number;
      coordination_deduction: number;
      upper_salary_limit: number;
      coordinated_salary_min: number;
      coordinated_salary_max: number;
    };
    coordination_rules: {
      standard: { formula: string };
      adaptive_optional?: {
        enabled: boolean;
        comment?: string;
        coord_deduction_formula: string;
        avs_max_annual_pension: number;
      };
    };
    minimum_interest_rate: { obligatory_part_pct: number };
    minimum_conversion_rate: { at_reference_age_pct: number; reference_age: number };
    savings_credits_min: SavingsCreditBand[];
    benefits_minima: {
      survivors: {
        widow_widower_pct_of_last_oldage_or_disability_pension: number;
        orphan_pct_of_last_oldage_or_disability_pension: number;
      };
      invalidity: { right_from_invalidity_pct_gte: number; comment?: string };
    };
    retirement_window: { early_from_age: number; reference_age: number; postpone_until_age: number };
  };
};

export type LppSurvivants = {
  year: number;
  currency: string;
  lpp_survivants: {
    priority: { certificate_values_override: boolean; comment?: string };
    eligibility: {
      veuve: {
        base: any[];
        otherwise_lump_sum?: { enabled: boolean; annual_pension_multiplier: number };
        extinction?: any[];
      };
      veuf: {
        base: any[];
        otherwise_lump_sum?: { enabled: boolean; annual_pension_multiplier: number };
        extinction?: any[];
      };
      partenaire_enregistre: {
        note?: string;
        base: any[];
        otherwise_lump_sum?: { enabled: boolean; annual_pension_multiplier: number };
        extinction?: any[];
      };
      partenaire_vie_concubin: {
        plan_dependent: boolean;
        required_all: any[];
        one_of: any[];
        exclusions?: any[];
        extinction?: any[];
      };
      orphelin: {
        base: any[];
        double_orphan_rule?: { plan_dependent: boolean; comment?: string };
      };
    };
    amounts_minima: {
      reference_pension: 'old_age_or_full_disability_pension_of_deceased';
      widow_widower_pct: number; // 60
      orphan_pct: number; // 20
      lump_sum_if_not_eligible: { annual_pension_multiplier: number }; // 3
    };
    death_capital?: {
      mandatory_BVG: { provided: boolean; comment?: string };
      supralegal_plan?: {
        provided_by_plan: boolean;
        typical_basis?: string[];
        beneficiaries_order?: any;
        plan_flags?: any;
      };
    };
  };
};

/* =========================
 * Types App (contexte & résultats)
 * ========================= */

export type EmploymentRate = number; // 1 = 100%, 0.6 = 60%

export type SurvivorContext = {
  // Statut au moment du décès de l'assuré·e
  maritalStatus:
    | 'marie'
    | 'mariee'
    | 'celibataire'
    | 'divorce'
    | 'divorcee'
    | 'partenariat_enregistre'
    | 'concubinage';

  // Conjoint/partenaire
  ageAtWidowhood?: number;
  marriageYears?: number;
  registeredPartnershipYears?: number;

  // Concubinage (partenaire de vie)
  cohabitationYears?: number;
  beneficiaryDesignationOnFile?: boolean;
  hasCommonChildOrMaintenanceDuty?: boolean;

  // Extinctions
  remarriedOrNewRegPartner?: boolean;
  newMarriageOrNewRegPartner?: boolean;

  // Enfants
  hasChild?: boolean; // au sens LPP
  childAge?: number; // pour évaluer le droit orphelin
  inTraining?: boolean; // formation en cours <= 25 ans
};

export type CoordinatedSalaryResult = {
  annualSalaryCapped: number;
  coordinationDeductionUsed: number;
  coordinatedSalary: number;
  rule: 'standard' | 'adaptive';
};

export type SavingsCreditResult = {
  bandPercent: number; // %
  annualCredit: number; // CHF/an
};

export type SurvivorAmounts = {
  // Montants mensuels estimés MINIMA (si le certificat n'est pas dispo)
  widowWidowerMonthly?: number; // 60% de la rente de référence
  orphanMonthly?: number; // 20% de la rente de référence

  // Capital unique si non-éligible (3x rente annuelle)
  lumpSumIfNotEligible?: number; // CHF (estimation)
};

export type SurvivorEligibility = {
  spouseEligible: boolean; // veuf/veuve/partenaire enregistré selon le statut
  spouseMode: 'pension' | 'lump_sum' | 'none';
  concubinEligible: boolean; // si plan le permet & conditions
  orphanEligible: boolean;
};

/* =========================
 * Loaders Firestore (+ cache)
 * ========================= */

const cache: Record<string, any> = {};

export async function loadRegsLpp(year = 2025): Promise<RegsLpp> {
  const key = `regs_lpp/${year}`;
  if (cache[key]) return cache[key];
  const snap = await db.collection('regs_lpp').doc(String(year)).get();
  if (!snap.exists) throw new Error(`regs_lpp/${year} introuvable`);
  const data = snap.data() as RegsLpp;
  cache[key] = data;
  return data;
}

export async function loadLppSurvivants(year = 2025): Promise<LppSurvivants> {
  const key = `lpp_survivants/${year}`;
  if (cache[key]) return cache[key];
  const snap = await db.collection('lpp_survivants').doc(String(year)).get();
  if (!snap.exists) throw new Error(`lpp_survivants/${year} introuvable`);
  const data = snap.data() as LppSurvivants;
  cache[key] = data;
  return data;
}

/* =========================
 * Outils calc
 * ========================= */

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const round = (x: number) => Math.round(x);

export function calcCoordinatedSalary(
  annualSalary: number,
  employmentRate: EmploymentRate,
  regs: RegsLpp,
  opts?: { useAdaptive?: boolean }
): CoordinatedSalaryResult {
  const { limits_annual, coordination_rules } = regs.lpp;

  // Plafonne le salaire assuré à l'upper limit LPP
  const annualSalaryCapped = Math.min(annualSalary, limits_annual.upper_salary_limit);

  // ADAPTATIF ?
  if (opts?.useAdaptive && coordination_rules.adaptive_optional?.enabled) {
    const avsMaxAnnual = coordination_rules.adaptive_optional.avs_max_annual_pension; // ex. 30'240
    const coordDeduction =
      Math.min(0.3 * annualSalary, 0.875 * avsMaxAnnual) * (employmentRate ?? 1);
    const candidate = annualSalary - coordDeduction;
    const coordinatedSalary = clamp(
      candidate,
      0, // certaines caisses n'imposent pas le min légal en adaptatif; on garde >= 0
      limits_annual.coordinated_salary_max
    );
    return {
      annualSalaryCapped,
      coordinationDeductionUsed: round(coordDeduction),
      coordinatedSalary: round(coordinatedSalary),
      rule: 'adaptive',
    };
  }

  // STANDARD
  const candidate = annualSalaryCapped - limits_annual.coordination_deduction;
  const coordinatedSalary = clamp(
    candidate,
    limits_annual.coordinated_salary_min,
    limits_annual.coordinated_salary_max
  );
  return {
    annualSalaryCapped,
    coordinationDeductionUsed: limits_annual.coordination_deduction,
    coordinatedSalary: round(coordinatedSalary),
    rule: 'standard',
  };
}

export function calcSavingsCredit(
  age: number,
  coordinatedSalary: number,
  regs: RegsLpp
): SavingsCreditResult {
  const band =
    regs.lpp.savings_credits_min.find((b) => age >= b.age_from && age <= b.age_to) ??
    regs.lpp.savings_credits_min[0];
  const annualCredit = (band.percent_of_coordinated_salary / 100) * (coordinatedSalary ?? 0);
  return { bandPercent: band.percent_of_coordinated_salary, annualCredit: round(annualCredit) };
}

/* =========================
 * Survivants: éligibilité & montants minima
 * ========================= */

function checkCond(cond: any, ctx: SurvivorContext): boolean {
  if (!cond || typeof cond !== 'object') return true;
  const { cond: name, value } = cond;

  const op = (res: boolean) => {
    if (cond.and) return res && checkCond(cond.and, ctx);
    if (cond.or) return res || checkCond(cond.or, ctx);
    return res;
  };

  switch (name) {
    case 'has_child':
    case 'has_child_under_18':
      return op(!!ctx.hasChild);
    case 'age_at_widowhood_gte':
    case 'age_at_partner_widowhood_gte':
      return op((ctx.ageAtWidowhood ?? 0) >= Number(value));
    case 'marriage_years_gte':
      return op((ctx.marriageYears ?? 0) >= Number(value));
    case 'registered_partnership_years_gte':
      return op((ctx.registeredPartnershipYears ?? 0) >= Number(value));
    case 'cohabitation_years_gte':
      return op((ctx.cohabitationYears ?? 0) >= Number(value));
    case 'has_common_child_or_maintenance_duty':
      return op(!!ctx.hasCommonChildOrMaintenanceDuty);
    case 'beneficiary_designation_on_file':
      return op(!!ctx.beneficiaryDesignationOnFile);
    case 'not_married_and_no_reg_partner':
      return op(
        ctx.maritalStatus !== 'marie' &&
          ctx.maritalStatus !== 'mariee' &&
          ctx.maritalStatus !== 'partenariat_enregistre'
      );
    case 'remarried_or_new_reg_partner':
      return op(!!ctx.remarriedOrNewRegPartner);
    case 'new_marriage_or_new_reg_partner':
      return op(!!ctx.newMarriageOrNewRegPartner);
    case 'child_age_lt':
      return op((ctx.childAge ?? 0) < Number(value));
    case 'in_training_and_age_lte':
      return op(!!ctx.inTraining && (ctx.childAge ?? 0) <= Number(value));
    default:
      return true; // inconnu → on ne bloque pas
  }
}

function allTrue(conds: any[] | undefined, ctx: SurvivorContext): boolean {
  if (!conds?.length) return true;
  return conds.every((c) => checkCond(c, ctx));
}

function anyTrue(conds: any[] | undefined, ctx: SurvivorContext): boolean {
  if (!conds?.length) return false;
  return conds.some((c) => checkCond(c, ctx));
}

export function estimateSurvivorEligibilityAndAmounts(
  ctx: SurvivorContext,
  referenceMonthlyPension: number, // rente vieillesse/invalidité (part obligatoire) de l'assuré·e
  rules: LppSurvivants
): { eligibility: SurvivorEligibility; amounts: SurvivorAmounts } {
  const r = rules.lpp_survivants;

  // --- Spouse / registered partner
  let spouseEligible = false;
  let spouseMode: SurvivorEligibility['spouseMode'] = 'none';

  const isMarried =
    ctx.maritalStatus === 'marie' || ctx.maritalStatus === 'mariee' || ctx.maritalStatus === 'partenariat_enregistre';

  if (isMarried) {
    const bloc = ctx.maritalStatus === 'partenariat_enregistre' ? r.eligibility.partenaire_enregistre : r.eligibility.veuve; // veuve/veuf → mêmes règles min.
    const baseOK = allTrue(bloc.base, ctx);
    if (baseOK) {
      spouseEligible = true;
      spouseMode = 'pension';
    } else if (bloc.otherwise_lump_sum?.enabled) {
      spouseEligible = false;
      spouseMode = 'lump_sum';
    }
  }

  // --- Concubin (plan dépendant)
  let concubinEligible = false;
  const concubinRule = r.eligibility.partenaire_vie_concubin;
  if (ctx.maritalStatus === 'concubinage' && concubinRule?.plan_dependent) {
    const requiredAll = allTrue(concubinRule.required_all, ctx);
    const oneOf = anyTrue(concubinRule.one_of, ctx);
    const excluded = anyTrue(concubinRule.exclusions, ctx);
    concubinEligible = requiredAll && oneOf && !excluded;
  }

  // --- Orphelin
  const orphanEligible = allTrue(r.eligibility.orphelin.base, ctx);

  // --- Montants minima (si pas de certificat)
  const widowPct = r.amounts_minima.widow_widower_pct / 100; // 0.6
  const orphanPct = r.amounts_minima.orphan_pct / 100; // 0.2
  const widowWidowerMonthly = round(referenceMonthlyPension * widowPct);
  const orphanMonthly = round(referenceMonthlyPension * orphanPct);

  // Capital unique si non-éligible (3x rente annuelle)
  let lumpSumIfNotEligible: number | undefined;
  if (spouseMode === 'lump_sum') {
    const mult = r.amounts_minima.lump_sum_if_not_eligible.annual_pension_multiplier || 3;
    lumpSumIfNotEligible = round(referenceMonthlyPension * 12 * mult);
  }

  return {
    eligibility: {
      spouseEligible,
      spouseMode,
      concubinEligible,
      orphanEligible,
    },
    amounts: {
      widowWidowerMonthly: spouseEligible && spouseMode === 'pension' ? widowWidowerMonthly : undefined,
      orphanMonthly: orphanEligible ? orphanMonthly : undefined,
      lumpSumIfNotEligible,
    },
  };
}

/* =========================
 * Facade principale pour l'analyse
 * ========================= */

export async function computeLppAnalysis(opts: {
  year?: number;
  annualSalary: number;
  employmentRate?: EmploymentRate;
  age: number;
  referenceMonthlyPension: number; // si tu as la rente LPP (ou estimer via capital * taux conv. min.)
  useAdaptiveCoordination?: boolean;
  survivorContext: SurvivorContext;
}) {
  const year = opts.year ?? 2025;
  const regs = await loadRegsLpp(year);
  const surv = await loadLppSurvivants(year);

  const coord = calcCoordinatedSalary(opts.annualSalary, opts.employmentRate ?? 1, regs, {
    useAdaptive: !!opts.useAdaptiveCoordination,
  });

  const savings = calcSavingsCredit(opts.age, coord.coordinatedSalary, regs);

  const survEval = estimateSurvivorEligibilityAndAmounts(
    opts.survivorContext,
    opts.referenceMonthlyPension,
    surv
  );

  return {
    year,
    currency: regs.currency,
    coordinatedSalary: coord,
    savingsCredit: savings,
    survivor: survEval,
    meta: {
      convMinPct: regs.lpp.minimum_conversion_rate.at_reference_age_pct,
      interestMinPct: regs.lpp.minimum_interest_rate.obligatory_part_pct,
    },
  };
}
