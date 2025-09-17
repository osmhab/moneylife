// app/analyse/_hooks/useGaps.ts
'use client';

import { useMemo } from 'react';
import {
  type NeedTargets,
  computeTargetsMonthly,
  computeRetirementCoverageMonthly,
  estimateLppRetirementMonthly,
} from '@/lib/needs';

// ===== Types d’entrées minimales =====

export type EventKind = 'maladie' | 'accident';

export type AvsInputs = {
  invalidityMonthly: number;   // rente AI mensuelle (AVS/AI)
  widowMonthly: number;        // veuf/veuve 80% (mensuel)
  childMonthly: number;        // enfant 40% (mensuel, par enfant)
  oldAgeMonthly?: number;      // AVS vieillesse (mensuel)
};

export type LppInputs = {
  // Invalidité / Survivants (mensuels) — prioriser les valeurs du certificat
  invalidityMonthly?: number;  // si connu (certificat) sinon minima calculés côté serveur
  widowMonthly?: number;       // si connu (certificat/minima)
  orphanMonthly?: number;      // si connu (certificat/minima, par enfant)

  // Retraite (certificat)
  retirementAnnualFromCert?: number; // rente LPP à 65 ans (an)
  capitalAt65FromCert?: number;      // capital à 65 ans
  minConversionRatePct?: number;     // ex. 6.8 (part obligatoire)
};

export type LaaParams = {
  insured_earnings_max: number;       // 148200
  disabilityPctFull: number;          // 80
  overallCapPct: number;              // 90 (cap AI+LAA)
  spousePct: number;                  // 40
  orphanPct: number;                  // 15
  doubleOrphanPct: number;            // 25
  familyCapPct: number;               // 70
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
};

export type GapsCtx = {
  eventInvalidity: EventKind;       // maladie | accident
  eventDeath: EventKind;            // maladie | accident
  invalidityDegreePct: number;      // 40..100
  childrenCount: number;            // nb d’enfants concernés
  doubleOrphans?: number;           // nb d’orphelins de père et mère (accident)
  weeklyHours?: number;             // AANP si >= 8h/sem (info UI)
  survivor: SurvivorContextLite;    // statut familial
};

export type NeedsSliders = Partial<NeedTargets>; // { invalidityPctTarget?, deathPctTarget?, retirementPctTarget? }

export type ThirdPillar = {
  invalidityMonthly?: number; // rentes (ex. 3a risque invalidité) si déjà connues
  deathMonthly?: number;      // rentes 3a décès (rare) — sinon traité en capital dans le configurateur
  retirementMonthly?: number; // rente estimée 3a à la retraite (optionnel)
};

// ===== Résultats et segments d’affichage =====

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
  invalidity: {
    maladie: GapStack;
    accident: GapStack;
    current: GapStack; // selon ctx.eventInvalidity
  };
  death: {
    maladie: GapStack;
    accident: GapStack;
    current: GapStack; // selon ctx.eventDeath
  };
  retirement: GapStack;
};

// ===== Helpers LAA (calculs purs, client-safe) =====

const DEFAULT_LAA: LaaParams = {
  insured_earnings_max: 148200,
  disabilityPctFull: 80,
  overallCapPct: 90,
  spousePct: 40,
  orphanPct: 15,
  doubleOrphanPct: 25,
  familyCapPct: 70,
};

const round = (x: number) => Math.round(x);
const pct = (x: number, p: number) => (x * p) / 100;

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

/** Survivants accident (LAA) — complément jusqu’à 90% après AVS/AI, avec cap famille 70% sur la part LAA */
function laaSurvivorsMonthly(
  annualIncome: number,
  spouseHasRight: boolean,
  nOrphans: number,
  nDoubleOrphans: number,
  avsAiSurvivorsMonthlyTotal: number,
  laa: LaaParams
) {
  const insured = Math.min(annualIncome, laa.insured_earnings_max);

  // Nominaux LAA
  let spouseAnnual = spouseHasRight ? pct(insured, laa.spousePct) : 0;
  const orphansSimple = Math.max(0, nOrphans - nDoubleOrphans);
  const orphanAnnual = orphansSimple * pct(insured, laa.orphanPct);
  const doubleAnnual = nDoubleOrphans * pct(insured, laa.doubleOrphanPct);

  let nominalTotal = spouseAnnual + orphanAnnual + doubleAnnual;
  const famCap = pct(insured, laa.familyCapPct); // 70%
  let ratio = 1;
  if (nominalTotal > famCap) {
    ratio = famCap / nominalTotal;
    spouseAnnual *= ratio;
    nominalTotal = famCap; // (orphan+double) ajustés via ratio aussi
  }

  // Coordination avec AVS/AI survivants
  const avsAnnual = (avsAiSurvivorsMonthlyTotal ?? 0) * 12;
  const overallCap = pct(insured, laa.overallCapPct); // 90%
  const laaPayAnnual = Math.min(nominalTotal, Math.max(0, overallCap - avsAnnual));

  const prorata = nominalTotal > 0 ? laaPayAnnual / nominalTotal : 0;
  return {
    insuredAnnual: insured,
    spouseMonthly: round((spouseAnnual * prorata) / 12),
    laaMonthlyTotal: round(laaPayAnnual / 12),
    avsMonthlyTotal: round(avsAnnual / 12),
    overallCapMonthly: round(overallCap / 12),
    // NB: si tu veux détailler orphelins: ((orphanAnnual+doubleAnnual)*prorata)/12
  };
}

/** Spouse right basic heuristic (LPP/LAA minimum rules) */
function spouseHasRightBasic(survivor: SurvivorContextLite) {
  const marriedOrReg =
    survivor.maritalStatus === 'marie' ||
    survivor.maritalStatus === 'mariee' ||
    survivor.maritalStatus === 'partenariat_enregistre';
  return marriedOrReg && (survivor.hasChild || (survivor.ageAtWidowhood ?? 45) >= 45);
}

// ===== Hook principal =====

export function useGaps(params: {
  annualIncome: number;
  targets: NeedsSliders;             // sliders (invalidity/death/retirement)
  avs: AvsInputs;                    // computeAvsAiMonthly(...)
  lpp: LppInputs;                    // certificats/minima LPP
  ctx: GapsCtx;                      // toggles & famille
  laaParams?: LaaParams;             // si non fourni → DEFAULT_LAA
  thirdPillar?: ThirdPillar;         // rentes 3e pilier si déjà configurées
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
    // 1) Cibles mensuelles (avec clamp 90% sur Invalidité)
    const tgt = computeTargetsMonthly(annualIncome, targets, { invalidityMaxPct: 90, minPct: 50 });
    const targetsMonthly = {
      invalidity: tgt.invalidity,
      death: tgt.death,
      retirement: tgt.retirement,
    };

    // 2) Invalidité — MALADIE
    const invMaladieCovered =
      Math.max(0, avs.invalidityMonthly) +
      Math.max(0, lpp.invalidityMonthly ?? 0) +
      Math.max(0, thirdPillar?.invalidityMonthly ?? 0);

    const invMaladie: GapStack = {
      target: targetsMonthly.invalidity,
      segments: [
        { label: 'AVS/AI', value: Math.max(0, avs.invalidityMonthly), source: 'AVS' },
        { label: 'LPP', value: Math.max(0, lpp.invalidityMonthly ?? 0), source: 'LPP' },
        ...(thirdPillar?.invalidityMonthly
          ? [{ label: '3e pilier', value: thirdPillar.invalidityMonthly, source: 'P3' } as GapSegment]
          : []),
      ],
      covered: Math.min(targetsMonthly.invalidity, invMaladieCovered),
      gap: Math.max(0, targetsMonthly.invalidity - invMaladieCovered),
    };

    // 3) Invalidité — ACCIDENT (coordination AI + LAA ≤ 90%)
    const laaInv = laaInvalidityMonthly(
      annualIncome,
      avs.invalidityMonthly,
      Math.max(40, Math.min(100, ctx.invalidityDegreePct ?? 100)),
      laaParams
    );
    const invAccidentCovered = laaInv.totalMonthly + Math.max(0, thirdPillar?.invalidityMonthly ?? 0);
    const invAccident: GapStack = {
      target: laaInv.capMonthly, // cible = cap 90% du gain assuré (cohérent accident)
      segments: [
        { label: 'AI (AVS/AI)', value: laaInv.aiMonthly, source: 'AVS' },
        { label: 'LAA (coord.)', value: laaInv.laaMonthly, source: 'LAA' },
        ...(thirdPillar?.invalidityMonthly
          ? [{ label: '3e pilier', value: thirdPillar.invalidityMonthly, source: 'P3' } as GapSegment]
          : []),
      ],
      covered: Math.min(laaInv.capMonthly, invAccidentCovered),
      gap: Math.max(0, laaInv.capMonthly - invAccidentCovered),
    };

    // 4) Décès — MALADIE
    const avsSurvivorsMonthlyTotal =
      (ctx.survivor && spouseHasRightBasic(ctx.survivor) ? Math.max(0, avs.widowMonthly) : 0) +
      ctx.childrenCount * Math.max(0, avs.childMonthly);

    const decesMaladieCovered =
      avsSurvivorsMonthlyTotal +
      Math.max(0, lpp.widowMonthly ?? 0) +
      ctx.childrenCount * Math.max(0, lpp.orphanMonthly ?? 0) +
      Math.max(0, thirdPillar?.deathMonthly ?? 0);

    const decesMaladie: GapStack = {
      target: targetsMonthly.death,
      segments: [
        { label: 'AVS survivants', value: avsSurvivorsMonthlyTotal, source: 'AVS' },
        {
          label: 'LPP survivants',
          value: Math.max(0, (lpp.widowMonthly ?? 0) + ctx.childrenCount * (lpp.orphanMonthly ?? 0)),
          source: 'LPP',
        },
        ...(thirdPillar?.deathMonthly
          ? [{ label: '3e pilier', value: thirdPillar.deathMonthly, source: 'P3' } as GapSegment]
          : []),
      ],
      covered: Math.min(targetsMonthly.death, decesMaladieCovered),
      gap: Math.max(0, targetsMonthly.death - decesMaladieCovered),
    };

    // 5) Décès — ACCIDENT (ajoute le complément LAA coordonné)
    const laaSurv = laaSurvivorsMonthly(
      annualIncome,
      spouseHasRightBasic(ctx.survivor),
      Math.max(0, ctx.childrenCount),
      Math.max(0, ctx.doubleOrphans ?? 0),
      avsSurvivorsMonthlyTotal,
      laaParams
    );
    const decesAccidentCovered =
      decesMaladieCovered + Math.max(0, laaSurv.laaMonthlyTotal ?? 0);

    const decesAccident: GapStack = {
      target: targetsMonthly.death,
      segments: [
        ...decesMaladie.segments,
        { label: 'LAA complémentaire', value: Math.max(0, laaSurv.laaMonthlyTotal ?? 0), source: 'LAA' },
      ],
      covered: Math.min(targetsMonthly.death, decesAccidentCovered),
      gap: Math.max(0, targetsMonthly.death - decesAccidentCovered),
    };

    // 6) Retraite
    const retireCovered = computeRetirementCoverageMonthly({
      annualIncome,
      avsOldAgeMonthly: avs.oldAgeMonthly ?? 0,
      lppRetirementAnnualFromCert: lpp.retirementAnnualFromCert,
      lppCapitalAt65FromCert: lpp.capitalAt65FromCert,
      minConversionRatePct: lpp.minConversionRatePct,
      thirdPillarMonthly: thirdPillar?.retirementMonthly ?? 0,
    });
    const retirement: GapStack = {
      target: targetsMonthly.retirement,
      segments: [
        { label: 'AVS vieillesse', value: Math.max(0, avs.oldAgeMonthly ?? 0), source: 'AVS' },
        {
          label: 'LPP vieillesse',
          value: Math.max(
            0,
            estimateLppRetirementMonthly({
              lppRetirementAnnualFromCert: lpp.retirementAnnualFromCert,
              lppCapitalAt65FromCert: lpp.capitalAt65FromCert,
              minConversionRatePct: lpp.minConversionRatePct,
            })
          ),
          source: 'LPP',
        },
        ...(thirdPillar?.retirementMonthly
          ? [{ label: '3e pilier', value: thirdPillar.retirementMonthly, source: 'P3' } as GapSegment]
          : []),
      ],
      covered: Math.min(targetsMonthly.retirement, retireCovered),
      gap: Math.max(0, targetsMonthly.retirement - retireCovered),
    };

    // 7) Sélection “courante” (toggles)
    const invalidityCurrent = ctx.eventInvalidity === 'accident' ? invAccident : invMaladie;
    const deathCurrent = ctx.eventDeath === 'accident' ? decesAccident : decesMaladie;

    return {
      targetsPct: tgt.targets,
      targetsMonthly,
      invalidity: {
        maladie: invMaladie,
        accident: invAccident,
        current: invalidityCurrent,
      },
      death: {
        maladie: decesMaladie,
        accident: decesAccident,
        current: deathCurrent,
      },
      retirement,
    };
  }, [annualIncome, targets, avs, lpp, ctx, laaParams, thirdPillar]);
}
