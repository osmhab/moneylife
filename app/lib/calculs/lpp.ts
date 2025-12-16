//app/lib/calculs/lpp.ts
/* =========================================================
 * MoneyLife — Calculs LPP (2e pilier)
 * Fichier : /lib/calculs/lpp.ts
 * ---------------------------------------------------------
 * Couvre :
 *  - Salaire assuré légal
 *  - Rentes invalidité / conjoint / partenaire / orphelin / vieillesse
 *  - Capitaux décès (avec multiplicateurs légaux)
 * ---------------------------------------------------------
 * Références : LPP art. 7–20, 36–38
 * =======================================================*/

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { calcRenteConjointLAA, calcCapitalUniqueLAA } from "@/lib/calculs/laa";

/* ---------- Helpers salaire assuré (priorité valeurs du certificat) ---------- */

/** Salaire assuré LPP pour les prestations "risque" (invalidité / survivants) */
export function calcSalaireAssureRisqueLPP(client: ClientData, legal: Legal_Settings): number {
  // 1) Certificat split (part risque prioritaire)
  if (client.Enter_typeSalaireAssure === 'split' && typeof client.Enter_salaireAssureLPPRisque === 'number') {
    return client.Enter_salaireAssureLPPRisque;
  }
  // 2) Certificat général
  if (typeof client.Enter_salaireAssureLPP === 'number') {
    return client.Enter_salaireAssureLPP;
  }
  // 3) Fallback légal
  return calcLegalSalaireAssureLPP(client, legal);
}

/** Salaire assuré LPP pour la retraite/épargne (vieillesse) */
export function calcSalaireAssureEpargneLPP(client: ClientData, legal: Legal_Settings): number {
  // 1) Certificat split (part épargne prioritaire)
  if (client.Enter_typeSalaireAssure === 'split' && typeof client.Enter_salaireAssureLPPEpargne === 'number') {
    return client.Enter_salaireAssureLPPEpargne;
  }
  // 2) Certificat général
  if (typeof client.Enter_salaireAssureLPP === 'number') {
    return client.Enter_salaireAssureLPP;
  }
  // 3) Fallback légal
  return calcLegalSalaireAssureLPP(client, legal);
}

/* =========================================================
 * 1. Salaire assuré LPP
 * ---------------------------------------------------------
 * Salaire assuré légal = salaire annuel – déduction de coordination
 * borné entre min et max légaux.
 * =======================================================*/

/** Calcule le salaire assuré légal LPP */
export function calcLegalSalaireAssureLPP(
  client: ClientData,
  legal: Legal_Settings
): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const deduction = legal.Legal_DeductionCoordinationMinLPP ?? 0;

  // Calcul brut
  let salaireAssure = salaire - deduction;

  // Minimum / maximum légaux
  if (salaireAssure < legal.Legal_SalaireAssureMinLPP) {
    salaireAssure = legal.Legal_SalaireAssureMinLPP;
  }
  if (salaireAssure > legal.Legal_SalaireAssureMaxLPP) {
    salaireAssure = legal.Legal_SalaireAssureMaxLPP;
  }

  return salaireAssure;
}

/* =========================================================
 * 2. Rentes d’invalidité LPP
 * =======================================================*/

/** Rente invalidité LPP (an) */
export function calcRenteInvaliditeLPP(client: ClientData): number {
  return client.Enter_renteInvaliditeLPP ?? 0;
}

/** Rente d’enfant d’invalide LPP (an, par enfant) */
export function calcRenteEnfantInvaliditeLPP(client: ClientData): number {
  return client.Enter_renteEnfantInvaliditeLPP ?? 0;
}

/* =========================================================
 * 3. Rentes de décès LPP
 * =======================================================*/

/**
 * Rente de conjoint LPP (an)
 * - Conditions légales contrôlées ailleurs (guards.ts)
 */
export function calcRenteConjointLPP(client: ClientData): number {
  return client.Enter_renteConjointLPP ?? 0;
}

/**
 * Rente de partenaire LPP (an)
 * - Conditions légales contrôlées ailleurs (guards.ts)
 */
export function calcRentePartenaireLPP(client: ClientData): number {
  return client.Enter_rentePartenaireLPP ?? 0;
}

/**
 * Rente d’orphelin LPP (an, par enfant)
 */
export function calcRenteOrphelinLPP(client: ClientData): number {
  return client.Enter_renteOrphelinLPP ?? 0;
}

/* =========================================================
 * 4. Rente vieillesse LPP (à 65 ans)
 * =======================================================*/

/** Rente vieillesse LPP (an) */
export function calcRenteVieillesseLPP(client: ClientData): number {
  return client.Enter_rentevieillesseLPP65 ?? 0;
}

/* =========================================================
 * 5. Capitaux décès (LPP / LAA)
 * ---------------------------------------------------------
 * - En cas d’absence de rente : capital = rente × multiplicateur
 * - Capital supplémentaire : capital en plus de la rente
 * =======================================================*/

/** Capital décès (maladie) si aucune rente LPP n’est due */
export function calcCapitalDecesMaladieAucuneRenteLPP(
  client: ClientData,
  legal: Legal_Settings
): number {
  const multiplicateur = legal.Legal_MultiplicateurCapitalSiPasRenteLPP ?? 3;

  // On prend la rente du conjoint ou du partenaire selon saisie
  const renteRef =
    client.Enter_renteConjointLPP && client.Enter_renteConjointLPP > 0
      ? client.Enter_renteConjointLPP
      : client.Enter_rentePartenaireLPP ?? 0;

  const base =
    client.Enter_CapitalAucuneRente ??
    client.Enter_CapitalAucuneRenteMal ??
    renteRef * multiplicateur;

  return base;
}

/** Capital décès (accident) si aucune rente LAA n’est due (base = rente conjoint LAA théorique) */
export function calcCapitalDecesAccidentAucuneRenteLAA(
  client: ClientData,
  legal: Legal_Settings
): number {
  const renteConjointTheoriqueLAA = calcRenteConjointLAA(client, legal) || 0;
  return calcCapitalUniqueLAA(renteConjointTheoriqueLAA, legal);
}

/** Capital décès (maladie) en plus de la rente */
export function calcCapitalDecesMaladiePlusRenteLPP(client: ClientData): number {
  return (
    client.Enter_CapitalPlusRente ??
    client.Enter_CapitalPlusRenteMal ??
    0
  );
}

/** Capital décès (accident) en plus de la rente */
export function calcCapitalDecesAccidentPlusRenteLPP(client: ClientData): number {
  return (
    client.Enter_CapitalPlusRente ??
    client.Enter_CapitalPlusRenteAcc ??
    0
  );
}

/* =========================================================
 * 6. Helper “tout-en-un” LPP
 * =======================================================*/

/**
 * Fournit un résumé complet LPP :
 *  - Salaire assuré légal
 *  - Rentes invalidité, conjoint, partenaire, orphelin, vieillesse
 *  - Capitaux décès (maladie / accident)
 */
export function computeLppProjection(
  client: ClientData,
  legal: Legal_Settings
) {
  const salaireAssureLegal = calcLegalSalaireAssureLPP(client, legal);
  const salaireAssureRisque = calcSalaireAssureRisqueLPP(client, legal);
  const salaireAssureEpargne = calcSalaireAssureEpargneLPP(client, legal);

  const renteInvalidite = calcRenteInvaliditeLPP(client);
  const renteEnfantInvalidite = calcRenteEnfantInvaliditeLPP(client);
  const renteConjoint = calcRenteConjointLPP(client);
  const rentePartenaire = calcRentePartenaireLPP(client);
  const renteOrphelin = calcRenteOrphelinLPP(client);
  const renteVieillesse = calcRenteVieillesseLPP(client);

  const capitalDecesMaladieAucune = calcCapitalDecesMaladieAucuneRenteLPP(
    client,
    legal
  );
  const capitalDecesAccidentAucune = calcCapitalDecesAccidentAucuneRenteLAA(
    client,
    legal
  );
  const capitalDecesMaladiePlus = calcCapitalDecesMaladiePlusRenteLPP(client);
  const capitalDecesAccidentPlus = calcCapitalDecesAccidentPlusRenteLPP(client);

   return {
    salaireAssure: {
      legal: salaireAssureLegal,
      risque: salaireAssureRisque,
      epargne: salaireAssureEpargne,
      mode: client.Enter_typeSalaireAssure ?? 'general',
    },
    rentes: {
      invalidite: renteInvalidite,
      enfantInvalidite: renteEnfantInvalidite,
      conjoint: renteConjoint,
      partenaire: rentePartenaire,
      orphelin: renteOrphelin,
      vieillesse: renteVieillesse,
    },
    capitaux: {
      maladieAucune: capitalDecesMaladieAucune,
      accidentAucune: capitalDecesAccidentAucune,
      maladiePlus: capitalDecesMaladiePlus,
      accidentPlus: capitalDecesAccidentPlus,
    },
  };
}
