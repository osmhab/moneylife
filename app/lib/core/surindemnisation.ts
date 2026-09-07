// app/lib/core/surindemnisation.ts
//
// LE PLAFOND QUI RABOTE LES RENTES — et que le certificat n'annonce jamais.
//
// Presque toutes les caisses réduisent leurs rentes d'invalidité et de
// survivants dès que, CUMULÉES avec l'AI et les autres revenus de remplacement,
// elles dépassent un pourcentage du gain que l'assuré aurait perçu sans le
// sinistre. AXA, chiffre 73.1 : 90 %.
//
// POURQUOI C'EST LE PLUS GROS ÉCART DE TOUS
// ------------------------------------------
// Le certificat imprime la rente d'invalidité BRUTE de la caisse. L'analyse y
// ajoute l'AI, et annonce un total. Mais ce total, le client ne le touchera
// jamais : la caisse rabote sa propre rente de l'excédent. On lui promet une
// couverture qui n'existe pas — et l'écart se compte en dizaines de milliers de
// francs sur une carrière.
//
// CE QUE LE RÈGLEMENT SEUL DONNE
// La base n'est pas le salaire assuré mais le GAIN PRÉSUMÉ PERDU (chiffre 73.2 :
// « la totalité du revenu d'une activité lucrative et du revenu de remplacement
// que la personne pourrait percevoir si l'événement n'était pas survenu »), et
// les prestations EN CAPITAL sont exclues du décompte. Deux nuances qu'on ne
// devine pas, et qui changent le résultat.

import type { BlocRegles } from "./reglement";
import { estSourcee } from "./reglement";

/**
 * Plafond en FRACTION du gain présumé perdu (0.9 pour 90 %).
 *
 * `null` quand le règlement est muet : on ne rabote alors rien. Appliquer un
 * plafond supposé retrancherait à un client une rente qu'il touchera peut-être
 * en entier.
 */
export function plafondSurindemnisation(bloc: BlocRegles | null | undefined): number | null {
  const r = bloc?.surindemnisation;
  if (!estSourcee(r)) return null;
  const pct = Number(r!.plafondPct);
  // Entre 50 % et 100 % : hors de cette plage, c'est une lecture erronée. Un
  // plafond à 9 % raboterait presque toute la rente.
  return Number.isFinite(pct) && pct >= 50 && pct <= 100 ? pct / 100 : null;
}

export interface EntreeSurindemnisation {
  /** Gain que l'assuré percevrait sans le sinistre (revenu total, pas le salaire assuré). */
  gainPresume: number | null | undefined;
  /** Rentes de tiers comptées : AI, LAA, indemnités journalières… JAMAIS les capitaux. */
  rentesTierces: number;
  /** Rente que la caisse verserait sans plafond. */
  renteCaisse: number;
}

export interface ResultatSurindemnisation {
  /** Rente de la caisse après réduction. */
  renteReduite: number;
  /** Montant retranché (0 si aucun). */
  reduction: number;
  plafond: number | null;
  notes: string[];
  /** Faux si un conseiller doit trancher. */
  automatique: boolean;
}

/**
 * Réduit la rente de la caisse de l'excédent, jamais en dessous de zéro.
 *
 * C'est bien la rente de LA CAISSE qui est rabotée : elle ne peut pas réduire
 * l'AI, qui est due par la Confédération. Le client garde donc toujours ses
 * rentes de tiers.
 */
export function reduireSiSurindemnise(
  e: EntreeSurindemnisation,
  bloc: BlocRegles | null | undefined,
): ResultatSurindemnisation {
  const fraction = plafondSurindemnisation(bloc);
  const renteCaisse = Math.max(0, Number(e.renteCaisse) || 0);
  const tierces = Math.max(0, Number(e.rentesTierces) || 0);

  if (fraction == null) {
    return { renteReduite: renteCaisse, reduction: 0, plafond: null, notes: [], automatique: true };
  }

  const gain = Number(e.gainPresume);
  if (!Number.isFinite(gain) || gain <= 0) {
    // Sans revenu connu, impossible de calculer le plafond. On ne rabote pas,
    // et on le dit : c'est une donnée à compléter, pas une absence de règle.
    return {
      renteReduite: renteCaisse, reduction: 0, plafond: null,
      notes: ["Plafond de surindemnisation non calculable : le revenu annuel n'est pas renseigné."],
      automatique: false,
    };
  }

  const article = bloc!.surindemnisation!.article ?? "";
  const plafond = gain * fraction;
  const total = tierces + renteCaisse;

  if (total <= plafond) {
    return { renteReduite: renteCaisse, reduction: 0, plafond, notes: [], automatique: true };
  }

  const reduction = Math.min(renteCaisse, total - plafond);
  return {
    renteReduite: Math.round(renteCaisse - reduction),
    reduction: Math.round(reduction),
    plafond: Math.round(plafond),
    notes: [
      `Rente réduite de ${Math.round(reduction).toLocaleString("fr-CH")} CHF : le cumul avec les autres ` +
      `revenus dépasse ${(fraction * 100).toFixed(0)} % du gain présumé perdu (${article}).`,
    ],
    automatique: true,
  };
}

/**
 * Le plafond mord-il, pour cette situation ?
 *
 * Sert à signaler un dossier au conseiller sans avoir à recalculer toute
 * l'analyse : si la réponse est oui, la couverture réellement versée sera
 * inférieure à celle qu'affiche le certificat.
 */
export function estSurindemnise(
  e: EntreeSurindemnisation,
  bloc: BlocRegles | null | undefined,
): boolean {
  return reduireSiSurindemnise(e, bloc).reduction > 0;
}

/* =========================================================
 * Application à un scénario de rentes
 * =======================================================*/

export interface ScenarioRentes {
  adulte: { avs: number; lpp: number };
  parEnfant: { avs: number; lpp: number };
  nbEnfants: number;
  total: number;
}

/**
 * Rabote un scénario de rentes MENSUELLES du dépassement de plafond.
 *
 * La réduction porte sur les seules parts LPP — adulte et enfants — au prorata
 * de leur poids : la caisse ne peut pas réduire l'AVS/AI, due par la
 * Confédération. Un scénario dont les rentes de tiers dépassent à elles seules
 * le plafond voit donc toute sa part LPP tomber à zéro, sans jamais devenir
 * négative.
 *
 * `plafondMensuel` à null ou nul : rien n'est raboté. Un plafond inconnu ne
 * doit jamais retrancher une rente que le client touchera peut-être en entier.
 */
export function reduireScenario<T extends ScenarioRentes>(
  scenario: T,
  plafondMensuel: number | null,
): T & { reductionSurindemnisation: number } {
  const intact = { ...scenario, reductionSurindemnisation: 0 };
  if (plafondMensuel == null || !Number.isFinite(plafondMensuel) || plafondMensuel <= 0) return intact;

  const n = Math.max(0, scenario.nbEnfants);
  const lppTotal = scenario.adulte.lpp + n * scenario.parEnfant.lpp;
  const exces = scenario.total - plafondMensuel;
  if (exces <= 0 || lppTotal <= 0) return intact;

  const reduction = Math.min(lppTotal, exces);
  const garde = 1 - reduction / lppTotal;   // part conservée, entre 0 et 1

  const adulteLpp = Math.round(scenario.adulte.lpp * garde);
  const enfantLpp = Math.round(scenario.parEnfant.lpp * garde);

  return {
    ...scenario,
    adulte: { ...scenario.adulte, lpp: adulteLpp },
    parEnfant: { ...scenario.parEnfant, lpp: enfantLpp },
    // Recalculé depuis les parts arrondies : le total affiché doit être la
    // somme de ce qu'on montre, pas une valeur qui ne s'y raccroche pas.
    total: scenario.adulte.avs + adulteLpp + n * (scenario.parEnfant.avs + enfantLpp),
    reductionSurindemnisation: Math.round(reduction),
  };
}

/** Plafond MENSUEL applicable, ou null si la règle ou le revenu manquent. */
export function plafondMensuel(
  gainPresumeAnnuel: number | null | undefined,
  bloc: BlocRegles | null | undefined,
): number | null {
  const fraction = plafondSurindemnisation(bloc);
  const gain = Number(gainPresumeAnnuel);
  if (fraction == null || !Number.isFinite(gain) || gain <= 0) return null;
  return (gain * fraction) / 12;
}
