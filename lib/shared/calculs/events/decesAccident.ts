/* =========================================================
 * MoneyLife — Évènement: Décès (ACCIDENT) + Capitaux LAA/LPP
 * Fichier : /lib/calculs/events/decesAccident.ts
 * ---------------------------------------------------------
 * Coordination :
 * 1) AVS survivants + LAA survivants ≤ 90% du SALAIRE ANNUEL effectif
 *    → LAA se réduit d’abord.
 * 2) Si < 90%, LPP (conjoint/partenaire + orphelins) complète
 *    → LPP se réduit si dépassement. Cap global 90%.
 *
 * Hypothèse d’affichage :
 * - Le décès survient à date fixe (dateDeces = aujourd’hui).
 * - La rente du conjoint (AVS/LAA/LPP) est figée à vie si due.
 * - Les rentes d’enfants évoluent selon l’année de paiement (paymentRef),
 *   et s’arrêtent à leur 18e anniversaire.
 *
 * Unités :
 * - Coordination en ANNUEL.
 * - AVS (échelle 44) : MENSUEL → ANNUEL.
 * - LAA / LPP survivants : ANNUEL.
 *
 * Capitaux :
 * - LAA : capital unique si rente LAA non due.
 * - LPP (accident) :
 *    • Enter_CapitalAucuneRenteAcc → ajouté si rente LPP non due.
 *    • Enter_CapitalPlusRenteAcc  → toujours ajouté.
 *    • Enter_CapitalPlusRente     → toujours ajouté (générique).
 * =======================================================*/

import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "../../core/types";
import { computeDecesProjection } from "../avsDeces";
import { calcRentesSurvivantsLAA, calcCapitalUniqueLAA, calcRenteConjointLAA } from "../laa";
import {
  calcRenteConjointLPP,
  calcRentePartenaireLPP,
  calcRenteOrphelinLPP,
} from "../lpp";
import {
  Legal_renteAVSWidowDueAt,
  Legal_renteAVSWidowerDueAt,
  Legal_renteLAAWidowDueAt,
  Legal_renteLAAWidowerDueAt,
  Legal_renteLPPDueAt,
  Legal_renteLPPNonDueAt,
  hasPartner,
} from "../../rules/guards";
import { monthlyToAnnual, annualToMonthly } from "../../core/format";
import { computeAgeOn } from "../../core/dates";

/* ---------- Types de sortie ---------- */
export type DecesAccidentResult = {
  annual: {
    capBase: number;
    cap90: number;
    avs: number;              // AVS survivants (annuel, veuve/veuf + orphelins)
    laaBeforeCap: number;     // LAA survivants avant coord 90% (cap famille 70% déjà appliqué)
    laaAfterCap: number;      // LAA après coord avec AVS
    lppAvailable: number;     // LPP dispo (conjoint/partenaire + orphelins)
    lppAfterCap: number;      // LPP réellement prise
    totalAfterCoord: number;  // AVS + LAA(coordonnée) + LPP(coordonnée)
  };
  monthly: {
    avs: number;
    laa: number;
    lpp: number;
    total: number;
  };
  capitals: {
    laaUniqueIfNonDue?: number;        // capital unique LAA si rente LAA non due
    lppAccidentAucuneRente?: number;   // Enter_CapitalAucuneRenteAcc si rente LPP non due
    lppAccidentPlusRente?: number;     // Enter_CapitalPlusRenteAcc (toujours ajouté)
    lppGenericPlusRente?: number;      // Enter_CapitalPlusRente (toujours ajouté)
    totalCapitalsAccident: number;
  };
  meta: {
    notes: string[];
    inputs: {
      salaireAnnuel: number;
      legalSalaireAssureMaxLAA: number;
      nbEnfantsEligibles: number;
      flags: {
        AVS_Widow_Due: boolean;
        AVS_Widower_Due: boolean;
        LAA_Due: boolean;
        LAA_NonDue: boolean;
        LPP_Due: boolean;
        LPP_NonDue: boolean;
      };
    };
    breakdown: {
      avs: { widowMonthly: number; orphanMonthlyPerChild: number; orphanMonthlyTotal: number };
      laa: { spouseAnnual: number; perChildAnnual: number; cappedFamilyAnnual: number };
      lpp: { spouseOrPartnerAnnual: number; perChildAnnual: number; availableAnnual: number };
    };
  };
};

/* ---------- Helpers internes ---------- */

/** Nombre d'enfants < 18 ans à une date de référence (paiement) */
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
  // fallback : préférer conjoint si existant
  return (calcRenteConjointLPP(client) || calcRentePartenaireLPP(client) || 0);
}

/* =========================================================
 * Fonction principale de calcul
 * =======================================================*/
export function computeDecesAccident(
  dateDeces: Date,
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  opts?: {
    /** Base de cap 90% (par défaut : SALAIRE ANNUEL effectif) */
    overrideCapBase?: number;
    /** Date de paiement (colonne du tableau). Défaut : dateDeces */
    paymentRef?: Date;
  }
): DecesAccidentResult {
  const salaireAnnuel = client.Enter_salaireAnnuel ?? 0;

  // Références : décès figé, paiement évolutif (pour enfants)
  const payRef = opts?.paymentRef ?? dateDeces;

  // ✅ Coordination sur le SALAIRE effectif (pas sur la base LAA plafonnée)
  const capBase =
    typeof opts?.overrideCapBase === "number" ? opts!.overrideCapBase : salaireAnnuel;
  const cap90 = capBase * 0.9;

  /* ---------- AVS survivants (mensuel -> annuel) ---------- */
  // Enfants éligibles à la date de paiement (varie par colonne)
  const nbEnfantsEligibles = countChildrenUnder18At(client, payRef);

  // Montants théoriques AVS (échelle 44) à partir du RAMD décès (figé)
  const avsProj = computeDecesProjection(client, legal, echelle44, {
    ageAuDeces: computeAgeOn(client.Enter_dateNaissance, dateDeces),
  });

  // Éligibilité AVS à la date du décès (figée, rente conjoint à vie si due)
  const AVS_Widow_Due = Legal_renteAVSWidowDueAt(client, dateDeces);
  const AVS_Widower_Due = Legal_renteAVSWidowerDueAt(client, dateDeces);

  // La rente de SURVIVANT dépend du sexe du survivant (= le CONJOINT). Le droit AVS réserve au
  // VEUF (homme) la seule voie « ≥1 enfant mineur » — pas de voie âge+durée comme la veuve.
  // Enter_spouseSexe : 0 = homme → veuf ; 1 = femme → veuve. Sexe inconnu → voie la plus
  // favorable (OR) pour ne pas sous-estimer par manque de donnée.
  const avsSurvivorDue =
    client.Enter_spouseSexe === 1 ? AVS_Widow_Due
    : client.Enter_spouseSexe === 0 ? AVS_Widower_Due
    : (AVS_Widow_Due || AVS_Widower_Due);
  const widowMonthly = avsSurvivorDue ? (avsProj.renteSurvivantMensuelle || 0) : 0;
  const orphanMonthlyPerChild =
    nbEnfantsEligibles > 0 ? (avsProj.orphelinMensuelParEnfant || 0) : 0;
  const orphanMonthlyTotal = orphanMonthlyPerChild * nbEnfantsEligibles;

  const avsAnnual = monthlyToAnnual(widowMonthly + orphanMonthlyTotal);

  /* ---------- LAA survivants (annuel, cap famille 70%) ---------- */
  // Éligibilité du conjoint LAA à la date du décès (figée)
  // LAA art. 29 : rente conjointe selon le SEXE du survivant (= le conjoint). Veuve : enfant à
  // charge OU ≥ 45 ans. Veuf : enfant à charge seulement. Sexe inconnu → voie la plus favorable.
  const LAA_Widow_Due = Legal_renteLAAWidowDueAt(client, dateDeces);
  const LAA_Widower_Due = Legal_renteLAAWidowerDueAt(client, dateDeces);
  const LAA_Due =
    client.Enter_spouseSexe === 1 ? LAA_Widow_Due
    : client.Enter_spouseSexe === 0 ? LAA_Widower_Due
    : (LAA_Widow_Due || LAA_Widower_Due);
  const LAA_NonDue = hasPartner(client) && !LAA_Due;

  // Rentes LAA (conjoint à vie si due) + enfants à la date de paiement
  const laaSurv = LAA_Due
    ? calcRentesSurvivantsLAA(client, legal, nbEnfantsEligibles)
    : { renteConjoint: 0, renteEnfants: 0, totalAvantCap: 0, totalApresCap: 0 };

  const laaAnnualBeforeCap = laaSurv.totalApresCap;

  /* ---------- Coordination 90% : LAA se réduit d'abord ---------- */
  const laaAllowed = Math.max(0, cap90 - avsAnnual);
  const laaAnnualAfterCap = Math.min(laaAnnualBeforeCap, laaAllowed);

  /* ---------- LPP : complète jusqu'à 90% (réduction si dépassement) ---------- */
  // Éligibilité du conjoint LPP à la date du décès (figée)
  const LPP_Due = Legal_renteLPPDueAt(client, dateDeces);
  const LPP_NonDue = Legal_renteLPPNonDueAt(client, dateDeces);

  // Conjoint/partenaire LPP (à vie si due) + enfants LPP à la date de paiement
  const lppSpouseOrPartnerAnnual = LPP_Due ? selectLppSpouseOrPartnerAnnual(client) : 0;
  const lppOrphanPerChildAnnual = calcRenteOrphelinLPP(client) || 0;
  const lppOrphansAnnual = lppOrphanPerChildAnnual * nbEnfantsEligibles;
  const lppAvailable = lppSpouseOrPartnerAnnual + lppOrphansAnnual;

  const remainingTo90 = Math.max(0, cap90 - (avsAnnual + laaAnnualAfterCap));
  const lppAnnualAfterCap = Math.min(lppAvailable, remainingTo90);

  /* ---------- Totaux rentes ---------- */
  const totalAnnual = avsAnnual + laaAnnualAfterCap + lppAnnualAfterCap;

  const monthly = {
    avs: annualToMonthly(avsAnnual),
    laa: annualToMonthly(laaAnnualAfterCap),
    lpp: annualToMonthly(lppAnnualAfterCap),
    total: annualToMonthly(totalAnnual),
  };

  /* ---------- Capitaux ---------- */
  // LAA : capital unique si NON due (base = rente conjointe théorique)
  let laaUniqueIfNonDue: number | undefined = undefined;
  if (LAA_NonDue) {
    const renteConjointTheorique = calcRenteConjointLAA(client, legal) || 0;
    laaUniqueIfNonDue = calcCapitalUniqueLAA(renteConjointTheorique, legal);
  }

  // LPP — "Aucune rente" uniquement si NON due (accident)
  const lppAccidentAucuneRente = LPP_NonDue ? (client.Enter_CapitalAucuneRenteAcc ?? 0) : 0;

  // LPP — "Plus rente" (accident) & générique : toujours ajoutés s'ils existent
  const lppAccidentPlusRente = client.Enter_CapitalPlusRenteAcc ?? 0;
  const lppGenericPlusRente = client.Enter_CapitalPlusRente ?? 0;

  // Capital décès INDÉPENDANT : versé TOUJOURS (rente due ou non), en plus des autres.
  const lppIndependant = Number(client.Enter_CapitalDecesIndependantAcc) || 0;

  const totalCapitalsAccident =
    (laaUniqueIfNonDue || 0) +
    lppAccidentAucuneRente +
    lppAccidentPlusRente +
    lppGenericPlusRente +
    lppIndependant;

  return {
    annual: {
      capBase,
      cap90,
      avs: avsAnnual,
      laaBeforeCap: laaAnnualBeforeCap,
      laaAfterCap: laaAnnualAfterCap,
      lppAvailable,
      lppAfterCap: lppAnnualAfterCap,
      totalAfterCoord: totalAnnual,
    },
    monthly,
    capitals: {
      laaUniqueIfNonDue,
      lppAccidentAucuneRente,
      lppAccidentPlusRente,
      lppGenericPlusRente,
      totalCapitalsAccident,
    },
    meta: {
      notes: [
        "Décès figé à la date de l’analyse ; rentes conjointes à vie si dues.",
        "Coordination accident : AVS + LAA ≤ 90% du salaire effectif ; LAA réduit d’abord.",
        "Si < 90%, LPP complète jusqu’à 90% (réduction LPP si dépassement).",
        "Cap famille LAA 70% appliqué dans calcRentesSurvivantsLAA.",
        "AVS inclut veuve/veuf (si éligible, fixe) + orphelins (40%/enfant) selon paymentRef.",
        "Capitaux : LAA si rente NON due ; LPP 'Aucune rente Acc' si NON due ; 'Plus rente' ajouté si présent.",
      ],
      inputs: {
        salaireAnnuel,
        legalSalaireAssureMaxLAA: legal.Legal_SalaireAssureMaxLAA,
        nbEnfantsEligibles,
        flags: {
          AVS_Widow_Due,
          AVS_Widower_Due,
          LAA_Due,
          LAA_NonDue,
          LPP_Due,
          LPP_NonDue,
        },
      },
      breakdown: {
        avs: { widowMonthly, orphanMonthlyPerChild, orphanMonthlyTotal },
        laa: {
          spouseAnnual: laaSurv.renteConjoint,
          perChildAnnual: nbEnfantsEligibles > 0 ? laaSurv.renteEnfants / nbEnfantsEligibles : 0,
          cappedFamilyAnnual: laaSurv.totalApresCap,
        },
        lpp: {
          spouseOrPartnerAnnual: lppSpouseOrPartnerAnnual,
          perChildAnnual: lppOrphanPerChildAnnual,
          availableAnnual: lppAvailable,
        },
      },
    },
  };
}