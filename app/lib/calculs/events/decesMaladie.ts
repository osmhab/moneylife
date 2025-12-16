//app/lib/calculs/events/decesMaladie.ts
/* =========================================================
 * MoneyLife — Évènement: Décès (MALADIE) + Capitaux LPP
 * Fichier : /lib/calculs/events/decesMaladie.ts
 * ---------------------------------------------------------
 * Règles :
 * - Maladie : PAS de coordination.
 *   → AVS survivants + LPP survivants s’additionnent (on peut dépasser le revenu).
 *
 * Hypothèse d’affichage :
 * - Le décès survient à date fixe (dateDeces = aujourd’hui).
 * - La rente du conjoint (AVS/LPP) est figée à vie si due.
 * - Les rentes d’enfants évoluent selon l’année de paiement (paymentRef),
 *   et s’arrêtent à leurs 18 ans.
 *
 * Unités :
 * - AVS échelle 44 : MENSUEL → ANNUEL.
 * - LPP : ANNUEL.
 * =======================================================*/

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";
import { computeDecesProjection } from "@/lib/calculs/avsDeces";
import {
  calcRenteConjointLPP,
  calcRentePartenaireLPP,
  calcRenteOrphelinLPP,
  calcCapitalDecesMaladieAucuneRenteLPP,
} from "@/lib/calculs/lpp";
import {
  Legal_renteAVSWidowDueAt,
  Legal_renteAVSWidowerDueAt,
  Legal_renteLPPDueAt,
  Legal_renteLPPNonDueAt,
} from "@/lib/rules/guards";
import { monthlyToAnnual, annualToMonthly } from "@/lib/core/format";
import { computeAgeOn } from "@/lib/core/dates";

/* ---------- Types de sortie ---------- */
export type DecesMaladieResult = {
  annual: {
    avs: number;              // AVS survivants annuel (veuve/veuf + orphelins)
    lppRentes: number;        // LPP survivants annuel (conjoint/partenaire + orphelins)
    totalRentes: number;      // somme sans coordination (AVS + LPP)
  };
  monthly: {
    avs: number;
    lpp: number;
    total: number;
  };
  capitals: {
    lppMaladieAucuneRente?: number; // si rente LPP non due (voir calc)
    lppMaladiePlusRente?: number;   // Enter_CapitalPlusRenteMal || Enter_CapitalPlusRente
    totalCapitalsMaladie: number;   // somme des capitaux LPP (maladie)
  };
  meta: {
    notes: string[];
    inputs: {
      nbEnfantsEligibles: number;
      flags: { AVS_Widow_Due: boolean; AVS_Widower_Due: boolean; LPP_Due: boolean; LPP_NonDue: boolean };
    };
    breakdown: {
      avs: { widowMonthly: number; orphanMonthlyPerChild: number; orphanMonthlyTotal: number };
      lpp: { spouseOrPartnerAnnual: number; perChildAnnual: number; orphansAnnual: number };
      guards: { LPP_Due: boolean; LPP_NonDue: boolean };
      capitals: {
        sourceAucuneRente: "Enter_CapitalAucuneRenteMal" | "Enter_CapitalAucuneRente" | "Legal_Multiplicateur" | "None";
        sourcePlusRente: "Enter_CapitalPlusRenteMal" | "Enter_CapitalPlusRente" | "None";
      };
    };
  };
};

/* ---------- Helpers internes ---------- */

/** Nombre d'enfants < 18 ans à une date donnée (paiement) */
function countChildrenUnder18At(client: ClientData, refDate: Date): number {
  const enfants = client.Enter_enfants ?? [];
  return enfants.filter(e => computeAgeOn(e.Enter_dateNaissance, refDate) < 18).length;
}

/** Rente LPP du conjoint OU du partenaire (jamais les deux) */
function selectLppSpouseOrPartnerAnnual(client: ClientData): number {
  if (client.Enter_RenteConjointOuPartenaireLPP === 0) {
    return calcRenteConjointLPP(client) || 0;
  }
  if (client.Enter_RenteConjointOuPartenaireLPP === 1) {
    return calcRentePartenaireLPP(client) || 0;
  }
  // fallback si non précisé : préférer conjoint si existant
  return (calcRenteConjointLPP(client) || calcRentePartenaireLPP(client) || 0);
}

/* =========================================================
 * Fonction principale
 * =======================================================*/
export function computeDecesMaladie(
  dateDeces: Date,
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  opts?: {
    /** Date de paiement (colonne du tableau). Défaut : dateDeces */
    paymentRef?: Date;
  }
): DecesMaladieResult {
  // Décès figé ; paiement évolutif pour le comptage des enfants
  const payRef = opts?.paymentRef ?? dateDeces;

  /* ---------- AVS survivants (mensuel → annuel) ---------- */
  // Enfants éligibles à la date de paiement
  const nbEnfantsEligibles = countChildrenUnder18At(client, payRef);

  // Montants théoriques AVS (échelle 44) à partir du RAMD décès (figé)
  const avsProj = computeDecesProjection(client, legal, echelle44, {
    ageAuDeces: computeAgeOn(client.Enter_dateNaissance, dateDeces),
  });

  // Éligibilité AVS à la date du décès (rente conjoint à vie si due)
  const AVS_Widow_Due = Legal_renteAVSWidowDueAt(client, dateDeces);
  const AVS_Widower_Due = Legal_renteAVSWidowerDueAt(client, dateDeces);

  const widowMonthly =
    (AVS_Widow_Due || AVS_Widower_Due) ? (avsProj.renteSurvivantMensuelle || 0) : 0;

  const orphanMonthlyPerChild =
    nbEnfantsEligibles > 0 ? (avsProj.orphelinMensuelParEnfant || 0) : 0;
  const orphanMonthlyTotal = orphanMonthlyPerChild * nbEnfantsEligibles;

  const avsAnnual = monthlyToAnnual(widowMonthly + orphanMonthlyTotal);

  /* ---------- LPP survivants (annuel) ---------- */
  // Éligibilité LPP (à la date du décès)
  const LPP_Due = Legal_renteLPPDueAt(client, dateDeces);
  const LPP_NonDue = Legal_renteLPPNonDueAt(client, dateDeces);

  // Conjoint/partenaire uniquement si due (figée à vie)
  const lppSpouseOrPartnerAnnual = LPP_Due ? selectLppSpouseOrPartnerAnnual(client) : 0;

  const lppOrphanPerChildAnnual = calcRenteOrphelinLPP(client) || 0;
  const lppOrphansAnnual = lppOrphanPerChildAnnual * nbEnfantsEligibles;

  const lppRentesAnnual = lppSpouseOrPartnerAnnual + lppOrphansAnnual;

  /* ---------- Totaux rentes (pas de coordination en maladie) ---------- */
  const totalRentesAnnual = avsAnnual + lppRentesAnnual;

  const monthly = {
    avs: annualToMonthly(avsAnnual),
    lpp: annualToMonthly(lppRentesAnnual),
    total: annualToMonthly(totalRentesAnnual),
  };

  /* ---------- Capitaux LPP (maladie) ---------- */
  // Aucune rente : seulement si NON due (à la date du décès)
  let lppMaladieAucuneRente = 0;
  let sourceAucune: "Enter_CapitalAucuneRenteMal" | "Enter_CapitalAucuneRente" | "Legal_Multiplicateur" | "None" = "None";

  if (LPP_NonDue) {
    const computed = calcCapitalDecesMaladieAucuneRenteLPP(client, legal) || 0;

    if (client.Enter_CapitalAucuneRenteMal && client.Enter_CapitalAucuneRenteMal > 0) {
      sourceAucune = "Enter_CapitalAucuneRenteMal";
    } else if (client.Enter_CapitalAucuneRente && client.Enter_CapitalAucuneRente > 0) {
      sourceAucune = "Enter_CapitalAucuneRente";
    } else if (computed > 0) {
      sourceAucune = "Legal_Multiplicateur";
    }

    lppMaladieAucuneRente = computed;
  }

  // Plus rente (maladie) : toujours ajouté si présent (sinon générique)
  let lppMaladiePlusRente = 0;
  let sourcePlus: "Enter_CapitalPlusRenteMal" | "Enter_CapitalPlusRente" | "None" = "None";
  if (client.Enter_CapitalPlusRenteMal && client.Enter_CapitalPlusRenteMal > 0) {
    lppMaladiePlusRente = client.Enter_CapitalPlusRenteMal;
    sourcePlus = "Enter_CapitalPlusRenteMal";
  } else if (client.Enter_CapitalPlusRente && client.Enter_CapitalPlusRente > 0) {
    lppMaladiePlusRente = client.Enter_CapitalPlusRente;
    sourcePlus = "Enter_CapitalPlusRente";
  }

  const totalCapitalsMaladie = lppMaladieAucuneRente + lppMaladiePlusRente;

  return {
    annual: {
      avs: avsAnnual,
      lppRentes: lppRentesAnnual,
      totalRentes: totalRentesAnnual,
    },
    monthly,
    capitals: {
      lppMaladieAucuneRente: lppMaladieAucuneRente || undefined,
      lppMaladiePlusRente: lppMaladiePlusRente || undefined,
      totalCapitalsMaladie,
    },
    meta: {
      notes: [
        "Décès figé à la date de l’analyse ; rentes conjointes à vie si dues.",
        "Pas de coordination en maladie — AVS + LPP s’additionnent.",
        "AVS inclut veuve/veuf (si éligible, fixe) + orphelins (40%/enfant) selon paymentRef.",
        "LPP inclut conjoint/partenaire (si éligible, fixe) + orphelins LPP (annuel).",
        "Capitaux LPP maladie : 'Aucune rente' uniquement si rente LPP non due ; 'Plus rente' ajouté si renseigné.",
      ],
      inputs: {
        nbEnfantsEligibles,
        flags: { AVS_Widow_Due, AVS_Widower_Due, LPP_Due, LPP_NonDue },
      },
      breakdown: {
        avs: { widowMonthly, orphanMonthlyPerChild, orphanMonthlyTotal },
        lpp: {
          spouseOrPartnerAnnual: lppSpouseOrPartnerAnnual,
          perChildAnnual: lppOrphanPerChildAnnual,
          orphansAnnual: lppOrphansAnnual,
        },
        guards: { LPP_Due, LPP_NonDue },
        capitals: {
          sourceAucuneRente: sourceAucune,
          sourcePlusRente: sourcePlus,
        },
      },
    },
  };
}