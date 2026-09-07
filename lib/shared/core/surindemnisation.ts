// lib/shared/core/surindemnisation.ts
//
// PLAFOND DE SURINDEMNISATION — arithmétique partagée.
//
// Une caisse réduit SES rentes d'invalidité et de survivants dès que, cumulées
// avec l'AI, la LAA et les indemnités journalières, elles dépassent un
// pourcentage du gain que l'assuré aurait perçu sans le sinistre (AXA, chiffre
// 73.1 : 90 %).
//
// Sans cette réduction, la matrice annonce un total que le client ne touchera
// jamais — et la lacune calculée en dessous est fausse d'autant.
//
// ⚠️ Copie miroir dans `app/lib/core/surindemnisation.ts` (application web).
// La fraction elle-même est extraite du règlement et posée sur le plan par
// `app/lib/server/appliquerReglement.ts`.

/** Revenus comptés dans le plafond. Les CAPITAUX en sont exclus (chiffre 73.3). */
export interface RevenusDeterminants {
  ai: number;
  lpp: number;
  laa: number;
  ij: number;
}

/**
 * Fraction applicable aux plans d'un client, ou null.
 *
 * Un client peut avoir plusieurs plans de 2e pilier. Si leurs caisses annoncent
 * des plafonds DIFFÉRENTS, on n'applique rien : la matrice additionne les rentes
 * LPP sans savoir laquelle vient de quelle caisse, et raboter au hasard
 * retrancherait à la mauvaise. Un seul plafond, ou aucun.
 */
export function plafondDesPlans(plans: unknown[]): number | null {
  const valeurs = new Set<number>();
  for (const p of plans ?? []) {
    const v = Number((p as { data?: Record<string, unknown> })?.data?.Enter_surindemnisationPlafond);
    if (Number.isFinite(v) && v > 0 && v <= 1) valeurs.add(v);
  }
  return valeurs.size === 1 ? [...valeurs][0] : null;
}

/**
 * Rabote la part LPP du dépassement.
 *
 * La caisse ne peut réduire que SA rente : l'AI est due par la Confédération,
 * la LAA par l'assureur-accidents, les indemnités journalières par l'assureur
 * perte de gain. Le client conserve donc toujours ces montants, et la part LPP
 * ne descend jamais sous zéro.
 */
export function reduireLpp(
  r: RevenusDeterminants,
  plafondAnnuel: number | null,
): { lpp: number; reduction: number } {
  const lpp = Math.max(0, Number(r.lpp) || 0);
  if (plafondAnnuel == null || !Number.isFinite(plafondAnnuel) || plafondAnnuel <= 0) {
    return { lpp, reduction: 0 };
  }
  const total = (Number(r.ai) || 0) + lpp + (Number(r.laa) || 0) + (Number(r.ij) || 0);
  const exces = total - plafondAnnuel;
  if (exces <= 0) return { lpp, reduction: 0 };

  const reduction = Math.min(lpp, exces);
  return { lpp: Math.round(lpp - reduction), reduction: Math.round(reduction) };
}

/** Plafond ANNUEL, ou null si le revenu ou la fraction manquent. */
export function plafondAnnuel(gainPresume: unknown, fraction: number | null): number | null {
  const g = Number(gainPresume);
  if (fraction == null || !Number.isFinite(g) || g <= 0) return null;
  return g * fraction;
}
