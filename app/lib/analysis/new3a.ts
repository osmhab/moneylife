// app/lib/analysis/new3a.ts
//
// Moteur de PROPOSITION 3a piloté par le questionnaire (new-3a).
// Port fidèle du calcul de app/[locale]/dashboard/prevoyance/new-3a/resultat/page.tsx :
// le pricing dépend des RÉPONSES du client (profil de risque → rendement, fumeur →
// planchers, budget → réconciliation de la prime d'épargne) + des lacunes de l'analyse.
//
// ⚠️ Règle métier : on ne chiffre JAMAIS un 3a sans ces réponses (cf. memory new-3a-wizard-required).

import type { SituationAnalysis } from "./situation";

export type RiskProfile = "guaranteed" | "prudent" | "balanced" | "dynamic";

export interface New3aWizard {
  /** fiscal | yield | immo | protection_family | protection_income */
  objective: string[];
  philosophy: "flexibility" | "security" | null;
  riskProfile: RiskProfile | null;
  isSmoker: boolean | null;
  monthlyBudget: number;
}

/** Surcharges issues de l'édition interactive du client sur l'écran résultat. */
export interface New3aOverrides {
  selRet?: boolean;
  selInc?: boolean;
  selDec?: boolean;
  selPay?: boolean;
  /** Prime d'épargne éditée manuellement (utilisée si hasUserEditedEpargne). */
  primeEpargne?: number;
  /** Rente d'invalidité mensuelle cible éditée. */
  maladie?: number;
  /** Capital décès cible édité. */
  deces?: number;
  hasUserEditedEpargne?: boolean;
}

export interface New3aOffer {
  selRet: boolean;
  selInc: boolean;
  selDec: boolean;
  selPay: boolean;
  premiums: { ret: number; inc: number; dec: number; pay: number };
  /** Capital projeté à 65 ans (FV de la prime d'épargne au taux du profil). */
  projectedRetirement: number;
  /** Prime d'épargne idéale pour combler la lacune retraite (recommandation). */
  recoEpargne: number;
  grossTotal: number;
  split3a: number;
  split3b: number;
  taxSaving: number;
  targets: { primeEpargne: number; maladie: number; deces: number; retraite: number };
  provider: string;
  /** Âge du client (pour l'horizon de souscription). */
  clientAge: number;
}

const PLAFOND_3A = 7258;
const YIELD_RATES: Record<RiskProfile, number> = {
  guaranteed: 0.005,
  prudent: 0.025,
  balanced: 0.045,
  dynamic: 0.07,
};
const roundTo5Cents = (n: number) => Math.round(n * 20) / 20;

/**
 * Taux actuariel prédit par un modèle Ridge `learner_models_3a` (sans clamp, avec
 * plancher fumeur). Port exact de resultat/page.tsx.
 */
export function calculatePredictedRate(
  model: any,
  age: number,
  isSmoker: boolean,
  isFemale: boolean,
  floor = 1.0
): number {
  if (!model || !Array.isArray(model.beta) || model.beta.length < 4) {
    return Math.exp(model?.fallbackLogMean ?? -5);
  }
  const beta = model.beta;
  const s = isSmoker ? 1 : 0;
  const f = isFemale ? 1 : 0;
  const logRate = beta[0] * 1 + beta[1] * age + beta[2] * s + beta[3] * f;
  let rate = Math.exp(logRate);
  if (isSmoker && floor > 1.0) {
    const logRateNS = beta[0] * 1 + beta[1] * age + beta[2] * 0 + beta[3] * f;
    rate = Math.max(rate, Math.exp(logRateNS) * floor);
  }
  return rate;
}

/** Dérive les cibles de couverture (lacunes) depuis l'analyse, comme resultat/page.tsx. */
export function deriveTargets(situation: SituationAnalysis): {
  maladie: number;
  deces: number;
  retraite: number;
  existing3a: number;
} {
  const maxLacuneIG = Math.max(situation.invaliditeMaladie.lacune, situation.invaliditeAccident.lacune);
  return {
    maladie: Math.max(0, Math.round(maxLacuneIG)), // rente mensuelle cible
    deces: Math.max(0, Math.round(situation.deces.lacune / 1000) * 1000),
    retraite: Math.max(0, situation.capManquantRetraite),
    existing3a: situation.fiscal.investi3aAnnuel,
  };
}

export function computeNew3aOffer(input: {
  wizard: New3aWizard;
  situation: SituationAnalysis;
  clientAge: number;
  clientGender: string; // "M" | "F"
  benchmarks: any[];
  /** Surcharges d'édition interactive (toggles / cibles / prime éditée). */
  overrides?: New3aOverrides;
}): New3aOffer {
  const { wizard, situation, clientAge, clientGender, benchmarks } = input;
  const ov = input.overrides || {};

  const isFemale = clientGender === "F";
  const isSmoker = wizard.isSmoker === true;
  const riskProfile: RiskProfile = wizard.riskProfile || "balanced";
  const objectives = wizard.objective || [];

  // Couvertures actives : par défaut mappées sur les objectifs (épargne + libération
  // toujours actives), sauf surcharge explicite par l'édition du client.
  const selRet = ov.selRet ?? true;
  const selPay = ov.selPay ?? true;
  const selInc = ov.selInc ?? objectives.includes("protection_income");
  const selDec = ov.selDec ?? (objectives.includes("protection_family") || objectives.includes("protection"));

  const derived = deriveTargets(situation);
  const targets = {
    primeEpargne: wizard.monthlyBudget || 250,
    maladie: ov.maladie ?? derived.maladie,
    deces: ov.deces ?? derived.deces,
    retraite: derived.retraite,
  };
  const existing3a = derived.existing3a;

  // --- Tarification des risques (modèle de référence = 1er benchmark, comme le web) ---
  const ref = benchmarks.length > 0 ? benchmarks[0] : null;
  let incCost = 0;
  let decCost = 0;
  let payRate = 0.03;

  if (ref) {
    const deathRate = calculatePredictedRate(ref.deathUnit, clientAge, isSmoker, isFemale, ref.smokerFloors?.death);
    const disRate = calculatePredictedRate(ref.disabilityUnit, clientAge, isSmoker, isFemale, ref.smokerFloors?.disability);
    decCost = (targets.deces * deathRate) / 12;
    incCost = (targets.maladie * 12 * disRate) / 12;
    payRate = calculatePredictedRate(ref.waiverRate, clientAge, isSmoker, isFemale, ref.smokerFloors?.waiver);
  } else {
    decCost = targets.deces * 0.00015;
    incCost = targets.maladie * 0.015;
  }

  // --- Épargne : prime idéale (combler la lacune retraite) vs budget disponible ---
  const rate = YIELD_RATES[riskProfile] ?? 0.045;
  const yearsToRetirement = Math.max(1, 65 - clientAge);

  let requiredMonthlyPremium = 0;
  if (targets.retraite > 0) {
    if (rate === 0) {
      requiredMonthlyPremium = targets.retraite / (yearsToRetirement * 12);
    } else {
      const annualPremium = (targets.retraite * rate) / (Math.pow(1 + rate, yearsToRetirement) - 1);
      requiredMonthlyPremium = annualPremium / 12;
    }
  }
  const idealEpargne = Math.max(0, roundTo5Cents(requiredMonthlyPremium));

  // Prime d'épargne : valeur éditée par le client si fournie, sinon suggestion automatique
  // (max entre l'idéal pour combler la lacune et ce que le budget permet — chemin "non édité").
  let epargnePremium: number;
  if (ov.hasUserEditedEpargne && ov.primeEpargne != null) {
    epargnePremium = Math.max(0, ov.primeEpargne);
  } else {
    const budget = wizard.monthlyBudget || 250;
    const appliedInc = selInc ? incCost : 0;
    const appliedDec = selDec ? decCost : 0;
    let maxAffordableEpargne = budget - appliedInc - appliedDec;
    if (selPay) {
      maxAffordableEpargne = budget / (1 + payRate) - appliedInc - appliedDec;
    }
    epargnePremium = Math.max(idealEpargne, maxAffordableEpargne);
    epargnePremium = Math.max(50, roundTo5Cents(epargnePremium));
  }

  const payCost = selPay ? (epargnePremium + (selInc ? incCost : 0) + (selDec ? decCost : 0)) * payRate : 0;
  const annualContribution = epargnePremium * 12;
  const projected =
    rate === 0
      ? annualContribution * yearsToRetirement
      : (annualContribution * (Math.pow(1 + rate, yearsToRetirement) - 1)) / rate;

  const premiums = {
    ret: roundTo5Cents(epargnePremium),
    inc: roundTo5Cents(incCost),
    dec: roundTo5Cents(decCost),
    pay: roundTo5Cents(payCost),
  };

  const grossTotal =
    (selRet ? premiums.ret : 0) + (selInc ? premiums.inc : 0) + (selDec ? premiums.dec : 0) + (selPay ? premiums.pay : 0);

  const maxDeductibleMonthly = Math.max(0, PLAFOND_3A - existing3a) / 12;
  let split3a = Math.min(grossTotal, maxDeductibleMonthly);
  if (split3a < 50) split3a = 0;
  const split3b = grossTotal - split3a;
  const taxSaving = roundTo5Cents(split3a * 0.25);

  return {
    selRet,
    selInc,
    selDec,
    selPay,
    premiums,
    projectedRetirement: projected,
    recoEpargne: idealEpargne,
    grossTotal,
    split3a,
    split3b,
    taxSaving,
    targets,
    provider: ref?.provider || "Sur Mesure",
    clientAge,
  };
}
