//app/lib/calculs/events/invaliditeMaladie.ts
/* =========================================================
 * MoneyLife — Évènement: Invalidité (MALADIE)
 * Fichier : /lib/calculs/events/invaliditeMaladie.ts
 * ---------------------------------------------------------
 * PHASE 1 — Indemnités journalières maladie (IJ Maladie)
 *  - Du jour 1 au jour 730 inclus (2 ans)
 *  - Montant: Enter_ijMaladieTaux % du salaire annuel (formulaire) — pas de plafond LAA ici
 *
 * PHASE 2 — Rentes (dès J+731)
 *  - Pas de coordination en cas de maladie (selon ton cahier) :
 *      • AI (échelle 44, mensuel → annuel) = adulte + 40%/enfant
 *      • LPP invalidité (annuel)
 *      • LPP enfant d’invalide (annuel) × nb d’enfants < 18 ans à la date de sinistre
 *  - La somme peut dépasser le dernier revenu.
 *
 * Unités:
 *  - AI issu de l’échelle 44: MENSUEL → converti en ANNUEL
 *  - LPP: ANNUEL
 *  - IJ: fourni en annuel, journalier, total période, et mensuel approx pour l'UI
 * =======================================================*/

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";
import { computeAiProjection } from "@/lib/calculs/avsAi";
import { calcRenteInvaliditeLPP, calcRenteEnfantInvaliditeLPP } from "@/lib/calculs/lpp";
import { monthlyToAnnual, annualToMonthly } from "@/lib/core/format";
import { computeAgeOn } from "@/lib/core/dates";

/* ---------- Types de sortie ---------- */

export type InvaliditeMaladieResult = {
  phaseIj: {
    days: number;              // 730 jours (J1 → J730)
    annualIj: number;          // IJ annualisée (80% salaire annuel)
    dailyIj: number;           // IJ journalière (= annualIj/365)
    totalForPeriod: number;    // total versé sur 730 jours
    monthlyApprox: number;     // approx visuelle (= annualIj/12)
    base: {
      salaireAnnuel: number;
    };
  };
  phaseRente: {
    annual: {
      ai: number;               // AI adulte annuel (échelle 44)
      aiChildren: number;       // AI enfants total (annuel)
      aiTotal: number;          // AI total (adulte + enfants) annuel
      lppInvalidite: number;    // LPP invalidité annuel (adulte)
      lppEnfants: number;       // LPP enfant d’invalide (total)
      totalNoCoord: number;     // somme (AI total + LPP adulte + LPP enfants)
    };
    monthly: {
      aiAdult: number;          // AI adulte (mensuel)
      aiChildren: number;       // AI enfants (mensuel)
      ai: number;               // AI total (mensuel) — alias de (aiAdult+aiChildren)
      lppInvalidite: number;
      lppEnfants: number;
      total: number;
    };
    metaChildren: {
      nbEnfantsEligibles: number; // <18 ans à la date de sinistre
      perChildAnnual: number;     // AI enfant d’invalide (40% de AI adulte) — annuel PAR enfant
      perChildLppAnnual: number;  // LPP enfant d’invalide — annuel PAR enfant
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

/* ---------- Helpers internes ---------- */

/** Nombre d'enfants < 18 ans à la date de sinistre */
function countChildrenUnder18At(client: ClientData, dateSinistre: Date): number {
  const enfants = client.Enter_enfants ?? [];
  return enfants.filter(e => computeAgeOn(e.Enter_dateNaissance, dateSinistre) < 18).length;
}

/* =========================================================
 * Fonction principale
 * =======================================================*/
export function computeInvaliditeMaladie(
  dateSinistre: Date,
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  opts?: {
    /** Années BTE jusqu’au sinistre */
    nbAnneesBTE?: number;
    /** Parmi les années BTE, années mariées (division par 2) */
    nbAnneesMariagePourBTE?: number;
    /** Années BTA jusqu’au sinistre */
    nbAnneesBTA?: number;
  }
): InvaliditeMaladieResult {
  /* ---------------- PHASE 1 — IJ Maladie ---------------- */
  const salaireAnnuel = client.Enter_salaireAnnuel ?? 0;
  const ijTaux = (client.Enter_ijMaladie === true ? (client.Enter_ijMaladieTaux ?? 0) : 0);
  const ijAnnual = Math.max(0, Math.min(100, ijTaux)) / 100 * salaireAnnuel;
  const ijDaily = ijAnnual / 365;             // base jour
  const ijDays = 730;                         // J1 → J730 = 730 jours
  const ijTotalForPeriod = ijDaily * ijDays;  // total sur 2 ans
  const ijMonthlyApprox = ijAnnual / 12;      // aide visuelle

  /* ---------------- PHASE 2 — RENTES (pas de coordination) ---------------- */
  // 1) AI depuis échelle 44 (mensuel → annuel)
  const aiProj = computeAiProjection(client, legal, echelle44, {
    nbAnneesBTE: opts?.nbAnneesBTE ?? 0,
    nbAnneesMariagePourBTE: opts?.nbAnneesMariagePourBTE ?? 0,
    nbAnneesBTA: opts?.nbAnneesBTA ?? 0,
  });
  const aiAdultAnnual = monthlyToAnnual(aiProj.renteAiMensuelle);

  // AI enfants = 40%/enfant de la rente AI adulte
  const nbEnfantsEligibles = countChildrenUnder18At(client, dateSinistre);
  const aiPerChildAnnual = monthlyToAnnual(aiProj.renteAiMensuelle * 0.4);
  const aiChildrenAnnual = aiPerChildAnnual * nbEnfantsEligibles;

  // 2) LPP invalidité (annuel) + Enfants d’invalide (annuel)
  const lppInvalidAnnual = calcRenteInvaliditeLPP(client) || 0;
  const perChildLppAnnual = calcRenteEnfantInvaliditeLPP(client) || 0;
  const lppChildrenAnnual = perChildLppAnnual * nbEnfantsEligibles;

  // 3) Totaux (pas de coordination en maladie)
  const aiTotalAnnual = aiAdultAnnual + aiChildrenAnnual;
  const totalAnnual = aiTotalAnnual + lppInvalidAnnual + lppChildrenAnnual;

  const monthly = {
    aiAdult: annualToMonthly(aiAdultAnnual),
    aiChildren: annualToMonthly(aiChildrenAnnual),
    ai: annualToMonthly(aiTotalAnnual), // alias AI total
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
        "PHASE 1 (Maladie) : IJ du jour 1 au jour 730 = Enter_ijMaladieTaux % du salaire annuel (2 ans).",
        "PHASE 2 (Maladie) : pas de coordination — AI total (adulte + enfants) + LPP adulte + LPP enfants s’additionnent.",
        "AI issue de l’échelle 44 : adulte + 40%/enfant ; conversions mensuelles/annuelles exposées.",
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