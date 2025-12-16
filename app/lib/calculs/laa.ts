/* =========================================================
 * MoneyLife — Calculs LAA (assurance accident)
 * Fichier : /lib/calculs/laa.ts
 * ---------------------------------------------------------
 * Couvre :
 *  - Indemnités journalières (ijMaladie / ijAccident)
 *  - Rente invalidité LAA
 *  - Rentes survivants LAA (conjoint + enfants, cap 70%)
 * ---------------------------------------------------------
 * Références : art. 15, 18, 20 LAA
 * =======================================================*/

import type { ClientData, Legal_Settings } from "@/lib/core/types";

/* =========================================================
 * 1. Indemnités journalières (maladie & accident)
 * =======================================================*/

/**
 * Indemnité journalière maladie (IJM)
 * - Montant : 80% du salaire annuel
 * - Durée : 2 ans (côté UI/temps, pas calculée ici)
 */
export function calcIjMaladie(client: ClientData): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  return salaire * 0.8;
}

/**
 * Indemnité journalière accident (IJA)
 * - Montant : 80% du salaire assuré LAA
 * - Salaire assuré plafonné à Legal_SalaireAssureMaxLAA
 */
export function calcIjAccident(client: ClientData, legal: Legal_Settings): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const base = Math.min(salaire, legal.Legal_SalaireAssureMaxLAA);
  return base * 0.8;
}

/* =========================================================
 * 2. Rente invalidité LAA
 * =======================================================*/

/**
 * Rente d’invalidité LAA
 * - Début : après épuisement des indemnités journalières (2 ans)
 * - Montant : 80% du salaire assuré (plafonné)
 */
export function calcRenteInvaliditeLAA(client: ClientData, legal: Legal_Settings): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const base = Math.min(salaire, legal.Legal_SalaireAssureMaxLAA);
  return base * 0.8;
}

/* =========================================================
 * 3. Rentes survivants LAA
 * =======================================================*/

/**
 * Rente de conjoint survivant LAA
 * - Montant : 40% du salaire assuré (plafonné)
 * - Versée à vie (selon conditions légales)
 */
export function calcRenteConjointLAA(client: ClientData, legal: Legal_Settings): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const base = Math.min(salaire, legal.Legal_SalaireAssureMaxLAA);
  return base * 0.4;
}

/**
 * Rente d’enfant LAA
 * - Montant : 15% du salaire assuré (plafonné)
 * - Versée jusqu’à 18 ans (ou 25 si en formation)
 */
export function calcRenteEnfantLAA(client: ClientData, legal: Legal_Settings): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const base = Math.min(salaire, legal.Legal_SalaireAssureMaxLAA);
  return base * 0.15;
}

/**
 * Calcule le total des rentes survivants LAA avec plafonnement famille à 70%.
 * - conjoint : 40%
 * - enfants : 15% chacun
 * - cap global : 70% du salaire assuré
 */
export function calcRentesSurvivantsLAA(
  client: ClientData,
  legal: Legal_Settings,
  nbEnfants: number
) {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const base = Math.min(salaire, legal.Legal_SalaireAssureMaxLAA);

  const renteConjoint = base * 0.4;
  const renteEnfants = base * 0.15 * nbEnfants;
  const totalAvantCap = renteConjoint + renteEnfants;

  const capFamille = base * 0.7;
  const totalApresCap = Math.min(totalAvantCap, capFamille);

  return {
    renteConjoint,
    renteEnfants,
    totalAvantCap,
    totalApresCap,
  };
}

/* =========================================================
 * 4. Capitaux LAA (indemnité unique si aucune rente n’est due)
 * =======================================================*/

/**
 * Capital unique LAA (si aucune rente n’est due)
 * - Montant = 3 × rente annuelle due (art. 20 LAA)
 * - Coefficient configurable via Legal_MultiplicateurCapitalSiPasRenteLAA
 */
export function calcCapitalUniqueLAA(
  renteConjoint: number,
  legal: Legal_Settings
): number {
  const multiplicateur = legal.Legal_MultiplicateurCapitalSiPasRenteLAA ?? 3;
  return renteConjoint * multiplicateur;
}

/* =========================================================
 * 5. Helper “tout-en-un” pour les écrans Décès / Invalidité
 * =======================================================*/

/**
 * Fournit un résumé complet LAA :
 * - IJ maladie / accident
 * - Rente invalidité
 * - Rentes survivants (conjoint + enfants + cap)
 * - Capital unique si non-due
 */
export function computeLaaProjection(
  client: ClientData,
  legal: Legal_Settings,
  nbEnfants: number
) {
  const ijMaladie = calcIjMaladie(client);
  const ijAccident = calcIjAccident(client, legal);
  const renteInvalidite = calcRenteInvaliditeLAA(client, legal);
  const survivants = calcRentesSurvivantsLAA(client, legal, nbEnfants);
  const capitalUnique = calcCapitalUniqueLAA(survivants.renteConjoint, legal);

  return {
    ijMaladie,
    ijAccident,
    renteInvalidite,
    survivants,
    capitalUnique,
  };
}
