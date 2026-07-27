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
  /** PLAFOND COUPLE AVS (marié/partenariat), MENSUEL — AFFICHAGE UNIQUEMENT.
   *  Total AVS du MÉNAGE (les deux conjoints ensemble) plafonné à 150 % du max
   *  individuel, projeté par la route via computeAvsCoupleForClient. NE change PAS
   *  le calcul de la lacune (qui reste sur la rente INDIVIDUELLE de la personne) :
   *  la carte affiche la rente individuelle en principal + ce plafond en note « * ».
   *  Non additionné : c'est un total ménage, pas la rente de la personne. */
  avsCouplePlafondMensuel?: number;
}

/** Une couche de prestation composant la couverture (AVS, LPP, LAA, 3e pilier…). */
export interface BenefitLayer {
  /** Clé stable pour le mapping couleur côté client. */
  key: "avs" | "lpp" | "laa" | "3a";
  label: string;
  /** Même unité que besoin/couverture de la carte (mensuel pour rentes, capital pour décès). */
  amount: number;
}

/** Un PALIER d'évolution de la couverture invalidité (une carte du carrousel) : la
 *  couverture change quand un enfant cesse d'ouvrir droit à une rente (18 ans). */
export interface IGStep {
  /** Année de début du palier. */
  fromYear: number;
  /** Nombre d'enfants ouvrant droit à une rente pendant ce palier. */
  nbEnfants: number;
  couverture: number;
  lacune: number;
  layers: BenefitLayer[];
}

export interface RiskCard {
  besoin: number;
  couverture: number;
  lacune: number;
  score: number;
  /** Décomposition de la couverture par pilier (somme ≈ couverture). Pour le graphique en couches. */
  layers: BenefitLayer[];
  /** ÉVOLUTION (invalidité) : couverture MINIMALE à terme, quand les rentes d'enfant
   *  s'arrêtent (18/25 ans). Présent seulement si la couverture baisse dans le futur. */
  futureCouverture?: number;
  /** Lacune à terme (une fois les enfants grandis), si supérieure à la lacune actuelle. */
  futureLacune?: number;
  /** Année à partir de laquelle la couverture minimale s'applique (null/absent si pas de baisse). */
  futureFromYear?: number | null;
  /** CARROUSEL (invalidité) : paliers de couverture au fil du départ des enfants
   *  (du plus d'enfants au moins). Présent seulement s'il y a plus d'un palier. */
  igSteps?: IGStep[];
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

/** Prestations du 1er pilier (AVS/AI) + complément LAA — toutes MENSUELLES.
 *  Pas de capital ici (rien à épargner) : uniquement des rentes. */
export interface PremierPilierPrestations {
  /** Rente de vieillesse AVS (mensuel, à 65 ans). */
  retraite: { avs: number };
  /** Rente d'invalidité AI en cas de MALADIE (mensuel). */
  invaliditeMaladie: { avs: number };
  /** Rente d'invalidité AI + rente LAA en cas d'ACCIDENT (mensuel). */
  invaliditeAccident: { avs: number; laa: number };
  /** Rentes de survivants AVS (veuf·ve + orphelins) — décès par MALADIE (mensuel). */
  decesMaladie: { avs: number };
  /** Rentes de survivants AVS + LAA — décès par ACCIDENT (mensuel). */
  decesAccident: { avs: number; laa: number };
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
  /** Plafond couple AVS retraite MENSUEL (total ménage, marié/partenariat), pour
   *  affichage en note « * » sous la rente individuelle. Absent si célibataire ou
   *  profil incomplet. N'entre JAMAIS dans la lacune (rente individuelle seule). */
  avsCouplePlafondMensuel?: number;
  retraite: RiskCard;
  invaliditeMaladie: RiskCard;
  invaliditeAccident: RiskCard;
  deces: RiskCard;
  /** Prestations 1er pilier (AVS/AI) + LAA — snapshot « aujourd'hui » ajouté par la route
   *  (computePremierPilierSnapshot). Optionnel : absent si le profil est incomplet. */
  premierPilier?: PremierPilierPrestations;
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
  const { cloudData, plans, allocation3a = 100, allocations, isSmoothingIG = false, avsCouplePlafondMensuel } = input;
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
  // Rente AVS retraite = rente INDIVIDUELLE de la personne (matrice). Le plafond
  // couple (avsCouplePlafondMensuel) est purement AFFICHÉ, jamais additionné ici.
  const retAvsAnnuelle = getVal(retProj, "AVS/AI");
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
  // Chaque source a un CAPITAL retraite (affiché) + un % alloué. Le % pilote la
  // rente prise en compte dans la lacune (retLppEffectifAnnuel) ; le capital, lui,
  // n'est qu'AFFICHÉ (« X destinés à la retraite »).
  const retraiteSources: { planId: string; label: string; type: string; capital: number; allocation: number }[] = [];

  const lppPlans = plans.filter(
    (p: any) => String(p.type || "").toUpperCase().startsWith("LPP") && (p.status === "ACTIVE" || !p.status)
  );
  let retLppEffectifAnnuel = retLppAnnuelle;
  if (retLppAnnuelle > 0) {
    const lppPlan = lppPlans[0];
    const lppAlloc = lppPlan ? allocOf(lppPlan) : 100;
    retLppEffectifAnnuel = retLppAnnuelle * (lppAlloc / 100);
    // Capital AFFICHÉ = capital projeté du CERTIFICAT (le chiffre que le client
    // reconnaît), et non « rente × 25 ». Cet ancien calcul reconvertissait la
    // rente LPP (versée à ~6.8%) au taux de 4% (×25), gonflant le capital (ex.
    // 350'945 devenait ~540'000). Repli sur l'ancien calcul si le certificat ne
    // porte pas de projection. N'affecte PAS la lacune (basée sur la rente).
    const ld = lppPlan?.data || {};
    const lppCapitalCertificat =
      parseAmount(ld.Enter_lppCapitalProjete65) ||
      parseAmount(ld.capitalRetraiteGlobal) ||
      parseAmount(ld.capitalRetraiteProjete) ||
      Math.round(retLppAnnuelle * 25);
    retraiteSources.push({
      planId: lppPlan?.id ?? "lpp",
      label: lppPlan ? planLabel(lppPlan) : "LPP (2e pilier)",
      type: "LPP_BASE",
      capital: Math.round(lppCapitalCertificat),
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

  // Nombre d'enfants ouvrant droit à une rente à l'année `year` (règle du moteur cloud
  // qui produit la projection : < 18 ans). Sert à étiqueter les PALIERS du carrousel.
  const enfantsList: any[] = cloudData.Enter_enfants || [];
  const nbEnfantsEligiblesAt = (year: number): number =>
    enfantsList.filter((e: any) => {
      const m = String(e?.Enter_dateNaissance || "").match(/\b(19|20)\d{2}\b/);
      const by = m ? parseInt(m[0], 10) : 0;
      return by > 0 && year - by < 18;
    }).length;

  function analyseIG(proj: any): {
    lacune: number;
    score: number;
    couverture: number;
    layers: BenefitLayer[];
    futureCouverture: number;
    futureLacune: number;
    futureFromYear: number | null;
    steps: IGStep[];
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

    // DEUX périodes : ACTUELLE = 1re année de rente (idx 2 : si invalide AUJOURD'HUI, avec
    // les enfants d'aujourd'hui) ; CONTRAIGNANTE = couverture MINIMALE (souvent plus tard,
    // quand les rentes d'enfant s'arrêtent à 18/25 ans) → alimente la lacune FUTURE.
    type Periode = { year: number; apres: number; avs: number; lpp: number; laa: number; a3: number };
    let current: Periode | null = null;
    let worst: Periode | null = null;
    // PALIERS (carrousel) : une carte par niveau de couverture distinct (change quand un
    // enfant cesse d'ouvrir droit à une rente). Du plus d'enfants au moins.
    const steps: IGStep[] = [];
    let lastStepKey = "";
    annees.forEach((yr: number, idx: number) => {
      if (idx < 2) return;
      const avs = getVal(proj, "AVS/AI", idx) / 12;
      const lpp = getVal(proj, "LPP", idx) / 12;
      const laa = getVal(proj, "LAA", idx) / 12;
      const a3 = rente3a / 12;
      const rentesM = avs + lpp + laa + a3;
      const apres = isSmoothingIG
        ? rentesM > cibleIGMensuelle ? cibleIGMensuelle : rentesM + bonusLissage
        : rentesM;
      const p: Periode = { year: yr, apres, avs, lpp, laa, a3 };
      if (!current) current = p;                      // 1re année de rente = ACTUELLE
      if (!worst || apres < worst.apres) worst = p;   // pire période = CONTRAIGNANTE

      const stepKey = `${Math.round(avs)}|${Math.round(lpp)}|${Math.round(laa)}`;
      if (stepKey !== lastStepKey) {
        lastStepKey = stepKey;
        steps.push({
          fromYear: yr,
          nbEnfants: nbEnfantsEligiblesAt(yr),
          couverture: rentesM,
          lacune: Math.max(0, cibleIGMensuelle - rentesM),
          layers: ([
            { key: "avs", label: "AVS / AI", amount: avs },
            { key: "lpp", label: "LPP (2e pilier)", amount: lpp },
            { key: "laa", label: "LAA (accident)", amount: laa },
            { key: "3a", label: "3e pilier", amount: a3 },
          ] as BenefitLayer[]).filter((l) => l.amount > 0),
        });
      }
    });

    const c = current as Periode | null;
    const w = worst as Periode | null;

    // ACTUELLE : couverture + lacune + décomposition par pilier (avec les enfants actuels).
    const couverture = c ? c.avs + c.lpp + c.laa + c.a3 : 0;
    const lacune = c ? Math.max(0, cibleIGMensuelle - c.apres) : 0;
    const revenuTotal = cibleIGMensuelle - lacune;
    const score = Math.round((revenuTotal / (salaireAnnuel / 12)) * 100);

    const layers: BenefitLayer[] = c
      ? ([
          { key: "avs", label: "AVS / AI", amount: c.avs },
          { key: "lpp", label: "LPP (2e pilier)", amount: c.lpp },
          { key: "laa", label: "LAA (accident)", amount: c.laa },
          { key: "3a", label: "3e pilier", amount: c.a3 },
        ] as BenefitLayer[]).filter((l) => l.amount > 0)
      : [];

    // FUTURE : le pire cas s'il est PLUS BAS que l'actuel (= la couverture baisse quand les
    // enfants grandissent). `futureFromYear` = année où ça baisse (null si aucune baisse).
    const futureCouverture = w ? w.avs + w.lpp + w.laa + w.a3 : couverture;
    const futureLacune = w ? Math.max(0, cibleIGMensuelle - w.apres) : lacune;
    const futureFromYear = w && c && w.apres < c.apres - 1 ? w.year : null;

    return { lacune, score, couverture, layers, futureCouverture, futureLacune, futureFromYear, steps };
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
    // Plafond couple (affichage seul) : uniquement s'il dépasse la rente individuelle,
    // sinon il n'apporte rien à montrer.
    ...(typeof avsCouplePlafondMensuel === "number" &&
    avsCouplePlafondMensuel > retAvsAnnuelle / 12
      ? { avsCouplePlafondMensuel }
      : {}),
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
      futureCouverture: igMaladie.futureCouverture,
      futureLacune: igMaladie.futureLacune,
      futureFromYear: igMaladie.futureFromYear,
      igSteps: igMaladie.steps.length > 1 ? igMaladie.steps : undefined,
    },
    invaliditeAccident: {
      besoin: cibleIGMensuelle,
      couverture: igAccident.couverture,
      lacune: igAccident.lacune,
      score: igAccident.score,
      layers: igAccident.layers,
      futureCouverture: igAccident.futureCouverture,
      futureLacune: igAccident.futureLacune,
      futureFromYear: igAccident.futureFromYear,
      igSteps: igAccident.steps.length > 1 ? igAccident.steps : undefined,
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
