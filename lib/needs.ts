// lib/needs.ts
// Outils pour gérer les cibles (pourcentages) et la couverture retraite.

export type NeedTargets = {
  /** Invalidité: cible % du revenu (mensuel). Doit rester <= 90% (AI+LAA cap légal). */
  invalidityPctTarget: number;   // ex. 90
  /** Décès: cible % du revenu (mensuel). */
  deathPctTarget: number;        // ex. 80
  /** Retraite: cible % du revenu (mensuel). */
  retirementPctTarget: number;   // ex. 80
};

export type ClampOptions = {
  invalidityMaxPct?: number; // défaut 90
  minPct?: number;           // plancher ergonomique, défaut 50
  deathMaxPct?: number;      // défaut 100
  retirementMaxPct?: number; // défaut 100
};

export function clampTargets(
  t: Partial<NeedTargets>,
  opts: ClampOptions = {}
): NeedTargets {
  const invalidityMax = opts.invalidityMaxPct ?? 90;
  const min = opts.minPct ?? 50;
  const deathMax = opts.deathMaxPct ?? 100;
  const retireMax = opts.retirementMaxPct ?? 100;

  const inv = Math.max(min, Math.min(invalidityMax, t.invalidityPctTarget ?? 90));
  const death = Math.max(min, Math.min(deathMax, t.deathPctTarget ?? 80));
  const retire = Math.max(min, Math.min(retireMax, t.retirementPctTarget ?? 80));

  return {
    invalidityPctTarget: inv,
    deathPctTarget: death,
    retirementPctTarget: retire,
  };
}

/** Convertit un pourcentage cible en montant mensuel cible sur la base d'un revenu annuel. */
export function targetMonthlyFromAnnual(annualIncome: number, pct: number): number {
  return Math.round((annualIncome * (pct / 100)) / 12);
}

/** Données retraite pour estimer la couverture mensuelle. */
export type RetirementInputs = {
  annualIncome: number;               // revenu annuel (pour déterminer la cible)
  avsOldAgeMonthly?: number;          // AVS vieillesse mensuelle (idéalement depuis computeAvsAiMonthly)
  lppRetirementAnnualFromCert?: number; // rente LPP annuelle (certificat) si dispo
  lppCapitalAt65FromCert?: number;      // capital LPP au 65e (certificat) si dispo
  minConversionRatePct?: number;        // ex. 6.8 (part obligatoire)
  thirdPillarMonthly?: number;          // rente mensuelle estimée du 3e pilier (optionnel)
};

/** Estime la rente LPP mensuelle à 65 ans à partir du certificat ou du minimum légal. */
export function estimateLppRetirementMonthly(
  inp: Pick<RetirementInputs, 'lppRetirementAnnualFromCert' | 'lppCapitalAt65FromCert' | 'minConversionRatePct'>
): number {
  if (typeof inp.lppRetirementAnnualFromCert === 'number') {
    return Math.round((inp.lppRetirementAnnualFromCert || 0) / 12);
  }
  const cap = inp.lppCapitalAt65FromCert ?? 0;
  const rate = (inp.minConversionRatePct ?? 6.8) / 100;
  return Math.round((cap * rate) / 12);
}

/** Calcule la couverture retraite mensuelle (AVS + LPP [+ 3e pilier éventuel]). */
export function computeRetirementCoverageMonthly(inp: RetirementInputs): number {
  const avs = Math.round(inp.avsOldAgeMonthly ?? 0);
  const lpp = estimateLppRetirementMonthly({
    lppRetirementAnnualFromCert: inp.lppRetirementAnnualFromCert,
    lppCapitalAt65FromCert: inp.lppCapitalAt65FromCert,
    minConversionRatePct: inp.minConversionRatePct,
  });
  const p3 = Math.round(inp.thirdPillarMonthly ?? 0);
  return avs + lpp + p3;
}

/** Calcule les cibles mensuelles par thème en appliquant les clamps. */
export function computeTargetsMonthly(
  annualIncome: number,
  rawTargets: Partial<NeedTargets>,
  opts?: ClampOptions
): { invalidity: number; death: number; retirement: number; targets: NeedTargets } {
  const t = clampTargets(rawTargets, opts);
  return {
    invalidity: targetMonthlyFromAnnual(annualIncome, t.invalidityPctTarget),
    death:      targetMonthlyFromAnnual(annualIncome, t.deathPctTarget),
    retirement: targetMonthlyFromAnnual(annualIncome, t.retirementPctTarget),
    targets: t,
  };
}
