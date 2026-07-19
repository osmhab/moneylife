// app/lib/analysis/situation.ts
//
// Analyse des LACUNES de prévoyance (déterministe) — extraite de usePrevoyanceAnalysis.
// Source unique consommée par le web (à terme) ET l'API/iOS.
// NB : ne contient PAS le pricing ML (threeA-engine) — c'est une couche séparée.

type AnyObj = Record<string, any>;

const parseAmount = (val: any): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  return Number(cleaned) || 0;
};

/** Lit une cellule d'une matrice de projection (par label de ligne + colonne). */
const getVal = (proj: any, label: string, col = 0): number => {
  const row = proj?.rows?.find((r: any) => String(r.label).trim() === label.trim());
  return Number(row?.cells?.[col]) || 0;
};

export interface SituationInput {
  /** Doc Analyse/current + DonneePersonnelles fusionnés (projections + salaire + état civil + enfants). */
  cloudData: AnyObj;
  /** Plans du client. */
  plans: any[];
  /** Part du capital 3a allouée à la retraite (0–100). LEGACY (fallback global). */
  allocation3a?: number;
  /** Override d'allocation retraite PAR PLAN (planId → 0–100), pour le preview live
   *  des sliders avant sauvegarde. Sinon on lit `plan.data.allocationRetraite` (défaut 100). */
  allocations?: Record<string, number>;
  /** Lissage des prestations d'invalidité (réserve les années d'excédent). */
  isSmoothingIG?: boolean;
}

/** Une couche de prestation composant la couverture (AVS, LPP, LAA, 3e pilier…). */
export interface BenefitLayer {
  /** Clé stable pour le mapping couleur côté client. */
  key: "avs" | "lpp" | "laa" | "3a";
  label: string;
  /** Même unité que besoin/couverture de la carte (mensuel pour rentes, capital pour décès). */
  amount: number;
}

export interface RiskCard {
  besoin: number;
  couverture: number;
  lacune: number;
  score: number;
  /** Décomposition de la couverture par pilier (somme ≈ couverture). Pour le graphique en couches. */
  layers: BenefitLayer[];
}

/** Une source de capital retraite (LPP / 3a / 3b / épargne), avec son allocation (slider). */
export interface RetraiteSource {
  planId: string;
  label: string;
  type: string;
  /** Capital retraite de la source (LPP = rente × 25). */
  capital: number;
  /** Part allouée à la retraite (0–100). */
  allocation: number;
}

export interface SituationAnalysis {
  totalScore: number;
  salaireMensuel: number;
  /** Rente retraite mensuelle de base (AVS + LPP, hors 3e pilier) — pour la courbe. */
  retraiteBaseMensuelle: number;
  /** Capital retraite manquant (lacune annuelle × 25 − capital 3a utilisé) — pour le pricing. */
  capManquantRetraite: number;
  /** Sources de capital retraite par plan (pour les sliders d'allocation). */
  retraiteSources: RetraiteSource[];
  retraite: RiskCard;
  invaliditeMaladie: RiskCard;
  invaliditeAccident: RiskCard;
  deces: RiskCard;
  fiscal: {
    investi3aAnnuel: number;
    plafond3a: number;
    pourcentUtilise: number;
    gainFiscalAnnuel: number;
    tauxMarginal: number;
  };
}

const PLAFOND_3A_ANNUEL = 7258;

/** Calcule les lacunes + scores affichés par SituationPrevoyancePage. */
export function computeSituationAnalysis(input: SituationInput): SituationAnalysis | null {
  const { cloudData, plans, allocation3a = 100, allocations, isSmoothingIG = false } = input;
  if (!cloudData?.projections || !cloudData?.Enter_salaireAnnuel) return null;

  // Allocation retraite effective d'un plan (0–100) : override live > valeur stockée
  // (data.allocationRetraite) > 100 % par défaut. Bornée [0, 100].
  const allocOf = (p: any): number => {
    const id = p.id;
    const override = allocations && id != null && id in allocations ? Number(allocations[id]) : undefined;
    const stored = p?.data?.allocationRetraite;
    const raw = override ?? (stored != null ? Number(stored) : 100);
    return Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 100));
  };
  // Libellé lisible d'un plan (pour les sliders côté UI).
  const planLabel = (p: any): string => {
    const t = String(p.type || "").toUpperCase();
    const inst = (p.institutionName || "").trim();
    if (t.startsWith("LPP")) return inst || "LPP (2e pilier)";
    if (t.includes("EPARGNE")) return inst || "Épargne libre";
    if (t.includes("3B")) return inst ? `3b · ${inst}` : "3b";
    return inst ? `3a · ${inst}` : "3a";
  };

  const retProj = cloudData.projections.retraite;
  const invM = cloudData.projections.invalidite_maladie;
  const invA = cloudData.projections.invalidite_accident;
  const decM = cloudData.projections.deces_maladie;

  const salaireAnnuel = getVal(retProj, "Besoin (Salaire)");

  // ---- RETRAITE ----
  const cibleRetAnnuelle = salaireAnnuel * 0.8;
  const retAvsAnnuelle = getVal(retProj, "AVS/AI");   // rente fixe (pas de slider)
  const retLppAnnuelle = getVal(retProj, "LPP");

  // Inclut le 3a/3b (prévoyance privée) ET l'ÉPARGNE LIBRE (cash) : décision de
  // compter le cash dans les lacunes (retraite + décès). L'épargne libre est
  // exclue du fiscal (pas de déduction 3a) et de l'invalidité (pas d'assurance).
  const listePlans3a = plans.filter((p: any) => {
    const type = (p.type || "").toLowerCase();
    const isActive = p.status === "ACTIVE" || !p.status;
    const isPrivate =
      type.includes("3a") ||
      type.includes("3b") ||
      type.includes("pilier") ||
      type.includes("epargne");
    return isPrivate && isActive;
  });

  // ── ALLOCATION RETRAITE PAR PLAN (sliders) ────────────────────────────────
  // Chaque source a un CAPITAL retraite + un % alloué. La LPP est capitalisée
  // (rente × 25) pour être uniforme avec les capitaux (à 100 % elle reproduit
  // exactement la rente LPP actuelle). Chaque source → rente = capital·alloc/25/12.
  const retraiteSources: { planId: string; label: string; type: string; capital: number; allocation: number }[] = [];

  const lppPlans = plans.filter(
    (p: any) => String(p.type || "").toUpperCase().startsWith("LPP") && (p.status === "ACTIVE" || !p.status)
  );
  let retLppEffectifAnnuel = retLppAnnuelle;
  if (retLppAnnuelle > 0) {
    const lppPlan = lppPlans[0];
    const lppAlloc = lppPlan ? allocOf(lppPlan) : 100;
    retLppEffectifAnnuel = retLppAnnuelle * (lppAlloc / 100);
    retraiteSources.push({
      planId: lppPlan?.id ?? "lpp",
      label: lppPlan ? planLabel(lppPlan) : "LPP (2e pilier)",
      type: "LPP_BASE",
      capital: Math.round(retLppAnnuelle * 25),
      allocation: lppAlloc,
    });
  }

  // Capitaux privés (3a / 3b / épargne long terme) : capital × allocation.
  let capitalUtilise = 0;
  for (const p of listePlans3a) {
    const d = p.data || {};
    const t = String(p.type || "").toUpperCase();
    // Épargne libre COURT TERME → pas projetable pour la retraite (mais reste cash décès/logement).
    if (t.includes("EPARGNE") && d.epargneHorizon === "court") continue;
    const capital = parseAmount(d.capitalRetraiteProjete || d.capitalRetraiteGlobal || d.soldeActuel || d.montant || 0);
    if (capital <= 0) continue;
    const alloc = allocOf(p);
    capitalUtilise += capital * (alloc / 100);
    retraiteSources.push({ planId: p.id, label: planLabel(p), type: p.type, capital: Math.round(capital), allocation: alloc });
  }

  const prestationsRetAnnuelle = retAvsAnnuelle + retLppEffectifAnnuel;
  const renteIssueDu3a = capitalUtilise / 25 / 12;
  const renteTotaleAffichee = prestationsRetAnnuelle / 12 + renteIssueDu3a;

  const garantiesSaisies3a = listePlans3a.reduce(
    (acc: { renteIG: number; capitalDeces: number }, p: any) => {
      const d = p.data || {};
      // 3a BANCAIRE / ÉPARGNE LIBRE (cash) : pas une assurance → aucune rente
      // invalidité, et le capital décès = le SOLDE (revient aux proches).
      // 3a/3b ASSURANCE : rente invalidité + capital décès garantis saisis.
      const t = String(p.type || "").toUpperCase();
      const isCashLike = t.includes("BANK") || t.includes("EPARGNE");
      return {
        renteIG: acc.renteIG + (isCashLike ? 0 : (parseAmount(d.renteInvalidite) || parseAmount(d.renteIG) || 0)),
        capitalDeces: acc.capitalDeces + (isCashLike
          ? (parseAmount(d.soldeActuel) || 0)
          : (parseAmount(d.capitalDecesFixe) || parseAmount(d.capitalDeces) || 0)),
      };
    },
    { renteIG: 0, capitalDeces: 0 }
  );

  const scoreRetraiteLocal = Math.round((renteTotaleAffichee / (salaireAnnuel / 12)) * 100) || 0;
  const cibleRetraiteMensuelle = cibleRetAnnuelle / 12;
  const lacuneRetraiteMensuelle = Math.max(0, cibleRetraiteMensuelle - renteTotaleAffichee);

  // ---- INVALIDITÉ (helper commun maladie/accident) ----
  const cibleIGMensuelle = (salaireAnnuel * 0.9) / 12;

  function analyseIG(proj: any): {
    lacune: number;
    score: number;
    couverture: number;
    layers: BenefitLayer[];
  } {
    const annees = proj?.headerYears || [];
    let reserveSurplus = 0;
    let nbAnneesLacune = 0;
    const rente3a = garantiesSaisies3a.renteIG;

    annees.forEach((_: number, idx: number) => {
      if (idx < 2) return;
      const rentesAnnuelle =
        getVal(proj, "AVS/AI", idx) + getVal(proj, "LPP", idx) + getVal(proj, "LAA", idx) + rente3a;
      const diff = rentesAnnuelle - cibleIGMensuelle * 12;
      if (diff > 0) reserveSurplus += diff;
      else if (diff < -120) nbAnneesLacune++;
    });

    const bonusLissage = isSmoothingIG && nbAnneesLacune > 0 ? reserveSurplus / nbAnneesLacune / 12 : 0;

    // Période CONTRAIGNANTE = couverture mensuelle minimale (qu'il y ait lacune ou non).
    // C'est elle qui définit la lacune affichée ET dont on expose la décomposition par pilier.
    type Periode = { apres: number; avs: number; lpp: number; laa: number; a3: number };
    let binding: Periode | null = null;
    annees.forEach((_: number, idx: number) => {
      if (idx < 2) return;
      const avs = getVal(proj, "AVS/AI", idx) / 12;
      const lpp = getVal(proj, "LPP", idx) / 12;
      const laa = getVal(proj, "LAA", idx) / 12;
      const a3 = rente3a / 12;
      const rentesM = avs + lpp + laa + a3;
      const apres = isSmoothingIG
        ? rentesM > cibleIGMensuelle
          ? cibleIGMensuelle
          : rentesM + bonusLissage
        : rentesM;
      if (!binding || apres < binding.apres) binding = { apres, avs, lpp, laa, a3 };
    });

    const b = binding as Periode | null;
    const maxLacune = b ? Math.max(0, cibleIGMensuelle - b.apres) : 0;
    const revenuTotal = cibleIGMensuelle - maxLacune;
    const score = Math.round((revenuTotal / (salaireAnnuel / 12)) * 100);

    const layers: BenefitLayer[] = b
      ? ([
          { key: "avs", label: "AVS / AI", amount: b.avs },
          { key: "lpp", label: "LPP (2e pilier)", amount: b.lpp },
          { key: "laa", label: "LAA (accident)", amount: b.laa },
          { key: "3a", label: "3e pilier", amount: b.a3 },
        ] as BenefitLayer[]).filter((l) => l.amount > 0)
      : [];

    // Couverture RÉELLE = ce que paient les piliers à la pire période (= somme des
    // couches). Non plafonnée à la cible → cohérente avec le graphique en couches.
    const couverture = b ? b.avs + b.lpp + b.laa + b.a3 : 0;

    return { lacune: maxLacune, score, couverture, layers };
  }

  const igMaladie = analyseIG(invM);
  const igAccident = analyseIG(invA);

  // ---- DÉCÈS ----
  const estMarie = cloudData.Enter_etatCivil === 1;
  const enfants = cloudData.Enter_enfants || [];
  let besoinEnfants = 0;
  enfants.forEach((enfant: any) => {
    const s = enfant.Enter_dateNaissance;
    if (s) {
      const [, , year] = String(s).split(".").map(Number);
      const ageEnfant = new Date().getFullYear() - (year || 0);
      besoinEnfants += ageEnfant < 16 ? 100000 : 50000;
    }
  });
  const salaireDeces = Number(cloudData.Enter_salaireAnnuel) || salaireAnnuel;
  const besoinConjoint = estMarie ? salaireDeces * 3 : 0;
  const besoinDecesTotal = besoinConjoint + besoinEnfants || 20000;

  const capDecesLppLaa = getVal(decM, "Prestations en capital / indemnité unique");
  const capExistants = capDecesLppLaa + garantiesSaisies3a.capitalDeces;
  const lacuneDeces = Math.max(0, besoinDecesTotal - capExistants);
  const scoreDecLocal = besoinDecesTotal > 0 ? Math.round((capExistants / besoinDecesTotal) * 100) : 100;
  const scoreDecFinal = lacuneDeces > 50000 ? Math.min(scoreDecLocal, 65) : scoreDecLocal;

  // ---- FISCAL (3a) ----
  const cotisations3a = listePlans3a.reduce((acc: number, p: any) => {
    const typeStr = (p.type || "").toLowerCase();
    if (!typeStr.includes("3a")) return acc;
    const d = p.data || {};
    if (d.isLibere || d.isRegulier === false) return acc;
    const base =
      parseAmount(d.primeTotale) ||
      parseAmount(d.montantRegulier) ||
      parseAmount(d.primeMensuelle) ||
      parseAmount(d.primeAnnuelle) ||
      parseAmount(d.prime) ||
      0;
    return acc + (d.occurrence === "annee" ? base : base * 12);
  }, 0);

  const montantDeductible = Math.min(cotisations3a, PLAFOND_3A_ANNUEL);
  const tauxFisc = salaireDeces > 150000 ? 0.3 : salaireDeces > 80000 ? 0.25 : 0.2;

  // ---- SCORE GLOBAL (pondéré selon la situation familiale) ----
  const aDesDependants = estMarie || enfants.length > 0;
  const poidsRet = aDesDependants ? 0.5 : 0.6;
  const poidsInv = aDesDependants ? 0.3 : 0.4;
  const poidsDec = aDesDependants ? 0.2 : 0.0;
  const totalScore = Math.round(
    Math.min(100, scoreRetraiteLocal) * poidsRet +
      Math.min(100, igMaladie.score) * poidsInv +
      Math.min(100, scoreDecFinal) * poidsDec
  );

  return {
    totalScore,
    salaireMensuel: salaireAnnuel / 12,
    retraiteBaseMensuelle: prestationsRetAnnuelle / 12,
    capManquantRetraite: Math.max(0, cibleRetAnnuelle - prestationsRetAnnuelle) * 25 - capitalUtilise,
    // Sources retraite PAR PLAN (pour les sliders d'allocation côté UI).
    retraiteSources,
    retraite: {
      besoin: cibleRetraiteMensuelle,
      couverture: renteTotaleAffichee,
      lacune: lacuneRetraiteMensuelle,
      score: scoreRetraiteLocal,
      layers: ([
        { key: "avs", label: "AVS / AI", amount: retAvsAnnuelle / 12 },
        { key: "lpp", label: "LPP (2e pilier)", amount: retLppEffectifAnnuel / 12 },
        { key: "3a", label: "3e pilier", amount: renteIssueDu3a },
      ] as BenefitLayer[]).filter((l) => l.amount > 0),
    },
    invaliditeMaladie: {
      besoin: cibleIGMensuelle,
      couverture: igMaladie.couverture,
      lacune: igMaladie.lacune,
      score: igMaladie.score,
      layers: igMaladie.layers,
    },
    invaliditeAccident: {
      besoin: cibleIGMensuelle,
      couverture: igAccident.couverture,
      lacune: igAccident.lacune,
      score: igAccident.score,
      layers: igAccident.layers,
    },
    deces: {
      besoin: besoinDecesTotal,
      couverture: capExistants,
      lacune: lacuneDeces,
      score: scoreDecFinal,
      layers: ([
        { key: "lpp", label: "LPP / LAA", amount: capDecesLppLaa },
        { key: "3a", label: "3e pilier", amount: garantiesSaisies3a.capitalDeces },
      ] as BenefitLayer[]).filter((l) => l.amount > 0),
    },
    fiscal: {
      investi3aAnnuel: cotisations3a,
      plafond3a: PLAFOND_3A_ANNUEL,
      pourcentUtilise: Math.round((montantDeductible / PLAFOND_3A_ANNUEL) * 100),
      gainFiscalAnnuel: montantDeductible * tauxFisc,
      tauxMarginal: tauxFisc,
    },
  };
}
