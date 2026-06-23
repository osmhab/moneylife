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
  /** Part du capital 3a allouée à la retraite (0–100). */
  allocation3a?: number;
  /** Lissage des prestations d'invalidité (réserve les années d'excédent). */
  isSmoothingIG?: boolean;
}

export interface RiskCard {
  besoin: number;
  couverture: number;
  lacune: number;
  score: number;
}

export interface SituationAnalysis {
  totalScore: number;
  salaireMensuel: number;
  /** Rente retraite mensuelle de base (AVS + LPP, hors 3e pilier) — pour la courbe. */
  retraiteBaseMensuelle: number;
  /** Capital retraite manquant (lacune annuelle × 25 − capital 3a utilisé) — pour le pricing. */
  capManquantRetraite: number;
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
  const { cloudData, plans, allocation3a = 100, isSmoothingIG = false } = input;
  if (!cloudData?.projections || !cloudData?.Enter_salaireAnnuel) return null;

  const retProj = cloudData.projections.retraite;
  const invM = cloudData.projections.invalidite_maladie;
  const invA = cloudData.projections.invalidite_accident;
  const decM = cloudData.projections.deces_maladie;

  const salaireAnnuel = getVal(retProj, "Besoin (Salaire)");

  // ---- RETRAITE ----
  const cibleRetAnnuelle = salaireAnnuel * 0.8;
  const prestationsRetAnnuelle = getVal(retProj, "AVS/AI") + getVal(retProj, "LPP");

  const listePlans3a = plans.filter((p: any) => {
    const type = (p.type || "").toLowerCase();
    const isActive = p.status === "ACTIVE" || !p.status;
    const isPrivate = type.includes("3a") || type.includes("3b") || type.includes("pilier");
    return isPrivate && isActive;
  });

  const capital3aProjeteTotal = listePlans3a.reduce((acc: number, p: any) => {
    const d = p.data || {};
    return acc + parseAmount(d.capitalRetraiteProjete || d.capitalRetraiteGlobal || d.soldeActuel || d.montant || 0);
  }, 0);

  const capitalUtilise = capital3aProjeteTotal * (allocation3a / 100);
  const renteIssueDu3a = capitalUtilise / 25 / 12;
  const renteTotaleAffichee = prestationsRetAnnuelle / 12 + renteIssueDu3a;

  const garantiesSaisies3a = listePlans3a.reduce(
    (acc: { renteIG: number; capitalDeces: number }, p: any) => {
      const d = p.data || {};
      return {
        renteIG: acc.renteIG + (parseAmount(d.renteInvalidite) || parseAmount(d.renteIG) || 0),
        capitalDeces: acc.capitalDeces + (parseAmount(d.capitalDecesFixe) || parseAmount(d.capitalDeces) || 0),
      };
    },
    { renteIG: 0, capitalDeces: 0 }
  );

  const scoreRetraiteLocal = Math.round((renteTotaleAffichee / (salaireAnnuel / 12)) * 100) || 0;
  const cibleRetraiteMensuelle = cibleRetAnnuelle / 12;
  const lacuneRetraiteMensuelle = Math.max(0, cibleRetraiteMensuelle - renteTotaleAffichee);

  // ---- INVALIDITÉ (helper commun maladie/accident) ----
  const cibleIGMensuelle = (salaireAnnuel * 0.9) / 12;

  function analyseIG(proj: any): { lacune: number; score: number } {
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

    const periodes: { lacune: number }[] = [];
    annees.forEach((_: number, idx: number) => {
      if (idx < 2) return;
      const rentesM =
        (getVal(proj, "AVS/AI", idx) + getVal(proj, "LPP", idx) + getVal(proj, "LAA", idx) + rente3a) / 12;
      const apres = isSmoothingIG
        ? rentesM > cibleIGMensuelle
          ? cibleIGMensuelle
          : rentesM + bonusLissage
        : rentesM;
      const lacM = Math.max(0, cibleIGMensuelle - apres);
      if (lacM > 10) periodes.push({ lacune: lacM });
    });

    const maxLacune = periodes.length > 0 ? Math.max(...periodes.map((p) => p.lacune)) : 0;
    const revenuTotal = cibleIGMensuelle - maxLacune;
    const score = Math.round((revenuTotal / (salaireAnnuel / 12)) * 100);
    return { lacune: maxLacune, score };
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

  const capExistants =
    getVal(decM, "Prestations en capital / indemnité unique") + garantiesSaisies3a.capitalDeces;
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
    retraite: {
      besoin: cibleRetraiteMensuelle,
      couverture: renteTotaleAffichee,
      lacune: lacuneRetraiteMensuelle,
      score: scoreRetraiteLocal,
    },
    invaliditeMaladie: {
      besoin: cibleIGMensuelle,
      couverture: Math.max(0, cibleIGMensuelle - igMaladie.lacune),
      lacune: igMaladie.lacune,
      score: igMaladie.score,
    },
    invaliditeAccident: {
      besoin: cibleIGMensuelle,
      couverture: Math.max(0, cibleIGMensuelle - igAccident.lacune),
      lacune: igAccident.lacune,
      score: igAccident.score,
    },
    deces: {
      besoin: besoinDecesTotal,
      couverture: capExistants,
      lacune: lacuneDeces,
      score: scoreDecFinal,
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
