// /lib/calculs/events/invaliditeMaladie.ts

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "../../core/types";
import { computeAiProjection } from "../avsAi";
import { calcRenteInvaliditeLPP, calcRenteEnfantInvaliditeLPP } from "../lpp";
import { monthlyToAnnual, annualToMonthly } from "../../core/format";
import { computeAgeOn } from "../../core/dates"; // ✅ On utilise le même helper que dans Accident

/* ---------- Types de sortie ---------- */
// (Gardé à l'identique pour ne pas casser ton interface)
export type InvaliditeMaladieResult = {
  phaseIj: {
    days: number;
    annualIj: number;
    dailyIj: number;
    totalForPeriod: number;
    monthlyApprox: number;
    base: { salaireAnnuel: number; };
  };
  phaseRente: {
    annual: {
      ai: number;
      aiChildren: number;
      aiTotal: number;
      lppInvalidite: number;
      lppEnfants: number;
      totalNoCoord: number;
    };
    monthly: {
      aiAdult: number;
      aiChildren: number;
      ai: number;
      lppInvalidite: number;
      lppEnfants: number;
      total: number;
    };
    metaChildren: {
      nbEnfantsEligibles: number;
      perChildAnnual: number;
      perChildLppAnnual: number;
    };
  };
  meta: {
    notes: string[];
    dateSinistre: Date;
    params: {
      nbAnneesBTE: number;
      nbAnneesMariagePourBTE: number;
      nbAnneesBTA: number;
    };
  };
};

/* ---------- Helper (Copié de Accident) ---------- */
function countChildrenUnder18At(client: ClientData, at: Date): number {
  // ✅ On utilise Enter_enfants et computeAgeOn comme dans le fichier Accident
  const enfants = client.Enter_enfants ?? [];
  return enfants.filter(e => computeAgeOn(e.Enter_dateNaissance, at) < 18).length;
}

/* =========================================================
 * Fonction principale
 * =======================================================*/
export function computeInvaliditeMaladie(
  dateSinistre: Date, // Pour la matrice, c'est la date de l'année en cours (2026, 2027...)
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  opts?: {
    nbAnneesBTE?: number;
    nbAnneesMariagePourBTE?: number;
    nbAnneesBTA?: number;
  }
): InvaliditeMaladieResult {
/* ---------------- PHASE 1 — IJ Maladie ---------------- */
  const salaireAnnuel = client.Enter_salaireAnnuel ?? 0;

  // On récupère directement le taux du curseur. 
  // S'il n'existe pas, on met 0 par défaut.
  const ijTaux = Number(client.Enter_ijMaladieTaux) || 0;

  const ijAnnual = (Math.max(0, Math.min(100, ijTaux)) / 100) * salaireAnnuel;
  const ijDaily = ijAnnual / 365;
  const ijDays = 730;
  const ijTotalForPeriod = ijDaily * ijDays;
  const ijMonthlyApprox = ijAnnual / 12;

  /* ---------------- PHASE 2 — RENTES (pas de coordination) ---------------- */
  // 1) AI depuis échelle 44
  const aiProj = computeAiProjection(client, legal, echelle44, {
    nbAnneesBTE: opts?.nbAnneesBTE ?? 0,
    nbAnneesMariagePourBTE: opts?.nbAnneesMariagePourBTE ?? 0,
    nbAnneesBTA: opts?.nbAnneesBTA ?? 0,
  });
  const aiAdultAnnual = monthlyToAnnual(aiProj.renteAiMensuelle);

  // ✅ CALCUL DYNAMIQUE DES ENFANTS (Correction majeure)
  // On utilise la date passée par la matrice pour filtrer les enfants
  const nbEnfantsEligibles = countChildrenUnder18At(client, dateSinistre);
  
  const aiPerChildAnnual = monthlyToAnnual(aiProj.renteAiMensuelle * 0.4);
  const aiChildrenAnnual = aiPerChildAnnual * nbEnfantsEligibles;

  // 2) LPP
  const lppInvalidAnnual = calcRenteInvaliditeLPP(client) || 0;
  const perChildLppAnnual = calcRenteEnfantInvaliditeLPP(client) || 0;
  const lppChildrenAnnual = perChildLppAnnual * nbEnfantsEligibles;

  // 3) Totaux
  const aiTotalAnnual = aiAdultAnnual + aiChildrenAnnual;
  const totalAnnual = aiTotalAnnual + lppInvalidAnnual + lppChildrenAnnual;

  const monthly = {
    aiAdult: annualToMonthly(aiAdultAnnual),
    aiChildren: annualToMonthly(aiChildrenAnnual),
    ai: annualToMonthly(aiTotalAnnual),
    lppInvalidite: annualToMonthly(lppInvalidAnnual),
    lppEnfants: annualToMonthly(lppChildrenAnnual),
    total: annualToMonthly(totalAnnual),
  };

  return {
    phaseIj: {
      days: ijDays,
      annualIj: ijAnnual,
      dailyIj: ijDaily,
      totalForPeriod: ijTotalForPeriod,
      monthlyApprox: ijMonthlyApprox,
      base: { salaireAnnuel },
    },
    phaseRente: {
      annual: {
        ai: aiAdultAnnual,
        aiChildren: aiChildrenAnnual,
        aiTotal: aiTotalAnnual,
        lppInvalidite: lppInvalidAnnual,
        lppEnfants: lppChildrenAnnual,
        totalNoCoord: totalAnnual,
      },
      monthly,
      metaChildren: {
        nbEnfantsEligibles,
        perChildAnnual: aiPerChildAnnual,
        perChildLppAnnual: perChildLppAnnual,
      },
    },
    meta: {
      notes: [
        "PHASE 2 (Maladie) : Recalcul dynamique des enfants éligibles (<18 ans) pour chaque année de projection.",
      ],
      dateSinistre,
      params: {
        nbAnneesBTE: opts?.nbAnneesBTE ?? 0,
        nbAnneesMariagePourBTE: opts?.nbAnneesMariagePourBTE ?? 0,
        nbAnneesBTA: opts?.nbAnneesBTA ?? 0,
      },
    },
  };
}