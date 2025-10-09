'use client';

import { useMemo } from 'react';
import type { TimelinePoint } from '../_components/charts/AreaInteractive';
import type { EventKind } from '../_hooks/useGaps';

export type Theme = 'invalidite' | 'deces' | 'retraite';

export type BuildTimelineInputs = {
  theme: Theme;
  start: Date;
  end: Date;
  unit: 'mois' | 'an';
  scenario: EventKind; // 'maladie' | 'accident'
  annualIncome: number;
  targetsPct: { invalidity: number; death: number; retirement: number };

  avs: {
    invalidityMonthly: number;
    widowMonthly: number;
    childMonthly: number;
    oldAgeMonthly: number;
    invalidityChildMonthly?: number;
  };
  lpp: {
    invalidityMonthly: number;
    invalidityChildMonthly?: number;
    widowMonthly: number;
    orphanMonthly: number;
    retirementAnnualFromCert?: number;
    capitalAt65FromCert?: number;
  };
  laa?: {
    invalidityMonthly?: number;
    survivorsMonthlyTotal?: number;
  };
  thirdPillarMonthly?: number;

  childrenBirthYYYYMM?: string[];
  retirementStartAge?: number;
  currentAge?: number;

  spouseHasRight?: boolean;
  initialOrphans?: number;
  laaSurvivorsPerOrphans?: number[];

  extendChildBenefitsTo25?: boolean;
};

function addMonths(d: Date, n: number) {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
}
function yyyymm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse une date de naissance (plusieurs formats) en début de mois. */
function parseBirthToMonth(s: string): Date | null {
  if (!s) return null;
  // yyyy-mm or yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  // dd.mm.yyyy
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, 1);
  // yyyymm
  m = s.match(/^(\d{4})(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return null;
}

function monthsBetween(a: Date, b: Date) {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

export function useTimeline(inputs: BuildTimelineInputs): {
  data: TimelinePoint[];
  markers: { x: string; label: string }[];
} {
  const {
    theme,
    start,
    end,
    scenario,
    avs,
    lpp,
    laa,
    thirdPillarMonthly = 0,
    childrenBirthYYYYMM = [],
    retirementStartAge = 65,
    currentAge = 40,
    annualIncome,
    targetsPct,
    spouseHasRight,
    initialOrphans,
    laaSurvivorsPerOrphans,
    extendChildBenefitsTo25 = false,
  } = inputs;

  return useMemo(() => {
    const data: TimelinePoint[] = [];
    const markers: { x: string; label: string }[] = [];

    // Marqueurs pour les 18 et 25 ans des enfants
    childrenBirthYYYYMM.forEach((s) => {
      const birth = parseBirthToMonth(s);
      if (!birth) return;
      const m18 = yyyymm(addMonths(birth, 18 * 12));
      const m25 = yyyymm(addMonths(birth, 25 * 12));
      markers.push({ x: m18, label: '18 ans enfant' });
      markers.push({ x: m25, label: '25 ans enfant' });
    });

    // Marqueur du début de retraite
    const monthsToRet = Math.max(0, (retirementStartAge - currentAge) * 12);
    const retX = yyyymm(addMonths(start, monthsToRet));
    markers.push({ x: retX, label: `Début retraite (${retirementStartAge} ans)` });

    // Cibles mensuelles
    const targetInvMonthly =
      (annualIncome * (targetsPct.invalidity ?? 0) / 100) / 12;
    const targetDeathMonthly =
      (annualIncome * (targetsPct.death ?? 0) / 100) / 12;
    const targetRetMonthly =
      (annualIncome * (targetsPct.retirement ?? 0) / 100) / 12;

    // Prépare les dates de naissance en objets Date (ignorées si non parsables)
    const childBirthDates: Date[] = [];
    childrenBirthYYYYMM.forEach((s) => {
      const d = parseBirthToMonth(s);
      if (d) childBirthDates.push(d);
    });

    let k = 0;
    while (true) {
      const d = addMonths(start, k);
      if (d > end) break;
      const t = yyyymm(d);

      // AI
      const avsInvalid = avs.invalidityMonthly;
      const avsInvalidChildPerChild =
        avs.invalidityChildMonthly ?? avs.childMonthly ?? 0;
      const avsWidow = avs.widowMonthly;
      const avsChildGeneric = avs.childMonthly;
      const avsOldAge = avs.oldAgeMonthly;

      // LPP
      const lppInvalid = lpp.invalidityMonthly;
      const lppInvalidChildPerChild =
        typeof lpp.invalidityChildMonthly === 'number'
          ? lpp.invalidityChildMonthly
          : Math.round((lppInvalid ?? 0) * 0.2); // fallback 20%
      const lppOrphan = lpp.orphanMonthly;
      const lppWidow = lpp.widowMonthly;

      // LAA et 3e pilier
      const laaInvalid = laa?.invalidityMonthly ?? 0;
      const laaSurvivorsConst = laa?.survivorsMonthlyTotal ?? 0;
      const p3 = thirdPillarMonthly;

      let target = 0;
      let covered = 0;

      if (theme === 'invalidite') {
        // Nombre et détails des enfants actifs
        const limitYears = extendChildBenefitsTo25 ? 25 : 18;
        const perChildAi = avsInvalidChildPerChild;
        const perChildLpp = lppInvalidChildPerChild;

        // Montant de laaa (scenario accident)
        const laaSeg = scenario === 'accident' ? laaInvalid : 0;
        const p3Seg = p3;

        // Base adulte
        const avsInvalidSeg = avsInvalid;
        const lppInvalidSeg = lppInvalid;

        // Détails par enfant
        const point: any = { t };
        point.avsInvalid = avsInvalidSeg;
        point.lppInvalid = lppInvalidSeg;
        point.laa = laaSeg;
        point.p3 = p3Seg;

        let avsChildAgg = 0;
        let lppChildAgg = 0;

        childBirthDates.forEach((birth, idx) => {
          const ageMonths = monthsBetween(d, birth);
          const eligible = ageMonths < limitYears * 12;
          const ai = eligible ? perChildAi : 0;
          const lp = eligible ? perChildLpp : 0;
          point[`avsInvalidChild_${idx + 1}`] = ai;
          point[`lppInvalidChild_${idx + 1}`] = lp;
          avsChildAgg += ai;
          lppChildAgg += lp;
        });

        // Ajoute une clé agrégée (utile pour d’autres affichages)
        point.avsInvalidChild = avsChildAgg;
        point.lppInvalidChild = lppChildAgg;

        target = targetInvMonthly;
        covered =
          avsInvalidSeg +
          lppInvalidSeg +
          laaSeg +
          p3Seg +
          avsChildAgg +
          lppChildAgg;
        const gap = Math.max(0, target - covered);

        data.push({
          ...point,
          target,
          covered,
          gap,
        } as TimelinePoint);
      } else if (theme === 'deces') {
        // (comportement inchangé)
        const computedOrphans = childrenBirthYYYYMM.filter((s) => {
          const birth = parseBirthToMonth(s);
          if (!birth) return false;
          const ageMonths = monthsBetween(d, birth);
          return ageMonths < 18 * 12;
        }).length;

        const nOrphans = childrenBirthYYYYMM.length
          ? computedOrphans
          : initialOrphans ?? 0;
        const avsOrphansNow = nOrphans * avsChildGeneric;

        target = targetDeathMonthly;

        const avsSeg = (spouseHasRight ? avsWidow : 0) + avsOrphansNow;
        const lppSeg = lppWidow + lppOrphan;

        let laaSeg = 0;
        if (scenario === 'accident') {
          if (laaSurvivorsPerOrphans && laaSurvivorsPerOrphans.length) {
            const idx = Math.max(
              0,
              Math.min(nOrphans, laaSurvivorsPerOrphans.length - 1),
            );
            laaSeg = laaSurvivorsPerOrphans[idx] ?? 0;
          } else {
            laaSeg = laaSurvivorsConst;
          }
        }

        const p3Seg = p3;
        covered = avsSeg + lppSeg + laaSeg + p3Seg;
        const gap = Math.max(0, target - covered);

        data.push({
          t,
          target,
          covered,
          gap,
          avs: avsSeg,
          lpp: lppSeg,
          laa: laaSeg,
          p3: p3Seg,
        } as TimelinePoint);
      } else {
        // retraite
        const isAfterRet = t >= retX;
        target = isAfterRet ? targetRetMonthly : 0;
        const avsSeg = isAfterRet ? avsOldAge : 0;
        const lppSeg = isAfterRet
          ? (lpp.retirementAnnualFromCert ?? 0) / 12
          : 0;
        const laaSeg = 0;
        const p3SegRet = isAfterRet ? p3 : 0;

        covered = avsSeg + lppSeg + laaSeg + p3SegRet;
        const gap = Math.max(0, target - covered);

        data.push({
          t,
          target,
          covered,
          gap,
          avs: avsSeg,
          lpp: lppSeg,
          laa: laaSeg,
          p3: p3SegRet,
        } as TimelinePoint);
      }

      k++;
    }

    return { data, markers };
  }, [
    theme,
    start,
    end,
    scenario,
    avs,
    lpp,
    laa,
    thirdPillarMonthly,
    childrenBirthYYYYMM,
    retirementStartAge,
    currentAge,
    annualIncome,
    targetsPct,
    spouseHasRight,
    initialOrphans,
    laaSurvivorsPerOrphans,
    extendChildBenefitsTo25,
  ]);
}
