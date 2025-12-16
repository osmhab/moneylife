//app/lib/calculs/events/invaliditeAccident.ts
/* =========================================================
 * MoneyLife — Évènement: Invalidité (ACCIDENT)
 * ---------------------------------------------------------
 * Coordination (phase 2) :
 * - Plafond = 90% du SALAIRE ANNUEL effectif (pas la base LAA).
 * - On prend AI (adulte + enfants) + LAA (réduite d'abord) + LPP (adulte + enfants)
 *   et on limite le total à 90% du salaire (top-up via LPP puis réduction si dépassement).
 *
 * Unités :
 * - Coordination en ANNUEL.
 * - AI échelle 44 : MENSUEL → ANNUEL.
 * - LAA/LPP invalidité : ANNUELS.
 * - IJ phase 1 (accident) : Enter_ijAccidentTaux % du SALAIRE ANNUEL (fallback legal.Legal_ijAccidentTaux si absent).
 * =======================================================*/

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";
import { computeAiProjection } from "@/lib/calculs/avsAi";
import { calcRenteInvaliditeLAA } from "@/lib/calculs/laa";
import { calcRenteInvaliditeLPP, calcRenteEnfantInvaliditeLPP } from "@/lib/calculs/lpp";
import { monthlyToAnnual, annualToMonthly } from "@/lib/core/format";
import { computeAgeOn } from "@/lib/core/dates";

/* ---------- Types de sortie ---------- */
export type InvaliditeAccidentResult = {
  phaseIj: {
    days: number;
    annualIj: number;
    dailyIj: number;
    totalForPeriod: number;
    monthlyApprox: number;
    base: { salaireAnnuel: number; baseAssuree: number; plafondLAA: number; ijAccidentTauxPct?: number; };
  };
  phaseRente: {
    annual: {
      capBase: number;            // SALAIRE ANNUEL (sauf override)
      cap90: number;              // 90% du salaire
      aiAdult: number;            // AI adulte (an)
      aiChildren: number;         // AI enfants total (an)
      aiTotal: number;            // AI total (adulte + enfants)
      laaBeforeCap: number;       // LAA brut (an)
      laaAfterCap: number;        // LAA après coord (an)
      lppAdultAnnual: number;     // LPP adulte (an)
      lppChildrenAnnual: number;  // LPP enfants total (an)
      lppAvailable: number;       // LPP adulte + enfants (an)
      lppAfterCap: number;        // LPP réellement prise (an)
      totalAfterCoord: number;    // total coordonné (an)
      nbChildrenEligible: number;
      aiPerChildAnnual: number;
      lppPerChildAnnual: number;
    };
    monthly: {
      aiAdult: number;
      aiChildren: number;
      ai: number;                 // total AI mensuel
      laa: number;
      lpp: number;
      total: number;
      lppAdultMonthly: number;
      lppChildrenMonthly: number;
    };
  };
  meta: {
    notes: string[];
    params: {
      nbAnneesBTE: number;
      nbAnneesMariagePourBTE: number;
      nbAnneesBTA: number;
      overrideCapBase?: number;
    };
  };
};

/* ---------- Helper ---------- */
function countChildrenUnder18At(client: ClientData, at: Date): number {
  const enfants = client.Enter_enfants ?? [];
  return enfants.filter(e => computeAgeOn(e.Enter_dateNaissance, at) < 18).length;
}

/* =========================================================
 * Fonction principale
 * =======================================================*/
export function computeInvaliditeAccident(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  opts?: {
    nbAnneesBTE?: number;
    nbAnneesMariagePourBTE?: number;
    nbAnneesBTA?: number;
    /** Override de la base de coordination (par défaut = salaire annuel) */
    overrideCapBase?: number;
    referenceDate?: Date;
  }
): InvaliditeAccidentResult {
  /* ---------------- PHASE 1 — IJ ACCIDENT ---------------- */
  const salaireAnnuel = client.Enter_salaireAnnuel ?? 0;
  const baseAssuree = Math.min(salaireAnnuel, legal.Legal_SalaireAssureMaxLAA);

  // Taux IJ Accident : valeur du formulaire (80–100) ou fallback légal
  const rawIjAccTaux =
    typeof client.Enter_ijAccidentTaux === "number"
      ? client.Enter_ijAccidentTaux
      : (legal?.Legal_ijAccidentTaux ?? 80);

  const ijAccTaux = Math.max(80, Math.min(100, rawIjAccTaux)); // borne 80–100
  // IJ accident appliquée au SALAIRE ANNUEL (et non à la base LAA)
  const ijAnnual = (ijAccTaux / 100) * salaireAnnuel;

  const ijDaily = ijAnnual / 365;
  const ijDays = 728; // J3→J730 inclus ~ 2 ans
  const ijTotalForPeriod = ijDaily * ijDays;
  const ijMonthlyApprox = ijAnnual / 12;

  /* ---------------- PHASE 2 — RENTES ---------------- */
  // ✅ Coordination à 90% sur le SALAIRE ANNUEL (et non la baseAssuree LAA)
  const capBase =
    typeof opts?.overrideCapBase === "number" ? opts!.overrideCapBase : salaireAnnuel;
  const cap90 = capBase * 0.9;

  // 1) AI depuis échelle 44 (mensuel → annuel)
  const aiProj = computeAiProjection(client, legal, echelle44, {
    nbAnneesBTE: opts?.nbAnneesBTE ?? 0,
    nbAnneesMariagePourBTE: opts?.nbAnneesMariagePourBTE ?? 0,
    nbAnneesBTA: opts?.nbAnneesBTA ?? 0,
  });
  const aiAdultAnnual = monthlyToAnnual(aiProj.renteAiMensuelle);

  // AI enfants (40%/enfant de la rente AI adulte) — uniquement <18 au sinistre
  const dateSinistre = opts?.referenceDate ?? new Date();
  const nbChildren = countChildrenUnder18At(client, dateSinistre);
  const aiPerChildAnnual = monthlyToAnnual(aiProj.renteAiMensuelle * 0.4);
  const aiChildrenAnnual = aiPerChildAnnual * nbChildren;
  const aiTotalAnnual = aiAdultAnnual + aiChildrenAnnual;

  // 2) LAA invalidité (an) — brut puis coordonné vs AI TOTAL (adulte + enfants)
  const laaInvalidAnnualBeforeCap = calcRenteInvaliditeLAA(client, legal);
  const laaAllowed = Math.max(0, cap90 - aiTotalAnnual);
  const laaInvalidAnnualAfterCap = Math.min(laaInvalidAnnualBeforeCap, laaAllowed);

  // 3) LPP invalidité (an) — ADULTE + ENFANTS complètent si <90%
  const lppAdultAnnual = calcRenteInvaliditeLPP(client) || 0;
  const lppPerChildAnnual = calcRenteEnfantInvaliditeLPP(client) || 0;
  const lppChildrenAnnual = lppPerChildAnnual * nbChildren;

  const lppAvailable = lppAdultAnnual + lppChildrenAnnual;
  const remainingTo90 = Math.max(0, cap90 - (aiTotalAnnual + laaInvalidAnnualAfterCap));
  const lppInvalidAnnualAfterCap = Math.min(lppAvailable, remainingTo90);

  // 4) Totaux + mensuels
  const totalAnnual = aiTotalAnnual + laaInvalidAnnualAfterCap + lppInvalidAnnualAfterCap;

  return {
    phaseIj: {
      days: ijDays,
      annualIj: ijAnnual,
      dailyIj: ijDaily,
      totalForPeriod: ijTotalForPeriod,
      monthlyApprox: ijMonthlyApprox,
      base: {
        salaireAnnuel,
        baseAssuree,
        plafondLAA: legal.Legal_SalaireAssureMaxLAA,
        ijAccidentTauxPct: ijAccTaux,
      },
    },
    phaseRente: {
      annual: {
        capBase,
        cap90,
        aiAdult: aiAdultAnnual,
        aiChildren: aiChildrenAnnual,
        aiTotal: aiTotalAnnual,
        laaBeforeCap: laaInvalidAnnualBeforeCap,
        laaAfterCap: laaInvalidAnnualAfterCap,
        lppAdultAnnual,
        lppChildrenAnnual,
        lppAvailable,
        lppAfterCap: lppInvalidAnnualAfterCap,
        totalAfterCoord: totalAnnual,
        nbChildrenEligible: nbChildren,
        aiPerChildAnnual,
        lppPerChildAnnual,
      },
      monthly: {
        aiAdult: annualToMonthly(aiAdultAnnual),
        aiChildren: annualToMonthly(aiChildrenAnnual),
        ai: annualToMonthly(aiTotalAnnual),
        laa: annualToMonthly(laaInvalidAnnualAfterCap),
        lpp: annualToMonthly(lppInvalidAnnualAfterCap),
        total: annualToMonthly(totalAnnual),
        lppAdultMonthly: annualToMonthly(lppAdultAnnual),
        lppChildrenMonthly: annualToMonthly(lppChildrenAnnual),
      },
    },
    meta: {
      notes: [
        "Coordination accident (invalidité) : plafond = 90% du SALAIRE annuel.",
        "Séquence : AI (adulte+enfants) + LAA (réduction d’abord) + LPP (adulte+enfants en top-up) ≤ 90%.",
        "Phase 1 IJ accident : taux du formulaire (Enter_ijAccidentTaux) appliqué au salaire annuel (fallback légal si absent).",
      ],
      params: {
        nbAnneesBTE: opts?.nbAnneesBTE ?? 0,
        nbAnneesMariagePourBTE: opts?.nbAnneesMariagePourBTE ?? 0,
        nbAnneesBTA: opts?.nbAnneesBTA ?? 0,
        overrideCapBase: opts?.overrideCapBase,
      },
    },
  };
}