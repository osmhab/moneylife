/* =========================================================
 * MoneyLife — Évènement: Retraite (65 ans)
 * Fichier : /lib/calculs/events/retraite.ts
 * ---------------------------------------------------------
 * Règles:
 * - AVS : rente MENSUELLE estimée via Échelle 44 (RAMD Retraite).
 * - LPP : rente VIEILLESSE (ANNUELLE) à 65 ans (certificat).
 * - Pas de coordination : on additionne AVS + LPP pour l’aperçu.
 * - Objectif: structure identique aux autres évènements (annual/monthly/meta).
 * =======================================================*/

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";
import { computeRetraiteProjection } from "@/lib/calculs/avsAi";
import { calcRenteVieillesseLPP } from "@/lib/calculs/lpp";
import { monthlyToAnnual, annualToMonthly } from "@/lib/core/format";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

/* ---------- Types de sortie ---------- */
export type RetraiteResult = {
  annual: {
    avs: number;        // AVS annuel (depuis rente mensuelle échelle 44)
    lpp: number;        // LPP vieillesse annuel (certificat)
    total: number;      // AVS + LPP (pas de coordination)
  };
  monthly: {
    avs: number;        // AVS mensuel
    lpp: number;        // LPP mensuel (conversion)
    total: number;      // somme mensuelle
  };
  meta: {
    notes: string[];
    age: {
      legalRetirementAge: number; // Legal_AgeRetraiteAVS (ex 65)
      currentAge: number;         // âge approx. aujourd’hui
      yearsTo65: number;          // max(0, 65 - currentAge)
    };
    avs: {
      ramdRetraite: number;       // RAMD utilisé pour la sélection "plancher"
    };
  };
};

/* ---------- Helpers internes ---------- */
function computeAgeTodayFromMask(mask?: string): number {
  if (!mask || !isValidDateMask(mask)) return 0;
  const [dd, mm, yyyy] = normalizeDateMask(mask).split(".");
  const birth = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/* =========================================================
 * Fonction principale
 * =======================================================*/
export function computeRetraite(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[]
): RetraiteResult {
  // 1) AVS — projection mensuelle via échelle 44
  const avsProj = computeRetraiteProjection(client, legal, echelle44);
  const avsMonthly = avsProj.renteRetraiteMensuelle || 0;
  const avsAnnual = monthlyToAnnual(avsMonthly);

  // 2) LPP — rente vieillesse (annuelle) du certificat
  const lppAnnual = calcRenteVieillesseLPP(client) || 0;
  const lppMonthly = annualToMonthly(lppAnnual);

  // 3) Totaux simples (pas de coordination)
  const totalAnnual = avsAnnual + lppAnnual;
  const totalMonthly = annualToMonthly(totalAnnual);

  // 4) Métadonnées d’âge
  const legalAge = legal.Legal_AgeRetraiteAVS ?? 65;
  const currentAge = computeAgeTodayFromMask(client.Enter_dateNaissance);
  const yearsTo65 = Math.max(0, legalAge - currentAge);

  return {
    annual: {
      avs: avsAnnual,
      lpp: lppAnnual,
      total: totalAnnual,
    },
    monthly: {
      avs: avsMonthly,
      lpp: lppMonthly,
      total: totalMonthly,
    },
    meta: {
      notes: [
        "Retraite: aucune coordination — AVS + LPP s’additionnent.",
        "AVS issue de l’échelle 44 (rente mensuelle) convertie en annuel pour l’agrégat.",
        "LPP vieillesse issue du certificat (annuel) convertie en mensuel pour l’UI.",
      ],
      age: {
        legalRetirementAge: legalAge,
        currentAge,
        yearsTo65,
      },
      avs: {
        ramdRetraite: avsProj.ramdRetraite,
      },
    },
  };
}