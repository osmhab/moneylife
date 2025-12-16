// app/lib/rules/guards.ts
/* =========================================================
 * MoneyLife — Règles booléennes (guards)
 * Fichier : /lib/rules/guards.ts
 * ---------------------------------------------------------
 * Centralise les conditions légales AVS / LAA / LPP.
 * - Compatible avec ton API actuelle (fonctions "du jour")
 * - Ajoute des variantes "At" dépendantes d'une date de référence.
 * =======================================================*/

import type { ClientData } from "@/lib/core/types";

/* =========================================================
 * 0. Helpers communs
 * =======================================================*/

/** Âge à une date de référence (format "dd.MM.yyyy") */
export function computeAgeOn(dateStr: string | undefined, ref: Date): number {
  if (!dateStr) return 0;
  const [d, m, y] = dateStr.split(".").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return 0;
  const birth = new Date(y, m - 1, d);
  let age = ref.getFullYear() - birth.getFullYear();
  const mDiff = ref.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

/** (Compat) Âge "aujourd'hui" — laissé pour rétro-compatibilité */
export function computeAgeFromISO(dateStr?: string): number {
  return computeAgeOn(dateStr, new Date());
}

/** Marié(e) ou partenariat enregistré ? */
export function hasPartner(client: ClientData): boolean {
  // 1 = marié(e), 3 = partenariat enregistré (selon Enter_EtatCivil)
  return [1, 3].includes(client.Enter_etatCivil);
}

/** Au moins un enfant < 18 ans à la date de référence ? */
export function hasEnfantMoins18At(client: ClientData, ref: Date): boolean {
  if (!client.Enter_enfants?.length) return false;
  return client.Enter_enfants.some((e) => computeAgeOn(e.Enter_dateNaissance, ref) < 18);
}

/** (Compat) Au moins un enfant < 18 ans "aujourd'hui" */
export function hasEnfantMoins18(client: ClientData): boolean {
  return hasEnfantMoins18At(client, new Date());
}

/* =========================================================
 * 1. AVS — Rentes de survivants (tes règles)
 * ---------------------------------------------------------
 * Veuve : (âge veuve ≥ 45 ET mariage ≥ 5 ans) OU (≥1 enfant < 18)
 * Veuf  : (≥1 enfant < 18)
 * =======================================================*/

/** AVS — Rente de veuve due à la date ref ? */
export function Legal_renteAVSWidowDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;
  const mariageLong = client.Enter_mariageDuree === 0; // 0 = "au moins 5 ans"
  const enfantMineur = hasEnfantMoins18At(client, ref);
  const ageVeuve = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  return (ageVeuve >= 45 && mariageLong) || enfantMineur;
}

/** AVS — Rente de veuf due à la date ref ? */
export function Legal_renteAVSWidowerDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;
  return hasEnfantMoins18At(client, ref);
}

/** (Compat) AVS — versions "aujourd'hui" */
export function Legal_renteAVSWidowDue(client: ClientData): boolean {
  return Legal_renteAVSWidowDueAt(client, new Date());
}
export function Legal_renteAVSWidowerDue(client: ClientData): boolean {
  return Legal_renteAVSWidowerDueAt(client, new Date());
}

/* =========================================================
 * 2. LPP — Conjoint/partenaire (tes règles)
 * ---------------------------------------------------------
 * Rente due si :
 *  - Affiliation LPP
 *  - Marié/partenariat
 *  - (âge conjoint ≥ 45 ET mariage ≥ 5 ans) OU (≥1 enfant < 18)
 *
 * Rente non due si :
 *  - Affiliation LPP
 *  - Marié/partenariat
 *  - Aucun enfant < 18
 *  - (âge conjoint < 45) OU (mariage < 5 ans)
 * =======================================================*/

/** LPP — Rente conjointe due à la date ref ? */
export function Legal_renteLPPDueAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_Affilie_LPP) return false;
  if (!hasPartner(client)) return false;

  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  const mariageLong = client.Enter_mariageDuree === 0;
  const enfantMineur = hasEnfantMoins18At(client, ref);

  return (ageConjoint >= 45 && mariageLong) || enfantMineur;
}

/** LPP — Rente conjointe NON due à la date ref ? (→ capital possible) */
export function Legal_renteLPPNonDueAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_Affilie_LPP) return false;
  if (!hasPartner(client)) return false;

  if (hasEnfantMoins18At(client, ref)) return false; // enfant mineur → due
  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  const mariageCourt = client.Enter_mariageDuree === 1;
  return ageConjoint < 45 || mariageCourt;
}

/** (Compat) LPP — versions "aujourd'hui" (garde tes exports existants) */
export function Legal_renteLPPDue(client: ClientData): boolean {
  return Legal_renteLPPDueAt(client, new Date());
}
export function Legal_renteLPPNonDue(client: ClientData): boolean {
  return Legal_renteLPPNonDueAt(client, new Date());
}

/* =========================================================
 * 3. LAA — Conjoint/partenaire (conditions égales H/F)
 * ---------------------------------------------------------
 * Rente due si :
 *  - Marié/partenariat
 *  - (âge conjoint ≥ 45 ET mariage ≥ 5 ans) OU (≥1 enfant < 18)
 *
 * Rente non due si :
 *  - Marié/partenariat
 *  - Aucun enfant < 18
 *  - (âge conjoint < 45) OU (mariage < 5 ans)
 * =======================================================*/

/** LAA — Rente conjointe due à la date ref ? */
export function Legal_renteLAADueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;

  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  const mariageLong = client.Enter_mariageDuree === 0;
  const enfantMineur = hasEnfantMoins18At(client, ref);

  return (ageConjoint >= 45 && mariageLong) || enfantMineur;
}

/** LAA — Rente conjointe NON due à la date ref ? (→ capital unique) */
export function Legal_renteLAANonDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;

  if (hasEnfantMoins18At(client, ref)) return false;
  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  const mariageCourt = client.Enter_mariageDuree === 1;
  return ageConjoint < 45 || mariageCourt;
}

/** (Compat) LAA — versions "aujourd'hui" (garde tes exports existants) */
export function Legal_renteLAADue(client: ClientData): boolean {
  return Legal_renteLAADueAt(client, new Date());
}
export function Legal_renteLAANonDue(client: ClientData): boolean {
  return Legal_renteLAANonDueAt(client, new Date());
}

/* =========================================================
 * 4. Résumé combiné (compat + variante "At")
 * =======================================================*/

/** (Compat) Résumé au jour d'aujourd'hui — conserve la signature existante */
export function computeLegalRentesStatus(client: ClientData) {
  return {
    LPP_Due: Legal_renteLPPDue(client),
    LPP_NonDue: Legal_renteLPPNonDue(client),
    LAA_Due: Legal_renteLAADue(client),
    LAA_NonDue: Legal_renteLAANonDue(client),
    // Bonus (non cassant) : on expose aussi l'AVS si besoin
    AVS_Widow_Due: Legal_renteAVSWidowDue(client),
    AVS_Widower_Due: Legal_renteAVSWidowerDue(client),
  };
}

/** Variante à la date de référence (utile pour les projections année par année) */
export function computeLegalRentesStatusAt(client: ClientData, ref: Date) {
  return {
    LPP_Due: Legal_renteLPPDueAt(client, ref),
    LPP_NonDue: Legal_renteLPPNonDueAt(client, ref),
    LAA_Due: Legal_renteLAADueAt(client, ref),
    LAA_NonDue: Legal_renteLAANonDueAt(client, ref),
    AVS_Widow_Due: Legal_renteAVSWidowDueAt(client, ref),
    AVS_Widower_Due: Legal_renteAVSWidowerDueAt(client, ref),
  };
}