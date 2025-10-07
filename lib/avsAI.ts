// lib/avsAI.ts
// Calcul AVS/AI (mensuel) depuis l'Échelle 44 locale (table OFAS embarquée)

import { getRegs } from '@/lib/regs'

/* ────────────────────────────────────────────────────────────────────────────
 * Utils
 * ──────────────────────────────────────────────────────────────────────────── */
function clamp01(x: number) { return Math.max(0, Math.min(1, x)) }
function roundCHF(x: number) { return Math.round(x) }

function parseBirthDateISO(s?: string | null): Date | null {
  if (!s) return null
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m1) return new Date(+m1[1], +m1[2] - 1, +m1[3])
  const m2 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1])
  return null
}

function ageAtYear(birth: Date, year: number) {
  const ref = new Date(year, 0, 1)
  let a = ref.getFullYear() - birth.getFullYear()
  const m = ref.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) a--
  return a
}

/* ────────────────────────────────────────────────────────────────────────────
 * Carrière & bonifications (inchangés fonctionnellement, robustifiés)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Calcule un coefficient carrière ≈ années cotisées / 44 */
export function computeCareerCoeffFromParams({
  currentYear,
  startWorkYearCH,
  missingYears,
}: {
  currentYear: number
  startWorkYearCH?: number
  missingYears?: number[]
}): number {
  const gaps = new Set((missingYears ?? []).filter((y) => Number.isFinite(y)))

  // Cas 1 — on connaît l’année de début: fenêtre [start..current]
  if (typeof startWorkYearCH === 'number' && Number.isFinite(startWorkYearCH)) {
    const start = Math.min(startWorkYearCH, currentYear)
    const totalYears = Math.max(0, currentYear - start + 1)
    const contributed = Array.from({ length: totalYears }, (_, i) => start + i)
      .filter((y) => !gaps.has(y)).length
    return clamp01(contributed / 44)
  }

  // Cas 2 — pas de start: fenêtre glissante des 44 dernières années
  const winStart = currentYear - 43
  const totalYears = 44
  let missingInWindow = 0
  for (const y of gaps) if (y >= winStart && y <= currentYear) missingInWindow++
  const contributed = Math.max(0, totalYears - missingInWindow)
  return clamp01(contributed / 44)
}

/** Ensemble des années où au moins un enfant est < 16 ans (pour bonifications éducatives) */
export function yearsWithChildUnder16(childrenDob: string[] = [], currentYear: number): Set<number> {
  const set = new Set<number>()
  for (const iso of childrenDob) {
    const y = Number(iso?.slice(0, 4))
    if (!Number.isFinite(y)) continue
    const end = Math.min(currentYear, y + 15) // <16 → 0..15 inclus
    for (let t = y; t <= end; t++) set.add(t)
  }
  return set
}

/** RAMD proxy = salaire annuel + (bonifs moyennées sur années cotisées) */
export function computeRamdProxyWithBonifs(opts: {
  annualIncome: number
  year: number
  maritalStatus?: string
  childrenBirthdates?: string[]
  startWorkYearCH?: number
  missingYears?: number[]
  caregivingYears?: number[]
  /** overrides optionnels si pas présents dans regs */
  eduCreditCHFOverride?: number
  careCreditCHFOverride?: number
}): number {
  const Y = opts.year
  const hasStart = typeof opts.startWorkYearCH === 'number' && Number.isFinite(opts.startWorkYearCH)
  const start = hasStart ? Math.min(opts.startWorkYearCH as number, Y) : undefined

  const gaps = new Set((opts.missingYears ?? []).filter((y) => Number.isFinite(y)))
  const contribYears: number[] = start != null
    ? Array.from({ length: Math.max(0, Y - start + 1) }, (_, i) => start + i).filter((y) => !gaps.has(y))
    : Array.from({ length: 22 }, (_, i) => Y - i) // fallback “safe”
  const nContrib = Math.max(1, contribYears.length)

  // Bonifs éducatives
  const eduYearsAll = yearsWithChildUnder16(opts.childrenBirthdates ?? [], Y)
  let nEduYears = 0
  for (const y of eduYearsAll) if (contribYears.includes(y)) nEduYears++

  // Bonifs assistance
  const careSet = new Set((opts.caregivingYears ?? []).filter((y) => Number.isFinite(y)))
  let nCareYears = 0
  for (const y of contribYears) if (careSet.has(y)) nCareYears++

  // Montants depuis la table regs (ou overrides)
  const meta = getRegs('avs_ai', Y) || {}
  const eduCreditCHF = Number(opts.eduCreditCHFOverride ?? (meta as any)?.eduCreditCHF ?? 0) || 0
  const careCreditCHF = Number(opts.careCreditCHFOverride ?? (meta as any)?.careCreditCHF ?? 0) || 0

  // Partage éducatif : 0.5 si marié / partenariat enregistré, sinon 1.0
  const married =
    opts.maritalStatus === 'marie' ||
    opts.maritalStatus === 'mariee' ||
    opts.maritalStatus === 'partenariat_enregistre'
  const eduShare = married ? 0.5 : 1.0

  const totalBonifs = eduShare * eduCreditCHF * nEduYears + careCreditCHF * nCareYears
  const avgBonus = totalBonifs / nContrib
  const ramdProxy = Math.max(0, Number(opts.annualIncome ?? 0)) + Math.max(0, avgBonus)
  return ramdProxy
}

export function computeBonificationStats(opts: {
  year: number
  childrenBirthdates?: string[]
  startWorkYearCH?: number
  missingYears?: number[]
  caregivingYears?: number[]
}): { nContrib: number; nEduYears: number; nCareYears: number } {
  const Y = opts.year
  const hasStart = typeof opts.startWorkYearCH === 'number' && Number.isFinite(opts.startWorkYearCH)
  const start = hasStart ? Math.min(opts.startWorkYearCH as number, Y) : undefined

  const gaps = new Set((opts.missingYears ?? []).filter((y) => Number.isFinite(y)))
  const contribYears: number[] = start != null
    ? Array.from({ length: Math.max(0, Y - start + 1) }, (_, i) => start + i).filter((y) => !gaps.has(y))
    : Array.from({ length: 22 }, (_, i) => Y - i)
  const nContrib = Math.max(1, contribYears.length)

  const eduAll = yearsWithChildUnder16(opts.childrenBirthdates ?? [], Y)
  let nEduYears = 0; for (const y of eduAll) if (contribYears.includes(y)) nEduYears++

  const careSet = new Set((opts.caregivingYears ?? []).filter((y) => Number.isFinite(y)))
  let nCareYears = 0; for (const y of contribYears) if (careSet.has(y)) nCareYears++

  return { nContrib, nEduYears, nCareYears }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sélection de ligne & types exposés
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Sélectionne la LIGNE "plancher" du barème :
 * - on prend la dernière ligne dont income <= annualIncome
 * - si en-dessous de la 1re ligne: on prend la 1re
 * - si au-dessus de la dernière: on prend la dernière
 */
function pickRowByIncomeFloor(rows: Array<any>, annualIncome: number) {
  const sorted = [...rows].sort((a, b) => a.income - b.income)
  const eff = Math.max(0, Math.round(annualIncome || 0))
  if (!sorted.length) return null
  if (eff <= sorted[0].income) return sorted[0]
  const last = sorted[sorted.length - 1]
  if (eff >= last.income) return last
  let chosen = sorted[0]
  for (const r of sorted) {
    if (r.income <= eff) chosen = r
    else break
  }
  return chosen
}

/* ────────────────────────────────────────────────────────────────────────────
 * AVS/AI — API publique
 * ──────────────────────────────────────────────────────────────────────────── */

export type AvsAiOptions = {
  year: number
  /** Facteur carrière ACTUEL (0..1) : années cotisées / 44 */
  coeffCarriere: number
  /** Si true, on projette la retraite à 65 ans (sans toucher AI/survivants) */
  projectTo65?: boolean
  /** Données pour projeter */
  birthDateISO?: string              // "YYYY-MM-DD" ou "DD.MM.YYYY"
  startWorkYearCH?: number           // ex. 2007
  missingYears?: number[]            // ex. [2012, 2015]
}

export type AvsAiMonthly = {
  year: number
  currency: 'CHF'
  // Valeurs mensuelles
  oldAge65: number            // vieillesse (échelle 44) — utilise coeff projeté si activé
  invalidity: number          // rente AI (adulte) — coeff actuel
  widowWidower: number        // veuf/veuve (80%) — coeff actuel
  child: number               // rente d’enfant (40%) — coeff actuel
  orphan: number              // orphelin (60%) — coeff actuel
  // Infos
  baseIncomeMatched: number
  coeff: AvsAiOptions['coeffCarriere']   // coeff ACTUEL (compat)
  coeffProjectedTo65?: number            // transparence si projection activée
  forWidowWidower120: number             // 120% (info)
  supplementary30: number                // 30% (info)
}

/** Calcule un coeff projeté à 65 ans (années actuelles + années restantes), plafonné à 44 */
function computeProjectedCareerCoeffTo65(opts: {
  year: number
  birthDateISO?: string
  startWorkYearCH?: number
  missingYears?: number[]
  coeffCarriere?: number
}): number | undefined {
  const { year, birthDateISO, startWorkYearCH, missingYears, coeffCarriere } = opts

  // Années cotisées “actuelles”
  let contributedNow: number | undefined
  if (typeof startWorkYearCH === 'number') {
    const start = Math.min(startWorkYearCH, year)
    const totalYears = Math.max(0, year - start + 1)
    const gaps = new Set((missingYears ?? []).filter((y) => Number.isFinite(y)))
    const contribYears = Array.from({ length: totalYears }, (_, i) => start + i).filter((y) => !gaps.has(y))
    contributedNow = contribYears.length
  } else if (typeof coeffCarriere === 'number') {
    contributedNow = Math.round(clamp01(coeffCarriere) * 44)
  }

  if (typeof contributedNow !== 'number') return undefined

  // Années restantes jusqu’à 65
  const birth = parseBirthDateISO(birthDateISO)
  const yearsLeft = birth ? Math.max(0, 65 - ageAtYear(birth, year)) : 0

  // Total plafonné à 44
  const total = Math.min(44, Math.max(0, contributedNow + yearsLeft))
  return total / 44
}

/** Version synchrone — utilisable dans des hooks/render */
export function computeAvsAiMonthlySync(
  annualIncome: number,
  opts: AvsAiOptions
): AvsAiMonthly {
  const table = getRegs('avs_ai', opts.year)
  const rows: Array<any> = table?.rows ?? []
  if (!rows.length) throw new Error('Échelle 44 introuvable en local')

  const row = pickRowByIncomeFloor(rows, annualIncome)
  if (!row) throw new Error('Ligne de barème introuvable')

  // Coeffs
  const cCurrent = clamp01(Number(opts.coeffCarriere ?? 0))
  const cProjected =
    opts.projectTo65
      ? (computeProjectedCareerCoeffTo65({
          year: opts.year,
          birthDateISO: opts.birthDateISO,
          startWorkYearCH: opts.startWorkYearCH,
          missingYears: opts.missingYears,
          coeffCarriere: cCurrent,
        }) ?? cCurrent)
      : undefined

  const scaleCurrent = (v?: number) => roundCHF((v ?? 0) * cCurrent)
  const scaleRet     = (v?: number) => roundCHF((v ?? 0) * (cProjected ?? cCurrent))

  // Vieillesse = coeff projeté si demandé; AI/Survivants = coeff actuel
  const oldAge65 = scaleRet(row.oldAgeInvalidity)
  const invalidity = scaleCurrent(row.oldAgeInvalidity)
  const widowWidower = scaleCurrent(row.widowWidowerSurvivor)
  const child = scaleCurrent(row.child40)
  const orphan = scaleCurrent(row.orphan60)
  const forWidowWidower120 = scaleRet(row.oldAgeInvalidityForWidowWidower)
  const supplementary30 = scaleRet(row.supplementary30)

  return {
    year: opts.year,
    currency: 'CHF',
    oldAge65,
    invalidity,
    widowWidower,
    child,
    orphan,
    baseIncomeMatched: row.income ?? annualIncome,
    coeff: cCurrent,
    coeffProjectedTo65: cProjected,
    forWidowWidower120,
    supplementary30,
  }
}

/** Compat — conserve l’API async existante */
export async function computeAvsAiMonthly(
  annualIncome: number,
  opts: AvsAiOptions
): Promise<AvsAiMonthly> {
  return computeAvsAiMonthlySync(annualIncome, opts)
}
