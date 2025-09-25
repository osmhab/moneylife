// lib/avsAI.ts
import { db } from '@/lib/firebaseAdmin';

export type AvsAiRow = {
  income: number;
  /** Rente AVS/AI de base (vieillesse/invalidité) - mensuel, plein droit (1/1) */
  oldAgeInvalidity: number;

  /** 120% : Rente de vieillesse/invalidité pour veuves/veufs (colonne distincte dans l'Échelle 44) */
  oldAgeInvalidityForWidowWidower?: number;

  /** 80% : Rente de survivant veuve/veuf (veuvage) */
  widowWidowerSurvivor?: number;

  /** 30% : Rente complémentaire (Zusatzrente) */
  supplementary30?: number;

  /** 40% : Rente pour enfant (Kinderrente) */
  child40: number;

  /** 60% : Rente d’orphelin */
  orphan60: number;

  /** Ancienne colonne (historiquement mal nommée) : pouvait contenir le 120% */
  widowWidower?: number;
};

export type AvsAiScale = {
  year: number;
  scale: '44';
  currency: 'CHF' | string;
  rows: AvsAiRow[];
};

export type CareerCoeff = 1 | 0.75 | 0.5 | 0.25;

export type AvsAiResult = {
  baseIncomeMatched: number;
  coeff: CareerCoeff;

  /** Vieillesse 65 (mensuel) */
  oldAge65: number;

  /** Invalidité (mensuel) — même base que vieillesse */
  invalidity: number;

  /** Veuve/veuf (80%) — c'est la rente de survivant */
  widowWidower: number;

  /** Orphelin (60%) */
  orphan: number;

  /** Rente pour enfant (40%) */
  child: number;

  /** 120% : AVS/AI pour veuves/veufs (info supplémentaire utile pour l'affichage) */
  forWidowWidower120?: number;

  /** 30% : Rente complémentaire (info supplémentaire pour l'affichage) */
  supplementary30?: number;
};

function nearestRow(rows: AvsAiRow[], annualIncome: number) {
  let best = rows[0];
  let diff = Math.abs(rows[0].income - annualIncome);
  for (const r of rows) {
    const d = Math.abs(r.income - annualIncome);
    if (d < diff) {
      best = r;
      diff = d;
    }
  }
  return best;
}

const round = (x: number) => Math.round(x);
const applyCoeff = (x: number, c: CareerCoeff) => round(x * c);

/**
 * Robust helpers pour tolérer l'ancien schéma Firestore le temps de la migration.
 * - widow 80% : priorité à widowWidowerSurvivor ; sinon déduit de la colonne 120% (× 2/3) ;
 *   sinon à défaut 80% de la base (arrondi).
 * - 120% : priorité à oldAgeInvalidityForWidowWidower ; sinon ancienne "widowWidower" ; sinon 120% de la base.
 * - 30% : priorité à supplementary30 ; sinon 30% de la base.
 * - 40% / 60% : si absents (ne devrait pas arriver), dérive de la base.
 */
function get120(row: AvsAiRow): number {
  const v =
    row.oldAgeInvalidityForWidowWidower ??
    row.widowWidower ??
    round(row.oldAgeInvalidity * 1.2);
  return v;
}

function get80(row: AvsAiRow): number {
  const v =
    row.widowWidowerSurvivor ??
    (row.oldAgeInvalidityForWidowWidower
      ? round((row.oldAgeInvalidityForWidowWidower * 2) / 3)
      : row.widowWidower
      ? round((row.widowWidower * 2) / 3)
      : round(row.oldAgeInvalidity * 0.8));
  return v;
}

function get30(row: AvsAiRow): number {
  return row.supplementary30 ?? round(row.oldAgeInvalidity * 0.3);
}

function get40(row: AvsAiRow): number {
  return row.child40 ?? round(row.oldAgeInvalidity * 0.4);
}

function get60(row: AvsAiRow): number {
  return row.orphan60 ?? round(row.oldAgeInvalidity * 0.6);
}

/**
 * Calcule les prestations mensuelles AVS/AI à partir du revenu annuel déterminant.
 * - Prend la ligne de l'échelle la plus proche du revenu fourni (lookup par "nearest").
 * - Applique éventuellement le coefficient de carrière (1, 3/4, 1/2, 1/4).
 */
export async function computeAvsAiMonthly(
  annualIncome: number,
  { year = 2025, coeffCarriere = 1 as CareerCoeff }: { year?: number; coeffCarriere?: CareerCoeff }
): Promise<AvsAiResult> {
  const snap = await db.collection('regs_avs_ai').doc(String(year)).get();
  if (!snap.exists) throw new Error(`regs_avs_ai/${year} absent`);
  const scale = snap.data() as AvsAiScale;
  if (!scale?.rows?.length) throw new Error('Barème AVS/AI vide');

  const row = nearestRow(scale.rows, annualIncome);

  const base = row.oldAgeInvalidity;
  const v120 = get120(row);
  const v80 = get80(row);
  const v30 = get30(row);
  const v40 = get40(row);
  const v60 = get60(row);

  return {
    baseIncomeMatched: row.income,
    coeff: coeffCarriere,

    // Vieillesse et invalidité utilisent la même base de rente
    oldAge65: applyCoeff(base, coeffCarriere),
    invalidity: applyCoeff(base, coeffCarriere),

    // Survivant veuve/veuf = 80%
    widowWidower: applyCoeff(v80, coeffCarriere),

    // Enfant (40%) / Orphelin (60%)
    child: applyCoeff(v40, coeffCarriere),
    orphan: applyCoeff(v60, coeffCarriere),

    // Infos supplémentaires utiles pour l'affichage détaillé
    forWidowWidower120: applyCoeff(v120, coeffCarriere),
    supplementary30: applyCoeff(v30, coeffCarriere),
  };
}
