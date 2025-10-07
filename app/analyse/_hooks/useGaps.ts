// app/analyse/_hooks/useGaps.ts
'use client';

import { useMemo } from 'react';
import {
  type NeedTargets,
  computeTargetsMonthly,
  computeRetirementCoverageMonthly,
  estimateLppRetirementMonthly,
} from '@/lib/needs';
import { computeLppInvalidityMinima } from '@/lib/lpp';
import {
  computeAvsAiMonthlySync,
  computeCareerCoeffFromParams,
  computeRamdProxyWithBonifs,
  computeBonificationStats,
} from '@/lib/avsAI';
import { getRegs } from '@/lib/regs';

/* ===== Types d’entrées minimales ===== */

export type EventKind = 'maladie' | 'accident';
export type ChildBirthdateISO = string; // ISO date string YYYY-MM-DD

export type AvsInputs = {
  invalidityMonthly: number;          // rente AI (adulte)
  invalidityChildMonthly?: number;    // rente enfant d’invalide (par enfant) — optionnel
  widowMonthly: number;               // veuf/veuve 80% (mensuel)
  childMonthly: number;               // enfant 40% (mensuel, par enfant)
  oldAgeMonthly?: number;             // AVS vieillesse (mensuel) — valeur serveur projetée à 65
};

export type LppInputs = {
  // Invalidité / Survivants (mensuels) — prioriser les valeurs du certificat
  invalidityMonthly?: number;         // inval. LPP (adulte)
  invalidityChildMonthly?: number;    // enfant d’invalide LPP (par enfant)
  widowMonthly?: number;              // survivants LPP (conjoint/partenaire)
  orphanMonthly?: number;             // survivants LPP (par enfant)
  deathCapital?: number;              // 🆕 capital décès LPP (CHF, one-off)

  // Retraite (certificat)
  retirementAnnualFromCert?: number;
  capitalAt65FromCert?: number;
  minConversionRatePct?: number;

  // Minima légaux invalidité LPP (fallback optionnel)
  invalidityMinYear?: number;
  invalidityMinAgeYears?: number;
  invalidityMinSex?: 'F' | 'M';
  invalidityMinCoordinatedSalary?: number;
  invalidityMinCurrentAssets?: number;
};


export type LaaParams = {
  insured_earnings_max: number; // 148200
  disabilityPctFull: number;    // 80
  overallCapPct: number;        // 90
  spousePct: number;            // 40
  orphanPct: number;            // 15
  familyCapPct: number;         // 70
};

export type SurvivorContextLite = {
  maritalStatus:
    | 'celibataire'
    | 'marie'
    | 'mariee'
    | 'divorce'
    | 'divorcee'
    | 'partenariat_enregistre'
    | 'concubinage';
  hasChild: boolean;
  ageAtWidowhood?: number;
  marriedSince5y?: boolean;
  partnerDesignated?: boolean;   // clause partenaire (concubinage)
  cohabitationYears?: number;    // années de vie commune (concubinage)
};

export type GapsCtx = {
  eventInvalidity: EventKind;
  eventDeath: EventKind;
  invalidityDegreePct: number;
  childrenCount: number;
  childrenBirthdates?: ChildBirthdateISO[];
  weeklyHours?: number;
  survivor: SurvivorContextLite;

  /** Paramètres carrière AVS saisis dans les Paramètres rapides */
  avsCareer?: {
    startWorkYearCH?: number;              // Début activité lucrative (année)
    missingYearsMode?: 'none' | 'some';
    missingYears?: number[];               // Liste d'années manquantes
    caregiving?: { hasCare: boolean; years?: number[] }; // Tâches d’assistance (années)
  };

  /** 🆕 date de naissance — pour projeter à 65 ans côté client */
  birthDateISO?: string; // "YYYY-MM-DD" ou "DD.MM.YYYY"
};

export type NeedsSliders = Partial<NeedTargets>;
export type ThirdPillar = {
  invalidityMonthly?: number;
  deathMonthly?: number;
  retirementMonthly?: number;
};

/* ===== Résultats & segments ===== */

export type GapSegment = { label: string; value: number; color?: string; source?: 'AVS' | 'LPP' | 'LAA' | 'P3' };
export type GapStack = {
  target: number;
  segments: GapSegment[];
  covered: number;
  gap: number;
};

export type UseGapsOutput = {
  targetsPct: NeedTargets;
  targetsMonthly: { invalidity: number; death: number; retirement: number };
  invalidity: { maladie: GapStack; accident: GapStack; current: GapStack };
  death: {
    maladie: GapStack;
    accident: GapStack;
    current: GapStack;
    capital?: { lpp?: number; total: number }; // 🆕
  };
  retirement: GapStack;
};


/* ===== Helpers LAA ===== */

const DEFAULT_LAA: LaaParams = {
  insured_earnings_max: 148200,
  disabilityPctFull: 80,
  overallCapPct: 90,
  spousePct: 40,
  orphanPct: 15,
  familyCapPct: 70,
};

const round = (x: number) => Math.round(x);
const pct = (x: number, p: number) => (x * p) / 100;

// Âge d'un enfant en années pleines
export function childAgeYears(birthISO: ChildBirthdateISO, at: Date = new Date()): number {
  const [y, m, d] = birthISO.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return 0;
  const birth = new Date(Date.UTC(y, m - 1, d));
  const now = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** Invalidité accident (LAA) — coordination AI + LAA ≤ 90% du gain assuré */
function laaInvalidityMonthly(
  annualIncome: number,
  aiMonthly: number,
  degreePct: number,
  laa: LaaParams
) {
  const insured = Math.min(annualIncome, laa.insured_earnings_max);
  const nominalAnnual = pct(insured, laa.disabilityPctFull) * (degreePct / 100);
  const aiAnnual = (aiMonthly ?? 0) * 12;
  const capAnnual = pct(insured, laa.overallCapPct);

  const laaAnnual = Math.max(0, Math.min(nominalAnnual, capAnnual - aiAnnual));
  const totalMonthly = round(aiAnnual / 12 + laaAnnual / 12);

  return {
    insuredAnnual: insured,
    nominalMonthly: round(nominalAnnual / 12),
    laaMonthly: round(laaAnnual / 12),
    aiMonthly: round(aiMonthly ?? 0),
    capMonthly: round(capAnnual / 12),
    totalMonthly,
  };
}

/** Survivants accident (LAA) — complément coordonné */
function laaSurvivorsMonthly(
  annualIncome: number,
  spouseHasRight: boolean,
  nOrphans: number,
  avsAiSurvivorsMonthlyTotal: number,
  laa: LaaParams
) {
  const insured = Math.min(annualIncome, laa.insured_earnings_max);
  let spouseAnnual = spouseHasRight ? pct(insured, laa.spousePct) : 0;
  const orphanAnnual = Math.max(0, nOrphans) * pct(insured, laa.orphanPct);
  let nominalTotal = spouseAnnual + orphanAnnual;

  // Cap famille 70% sur la part LAA
  const famCap = pct(insured, laa.familyCapPct);
  if (nominalTotal > famCap) {
    const ratio = famCap / nominalTotal;
    spouseAnnual *= ratio;
    nominalTotal = famCap;
  }

  // Coordination avec AVS/AI survivants (cap global 90%)
  const avsAnnual = (avsAiSurvivorsMonthlyTotal ?? 0) * 12;
  const overallCap = pct(insured, laa.overallCapPct);
  const laaPayAnnual = Math.min(nominalTotal, Math.max(0, overallCap - avsAnnual));
  const prorata = nominalTotal > 0 ? laaPayAnnual / nominalTotal : 0;

  return {
    insuredAnnual: insured,
    spouseMonthly: round((spouseAnnual * prorata) / 12),
    laaMonthlyTotal: round(laaPayAnnual / 12),
    avsMonthlyTotal: round(avsAnnual / 12),
    overallCapMonthly: round(overallCap / 12),
  };
}

/** Heuristique droit AVS survivants minimal */
function spouseHasRightBasic(survivor: SurvivorContextLite) {
  const marriedOrReg =
    survivor.maritalStatus === 'marie' ||
    survivor.maritalStatus === 'mariee' ||
    survivor.maritalStatus === 'partenariat_enregistre';
  if (!marriedOrReg) return false;
  if (survivor.hasChild) return true;
  const ageOk = (survivor.ageAtWidowhood ?? 0) >= 45;
  const yearsOk = survivor.marriedSince5y === true;
  return ageOk && yearsOk;
}

/** Droit partenaire LPP (conjoint ou concubin désigné 5+ ans) */
function lppPartnerRight(survivor: SurvivorContextLite) {
  const marriedOrReg =
    survivor.maritalStatus === 'marie' ||
    survivor.maritalStatus === 'mariee' ||
    survivor.maritalStatus === 'partenariat_enregistre';
  if (marriedOrReg) return spouseHasRightBasic(survivor);
  if (survivor.maritalStatus === 'concubinage') {
    const designated = survivor.partnerDesignated === true;
    const years = Math.max(0, survivor.cohabitationYears ?? 0);
    return designated && years >= 5;
  }
  return false;
}

/* ===== Sélecteur LPP invalidité ===== */
function selectLppInvalidityMonthly(lpp: LppInputs) {
  if (typeof lpp.invalidityMonthly === 'number' && lpp.invalidityMonthly > 0) {
    return { monthly: Math.round(lpp.invalidityMonthly), source: 'cert' as const };
  }
  if (
    typeof lpp.invalidityMinYear === 'number' &&
    typeof lpp.invalidityMinAgeYears === 'number' &&
    typeof lpp.invalidityMinCoordinatedSalary === 'number'
  ) {
    const res = computeLppInvalidityMinima({
      year: lpp.invalidityMinYear,
      ageYears: lpp.invalidityMinAgeYears,
      sex: lpp.invalidityMinSex,
      coordinatedSalary: Math.max(0, lpp.invalidityMinCoordinatedSalary),
      currentAssets: lpp.invalidityMinCurrentAssets ?? 0,
    });
    if (res?.invalidityMonthlyMin > 0) {
      return { monthly: res.invalidityMonthlyMin, source: 'lpp_minima' as const };
    }
  }
  const estRetMonthly = estimateLppRetirementMonthly({
    lppRetirementAnnualFromCert: lpp.retirementAnnualFromCert,
    lppCapitalAt65FromCert: lpp.capitalAt65FromCert,
    minConversionRatePct: lpp.minConversionRatePct,
  });
  if (estRetMonthly > 0) {
    return { monthly: estRetMonthly, source: 'ret_proxy' as const };
  }
  return { monthly: 0, source: 'none' as const };
}

/* ===== Hook principal ===== */
export function useGaps(params: {
  annualIncome: number;
  targets: NeedsSliders;
  avs: AvsInputs;
  lpp: LppInputs;
  ctx: GapsCtx;
  laaParams?: LaaParams;
  thirdPillar?: ThirdPillar;
}): UseGapsOutput {
  const {
    annualIncome,
    targets,
    avs,
    lpp,
    ctx,
    laaParams = DEFAULT_LAA,
    thirdPillar,
  } = params;

  return useMemo<UseGapsOutput>(() => {
    // 1) Objectifs mensuels
    const tgt = computeTargetsMonthly(annualIncome, targets, { invalidityMaxPct: 90, minPct: 50 });
    const targetsMonthly = { invalidity: tgt.invalidity, death: tgt.death, retirement: tgt.retirement };

    // ===== AVS — paramètres communs (année, carrière, RAMD, bonifs) =====
    const yearForAvs = new Date().getFullYear();

    // a) Début activité (root ou quick params)
    const startYearFromRoot = (ctx as any)?.debutActiviteYear;
    const startYearFromObj  = ctx.avsCareer?.startWorkYearCH;
    const startY =
      (typeof startYearFromRoot === 'number' && Number.isFinite(startYearFromRoot))
        ? Math.min(startYearFromRoot, yearForAvs)
        : (typeof startYearFromObj === 'number' && Number.isFinite(startYearFromObj))
          ? Math.min(startYearFromObj, yearForAvs)
          : undefined;

    // b) Années sans cotisations (liste)
    const missingFromRoot = ((ctx as any)?.anneesSansCotisationList ?? []) as number[];
    const missingFromObj  = (ctx.avsCareer?.missingYearsMode === 'some' ? ctx.avsCareer?.missingYears : []) ?? [];
    const rawMissing = (Array.isArray(missingFromRoot) && missingFromRoot.length > 0 ? missingFromRoot : missingFromObj) ?? [];
    const effectiveMissingYears = rawMissing
      .filter((y) => Number.isFinite(y))
      .filter((y) => startY ? (y >= startY && y <= yearForAvs) : (y >= (yearForAvs - 43) && y <= yearForAvs));

    // c) Tâches d’assistance (années)
    const effectiveCareYears = (ctx.avsCareer?.caregiving?.years ?? [])
      .filter((y) => Number.isFinite(y))
      .filter((y) => startY ? (y >= startY && y <= yearForAvs) : (y >= (yearForAvs - 43) && y <= yearForAvs));

    // d) Coeff carrière = années cotisées / 44 (réactif aux quick params)
    const careerCoeff = computeCareerCoeffFromParams({
      currentYear: yearForAvs,
      startWorkYearCH: startY,
      missingYears: effectiveMissingYears,
    });

    // e) RAMD proxy influencé par enfants/dates (bonifs), début, années manquantes, assistance, état civil, revenu
    const regsAvs = getRegs('avs_ai', yearForAvs) as any;
    const eduCreditCHFOverride = Number(regsAvs?.eduCreditCHF);
    const careCreditCHFOverride = Number(regsAvs?.careCreditCHF);

    const ramdProxy = computeRamdProxyWithBonifs({
      annualIncome,
      year: yearForAvs,
      maritalStatus: ctx.survivor.maritalStatus,
      childrenBirthdates: ctx.childrenBirthdates ?? [],
      startWorkYearCH: startY,
      missingYears: effectiveMissingYears,
      caregivingYears: effectiveCareYears,
      eduCreditCHFOverride: Number.isFinite(eduCreditCHFOverride) ? eduCreditCHFOverride : undefined,
      careCreditCHFOverride: Number.isFinite(careCreditCHFOverride) ? careCreditCHFOverride : undefined,
    });

    // AVS “actuel” (coeff courant) — sert à AI/Survivants et fallback Retraite si besoin
    const avsScale = computeAvsAiMonthlySync(ramdProxy, {
      year: yearForAvs,
      coeffCarriere: careerCoeff,
    });

    // 🆕 AVS “projeté 65” local — seulement si on a assez d’infos pour projeter
    const birthDateISO = ctx.birthDateISO; // à faire remonter depuis la page serveur
    const canProjectLocally = Boolean(birthDateISO);

    const avsScaleProjected = canProjectLocally
      ? computeAvsAiMonthlySync(ramdProxy, {
          year: yearForAvs,
          coeffCarriere: careerCoeff, // coeff ACTUEL ; la lib projette oldAge avec projectTo65
          projectTo65: true,
          birthDateISO,
          startWorkYearCH: startY,
          missingYears: effectiveMissingYears,
        })
      : avsScale; // sinon, on réutilise “actuel” (oldAge restera ≈ coeff courant)

    // Stats bonifs (affichage)
    const { nEduYears, nCareYears } = computeBonificationStats({
      year: yearForAvs,
      childrenBirthdates: ctx.childrenBirthdates ?? [],
      startWorkYearCH: startY,
      missingYears: effectiveMissingYears,
      caregivingYears: effectiveCareYears,
    });
    const hasBonifs = (nEduYears > 0) || (nCareYears > 0);

    // Activer la projection locale dès qu’un param carrière/bonif est saisi
    const avsCareerOverrideActive =
      Boolean(typeof startY === 'number' || effectiveMissingYears.length > 0 || effectiveCareYears.length > 0 || (ctx.childrenBirthdates?.length ?? 0) > 0);

    // ===== AVS (risques immédiats) — avec fallbacks
    const avsInvalidityEff = avsCareerOverrideActive
      ? avsScale.invalidity
      : (Number.isFinite(avs.invalidityMonthly) && avs.invalidityMonthly! > 0 ? Math.max(0, avs.invalidityMonthly!) : avsScale.invalidity);

    const avsWidowEff = avsCareerOverrideActive
      ? avsScale.widowWidower
      : (Number.isFinite(avs.widowMonthly) && avs.widowMonthly! > 0 ? Math.max(0, avs.widowMonthly!) : avsScale.widowWidower);

    const avsChildSurvivorEff = avsCareerOverrideActive
      ? avsScale.child
      : (Number.isFinite(avs.childMonthly) && avs.childMonthly! > 0 ? Math.max(0, avs.childMonthly!) : avsScale.child);

    const avsInvalidityEstimated =
      avsCareerOverrideActive || !(Number.isFinite(avs.invalidityMonthly) && avs.invalidityMonthly! > 0);
    const avsInvalidityChildEstimated =
      avsCareerOverrideActive || !(Number.isFinite(avs.invalidityChildMonthly) && avs.invalidityChildMonthly! > 0);
    const avsWidowEstimated =
      avsCareerOverrideActive || !(Number.isFinite(avs.widowMonthly) && avs.widowMonthly! > 0);
    const avsChildSurvivorEstimated =
      avsCareerOverrideActive || !(Number.isFinite(avs.childMonthly) && avs.childMonthly! > 0);

    // ===== INVALIDITÉ (maladie)
    const children = Math.max(0, ctx.childrenCount);
    const aiChildMonthly = Math.max(0, avs.invalidityChildMonthly ?? Math.round(avsInvalidityEff * 0.4));

    const lppInvSel = selectLppInvalidityMonthly(lpp);
    const lppInvalidityMonthlyEff = Math.max(0, lppInvSel.monthly);
    const lppChildMonthly =
      typeof lpp.invalidityChildMonthly === 'number' && lpp.invalidityChildMonthly > 0
        ? Math.round(lpp.invalidityChildMonthly)
        : Math.round(lppInvalidityMonthlyEff * 0.20);

    const invMaladieCovered =
      avsInvalidityEff + children * aiChildMonthly + lppInvalidityMonthlyEff + children * Math.max(0, lppChildMonthly) + Math.max(0, thirdPillar?.invalidityMonthly ?? 0);

    const invMaladie: GapStack = {
      target: targetsMonthly.invalidity,
      segments: [
  { label: `AVS/AI${avsInvalidityEstimated ? ' (estimé)' : ''}`, value: avsInvalidityEff, source: 'AVS' },
  { label: 'LPP', value: lppInvalidityMonthlyEff, source: 'LPP' },

  // 🆕 LPP enfant d’invalide (par enfant)
  ...(children > 0 && lppChildMonthly > 0
    ? [{
        label: children > 1 ? 'LPP enfants invalides (estimé)' : 'LPP enfant invalide (estimé)',
        value: children * lppChildMonthly,
        source: 'LPP',
      } as GapSegment]
    : []),

  // AVS enfant d’invalide (par enfant)
  ...(children > 0
    ? [{
        label: `AVS enfant invalide${avsInvalidityChildEstimated ? ' (estimé)' : ''}`,
        value: children * aiChildMonthly,
        source: 'AVS',
      } as GapSegment]
    : []),

  ...(thirdPillar?.invalidityMonthly
    ? [{ label: '3e pilier', value: thirdPillar.invalidityMonthly, source: 'P3' } as GapSegment]
    : []),
],

      covered: Math.min(targetsMonthly.invalidity, invMaladieCovered),
      gap: Math.max(0, targetsMonthly.invalidity - invMaladieCovered),
    };

    // ===== INVALIDITÉ (accident — coordination AI + LAA ≤ 90%)
    const aiMonthlyTotalForAccident = avsInvalidityEff + children * aiChildMonthly;
    const laaInv = laaInvalidityMonthly(annualIncome, aiMonthlyTotalForAccident, Math.max(40, Math.min(100, ctx.invalidityDegreePct ?? 100)), laaParams);
    const invAccidentCovered = laaInv.totalMonthly + Math.max(0, thirdPillar?.invalidityMonthly ?? 0);
    const invAccident: GapStack = {
      target: laaInv.capMonthly,
      segments: [
        { label: `AI (AVS/AI + enfants)${(avsInvalidityEstimated || avsInvalidityChildEstimated) ? ' (estimé)' : ''}`, value: laaInv.aiMonthly, source: 'AVS' },
        { label: 'LAA (coord.)', value: laaInv.laaMonthly, source: 'LAA' },
        ...(thirdPillar?.invalidityMonthly ? [{ label: '3e pilier', value: thirdPillar.invalidityMonthly, source: 'P3' } as GapSegment] : []),
      ],
      covered: Math.min(laaInv.capMonthly, invAccidentCovered),
      gap: Math.max(0, laaInv.capMonthly - invAccidentCovered),
    };

    // ===== DÉCÈS (maladie)
    const avsSpouseRight = spouseHasRightBasic({ ...ctx.survivor, hasChild: children > 0 });
    const avsSurvivorsMonthlyTotal = (avsSpouseRight ? avsWidowEff : 0) + children * avsChildSurvivorEff;

    const avsSurvivorsEstimated =
      (avsSpouseRight ? avsWidowEstimated : false) || (children > 0 ? avsChildSurvivorEstimated : false);

    const lppPartnerEligible = lppPartnerRight({ ...ctx.survivor, hasChild: children > 0 });
    const lppWidowEligible   = lppPartnerEligible ? Math.max(0, lpp.widowMonthly ?? 0) : 0;
    const lppOrphansEligible = children * Math.max(0, lpp.orphanMonthly ?? 0);

    const decesMaladieCovered = avsSurvivorsMonthlyTotal + lppWidowEligible + lppOrphansEligible + Math.max(0, thirdPillar?.deathMonthly ?? 0);

    const decesMaladie: GapStack = {
      target: targetsMonthly.death,
      segments: [
        { label: `AVS survivants${avsSurvivorsEstimated ? ' (estimé)' : ''}`, value: avsSurvivorsMonthlyTotal, source: 'AVS' },
        ...(lppWidowEligible > 0 ? [{ label: 'LPP conjoint', value: lppWidowEligible, source: 'LPP' } as GapSegment] : []),
        ...(lppOrphansEligible > 0 ? [{
          label: children > 1 ? 'LPP orphelins' : 'LPP orphelin',
          value: lppOrphansEligible,
          source: 'LPP'
        } as GapSegment] : []),

        ...(thirdPillar?.deathMonthly ? [{ label: '3e pilier', value: thirdPillar.deathMonthly, source: 'P3' } as GapSegment] : []),
      ],
      covered: Math.min(targetsMonthly.death, decesMaladieCovered),
      gap: Math.max(0, targetsMonthly.death - decesMaladieCovered),
    };

    // ===== DÉCÈS (accident — complément LAA coordonné)
    const laaSurv = laaSurvivorsMonthly(annualIncome, spouseHasRightBasic(ctx.survivor), Math.max(0, ctx.childrenCount), avsSurvivorsMonthlyTotal, laaParams);
    const decesAccidentCovered = decesMaladieCovered + Math.max(0, laaSurv.laaMonthlyTotal ?? 0);
    const decesAccident: GapStack = {
      target: targetsMonthly.death,
      segments: [
   ...decesMaladie.segments,
   {
     label: 'LAA conjoint (coord.)',
     value: Math.max(0, laaSurv.spouseMonthly ?? 0),
     source: 'LAA',
   },
   {
     label: 'LAA orphelins (coord.)',
     value: Math.max(
       0,
       (laaSurv.laaMonthlyTotal ?? 0) - (laaSurv.spouseMonthly ?? 0)
     ),
     source: 'LAA',
   },
 ],
      covered: Math.min(targetsMonthly.death, decesAccidentCovered),
      gap: Math.max(0, targetsMonthly.death - decesAccidentCovered),
    };

    // ===== RETRAITE (projection)
    // Priorité :
    // - si l’utilisateur a saisi carrière/bonifs ET qu’on a la date de naissance → projection locale (avsScaleProjected.oldAge65)
    // - sinon, garder la valeur serveur projetée (avs.oldAgeMonthly) si présente
    // - à défaut, fallback sur notre projection locale (même si non idéale)
    const avsOldAgeEff = (avsCareerOverrideActive && canProjectLocally)
      ? avsScaleProjected.oldAge65
      : (Number.isFinite(avs.oldAgeMonthly) ? avs.oldAgeMonthly! : avsScaleProjected.oldAge65);

    const retireCovered = computeRetirementCoverageMonthly({
      annualIncome,
      avsOldAgeMonthly: avsOldAgeEff,
      lppRetirementAnnualFromCert: lpp.retirementAnnualFromCert,
      lppCapitalAt65FromCert: lpp.capitalAt65FromCert,
      minConversionRatePct: lpp.minConversionRatePct,
      thirdPillarMonthly: thirdPillar?.retirementMonthly ?? 0,
    });

    const retirement: GapStack = {
      target: targetsMonthly.retirement,
      segments: [
        {
          label: `AVS vieillesse${
            (avsCareerOverrideActive && canProjectLocally)
              ? (hasBonifs ? ' (estimé, bonifs)' : ' (estimé)')
              : (Number.isFinite(avs.oldAgeMonthly) ? (hasBonifs ? ' (bonifs)' : '') : (hasBonifs ? ' (estimé, bonifs)' : ' (estimé)'))
          }`,
          value: Math.max(0, avsOldAgeEff),
          source: 'AVS',
        },
        {
          label: 'LPP vieillesse',
          value: Math.max(0, estimateLppRetirementMonthly({
            lppRetirementAnnualFromCert: lpp.retirementAnnualFromCert,
            lppCapitalAt65FromCert: lpp.capitalAt65FromCert,
            minConversionRatePct: lpp.minConversionRatePct,
          })),
          source: 'LPP',
        },
        ...(thirdPillar?.retirementMonthly ? [{ label: '3e pilier', value: thirdPillar.retirementMonthly, source: 'P3' } as GapSegment] : []),
      ],
      covered: Math.min(targetsMonthly.retirement, retireCovered),
      gap: Math.max(0, targetsMonthly.retirement - retireCovered),
    };

    // ===== Sélection “courante”
const invalidityCurrent = ctx.eventInvalidity === 'accident' ? invAccident : invMaladie;
const deathCurrent = ctx.eventDeath === 'accident' ? decesAccident : decesMaladie;

// 🆕 Capital décès LPP (one-off)
const deathCapitalLpp = Math.max(0, Math.round(lpp.deathCapital ?? 0));
const death = {
  maladie: decesMaladie,
  accident: decesAccident,
  current: deathCurrent,
  ...(deathCapitalLpp > 0 ? { capital: { lpp: deathCapitalLpp, total: deathCapitalLpp } } : {}),
};

return {
  targetsPct: tgt.targets,
  targetsMonthly,
  invalidity: { maladie: invMaladie, accident: invAccident, current: invalidityCurrent },
  death,
  retirement,
};

  }, [annualIncome, targets, avs, lpp, ctx, laaParams, thirdPillar]);
}
