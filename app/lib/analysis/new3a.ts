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

/** Une libération (payment protect) rattachée au contrat d'un assureur. */
export interface WaiverLine {
  provider: string;
  amount: number;
}

/** Résumé d'un scénario de placement (pour la comparaison éclaté vs regroupé). */
export interface ScenarioSummary {
  grossTotal: number;
  projectedRetirement: number;
  /** Coût net sur l'horizon = capital projeté − primes payées jusqu'à 65 (critère de choix). */
  net: number;
  /** Nombre de contrats distincts (assureurs) sur les couvertures actives. */
  nbContrats: number;
  providers: { ret: string; inc: string; dec: string; pay: string };
}

/** Scénario de placement complet (interne au moteur). */
interface Scenario extends ScenarioSummary {
  premiums: { ret: number; inc: number; dec: number; pay: number };
  waivers: WaiverLine[];
  recoEpargne: number;
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
  /** Provider retenu PAR micro-produit (best-of-breed) : épargne / invalidité / décès / libération. */
  providers: { ret: string; inc: string; dec: string; pay: string };
  /** Libération PAR contrat (assureur → montant mensuel) du scénario retenu. */
  waivers: WaiverLine[];
  /** Comparaison éclaté vs regroupé (coût net) + scénario recommandé. */
  comparison: {
    recommended: "eclate" | "regroupe";
    eclate: ScenarioSummary;
    regroupe: ScenarioSummary | null;
  };
  /** LEGACY : provider « principal » (= épargne). Conservé pour compat ; préférer `providers`. */
  provider: string;
  /** Âge du client (pour l'horizon de souscription). */
  clientAge: number;
}

const PLAFOND_3A = 7258;

/**
 * Rente d'invalidité (perte de gain) MINIMALE assurable, en annuel puis mensuel.
 * En dessous, une lacune positive n'est pas assurable utilement → on ne descend
 * jamais sous ce plancher (mais une lacune NULLE reste à 0 : aucune couverture).
 * Décision produit : plancher 3'000/an = 250/mois.
 */
export const RENTE_IG_MIN_ANNUELLE = 3000;
export const RENTE_IG_MIN_MENSUELLE = RENTE_IG_MIN_ANNUELLE / 12; // 250

/** Applique le plancher : 0 reste 0 ; (0, min) → min ; ≥ min → inchangé. */
export function floorRenteIGMensuelle(renteMensuelle: number): number {
  if (renteMensuelle > 0 && renteMensuelle < RENTE_IG_MIN_MENSUELLE) return RENTE_IG_MIN_MENSUELLE;
  return renteMensuelle;
}
const YIELD_RATES: Record<RiskProfile, number> = {
  guaranteed: 0.005,
  prudent: 0.025,
  balanced: 0.045,
  dynamic: 0.07,
};
// Arrondi au CENTIME (2 décimales), pas aux 5 centimes : on ne sacrifie plus la
// précision des primes (ex. 604.83 reste 604.83, pas 604.85).
const round2 = (n: number) => Math.round(n * 100) / 100;

// Nombre minimal de benchmarks derrière un modèle pour qu'il entre dans la sélection
// « moins cher ». En dessous, le taux vient d'un repli (fallbackLogMean) non fiable :
// on l'écarte pour éviter qu'un tarif inventé « gagne » le moins cher.
const MIN_OBS_SELECTION = 3;

export interface ProviderPick {
  provider: string;
  /** Taux actuariel prédit (assurances) OU rendement (épargne). */
  value: number;
}

/**
 * BEST-OF-BREED assurance : parmi tous les providers, celui dont le taux prédit est
 * le PLUS BAS pour un produit (décès / invalidité / libération), en écartant les
 * modèles à données minces (nObs < MIN_OBS_SELECTION). Retourne null si aucun fiable.
 */
export function pickCheapestInsurer(
  benchmarks: any[],
  unitKey: "deathUnit" | "disabilityUnit" | "waiverRate",
  floorKey: "death" | "disability" | "waiver",
  age: number,
  isSmoker: boolean,
  isFemale: boolean
): ProviderPick | null {
  let best: ProviderPick | null = null;
  for (const b of benchmarks || []) {
    const unit = b?.[unitKey];
    if (!unit || Number(unit.nObs ?? 0) < MIN_OBS_SELECTION) continue;
    const rate = calculatePredictedRate(unit, age, isSmoker, isFemale, b.smokerFloors?.[floorKey]);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    if (best === null || rate < best.value) best = { provider: b.provider, value: rate };
  }
  return best;
}

/**
 * BEST-OF-BREED épargne : le provider au MEILLEUR rendement (`yieldMedian` le plus
 * élevé, strictement > 0). Retourne null si aucun rendement exploitable.
 */
export function pickBestSaver(benchmarks: any[]): ProviderPick | null {
  let best: ProviderPick | null = null;
  for (const b of benchmarks || []) {
    const y = Number(b?.yieldMedian) || 0;
    if (y <= 0) continue;
    if (best === null || y > best.value) best = { provider: b.provider, value: y };
  }
  return best;
}

const bmByProvider = (benchmarks: any[], provider: string) =>
  (benchmarks || []).find((b) => b?.provider === provider);

/** Taux d'un assureur pour un produit d'assurance, FIABLE seulement (nObs≥seuil). Sinon null. */
function reliableRate(
  b: any, unitKey: "deathUnit" | "disabilityUnit", floorKey: "death" | "disability",
  age: number, isSmoker: boolean, isFemale: boolean
): number | null {
  const unit = b?.[unitKey];
  if (!unit || Number(unit.nObs ?? 0) < MIN_OBS_SELECTION) return null;
  const r = calculatePredictedRate(unit, age, isSmoker, isFemale, b.smokerFloors?.[floorKey]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * Taux de LIBÉRATION d'un assureur donné. Contrairement à la sélection « moins cher »,
 * on ACCEPTE ici le repli (fallbackLogMean) : la libération est ATTACHÉE à un contrat
 * déjà choisi pour son produit principal — on ne sélectionne pas dessus, on la chiffre.
 * Repli forfaitaire 0.03 si l'assureur n'a aucun modèle de libération.
 */
function waiverRateOf(b: any, age: number, isSmoker: boolean, isFemale: boolean): number {
  if (!b?.waiverRate) return 0.03;
  const r = calculatePredictedRate(b.waiverRate, age, isSmoker, isFemale, b.smokerFloors?.waiver);
  return Number.isFinite(r) && r > 0 ? r : 0.03;
}

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
    // Rente mensuelle cible, avec plancher assurable (0 reste 0 ; sinon ≥ 250/mois).
    maladie: floorRenteIGMensuelle(Math.max(0, Math.round(maxLacuneIG))),
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

  // ═══ TARIFICATION : deux scénarios comparés au COÛT NET ═══════════════════════
  // ÉCLATÉ (best-of-breed) : chaque produit chez son meilleur assureur → possiblement
  // plusieurs contrats, donc plusieurs LIBÉRATIONS. REGROUPÉ : tout chez un seul assureur
  // → une seule libération, mais rendement épargne / tarifs éventuellement moins bons.
  // Libération PROPORTIONNELLE (taux × primes) et ATTACHÉE au contrat de son assureur hôte
  // (plus de taux global unique). On garde le scénario au meilleur NET
  // (= capital projeté − primes payées jusqu'à 65).
  const yearsToRetirement = Math.max(1, 65 - clientAge);
  const profileFactor = (YIELD_RATES[riskProfile] ?? YIELD_RATES.balanced) / YIELD_RATES.balanced;
  const budget = wizard.monthlyBudget || 250;

  const priceScenario = (p: {
    retProvider: string; retYield: number; // yieldMedian % (0 → repli profil)
    incProvider: string; disRate: number | null;
    decProvider: string; deathRate: number | null;
    retWaiver: number; incWaiver: number; decWaiver: number;
  }): Scenario => {
    const rate = p.retYield > 0 ? (p.retYield / 100) * profileFactor : (YIELD_RATES[riskProfile] ?? 0.045);

    let required = 0;
    if (targets.retraite > 0) {
      required = rate === 0
        ? targets.retraite / (yearsToRetirement * 12)
        : ((targets.retraite * rate) / (Math.pow(1 + rate, yearsToRetirement) - 1)) / 12;
    }
    const recoEpargne = Math.max(0, round2(required));

    const incCost = p.disRate != null ? targets.maladie * p.disRate : targets.maladie * 0.015;
    const decCost = p.deathRate != null ? (targets.deces * p.deathRate) / 12 : targets.deces * 0.00015;

    let epargne: number;
    if (ov.hasUserEditedEpargne && ov.primeEpargne != null) {
      epargne = Math.max(0, ov.primeEpargne);
    } else {
      // budget = épargne(1+wRet) + inc(1+wInc) + dec(1+wDec) quand la libération est active.
      const wRet = selPay ? p.retWaiver : 0;
      const appliedInc = selInc ? incCost * (1 + (selPay ? p.incWaiver : 0)) : 0;
      const appliedDec = selDec ? decCost * (1 + (selPay ? p.decWaiver : 0)) : 0;
      const maxAffordable = (budget - appliedInc - appliedDec) / (1 + wRet);
      epargne = Math.max(recoEpargne, maxAffordable);
      epargne = Math.max(50, round2(epargne));
    }

    // Libération PAR contrat (assureur hôte → montant), regroupée par assureur.
    const waiverMap = new Map<string, number>();
    if (selPay) {
      const add = (prov: string, amt: number) => waiverMap.set(prov, (waiverMap.get(prov) ?? 0) + amt);
      if (selRet) add(p.retProvider, epargne * p.retWaiver);
      if (selInc) add(p.incProvider, incCost * p.incWaiver);
      if (selDec) add(p.decProvider, decCost * p.decWaiver);
    }
    const waivers = [...waiverMap.entries()].map(([provider, amount]) => ({ provider, amount: round2(amount) }));
    const payCost = waivers.reduce((s, w) => s + w.amount, 0);

    const premiums = { ret: round2(epargne), inc: round2(incCost), dec: round2(decCost), pay: round2(payCost) };
    const grossTotal =
      (selRet ? premiums.ret : 0) + (selInc ? premiums.inc : 0) + (selDec ? premiums.dec : 0) + (selPay ? premiums.pay : 0);

    const annual = epargne * 12;
    const projectedRetirement = rate === 0 ? annual * yearsToRetirement
      : (annual * (Math.pow(1 + rate, yearsToRetirement) - 1)) / rate;

    const active = new Set<string>();
    if (selRet) active.add(p.retProvider);
    if (selInc) active.add(p.incProvider);
    if (selDec) active.add(p.decProvider);

    const net = projectedRetirement - grossTotal * 12 * yearsToRetirement;
    return {
      providers: { ret: p.retProvider, inc: p.incProvider, dec: p.decProvider, pay: waivers[0]?.provider ?? p.retProvider },
      premiums, waivers, grossTotal, projectedRetirement, recoEpargne, net, nbContrats: active.size,
    };
  };

  // Picks best-of-breed (sélection sur la prime / le rendement).
  const deathPick = pickCheapestInsurer(benchmarks, "deathUnit", "death", clientAge, isSmoker, isFemale);
  const disPick = pickCheapestInsurer(benchmarks, "disabilityUnit", "disability", clientAge, isSmoker, isFemale);
  const saverPick = pickBestSaver(benchmarks);
  const retProvider = saverPick?.provider ?? "Sur mesure";
  const incProvider = disPick?.provider ?? "Sur mesure";
  const decProvider = deathPick?.provider ?? "Sur mesure";

  // ── ÉCLATÉ : chaque produit chez son meilleur assureur, libération au taux de chaque hôte.
  const eclate = priceScenario({
    retProvider, retYield: saverPick?.value ?? 0,
    incProvider, disRate: disPick?.value ?? null,
    decProvider, deathRate: deathPick?.value ?? null,
    retWaiver: saverPick ? waiverRateOf(bmByProvider(benchmarks, retProvider), clientAge, isSmoker, isFemale) : 0.03,
    incWaiver: disPick ? waiverRateOf(bmByProvider(benchmarks, incProvider), clientAge, isSmoker, isFemale) : 0.03,
    decWaiver: deathPick ? waiverRateOf(bmByProvider(benchmarks, decProvider), clientAge, isSmoker, isFemale) : 0.03,
  });

  // ── REGROUPÉ : meilleur NET parmi les assureurs pouvant héberger TOUTES les couvertures
  // actives avec des données fiables (invalidité/décès nObs≥3). Une seule libération.
  let regroupe: Scenario | null = null;
  for (const b of benchmarks || []) {
    const dis = reliableRate(b, "disabilityUnit", "disability", clientAge, isSmoker, isFemale);
    const death = reliableRate(b, "deathUnit", "death", clientAge, isSmoker, isFemale);
    if (selInc && dis == null) continue;
    if (selDec && death == null) continue;
    const w = waiverRateOf(b, clientAge, isSmoker, isFemale);
    const cand = priceScenario({
      retProvider: b.provider, retYield: Number(b.yieldMedian) || 0,
      incProvider: b.provider, disRate: dis,
      decProvider: b.provider, deathRate: death,
      retWaiver: w, incWaiver: w, decWaiver: w,
    });
    if (regroupe === null || cand.net > regroupe.net) regroupe = cand;
  }

  // Recommandation = meilleur coût net (éclaté par défaut si aucun regroupé fiable).
  const useRegroupe = regroupe != null && regroupe.net > eclate.net;
  const chosen: Scenario = useRegroupe ? (regroupe as Scenario) : eclate;

  const providers = chosen.providers;
  const premiums = chosen.premiums;
  const projected = chosen.projectedRetirement;
  const idealEpargne = chosen.recoEpargne;
  const grossTotal = chosen.grossTotal;

  const maxDeductibleMonthly = Math.max(0, PLAFOND_3A - existing3a) / 12;
  let split3a = Math.min(grossTotal, maxDeductibleMonthly);
  if (split3a < 50) split3a = 0;
  const split3b = grossTotal - split3a;
  const taxSaving = round2(split3a * 0.25);

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
    // Provider best-of-breed PAR micro-produit + legacy (épargne) pour compat.
    providers,
    waivers: chosen.waivers,
    comparison: {
      recommended: useRegroupe ? "regroupe" : "eclate",
      eclate: summarize(eclate),
      regroupe: regroupe ? summarize(regroupe) : null,
    },
    provider: providers.ret,
    clientAge,
  };
}

/** Réduit un scénario complet à son résumé exposé dans la comparaison. */
function summarize(s: Scenario): ScenarioSummary {
  return {
    grossTotal: s.grossTotal,
    projectedRetirement: s.projectedRetirement,
    net: s.net,
    nbContrats: s.nbContrats,
    providers: s.providers,
  };
}
