// lib/shared/calculs/3epilier.ts

import type {
  Config_3e_Pilier,
  Config_3e_ClientSnapshot,
  Config_3e_Type,
} from "../core/types"; 

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

/**
 * Helper pour synchroniser les taux avec le Dashboard
 */
function getRate(isInvesti: boolean, profil: string = "equilibre"): number {
  if (!isInvesti) return 0.005; // 0.5%
  switch (profil) {
    case "defensif":  return 0.02;  
    case "equilibre": return 0.035; 
    case "growth":    return 0.05;  
    case "dynamique": return 0.065; 
    default:          return 0.005;
  }
}

/* ---------- Contexte de tarification ---------- */

export interface RiskPricingContext {
  age: number;
  type: Config_3e_Type;
  isSmoker: boolean;
  bmi: number;
  hasHypertension: boolean;
  hasHealthIssues: boolean;
  occupationRiskClass?: number | null;
}

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

/* ---------- Calcul des primes de risque (Squelette AXA) ---------- */

export interface RiskPremiumResult {
  totalRiskPremium: number;
  breakdown: Record<string, number>;
}

export function computeRiskPremiums(
  config: Config_3e_Pilier,
  ctx: RiskPricingContext
): RiskPremiumResult {
  if (ctx.occupationRiskClass == null || Number.isNaN(ctx.occupationRiskClass as number)) {
    return { totalRiskPremium: 0, breakdown: {} };
  }

  let total = 0;
  const breakdown: Record<string, number> = {};
  const BASE_DEATH_PER_1000 = 1.8;
  const SMOKER_DEATH_FACTOR = ctx.isSmoker ? 2.6 : 1.0;
  const BASE_IG_PER_1000 = 33.8;
  const SMOKER_IG_FACTOR = ctx.isSmoker ? 1.165 : 1.0;

  const occClass = ctx.occupationRiskClass ?? 1;
  const OCC_IG_FACTOR = occClass <= 1 ? 1.0 : occClass === 2 ? 1.2 : 1.66;

  const bmi = ctx.bmi || 22;
  let bmiFactor = 1.0;
  if (bmi < 18.5) bmiFactor = 1.05;
  else if (bmi >= 25 && bmi < 30) bmiFactor = 1.10;
  else if (bmi >= 30 && bmi < 35) bmiFactor = 1.20;
  else if (bmi >= 35) bmiFactor = 1.35;

  const healthFactor = bmiFactor * (ctx.hasHypertension ? 1.15 : 1.0);
  const ageFactor = 1 + Math.max(ctx.age - 30, 0) * 0.02;

  if (config.deathFixed.enabled && config.deathFixed.capital > 0) {
    let deathPremium = (config.deathFixed.capital / 1000) * BASE_DEATH_PER_1000 * SMOKER_DEATH_FACTOR;
    breakdown["deathFixed"] = deathPremium;
    total += deathPremium;
  }

  if (config.deathDecreasing.enabled && config.deathDecreasing.capitalInitial > 0) {
    let deathDecPremium = (config.deathDecreasing.capitalInitial / 1000) * BASE_DEATH_PER_1000 * 0.65 * SMOKER_DEATH_FACTOR;
    breakdown["deathDecreasing"] = deathDecPremium;
    total += deathDecPremium;
  }

  if (Array.isArray((config as any).disabilityAnnuities)) {
    for (const [index, r] of (config as any).disabilityAnnuities.entries()) {
      if (!r?.enabled || !r.annualRente) continue;
      let waitFactor = r.waitingPeriod === 3 ? 1.4 : r.waitingPeriod === 12 ? 1.1 : 1.0;
      const igPremium = (r.annualRente / 1000) * BASE_IG_PER_1000 * SMOKER_IG_FACTOR * OCC_IG_FACTOR * healthFactor * waitFactor * ageFactor;
      total += igPremium;
      breakdown[`disabilityAnnuity_${index + 1}`] = igPremium;
    }
  }

  if (config.premiumWaiver.enabled) {
    const annual = config.premiumFrequency === "monthly" ? config.premiumAmount * 12 : config.premiumAmount;
    let lpFactor = config.premiumWaiver.waitingPeriod === 12 ? 0.055 : config.premiumWaiver.waitingPeriod === 24 ? 0.04 : 0.075;
    const lpPremium = annual * lpFactor;
    breakdown["premiumWaiver"] = lpPremium;
    total += lpPremium;
  }

  return { totalRiskPremium: total, breakdown };
}

export function computeRiskAndSavings(config: Config_3e_Pilier, ctx: RiskPricingContext) {
  const { totalRiskPremium: totalRiskAnnual, breakdown } = computeRiskPremiums(config, ctx);
  const annualPremium = config.premiumFrequency === "monthly" ? config.premiumAmount * 12 : config.premiumAmount;
  const netSavingsAnnual = Math.max(annualPremium - totalRiskAnnual, 0);
  const isMonthly = config.premiumFrequency === "monthly";

  return {
    totalRiskPremium: isMonthly ? totalRiskAnnual / 12 : totalRiskAnnual,
    netSavingsPremium: isMonthly ? netSavingsAnnual / 12 : netSavingsAnnual,
    breakdown,
  };
}

/* ---------- Fonctions de Projection (Synchronisées Dashboard) ---------- */

/**
 * Projection BANQUE
 */
export function computeProjections3aBanque(data: any, clientAge: number): number {
  const d = data || {};
  
  // 1. PRIORITÉ : Valeur enregistrée dans Firestore
  if (Number(d.capitalRetraiteGlobal) > 0) return Math.round(Number(d.capitalRetraiteGlobal));

  // 2. FALLBACK : Calcul dynamique
  const { soldeActuel = 0, isRegulier, montantRegulier = 0, occurrence = "mois", isInvesti, profil } = d;
  const r = getRate(isInvesti, profil);
  const n = Math.max(0, 65 - clientAge);
  if (n <= 0) return Math.round(soldeActuel);

  const P = isRegulier ? (occurrence === "mois" ? montantRegulier * 12 : montantRegulier) : 0;
  const capExistant = soldeActuel * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

/**
 * Projection ASSURANCE
 */
// Parseur de date souple (ISO "aaaa-mm-jj" OU masque "jj.mm.aaaa"). Inliné ici pour rester
// autonome dans le bundle de la Cloud Function (pas d'import supplémentaire).
function parseFlexibleDate3a(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const mask = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (iso) {
    [, y, m, d] = iso.map(Number) as unknown as [unknown, number, number, number];
  } else if (mask) {
    [, d, m, y] = mask.map(Number) as unknown as [unknown, number, number, number];
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

// Horizon de capitalisation = échéance RÉELLE de la police si connue, sinon 65 − âge.
export function yearsToMaturity(
  dateEcheance: string | null | undefined,
  clientAge: number,
  at: Date = new Date(),
): number {
  const end = parseFlexibleDate3a(dateEcheance);
  if (end) {
    const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
    return Math.max(0, (end.getTime() - at.getTime()) / MS_PER_YEAR);
  }
  return Math.max(0, 65 - clientAge);
}

// ⚠️ ALIGNÉ SUR app/lib (= la version consommée par l'app iOS, source de vérité, CLAUDE.md §2.3) :
//  1) priorité à `projectionAssureur` (la projection de l'assureur fait foi) ;
//  2) horizon = échéance réelle de la police (`yearsToMaturity`), pas « 65 − âge ».
// Avant, cette copie priorisait `capitalRetraiteGlobal` + horizon 65 → écart ~1.3 % sur le
// capital 3a affiché entre la matrice (client) et le détail du plan (app/iOS).
export function computeProjections3aAssurance(data: any, clientAge: number): number {
  const d = data || {};
  if (Number(d.projectionAssureur) > 0) return Math.round(Number(d.projectionAssureur));

  const { valeurRachatActuelle = 0, primeEpargne = 0, occurrence = "mois", isInvesti, profil, isLibere } = d;
  const r = getRate(isInvesti, profil);
  const n = yearsToMaturity(d.dateEcheance, clientAge);
  if (n === 0) return Math.round(valeurRachatActuelle);

  const P = isLibere ? 0 : (occurrence === "annee" ? primeEpargne : primeEpargne * 12);
  const capExistant = valeurRachatActuelle * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

/**
 * Capital Décès pour une Assurance
 */
export function computeDeathBenefitAssurance(data: any): number {
  const d = data || {};

  // 1. PRIORITÉ : Valeur enregistrée dans Firestore
  if (Number(d.capitalDecesCalcule) > 0) return Math.round(Number(d.capitalDecesCalcule));

  const epargneAujourdhui = Number(d.valeurRachatActuelle) || 0;
  if (d.isLibere) return Math.round(epargneAujourdhui);

  // 2. Capital fixe
  if (d.capitalDecesFixe && Number(d.capitalDecesFixe) > 0) {
    return Math.max(epargneAujourdhui, Number(d.capitalDecesFixe));
  }

  // 3. Restitution des primes + 10%
  if (d.dateDebut && Number(d.primeTotale) > 0) {
    const parts = d.dateDebut.includes('.') ? d.dateDebut.split('.') : d.dateDebut.split('-');
    const start = parts.length === 3 ? new Date(Number(parts[0].length === 4 ? parts[0] : parts[2]), Number(parts[1]) - 1, Number(parts[0].length === 4 ? parts[2] : parts[0])) : new Date(d.dateDebut);
    const now = new Date();
    const diffMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;

    if (diffMonths > 0) {
      const pMensuelle = d.occurrence === "annee" ? Number(d.primeTotale) / 12 : Number(d.primeTotale);
      return Math.max(epargneAujourdhui, Math.round((pMensuelle * diffMonths) * 1.10));
    }
  }

  return Math.round(epargneAujourdhui);
}