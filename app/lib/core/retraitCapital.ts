// app/lib/core/retraitCapital.ts
//
// QUELLE PART DE L'AVOIR PEUT ÊTRE PRISE EN CAPITAL ?
//
// Les MONTANTS viennent du certificat — capital projeté, rentes — et font foi.
// Le règlement répond à une question que le certificat n'aborde jamais : quelle
// part de cet avoir l'assuré peut-il percevoir en capital plutôt qu'en rente.
//
// C'est ce qui borne le curseur « part utilisée pour la retraite » de l'app.
// Chez une caisse plafonnée à 25 %, laisser un client planifier sur 100 %
// revient à bâtir son projet sur un capital qu'il n'obtiendra jamais — et
// l'erreur ne se découvrirait qu'au moment de partir à la retraite, quand plus
// rien n'est rattrapable.

import type { BlocRegles } from "./reglement";
import { estSourcee } from "./reglement";

/**
 * Plafond de retrait en capital, en pourcents.
 *
 * `null` quand le règlement est muet ou n'est pas connu : on ne borne alors
 * rien, plutôt que de restreindre un client sur une supposition. Ne pas savoir
 * n'est pas la même chose que savoir que c'est limité.
 */
export function partMaxEnCapital(bloc: BlocRegles | null | undefined): number | null {
  const r = bloc?.retraitCapital;
  if (!estSourcee(r)) return null;
  // ⚠️ `Number(null)` vaut 0. Sans ce test, un règlement MUET sur le retrait en
  // capital produirait « 0 % » — la lecture la plus restrictive possible — et
  // interdirait à un client un droit qu'il a peut-être. Un 0 explicite, lui,
  // reste un 0 : certaines caisses excluent réellement le capital.
  if (r!.partMaxPct == null) return null;
  const n = Number(r!.partMaxPct);
  // Hors de [0, 100], c'est une lecture erronée : on préfère ne rien borner.
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export interface ContrainteRetrait {
  /** Plafond à appliquer au curseur, ou null si rien n'est connu. */
  partMaxPct: number | null;
  notes: string[];
}

/**
 * Contrainte de retrait à poser sur un plan, et ce qu'il faut en dire.
 *
 * Les notes ne servent pas qu'à la traçabilité : un préavis de trois ans ou le
 * consentement du conjoint sont des DÉMARCHES que le client doit engager bien
 * avant la retraite. Les découvrir trop tard coûte le bénéfice de la règle.
 */
export function contrainteRetrait(bloc: BlocRegles | null | undefined): ContrainteRetrait {
  const r = bloc?.retraitCapital;
  const partMaxPct = partMaxEnCapital(bloc);
  if (partMaxPct == null) return { partMaxPct: null, notes: [] };

  const article = r!.article ?? "";
  const notes: string[] = [];

  notes.push(
    partMaxPct >= 100
      ? `L'avoir peut être perçu intégralement en capital (${article}).`
      : `Retrait en capital limité à ${partMaxPct} % de l'avoir (${article}).`,
  );

  const delai = Number(r!.delaiAnnonceMois);
  if (Number.isFinite(delai) && delai > 0) {
    notes.push(`À annoncer ${delai} mois avant la retraite (${article}).`);
  }
  if (r!.consentementConjoint === true) {
    notes.push(`Le consentement écrit du conjoint est requis (${article}).`);
  }
  const blocage = Number(r!.blocageApresRachatAns);
  if (Number.isFinite(blocage) && blocage > 0) {
    notes.push(
      `Un rachat ferme l'accès au capital pendant ${blocage} an${blocage > 1 ? "s" : ""} (${article}).`,
    );
  }

  return { partMaxPct, notes };
}
