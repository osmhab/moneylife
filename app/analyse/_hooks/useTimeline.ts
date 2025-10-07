// app/analyse/_hooks/useTimeline.ts
'use client'

import { useMemo } from 'react'
import type { TimelinePoint } from '../_components/charts/AreaInteractive'
import type { EventKind } from '../_hooks/useGaps'

export type Theme = 'invalidite' | 'deces' | 'retraite'

export type BuildTimelineInputs = {
  theme: Theme
  start: Date
  end: Date
  unit: 'mois' | 'an'
  scenario: EventKind // 'maladie' | 'accident'

  annualIncome: number
  targetsPct: { invalidity: number; death: number; retirement: number }

  avs: {
    invalidityMonthly: number
    widowMonthly: number
    childMonthly: number
    oldAgeMonthly: number
    invalidityChildMonthly?: number
  }
  lpp: {
    invalidityMonthly: number
    invalidityChildMonthly?: number
    widowMonthly: number
    orphanMonthly: number
    retirementAnnualFromCert?: number
    capitalAt65FromCert?: number
  }
  laa?: {
    invalidityMonthly?: number
    survivorsMonthlyTotal?: number
  }
  thirdPillarMonthly?: number

  childrenBirthYYYYMM?: string[]
  retirementStartAge?: number
  currentAge?: number

  spouseHasRight?: boolean
  initialOrphans?: number
  laaSurvivorsPerOrphans?: number[]

  /** ✅ NEW: étend les rentes d’enfant à 25 ans (formation) au lieu de 18 */
  extendChildBenefitsTo25?: boolean
}

function addMonths(d: Date, n: number) {
  const nd = new Date(d)
  nd.setMonth(nd.getMonth() + n)
  return nd
}
function yyyymm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ✅ Parse une date enfant en début de mois (multi-formats)
function parseBirthToMonth(s: string): Date | null {
  if (!s) return null

  // yyyy-mm or yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1)

  // dd.mm.yyyy
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, 1)

  // yyyymm (compact)
  m = s.match(/^(\d{4})(\d{2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1)

  return null
}

function monthsBetween(a: Date, b: Date) {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())
}


export function useTimeline(inputs: BuildTimelineInputs): {
  data: TimelinePoint[]
  markers: { x: string; label: string }[]
} {
  const {
    theme, start, end, scenario,
    avs, lpp, laa,
    thirdPillarMonthly = 0,
    childrenBirthYYYYMM = [],
    retirementStartAge = 65,
    currentAge = 40,

    annualIncome,
    targetsPct,

    spouseHasRight,
    initialOrphans,
    laaSurvivorsPerOrphans,

    extendChildBenefitsTo25 = false, // ✅ par défaut: 18 ans
  } = inputs

  return useMemo(() => {
    const data: TimelinePoint[] = []
    const markers: { x: string; label: string }[] = []

    // Marqueurs 18 & 25 — robustes à tous les formats
childrenBirthYYYYMM.forEach(s => {
  const birth = parseBirthToMonth(s)
  if (!birth) return
  const m18 = yyyymm(addMonths(birth, 18 * 12))
  const m25 = yyyymm(addMonths(birth, 25 * 12))
  markers.push({ x: m18, label: '18 ans enfant' })
  markers.push({ x: m25, label: '25 ans enfant' })
})


    // Début retraite
    const monthsToRet = Math.max(0, (retirementStartAge - currentAge) * 12)
    const retX = yyyymm(addMonths(start, monthsToRet))
    markers.push({ x: retX, label: `Début retraite (${retirementStartAge} ans)` })

    // Cibles
    const targetInvMonthly   = (annualIncome * (targetsPct.invalidity ?? 0) / 100) / 12
    const targetDeathMonthly = (annualIncome * (targetsPct.death ?? 0) / 100) / 12
    const targetRetMonthly   = (annualIncome * (targetsPct.retirement ?? 0) / 100) / 12

    let k = 0
    while (true) {
      const d = addMonths(start, k)
      if (d > end) break
      const t = yyyymm(d)

      // Sources
      const avsInvalid      = avs.invalidityMonthly
      const avsInvalidChildPerChild = avs.invalidityChildMonthly ?? avs.childMonthly // par enfant
      const avsWidow        = avs.widowMonthly
      const avsChildGeneric = avs.childMonthly
      const avsOldAge       = avs.oldAgeMonthly

      const lppInvalid      = lpp.invalidityMonthly
// ✅ Fallback légal : si le certif ne donne pas "enfant invalidité", on applique 20% de la rente d’invalidité
const lppInvalidChildPerChild =
  typeof lpp.invalidityChildMonthly === 'number'
    ? lpp.invalidityChildMonthly
    : (typeof lppInvalid === 'number' ? Math.round(lppInvalid * 0.20) : 0)

      const lppOrphan       = lpp.orphanMonthly
      const lppWidow        = lpp.widowMonthly

      const laaInvalid      = laa?.invalidityMonthly ?? 0
      const laaSurvivorsConst = laa?.survivorsMonthlyTotal ?? 0

      const p3 = thirdPillarMonthly

      let target = 0
      let covered = 0

      if (theme === 'invalidite') {
      // ✅ Nombre d’enfants éligibles : <18 ou <25 si formation (parser multi-formats)
      //    AUCUN fallback : si aucune date fournie → 0 (on ne compte pas d’enfants)
      const limitYears = extendChildBenefitsTo25 ? 25 : 18
      const eligibleChildren = childrenBirthYYYYMM.length
        ? childrenBirthYYYYMM.filter(s => {
            const birth = parseBirthToMonth(s)
            if (!birth) return false
            const ageMonths = monthsBetween(d, birth)
            return ageMonths < limitYears * 12
          }).length
        : 0




        // Montants “enfant” = par enfant × nb éligibles
        // Montants “enfant” = par enfant × nb éligibles, UNIQUEMENT si une rente par enfant est accordée (>0)
        const avsInvalidChild = (avsInvalidChildPerChild > 0 ? avsInvalidChildPerChild * eligibleChildren : 0)
        const lppInvalidChild = (lppInvalidChildPerChild > 0 ? lppInvalidChildPerChild * eligibleChildren : 0)


        const laaSeg = scenario === 'accident' ? laaInvalid : 0
        const p3Seg  = p3

        const avsInvalidSeg      = avsInvalid
        const avsInvalidChildSeg = avsInvalidChild
        const lppInvalidSeg      = lppInvalid
        const lppInvalidChildSeg = lppInvalidChild

        target  = targetInvMonthly
        covered = avsInvalidSeg + avsInvalidChildSeg + lppInvalidSeg + lppInvalidChildSeg + laaSeg + p3Seg
        const gap = Math.max(0, target - covered)

        data.push({
          t, target, covered, gap,
          avsInvalid: avsInvalidSeg,
          avsInvalidChild: avsInvalidChildSeg,
          lppInvalid: lppInvalidSeg,
          lppInvalidChild: lppInvalidChildSeg,
          laa: laaSeg,
          p3: p3Seg,
        } as TimelinePoint)

      } else if (theme === 'deces') {
        // (inchangé)
        const computedOrphans = childrenBirthYYYYMM.filter(s => {
  const birth = parseBirthToMonth(s)
  if (!birth) return false
  const ageMonths = monthsBetween(d, birth)
  return ageMonths < 18 * 12
}).length

        const nOrphans = (childrenBirthYYYYMM.length ? computedOrphans : (initialOrphans ?? 0))
        const avsOrphansNow = nOrphans * avsChildGeneric

        target = targetDeathMonthly

        const avsSeg = (spouseHasRight ? avsWidow : 0) + avsOrphansNow
        const lppSeg = lppWidow + lppOrphan

        let laaSeg = 0
        if (scenario === 'accident') {
          if (laaSurvivorsPerOrphans && laaSurvivorsPerOrphans.length) {
            const idx = Math.max(0, Math.min(nOrphans, laaSurvivorsPerOrphans.length - 1))
            laaSeg = laaSurvivorsPerOrphans[idx] ?? 0
          } else {
            laaSeg = laaSurvivorsConst
          }
        }

        const p3Seg = p3
        covered = avsSeg + lppSeg + laaSeg + p3Seg
        const gap = Math.max(0, target - covered)

        data.push({ t, target, covered, gap, avs: avsSeg, lpp: lppSeg, laa: laaSeg, p3: p3Seg } as TimelinePoint)

      } else {
        // retraite (inchangé)
        const isAfterRet = t >= retX
        target = isAfterRet ? targetRetMonthly : 0
        const avsSeg = isAfterRet ? avsOldAge : 0
        const lppSeg = isAfterRet
          ? (lpp.retirementAnnualFromCert ? lpp.retirementAnnualFromCert / 12 : 0)
          : 0
        const laaSeg = 0
        const p3Seg  = isAfterRet ? p3 : 0

        covered = avsSeg + lppSeg + laaSeg + p3Seg
        const gap = Math.max(0, target - covered)

        data.push({ t, target, covered, gap, avs: avsSeg, lpp: lppSeg, laa: laaSeg, p3: p3Seg } as TimelinePoint)
      }

      k++
    }

    return { data, markers }
  }, [
    theme, start, end, scenario,
    avs, lpp, laa, thirdPillarMonthly,
    childrenBirthYYYYMM, retirementStartAge, currentAge,
    annualIncome, targetsPct,
    spouseHasRight, initialOrphans, laaSurvivorsPerOrphans,
    extendChildBenefitsTo25, // ✅ dépendance
  ])
}
