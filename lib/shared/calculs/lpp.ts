/* =========================================================
 * MoneyLife — Calculs LPP (2e pilier)
 * Fichier : lib/shared/calculs/lpp.ts
 * =======================================================*/

import type { Legal_Settings } from "../core/types";
import { calcRenteConjointLAA, calcCapitalUniqueLAA } from "./laa";

/* =========================================================
 * 1. MOTEUR DE PROJECTION (CAPITAL RETRAITE)
 * =======================================================*/

export function computeLPPProjectionRetraite(data: any, clientAge: number): number {
  const d = data || {};
  const capitalCertificat = Number(d.capitalRetraiteGlobal) || Number(d.Enter_lppCapitalProjete65);
  if (capitalCertificat > 0) return Math.round(capitalCertificat);

  const avoirActuel = Number(d.Enter_avoirVieillesseTotal) || 0;
  const cotisationAnnuelle = Number(d.Enter_lppCotisationEpargneEmploye || 0) + Number(d.Enter_lppCotisationEpargneEmployeur || 0);
  
  const n = Math.max(0, 65 - clientAge);
  if (n === 0) return Math.round(avoirActuel);

  const r = 0.01; 
  const vfAvoir = avoirActuel * Math.pow(1 + r, n);
  const vfCotisations = r <= 0 
    ? cotisationAnnuelle * n 
    : cotisationAnnuelle * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(vfAvoir + vfCotisations);
}

/* ---------- Helpers salaire assuré ---------- */

export function calcSalaireAssureRisqueLPP(data: any, legal: Legal_Settings): number {
  const d = data || {};
  return d.Enter_lppSalaireAssureRisque || d.Enter_salaireAssureLPP || calcLegalSalaireAssureLPP(d, legal);
}

export function calcSalaireAssureEpargneLPP(data: any, legal: Legal_Settings): number {
  const d = data || {};
  return d.Enter_salaireAssureLPP || calcLegalSalaireAssureLPP(d, legal);
}

export function calcLegalSalaireAssureLPP(data: any, legal: Legal_Settings): number {
  const d = data || {};
  const salaire = d.Enter_salaireAnnuel ?? 0;
  const deduction = legal.Legal_DeductionCoordinationMinLPP ?? 0;
  let salaireAssure = salaire - deduction;
  if (salaireAssure < legal.Legal_SalaireAssureMinLPP) salaireAssure = legal.Legal_SalaireAssureMinLPP;
  if (salaireAssure > legal.Legal_SalaireAssureMaxLPP) salaireAssure = legal.Legal_SalaireAssureMaxLPP;
  return salaireAssure;
}

/* =========================================================
 * 2. Rentes d’invalidité LPP (Logique Assumée vs Absence)
 * =======================================================*/

export function calcRenteInvaliditeLPP(data: any, mode: 'maladie' | 'accident' = 'maladie'): number {
  const d = data || {};
  if (mode === 'accident') {
    // Si c'est écrit 0 explicitement --> Zéro assumé (Pas de rente en accident)
    if (d.Enter_lppRenteInvaliditeAccident === 0) return 0;
    // Si c'est null/undefined --> On présume que la caisse peut aider la LAA (on prend Maladie)
    return d.Enter_lppRenteInvaliditeAccident ?? d.Enter_renteInvaliditeMaladie ?? d.Enter_renteInvaliditeLPP ?? 0;
  }
  return d.Enter_renteInvaliditeMaladie || d.Enter_renteInvaliditeLPP || 0;
}

export function calcRenteEnfantInvaliditeLPP(data: any, mode: 'maladie' | 'accident' = 'maladie'): number {
  const d = data || {};
  if (mode === 'accident') {
    if (d.Enter_renteEnfantInvalideAccident === 0) return 0;
    return d.Enter_renteEnfantInvalideAccident ?? d.Enter_renteEnfantInvalideMaladie ?? d.Enter_renteEnfantInvaliditeLPP ?? 0;
  }
  return d.Enter_renteEnfantInvalideMaladie || d.Enter_renteEnfantInvaliditeLPP || 0;
}

/* =========================================================
 * 3. Rentes de décès LPP (Survivants)
 * =======================================================*/

export function calcRenteConjointLPP(data: any, mode: 'maladie' | 'accident' = 'maladie'): number {
  const d = data || {};
  if (mode === 'accident') {
    if (d.Enter_lppRenteConjointAccident === 0) return 0;
    return d.Enter_lppRenteConjointAccident ?? d.Enter_renteConjointLPP ?? 0;
  }
  return d.Enter_renteConjointLPP || 0;
}

export function calcRentePartenaireLPP(data: any): number {
  return data?.Enter_rentePartenaireLPP || 0;
}

export function calcRenteOrphelinLPP(data: any, mode: 'maladie' | 'accident' = 'maladie'): number {
  const d = data || {};
  if (mode === 'accident') {
    if (d.Enter_lppRenteOrphelinAccident === 0) return 0;
    return d.Enter_lppRenteOrphelinAccident ?? d.Enter_renteOrphelinLPP ?? 0;
  }
  return d.Enter_renteOrphelinLPP || 0;
}

/* =========================================================
 * 4. Rente vieillesse LPP
 * =======================================================*/

export function calcRenteVieillesseLPP(data: any, age: number = 65): number {
  const d = data || {};
  const key = age === 65 ? "Enter_rentevieillesseLPP65" : `Enter_rentevieillesseLPP${age}`;
  return d[key] || d.Enter_rentevieillesseLPP65 || 0;
}

/* =========================================================
 * 5. Capitaux décès
 * =======================================================*/

export function calcCapitalDecesMaladieAucuneRenteLPP(data: any, legal: Legal_Settings): number {
  const d = data || {};
  const multiplicateur = legal.Legal_MultiplicateurCapitalSiPasRenteLPP ?? 3;
  const renteRef = (Number(d.Enter_renteConjointLPP) > 0)
    ? d.Enter_renteConjointLPP
    : d.Enter_rentePartenaireLPP || 0;

  return d.Enter_CapitalAucuneRenteMal || d.Enter_CapitalAucuneRente || (renteRef * multiplicateur);
}

export function calcCapitalDecesAccidentAucuneRenteLAA(data: any, legal: Legal_Settings): number {
  const d = data || {};
  const renteConjointTheoriqueLAA = calcRenteConjointLAA(d, legal) || 0;
  const capLAA = calcCapitalUniqueLAA(renteConjointTheoriqueLAA, legal);
  
  // Appliquer la même logique de 0 assumé pour les capitaux
  const capLPPAaccident = d.Enter_CapitalAucuneRenteAcc === 0 ? 0 : (d.Enter_CapitalAucuneRenteAcc || d.Enter_CapitalAucuneRente || 0);
  return capLAA + capLPPAaccident;
}

export function calcCapitalDecesMaladiePlusRenteLPP(data: any): number {
  return data?.Enter_CapitalPlusRenteMal || data?.Enter_CapitalPlusRente || 0;
}

export function calcCapitalDecesAccidentPlusRenteLPP(data: any): number {
  const d = data || {};
  if (d.Enter_CapitalPlusRenteAcc === 0) return 0;
  return d.Enter_CapitalPlusRenteAcc || d.Enter_CapitalPlusRente || 0;
}

/* =========================================================
 * 6. Helper “tout-en-un” LPP
 * =======================================================*/

export function computeLppProjection(data: any, legal: Legal_Settings, mode: 'maladie' | 'accident' = 'maladie') {
  return {
    salaireAssure: {
      legal: calcLegalSalaireAssureLPP(data, legal),
      risque: calcSalaireAssureRisqueLPP(data, legal),
      epargne: calcSalaireAssureEpargneLPP(data, legal),
    },
    rentes: {
      invalidite: calcRenteInvaliditeLPP(data, mode),
      enfantInvalidite: calcRenteEnfantInvaliditeLPP(data, mode),
      conjoint: calcRenteConjointLPP(data, mode),
      partenaire: calcRentePartenaireLPP(data),
      orphelin: calcRenteOrphelinLPP(data, mode),
      vieillesse: calcRenteVieillesseLPP(data),
    },
    capitaux: {
      maladieAucune: calcCapitalDecesMaladieAucuneRenteLPP(data, legal),
      accidentAucune: calcCapitalDecesAccidentAucuneRenteLAA(data, legal),
      maladiePlus: calcCapitalDecesMaladiePlusRenteLPP(data),
      accidentPlus: calcCapitalDecesAccidentPlusRenteLPP(data),
    },
  };
}