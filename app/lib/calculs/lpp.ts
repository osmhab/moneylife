/* =========================================================
 * MoneyLife — Calculs LPP (2e pilier)
 * Fichier : /lib/calculs/lpp.ts
 * ---------------------------------------------------------
 * Couvre :
 * - Projection du capital retraite (intérêt composé)
 * - Salaire assuré légal
 * - Rentes invalidité / conjoint / partenaire / orphelin / vieillesse
 * - Capitaux décès (avec multiplicateurs légaux)
 * ---------------------------------------------------------
 * Conventions :
 * - Les chaînes de priorité métier utilisent `??` (nullish) afin
 *   qu'une valeur `0` saisie/extraite explicitement soit conservée
 *   et jamais écrasée par un fallback.
 * - Règle accident : si la valeur "accident" est absente (null/undefined),
 *   on retombe sur la valeur "maladie" correspondante (la caisse peut
 *   compléter la LAA). Un `0` accident explicite reste un 0 assumé.
 * ---------------------------------------------------------
 * Références : LPP art. 7–20, 36–38
 * =======================================================*/

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { calcRenteConjointLAA, calcCapitalUniqueLAA } from "@/lib/calculs/laa";

/* =========================================================
 * 0. Moteur de projection (capital retraite)
 * =======================================================*/

/**
 * Projette le capital de vieillesse LPP à 65 ans.
 * Priorité : capital certificat (si fourni) > projection à intérêt composé.
 *
 * Note : les `||` ci-dessous sont VOLONTAIRES (et non des `??`).
 * `Number(undefined)` vaut `NaN` ; or `NaN ?? x` renverrait `NaN`,
 * alors que `NaN || x` bascule correctement sur le fallback. Ce sont
 * des gardes numériques, pas des chaînes de priorité métier.
 */
export function computeLPPProjectionRetraite(client: ClientData, clientAge: number): number {
  const capitalCertificat = Number(client.capitalRetraiteGlobal) || Number(client.Enter_lppCapitalProjete65);
  if (capitalCertificat > 0) return Math.round(capitalCertificat);

  const avoirActuel = Number(client.Enter_avoirVieillesseTotal) || 0;
  const cotisationAnnuelle =
    Number(client.Enter_lppCotisationEpargneEmploye ?? 0) +
    Number(client.Enter_lppCotisationEpargneEmployeur ?? 0);

  const n = Math.max(0, 65 - clientAge);
  if (n === 0) return Math.round(avoirActuel);

  const r = 0.01; // hypothèse de rendement annuel de l'avoir de vieillesse
  const vfAvoir = avoirActuel * Math.pow(1 + r, n);
  const vfCotisations =
    r <= 0
      ? cotisationAnnuelle * n
      : cotisationAnnuelle * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(vfAvoir + vfCotisations);
}

/* ---------- Helpers salaire assuré (priorité valeurs du certificat) ---------- */

/** Salaire assuré LPP pour les prestations "risque" (invalidité / survivants) */
export function calcSalaireAssureRisqueLPP(client: ClientData, legal: Legal_Settings): number {
  // 1) Champ spécifique extrait par l'IA
  if (typeof client.Enter_lppSalaireAssureRisque === 'number') {
    return client.Enter_lppSalaireAssureRisque;
  }
  // 2) Certificat split (ancien mode manuel)
  if (client.Enter_typeSalaireAssure === 'split' && typeof client.Enter_salaireAssureLPPRisque === 'number') {
    return client.Enter_salaireAssureLPPRisque;
  }
  // 3) Certificat général
  if (typeof client.Enter_salaireAssureLPP === 'number') {
    return client.Enter_salaireAssureLPP;
  }
  // 4) Fallback légal
  return calcLegalSalaireAssureLPP(client, legal);
}

/** Salaire assuré LPP pour la retraite/épargne (vieillesse) */
export function calcSalaireAssureEpargneLPP(client: ClientData, legal: Legal_Settings): number {
  // 1) Certificat général (Gemini utilise souvent celui-là pour l'épargne)
  if (typeof client.Enter_salaireAssureLPP === 'number') {
    return client.Enter_salaireAssureLPP;
  }
  // 2) Certificat split (ancien mode manuel)
  if (client.Enter_typeSalaireAssure === 'split' && typeof client.Enter_salaireAssureLPPEpargne === 'number') {
    return client.Enter_salaireAssureLPPEpargne;
  }
  // 3) Fallback légal
  return calcLegalSalaireAssureLPP(client, legal);
}

/* =========================================================
 * 1. Salaire assuré LPP (Légal)
 * =======================================================*/

export function calcLegalSalaireAssureLPP(client: ClientData, legal: Legal_Settings): number {
  const salaire = client.Enter_salaireAnnuel ?? 0;
  const deduction = legal.Legal_DeductionCoordinationMinLPP ?? 0;
  let salaireAssure = salaire - deduction;

  if (salaireAssure < legal.Legal_SalaireAssureMinLPP) {
    salaireAssure = legal.Legal_SalaireAssureMinLPP;
  }
  if (salaireAssure > legal.Legal_SalaireAssureMaxLPP) {
    salaireAssure = legal.Legal_SalaireAssureMaxLPP;
  }
  return salaireAssure;
}

/* =========================================================
 * 2. Rentes d’invalidité LPP (Switch Maladie/Accident)
 * =======================================================*/

/** Rente invalidité LPP (an) */
export function calcRenteInvaliditeLPP(client: ClientData, mode: 'maladie' | 'accident' = 'maladie'): number {
  if (mode === 'accident') {
    // Accident : valeur accident (0 explicite conservé via ??).
    // Si absente → fallback sur la valeur maladie, puis ancien manuel.
    return client.Enter_lppRenteInvaliditeAccident
      ?? client.Enter_renteInvaliditeMaladie
      ?? client.Enter_renteInvaliditeLPP
      ?? 0;
  }
  // Maladie : priorité IA (Maladie) > ancien manuel > 0
  return client.Enter_renteInvaliditeMaladie ?? client.Enter_renteInvaliditeLPP ?? 0;
}

/** Rente d’enfant d’invalide LPP (an, par enfant) */
export function calcRenteEnfantInvaliditeLPP(client: ClientData, mode: 'maladie' | 'accident' = 'maladie'): number {
  if (mode === 'accident') {
    return client.Enter_renteEnfantInvalideAccident
      ?? client.Enter_renteEnfantInvalideMaladie
      ?? client.Enter_renteEnfantInvaliditeLPP
      ?? 0;
  }
  return client.Enter_renteEnfantInvalideMaladie ?? client.Enter_renteEnfantInvaliditeLPP ?? 0;
}

/* =========================================================
 * 3. Rentes de décès LPP (Survivants)
 * =======================================================*/

export function calcRenteConjointLPP(client: ClientData, mode: 'maladie' | 'accident' = 'maladie'): number {
  if (mode === 'accident') {
    // Accident absent → fallback sur la rente conjoint "maladie" (Enter_renteConjointLPP)
    return client.Enter_lppRenteConjointAccident ?? client.Enter_renteConjointLPP ?? 0;
  }
  return client.Enter_renteConjointLPP ?? 0;
}

export function calcRentePartenaireLPP(client: ClientData): number {
  return client.Enter_rentePartenaireLPP ?? 0;
}

export function calcRenteOrphelinLPP(client: ClientData, mode: 'maladie' | 'accident' = 'maladie'): number {
  if (mode === 'accident') {
    // Accident absent → fallback sur la rente orphelin "maladie" (Enter_renteOrphelinLPP)
    return client.Enter_lppRenteOrphelinAccident ?? client.Enter_renteOrphelinLPP ?? 0;
  }
  return client.Enter_renteOrphelinLPP ?? 0;
}

/* =========================================================
 * 4. Rente vieillesse LPP (Courbe dynamique 58-65)
 * =======================================================*/

/** Rente vieillesse LPP (an) selon l'âge cible */
export function calcRenteVieillesseLPP(client: ClientData, age: number = 65): number {
  const key = `Enter_rentevieillesseLPP${age}` as keyof ClientData;
  const val = client[key];

  if (typeof val === 'number') return val;
  return client.Enter_rentevieillesseLPP65 ?? 0;
}

/* =========================================================
 * 5. Capitaux décès (LPP / LAA)
 * =======================================================*/

/** Capital décès (maladie) si aucune rente LPP n’est due */
export function calcCapitalDecesMaladieAucuneRenteLPP(client: ClientData, legal: Legal_Settings): number {
  const multiplicateur = legal.Legal_MultiplicateurCapitalSiPasRenteLPP ?? 3;
  const renteRef = (client.Enter_renteConjointLPP && client.Enter_renteConjointLPP > 0)
    ? client.Enter_renteConjointLPP
    : client.Enter_rentePartenaireLPP ?? 0;

  // Priorité IA spécifique > IA Générique > Calcul théorique
  return (
    client.Enter_CapitalAucuneRenteMal ??
    client.Enter_CapitalAucuneRente ??
    renteRef * multiplicateur
  );
}

export function calcCapitalDecesAccidentAucuneRenteLAA(client: ClientData, legal: Legal_Settings): number {
  // LAA (Légal) : Base = rente conjoint LAA théorique
  // `|| 0` volontaire : garde NaN, calcRenteConjointLAA renvoie un number.
  const renteConjointTheoriqueLAA = calcRenteConjointLAA(client, legal) || 0;
  const capLAA = calcCapitalUniqueLAA(renteConjointTheoriqueLAA, legal);

  // On y ajoute le capital LPP Accident "Aucune Rente" extrait par l'IA
  // (0 accident explicite conservé via ??).
  const capLPPAaccident = client.Enter_CapitalAucuneRenteAcc ?? client.Enter_CapitalAucuneRente ?? 0;

  return capLAA + capLPPAaccident;
}

/** Capital décès (maladie) en plus de la rente */
export function calcCapitalDecesMaladiePlusRenteLPP(client: ClientData): number {
  return client.Enter_CapitalPlusRenteMal ?? client.Enter_CapitalPlusRente ?? 0;
}

/** Capital décès (accident) en plus de la rente */
export function calcCapitalDecesAccidentPlusRenteLPP(client: ClientData): number {
  return client.Enter_CapitalPlusRenteAcc ?? client.Enter_CapitalPlusRente ?? 0;
}

/* =========================================================
 * 6. Helper “tout-en-un” LPP
 * =======================================================*/

export function computeLppProjection(client: ClientData, legal: Legal_Settings, mode: 'maladie' | 'accident' = 'maladie') {
  return {
    salaireAssure: {
      legal: calcLegalSalaireAssureLPP(client, legal),
      risque: calcSalaireAssureRisqueLPP(client, legal),
      epargne: calcSalaireAssureEpargneLPP(client, legal),
    },
    rentes: {
      invalidite: calcRenteInvaliditeLPP(client, mode),
      enfantInvalidite: calcRenteEnfantInvaliditeLPP(client, mode),
      conjoint: calcRenteConjointLPP(client, mode),
      partenaire: calcRentePartenaireLPP(client),
      orphelin: calcRenteOrphelinLPP(client, mode),
      vieillesse: calcRenteVieillesseLPP(client),
    },
    capitaux: {
      maladieAucune: calcCapitalDecesMaladieAucuneRenteLPP(client, legal),
      accidentAucune: calcCapitalDecesAccidentAucuneRenteLAA(client, legal),
      maladiePlus: calcCapitalDecesMaladiePlusRenteLPP(client),
      accidentPlus: calcCapitalDecesAccidentPlusRenteLPP(client),
    },
  };
}
