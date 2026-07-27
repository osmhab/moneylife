// lib/shared/calculs/matrices.ts
import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "../core/types";
import { normalizeDateMask, isValidDateMask } from "../core/dates";

// Import des moteurs de calcul (Shared)
import { computeInvaliditeMaladie } from "./events/invaliditeMaladie";
import { computeInvaliditeAccident } from "./events/invaliditeAccident";
import { computeDecesMaladie } from "./events/decesMaladie";
import { computeDecesAccident } from "./events/decesAccident";
import { computeRetraite } from "./events/retraite";

import { 
  computeProjections3aBanque, 
  computeProjections3aAssurance, 
  computeDeathBenefitAssurance 
} from "./3epilier";

/* ===== Types & Helpers ===== */

export type Matrix = { 
  headerYears: number[]; 
  rows: { label: string; cells: (number | string)[] }[] 
};

function birthYearFromMask(mask?: string) {
  if (!mask || !isValidDateMask(mask)) return undefined;
  const [, , yyyy] = normalizeDateMask(mask).split(".");
  return Number(yyyy);
}

function currentYear() {
  return new Date().getFullYear();
}

function yearDate(y: number) {
  return new Date(y, 0, 1);
}

/**
 * Interface pour séparer les flux financiers par pilier et par type
 */
interface PlanTotals {
  lppRente: number;      
  lppRenteEnfant: number; // Ajouté pour gérer les orphelins/enfants d'invalides
  lppCapital: number;    
  priveRente: number;    
  priveCapital: number;  
}

/**
 * Calcule et répartit les montants issus des plans Firestore
 */
function sumFromPlans(plans: any[], category: 'retraite' | 'deces' | 'invalidite', clientAge: number = 35): PlanTotals {
  return plans.reduce((acc, plan) => {
    const d = { ...plan, ...(plan.data || {}) };
    const isLPP = plan.type === "LPP_BASE";
    const isBank = plan.type === "PILIER_3A_BANK" || plan.type === "3A_BANQUE";

    if (category === 'retraite') {
      if (isLPP) {
        acc.lppRente += Number(d.Enter_rentevieillesseLPP65) || 0;
        acc.lppCapital += Number(d.capitalRetraiteGlobal) || Number(d.Enter_lppCapitalProjete65) || 0;
      } else {
        const projection = isBank ? computeProjections3aBanque(d, clientAge) : computeProjections3aAssurance(d, clientAge);
        acc.priveCapital += projection;
      }
    }

    if (category === 'deces') {
      if (isLPP) {
        acc.lppRente += Number(d.Enter_renteConjointLPP) || 0;
        acc.lppRenteEnfant += Number(d.Enter_renteOrphelinLPP) || 0;
        acc.lppCapital += Number(d.Enter_CapitalPlusRenteMal) || 0;
        // Capital décès INDÉPENDANT : versé TOUJOURS, en plus du "plus rente" (et de la
        // rente de survivant). Additif inconditionnel → toujours dans le capital décès.
        acc.lppCapital += Number(d.Enter_CapitalDecesIndependantMal) || 0;
      } else {
        acc.priveCapital += isBank ? (Number(d.soldeActuel) || 0) : computeDeathBenefitAssurance(d);
      }
    }

    if (category === 'invalidite') {
      if (isLPP) {
        acc.lppRente += Number(d.Enter_renteInvaliditeMaladie) || 0;
        acc.lppRenteEnfant += Number(d.Enter_renteEnfantInvalideMaladie) || 0;
      } else {
        acc.priveRente += Number(d.renteInvalidite) || 0;
        acc.priveCapital += Number(d.soldeActuel) || Number(d.valeurRachatActuelle) || 0;
      }
    }

    return acc;
  }, { lppRente: 0, lppRenteEnfant: 0, lppCapital: 0, priveRente: 0, priveCapital: 0 });
}

/* ===== 1. INVALIDITÉ ACCIDENT ===== */

export function buildInvaliditeAccidentMatrix(
  client: ClientData, 
  legal: Legal_Settings, 
  echelle44: Legal_Echelle44Row[],
  plans: any[] = []
): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const ageActuel = startY - (by ?? 1990);
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  const planTotals = sumFromPlans(plans, 'invalidite', ageActuel);

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Indemnités journalières Accident", cells: [] as number[] },
    { label: "Prévoyance privée (3e pilier)", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y, idx) => {
    let ai = 0, lpp = 0, laa = 0, ij = 0;

    // On crée un client hybride : données de base + rentes LPP du scan
    const hybridClient = { 
        ...client, 
        Enter_renteInvaliditeLPP: planTotals.lppRente,
        Enter_renteEnfantInvaliditeLPP: planTotals.lppRenteEnfant 
    };

    if (idx < 2) {
      const firstRes = computeInvaliditeAccident(hybridClient, legal, echelle44, { referenceDate: yearDate(startY) });
      ij = firstRes.phaseIj.annualIj;
    } else {
      // Le moteur computeInvaliditeAccident va maintenant appliquer la coordination à 90% sur tes chiffres scannés
      const res = computeInvaliditeAccident(hybridClient, legal, echelle44, { referenceDate: yearDate(y) });
      ai  = res.phaseRente.annual.aiTotal;
      laa = res.phaseRente.annual.laaAfterCap;
      lpp = res.phaseRente.annual.lppAfterCap; 
    }

    const prive = idx === 0 ? (planTotals.priveRente + planTotals.priveCapital) : planTotals.priveRente;
    const capital = idx === 0 ? planTotals.lppCapital : 0;
    const total = ai + lpp + laa + ij + prive + capital;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(ij);
    rows[4].cells.push(prive);
    rows[5].cells.push(capital); 
    rows[6].cells.push(total);
    rows[7].cells.push(need);
    rows[8].cells.push(need - total);
  });

  return { headerYears: years, rows };
}

/* ===== 2. INVALIDITÉ MALADIE ===== */

/* ===== 2. INVALIDITÉ MALADIE ===== */

export function buildInvaliditeMaladieMatrix(
    client: ClientData, 
    legal: Legal_Settings, 
    echelle44: Legal_Echelle44Row[],
    plans: any[] = []
  ): Matrix {
    const need = client.Enter_salaireAnnuel ?? 0;
    const by = birthYearFromMask(client.Enter_dateNaissance);
    const startY = currentYear();
    const ageActuel = startY - (by ?? 1990);
    const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
    const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);
    const planTotals = sumFromPlans(plans, 'invalidite', ageActuel);
  
    const rows = [
      { label: "AVS/AI", cells: [] as number[] },
      { label: "LPP", cells: [] as number[] },
      { label: "LAA", cells: [] as number[] },
      { label: "Indemnités journalières Maladie", cells: [] as number[] }, // Ligne 3
      { label: "Prévoyance privée (3e pilier)", cells: [] as number[] },
      { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
      { label: "Prestation totale", cells: [] as number[] },
      { label: "Besoin (Salaire)", cells: [] as number[] },
      { label: "Lacune", cells: [] as (number | string)[] },
    ];
  
    years.forEach((y, idx) => {
      let ai = 0, lpp = 0, ij = 0;
      
      const hybridClient = { 
        ...client, 
        Enter_renteInvaliditeLPP: planTotals.lppRente,
        Enter_renteEnfantInvaliditeLPP: planTotals.lppRenteEnfant 
      };
  
      // On appelle le moteur pour chaque année
      const res = computeInvaliditeMaladie(yearDate(y), hybridClient, legal, echelle44);

      // --- LOGIQUE IJ MALADIE ---
      // Les IJ durent généralement 730 jours (2 ans). 
      // On les affiche donc pour l'index 0 et 1 (les deux premières années).
      if (idx < 2) {
        ij = res.phaseIj.annualIj;
        ai = 0;  // En général, l'AI ne verse rien pendant que les IJ tournent
        lpp = 0; // Idem pour la LPP (délai d'attente)
      } else {
        // Après 2 ans, les rentes prennent le relais
        ai = res.phaseRente.annual.aiTotal;
        lpp = res.phaseRente.annual.lppInvalidite + res.phaseRente.annual.lppEnfants;
        ij = 0;
      }
  
      const prive = idx === 0 ? (planTotals.priveRente + planTotals.priveCapital) : planTotals.priveRente;
      const capital = idx === 0 ? planTotals.lppCapital : 0;
      
      const total = ai + lpp + ij + prive + capital;

      rows[0].cells.push(ai);
      rows[1].cells.push(lpp);
      rows[2].cells.push(0);  // Pas de LAA en maladie
      rows[3].cells.push(ij);   // On remplit enfin la ligne IJ Maladie
      rows[4].cells.push(prive);
      rows[5].cells.push(capital);
      rows[6].cells.push(total);
      rows[7].cells.push(need);
      rows[8].cells.push(need - total);
    });
  
    return { headerYears: years, rows };
  }

/* ===== 3. DÉCÈS ACCIDENT ===== */

/* ===== 3. DÉCÈS ACCIDENT ===== */

export function buildDecesAccidentMatrix(
  client: ClientData, 
  legal: Legal_Settings, 
  echelle44: Legal_Echelle44Row[],
  plans: any[] = []
): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const ageActuel = startY - (by ?? 1990);
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);
  const planTotals = sumFromPlans(plans, 'deces', ageActuel);

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Prévoyance privée (3e pilier)", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y) => {
    // 1. On déclare la variable lpp (celle qui manquait)
    let lpp = 0; 
    
    // 2. On crée le client hybride avec les rentes du scan
    const hybridClient = { 
        ...client, 
        Enter_renteConjointLPP: planTotals.lppRente,
        Enter_renteOrphelinLPP: planTotals.lppRenteEnfant 
    };

    // 3. On appelle le moteur de calcul (qui gère la coordination LAA/LPP à 90%)
    const res = computeDecesAccident(new Date(), hybridClient, legal, echelle44, { paymentRef: yearDate(y) });
    
    const ai = res.annual.avs;
    const laa = res.annual.laaAfterCap;
    lpp = res.annual.lppAfterCap; // C'est ici que le "besoin uniquement" est calculé
    
    const prive = y === startY ? (planTotals.priveRente + planTotals.priveCapital) : planTotals.priveRente;
    const capital = y === startY ? (planTotals.lppCapital + (res.capitals.totalCapitalsAccident ?? 0)) : 0;
    
    const total = ai + lpp + laa + prive + capital;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(prive);
    rows[4].cells.push(capital);
    rows[5].cells.push(total);
    rows[6].cells.push(need);
    rows[7].cells.push(need - total);
  });

  return { headerYears: years, rows };
}

/* ===== 4. DÉCÈS MALADIE ===== */

export function buildDecesMaladieMatrix(
  client: ClientData, 
  legal: Legal_Settings, 
  echelle44: Legal_Echelle44Row[],
  plans: any[] = []
): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const ageActuel = startY - (by ?? 1990);
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);
  const planTotals = sumFromPlans(plans, 'deces', ageActuel);

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Prévoyance privée (3e pilier)", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y) => {
    const hybridClient = { 
        ...client, 
        Enter_renteConjointLPP: planTotals.lppRente,
        Enter_renteOrphelinLPP: planTotals.lppRenteEnfant 
    };
    const res = computeDecesMaladie(new Date(), hybridClient, legal, echelle44, { paymentRef: yearDate(y) });
    const ai = res.annual.avs;
    const lpp = res.annual.lppRentes; // Incorpore conjoint + orphelins dynamiques
    
    const prive = y === startY ? (planTotals.priveRente + planTotals.priveCapital) : planTotals.priveRente;
    const capital = y === startY ? (planTotals.lppCapital + (res.capitals.totalCapitalsMaladie ?? 0)) : 0;
    const total = ai + lpp + prive + capital;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(0);
    rows[3].cells.push(prive);
    rows[4].cells.push(capital);
    rows[5].cells.push(total);
    rows[6].cells.push(need);
    rows[7].cells.push(need - total);
  });

  return { headerYears: years, rows };
}

/* ===== 5. RETRAITE ===== */

export function buildRetraiteMatrix(
  client: ClientData, 
  legal: Legal_Settings, 
  echelle44: Legal_Echelle44Row[],
  plans: any[] = []
): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const ageActuel = startY - (by ?? 1990);
  const startAt = (by ?? startY) + legal.Legal_AgeRetraiteAVS;
  const endY = startAt + 22;
  const years = Array.from({ length: endY - startAt + 1 }, (_, i) => startAt + i);

  const planTotals = sumFromPlans(plans, 'retraite', ageActuel);

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "Prévoyance privée (3e pilier)", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y, idx) => {
    // Pour la retraite, on injecte la rente 65 du scan
    const hybridClient = { ...client, Enter_rentevieillesseLPP65: planTotals.lppRente };
    const res = computeRetraite(hybridClient, legal, echelle44);
    
    const ai = res.annual.avs;
    const lpp = res.annual.lpp; 
    const prive = idx === 0 ? planTotals.priveCapital : 0;
    const capitalUnique = idx === 0 ? planTotals.lppCapital : 0;
    
    const total = ai + lpp + prive + capitalUnique;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(prive);
    rows[3].cells.push(capitalUnique);
    rows[4].cells.push(total);
    rows[5].cells.push(need);
    rows[6].cells.push(need - total);
  });

  return { headerYears: years, rows };
}