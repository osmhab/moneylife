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

/** Au moins un enfant (de TOUT âge) existant à la date de référence ?
 *  Ouvre le droit à la rente de VEUVE (LAVS art. 23 : « au décès, elle a un ou plusieurs
 *  enfants » — sans condition d'âge de l'enfant, contrairement au veuf). */
export function hasEnfantAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_enfants?.length) return false;
  return client.Enter_enfants.some((e) => computeAgeOn(e.Enter_dateNaissance, ref) >= 0);
}

/** Au moins un enfant ouvrant droit à une rente d'ORPHELIN à la date de référence ?
 *  Règle unique AVS/LPP : enfant < 18, OU < 25 s'il est ENCORE EN FORMATION.
 *  Utilisé pour l'« enfant à charge » de la rente de conjoint LPP (art. 19) et pour compter
 *  les orphelins. NB : le flag Enter_enFormation n'est pertinent qu'entre 18 et 25 ans. */
export function hasEnfantOrphelinEligibleAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_enfants?.length) return false;
  return client.Enter_enfants.some((e) => {
    const age = computeAgeOn(e.Enter_dateNaissance, ref);
    return age < 18 || (age < 25 && e.Enter_enFormation === true);
  });
}

/** Mariage "long" (≥ 5 ans) pour l'éligibilité aux rentes de survivant.
 *  ⚠️ Un Enter_mariageDuree ABSENT (non capté) est traité comme ≥ 5 ans — cas courant d'un
 *  couple marié. Sans ça, un champ manquant annulait SILENCIEUSEMENT les rentes de survivant
 *  (AVS/LPP/LAA) d'un client pourtant marié. Seul un `1` explicite = « < 5 ans » (court). */
export function isMariageLong(client: ClientData, ref: Date = new Date()): boolean {
  // Priorité à la DATE de mariage (auto-actualisante) : ≥ 5 ans révolus à la date de référence.
  if (client.Enter_dateMariage) return computeAgeOn(client.Enter_dateMariage, ref) >= 5;
  // Repli legacy : ancien flag binaire (0 = ≥ 5 ans, 1 = < 5 ans).
  if (client.Enter_mariageDuree != null) return client.Enter_mariageDuree === 0;
  // Filet : rien de capté → traité comme ≥ 5 ans (cas courant d'un couple marié).
  return true;
}

/* =========================================================
 * 1. AVS — Rentes de survivants (tes règles)
 * ---------------------------------------------------------
 * Veuve : (âge veuve ≥ 45 ET mariage ≥ 5 ans) OU (≥1 enfant < 18)
 * Veuf  : (≥1 enfant < 18)
 * =======================================================*/

/** AVS — Rente de veuve due à la date ref ?
 *  LAVS art. 23/24 : a un enfant (DE TOUT ÂGE) au décès, OU (≥45 ans ET mariage ≥5 ans).
 *  La rente de veuve ne s'éteint PAS aux 18 ans de l'enfant (≠ veuf). */
export function Legal_renteAVSWidowDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;
  const mariageLong = isMariageLong(client, ref); // ≥ 5 ans (date, sinon legacy, sinon filet)
  const aEnfant = hasEnfantAt(client, ref);
  const ageVeuve = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  return (ageVeuve >= 45 && mariageLong) || aEnfant;
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

/** LPP — Rente conjointe due à la date ref ?
 *  LPP art. 19 : a un enfant À CHARGE (ouvrant droit à l'orphelin : <18 ou <25 en formation),
 *  OU (≥45 ans ET mariage ≥5 ans). Même règle pour les deux sexes (pas de distinction veuf/veuve
 *  en LPP). Sinon : allocation unique (cf. Legal_renteLPPNonDueAt). */
export function Legal_renteLPPDueAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_Affilie_LPP) return false;
  if (!hasPartner(client)) return false;

  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  const mariageLong = isMariageLong(client, ref);
  const enfantACharge = hasEnfantOrphelinEligibleAt(client, ref);

  return (ageConjoint >= 45 && mariageLong) || enfantACharge;
}

/** LPP — Rente conjointe NON due à la date ref ? (→ capital possible) */
export function Legal_renteLPPNonDueAt(client: ClientData, ref: Date): boolean {
  if (!client.Enter_Affilie_LPP) return false;
  if (!hasPartner(client)) return false;

  if (hasEnfantOrphelinEligibleAt(client, ref)) return false; // enfant à charge → rente due
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
 * 3. LAA (accident) — Conjoint survivant · LAA art. 29
 * ---------------------------------------------------------
 * ⚠️ La LAA est PLUS GÉNÉREUSE et DIFFÉRENTE de l'AVS/LPP :
 *  - AUCUNE condition de durée de mariage.
 *  - VEUVE : enfant ouvrant droit à l'orphelin (<18 ou <25 en formation) OU âge ≥ 45 ans.
 *            (La voie « invalide aux 2/3 » existe aussi mais n'est pas captée → omise.)
 *  - VEUF  : uniquement s'il a un enfant ouvrant droit à l'orphelin (pas de voie âge).
 *  - Sinon : indemnité en capital unique (cf. calcCapitalUniqueLAA).
 * La sélection veuve/veuf se fait sur Enter_spouseSexe dans decesAccident.
 * =======================================================*/

/** LAA — Rente de VEUVE due à la date ref ? (enfant à charge OU conjointe ≥ 45 ans) */
export function Legal_renteLAAWidowDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;
  const ageConjoint = computeAgeOn(client.Enter_spouseDateNaissance, ref);
  return hasEnfantOrphelinEligibleAt(client, ref) || ageConjoint >= 45;
}

/** LAA — Rente de VEUF due à la date ref ? (uniquement enfant à charge, pas de voie âge) */
export function Legal_renteLAAWidowerDueAt(client: ClientData, ref: Date): boolean {
  if (!hasPartner(client)) return false;
  return hasEnfantOrphelinEligibleAt(client, ref);
}

/** LAA — Rente conjointe due (sex-neutral, compat). Retient la voie la plus favorable (veuve).
 *  La logique par sexe utilisée en production est Legal_renteLAAWidow/WidowerDueAt. */
export function Legal_renteLAADueAt(client: ClientData, ref: Date): boolean {
  return Legal_renteLAAWidowDueAt(client, ref);
}

/** LAA — Rente conjointe NON due (→ indemnité en capital), sex-neutral (compat). */
export function Legal_renteLAANonDueAt(client: ClientData, ref: Date): boolean {
  return hasPartner(client) && !Legal_renteLAAWidowDueAt(client, ref);
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