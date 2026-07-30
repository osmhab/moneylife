// app/lib/analysis/plafond3a.ts
//
// Plafond 3a annuel déductible — dépend de l'affiliation au 2e pilier (LPP) :
//  - AFFILIÉ LPP  → « petit plafond » (montant fixe légal).
//  - PAS affilié (typiquement indépendant sans caisse) → « grand plafond » =
//    20 % du revenu annuel, plafonné à un maximum légal.
// Source unique : utilisée par situation.ts, new3a.ts et le hook — pour ne PAS re-diverger.

/** Petit plafond 3a (avec 2e pilier), 2025. */
export const PLAFOND_3A_PETIT = 7258;
/** Plafond du « grand plafond » (sans 2e pilier), 2025 : 20 % du revenu, max ce montant. */
export const PLAFOND_3A_GRAND_MAX = 36288;
export const PLAFOND_3A_TAUX_INDEP = 0.2;

/** Plafond 3a annuel déductible selon l'affiliation LPP (déterminant) + le salaire annuel. */
export function plafond3aAnnuel(cloudData: any): number {
  const affilie = cloudData?.Enter_Affilie_LPP === true;
  if (affilie) return PLAFOND_3A_PETIT;
  const salaire = Number(cloudData?.Enter_salaireAnnuel) || 0;
  return Math.min(PLAFOND_3A_TAUX_INDEP * salaire, PLAFOND_3A_GRAND_MAX);
}
