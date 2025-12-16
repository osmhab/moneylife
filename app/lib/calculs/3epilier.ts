// app/lib/calculs/3epilier.ts

import type {
  Config_3e_Pilier,
  Config_3e_ClientSnapshot,
  Config_3e_Type,
} from "@/lib/core/types";

/* ---------- Helpers de base ---------- */

export function getAgeAtDate(birthdate: string, at: Date): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  const dob = new Date(y, (m || 1) - 1, d || 1);
  let age = at.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    at.getMonth() > dob.getMonth() ||
    (at.getMonth() === dob.getMonth() && at.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/* ---------- Contexte de tarification ---------- */

export interface RiskPricingContext {
  age: number;
  type: Config_3e_Type;
  isSmoker: boolean;
  bmi: number;
  hasHypertension: boolean;
  hasHealthIssues: boolean; // gardé pour compat, mais plus utilisé dans le moteur
  /**
   * Classe de risque métier (1 = bureau, 4 = très physique / dangereux).
   * null/undefined = profession pas encore précisée → pas de tarification de risque.
   */
  occupationRiskClass?: number | null;
}

/**
 * Construit le contexte de tarification simple
 */
export function buildRiskPricingContext(
  client: Config_3e_ClientSnapshot,
  type: Config_3e_Type,
  asOf: Date = new Date()
): RiskPricingContext {
  const age = getAgeAtDate(client.birthdate, asOf);
  const bmi = client.weightKg / Math.pow(client.heightCm / 100, 2);

  return {
    age,
    type,
    isSmoker: client.isSmoker,
    bmi,
    hasHypertension: client.hasHypertension,
    hasHealthIssues: client.hasHealthIssues,
  };
}

/* ---------- Calcul des primes de risque (squelette) ---------- */

export interface RiskPremiumResult {
  totalRiskPremium: number;
  breakdown: Record<string, number>;
}

/**
 * Squelette de calcul de primes de risque.
 * À remplacer plus tard par:
 *  - tables tarifaires réelles
 *  - ou appel à une IA "tarificateur"
 */
export function computeRiskPremiums(
  config: Config_3e_Pilier,
  ctx: RiskPricingContext
): RiskPremiumResult {
  // 0) Tant que la profession n'est pas précisée (pas de classe de risque),
  //    on ne tarifie PAS le risque: tout est considéré comme épargne.
  if (
    ctx.occupationRiskClass == null ||
    Number.isNaN(ctx.occupationRiskClass as number)
  ) {
    return {
      totalRiskPremium: 0,
      breakdown: {},
    };
  }

  let total = 0;
  const breakdown: Record<string, number> = {};

  // ---------- Coefficients calibrés (approx AXA) ----------

  // Décès : prix de base non-fumeur (tous sexes) ~1.8 CHF / 1'000 capital/an
  const BASE_DEATH_PER_1000 = 1.8;

  // Surprime fumeur décès (≈ 2.6x observé sur homme 34 ans)
  const SMOKER_DEATH_FACTOR = ctx.isSmoker ? 2.6 : 1.0;

  // IG : prix de base non-fumeur bureau ~33.8 CHF / 1'000 rente/an
  const BASE_IG_PER_1000 = 33.8;

  // Surprime fumeur IG (≈ +16.5%)
  const SMOKER_IG_FACTOR = ctx.isSmoker ? 1.165 : 1.0;

  // Métier : facteur IG (classe 1 = bureau, 2 = mixte, 3 = manuel lourd)
  const occClass = ctx.occupationRiskClass ?? 1;
  const OCC_IG_FACTOR =
    occClass <= 1
      ? 1.0 // bureau / banquier
      : occClass === 2
      ? 1.2 // mixte, semi-actif
      : 1.66; // maçon / chantier

  // IMC
  const bmi = ctx.bmi || 22;
  let bmiFactor = 1.0;
  if (bmi < 18.5) {
    bmiFactor = 1.05;
  } else if (bmi >= 25 && bmi < 30) {
    bmiFactor = 1.10;
  } else if (bmi >= 30 && bmi < 35) {
    bmiFactor = 1.20;
  } else if (bmi >= 35) {
    bmiFactor = 1.35;
  }

  // Hypertension
  const hypertensionFactor = ctx.hasHypertension ? 1.15 : 1.0;

  // Facteur global "profil santé" (sans métier ni tabac)
  const healthFactor = bmiFactor * hypertensionFactor;

  // Facteur âge pour décès et IG (simple pente 2% / an > 30 ans)
  const ageFactor = 1 + Math.max(ctx.age - 30, 0) * 0.02;

  // ---------- Décès fixe ----------
  if (config.deathFixed.enabled && config.deathFixed.capital > 0) {
    const baseUnits = config.deathFixed.capital / 1000; // unités de 1'000 CHF de capital

    // Calibration AXA: ~1.8 CHF / 1'000 CHF capital/an pour un non-fumeur "bureau".
    // On applique uniquement la surprime fumeur, pas d'âge ni santé sur la version v1.
    let deathPremium =
      baseUnits *
      BASE_DEATH_PER_1000 *
      SMOKER_DEATH_FACTOR;

    breakdown["deathFixed"] = deathPremium;
    total += deathPremium;
  }

  // ---------- Décès décroissant ----------
  if (
    config.deathDecreasing.enabled &&
    config.deathDecreasing.capitalInitial > 0 &&
    config.deathDecreasing.durationYears > 0
  ) {
    const baseUnits = config.deathDecreasing.capitalInitial / 1000;

    // Approche simple: on applique un rabais ~35% par rapport au capital fixe,
    // car le capital diminue linéairement jusqu'à 0.
    let deathDecPremium =
      baseUnits *
      BASE_DEATH_PER_1000 *
      0.65 * // rabais moyen pour capital décroissant
      SMOKER_DEATH_FACTOR;

    breakdown["deathDecreasing"] = deathDecPremium;
    total += deathDecPremium;
  }

  // ---------- Rentes IG (multi-rente) ----------
  if (Array.isArray((config as any).disabilityAnnuities)) {
    let totalDisability = 0;

    for (const [index, r] of (config as any).disabilityAnnuities.entries()) {
      if (!r || !r.enabled || !r.annualRente || r.annualRente <= 0) continue;

      const units = r.annualRente / 1000; // unités de 1'000 CHF de rente annuelle

      // Facteur délai d'attente basé sur 24 mois = 1.0 (notre cas de calibration)
      let waitFactor = 1.0;
      if (r.waitingPeriod === 3) waitFactor = 1.4;
      else if (r.waitingPeriod === 12) waitFactor = 1.1;
      else if (r.waitingPeriod === 24) waitFactor = 1.0;

      const igPremium =
        units *
        BASE_IG_PER_1000 *
        SMOKER_IG_FACTOR *
        OCC_IG_FACTOR *
        healthFactor *
        waitFactor *
        ageFactor;

      totalDisability += igPremium;
      breakdown[`disabilityAnnuity_${index + 1}`] = igPremium;
    }

    total += totalDisability;
  }

  // ---------- Libération des primes ----------
  if (config.premiumWaiver.enabled) {
    // On prend comme base la prime TOTALE ANNUELLE du contrat (risque + épargne)
    const contractPremiumAnnual =
      config.premiumFrequency === "monthly"
        ? config.premiumAmount * 12
        : config.premiumAmount;

    // On vise ~7–8% de la prime annuelle pour un délai 3 mois sur nos cas
    let lpFactor = 0.075;
    if (config.premiumWaiver.waitingPeriod === 12) {
      lpFactor = 0.055;
    } else if (config.premiumWaiver.waitingPeriod === 24) {
      lpFactor = 0.04;
    }

    // v1: pas de raffinements santé/âge, on reste simple
    const lpPremium = contractPremiumAnnual * lpFactor;

    breakdown["premiumWaiver"] = lpPremium;
    total += lpPremium;
  }

  return { totalRiskPremium: total, breakdown };
}

/**
 * Calcule la part risque / épargne.
 * Si les risques dépassent la prime, on force l'épargne à 0.
 */
export function computeRiskAndSavings(
  config: Config_3e_Pilier,
  ctx: RiskPricingContext
) {
  // 1) On récupère les primes de risque ANNUELLES
  const { totalRiskPremium: totalRiskAnnual, breakdown } = computeRiskPremiums(
    config,
    ctx
  );

  // 2) On calcule la prime ANNUELLE du contrat
  const annualPremium =
    config.premiumFrequency === "monthly"
      ? config.premiumAmount * 12
      : config.premiumAmount;

  const netSavingsAnnual = Math.max(annualPremium - totalRiskAnnual, 0);

  // 3) On renvoie les montants dans LA MÊME UNITÉ que premiumAmount (mensuelle ou annuelle)
  const totalRiskPremium =
    config.premiumFrequency === "monthly"
      ? totalRiskAnnual / 12
      : totalRiskAnnual;

  const netSavingsPremium =
    config.premiumFrequency === "monthly"
      ? netSavingsAnnual / 12
      : netSavingsAnnual;

  return {
    totalRiskPremium,
    netSavingsPremium,
    breakdown,
  };
}