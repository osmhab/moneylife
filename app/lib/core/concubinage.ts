// app/lib/core/concubinage.ts
//
// LE PARTENAIRE NON MARIÉ, ET LA CLAUSE BÉNÉFICIAIRE.
//
// Le concubinage est le seul cas où une prestation de survivant dépend d'une
// DÉMARCHE que le client doit avoir faite lui-même. Un conjoint marié est connu
// de la caisse par l'état civil ; un concubin, non : la plupart des caisses ne
// le reconnaissent que s'il a été DÉSIGNÉ PAR ÉCRIT dans la clause bénéficiaire,
// et après une durée minimale de vie commune (cinq ans, le plus souvent).
//
// Conséquence, et c'est tout l'enjeu : un client peut vivre quinze ans avec son
// partenaire, cotiser toute sa vie, et laisser ce partenaire sans rien — parce
// que personne ne lui a dit d'envoyer un formulaire à sa caisse.
//
// Ce module répond à deux questions distinctes :
//   · le partenaire a-t-il DROIT à une rente ? (durée + désignation) ;
//   · faut-il ALERTER le client parce qu'il lui manque une démarche ?

import type { BlocRegles } from "./reglement";

/**
 * Durée de vie commune exigée à défaut d'information.
 *
 * Cinq ans est l'usage dominant, repris de l'art. 20a LPP. C'est une hypothèse,
 * jamais une certitude : elle sert à ALERTER (« vérifiez donc »), jamais à
 * conclure qu'une rente n'est pas due — cf. `droitPartenaireConcubinage`.
 */
export const DUREE_DEFAUT_ANS = 5;

/** Réponse du client sur la désignation de son partenaire auprès de la caisse. */
export type ClauseBeneficiaire = "OUI" | "NON" | "INCONNU";

export interface SituationConcubinage {
  etatCivil?: number | null;
  /** Année du début de la vie commune (« depuis quand ? »). */
  concubinageDepuis?: number | null;
  clauseBeneficiaire?: ClauseBeneficiaire | null;
  /** Le client a coché « ne plus voir ce message ». */
  rappelMasque?: boolean | null;
  partenairePrenom?: string | null;
  partenaireNom?: string | null;
}

const CONCUBINAGE = 4;

export function estConcubinage(etatCivil?: number | null): boolean {
  return etatCivil === CONCUBINAGE;
}

/** Années révolues de vie commune, ou null si l'année de début est inconnue. */
export function anneesViecommune(
  depuis?: number | null,
  anneeCourante: number = new Date().getFullYear(),
): number | null {
  if (typeof depuis !== "number" || !isFinite(depuis)) return null;
  // Une année aberrante (faute de frappe, année future) ne doit pas produire
  // une durée négative qui déclencherait des verdicts absurdes.
  if (depuis < 1900 || depuis > anneeCourante) return null;
  return anneeCourante - depuis;
}

/**
 * Durée de vie commune exigée par le règlement de la caisse.
 *
 * ⚠️ On lit un CHAMP STRUCTURÉ, jamais la prose des conditions. Chercher
 * « N ans » dans le texte a produit une erreur réelle : chez Aevum, la première
 * occurrence est « 20 ans plus jeune que l'assuré » — une différence d'ÂGE. On
 * en a conclu qu'il fallait vingt ans de vie commune, ce qui supprimait la rente
 * d'un couple qui y avait droit et étouffait l'alerte censée le prévenir.
 *
 * Hors de [1, 30] ans, on rend null : une valeur aberrante vaut mieux ignorée
 * que propagée.
 */
export function dureeExigeeParReglement(bloc?: BlocRegles | null): number | null {
  const n = bloc?.rentePartenaire?.dureeViecommuneAns;
  return typeof n === "number" && isFinite(n) && n > 0 && n <= 30 ? n : null;
}

/**
 * Le partenaire a-t-il droit à une rente ?
 *
 * On ne conclut « non » que sur du solide :
 *   · le client a répondu qu'il n'a PAS désigné son partenaire, ou
 *   · le règlement est connu et la durée exigée n'est pas atteinte.
 *
 * Dans tous les autres cas — durée inconnue, règlement inconnu, désignation non
 * renseignée — on répond « à vérifier ». Supprimer une rente sur une hypothèse
 * de cinq ans priverait un client d'une couverture qu'il a peut-être.
 */
export function droitPartenaireConcubinage(
  situation: SituationConcubinage,
  bloc?: BlocRegles | null,
  anneeCourante: number = new Date().getFullYear(),
): { verdict: "OUI" | "NON" | "A_VERIFIER"; motif: string } {
  const clause = situation.clauseBeneficiaire ?? "INCONNU";
  if (clause === "NON") {
    return {
      verdict: "NON",
      motif: "Le partenaire n'est pas désigné dans la clause bénéficiaire de la caisse : aucune rente ne lui serait versée.",
    };
  }

  const annees = anneesViecommune(situation.concubinageDepuis, anneeCourante);
  const exigee = dureeExigeeParReglement(bloc);

  if (annees != null && exigee != null && annees < exigee) {
    return {
      verdict: "NON",
      motif: `Vie commune de ${annees} an${annees > 1 ? "s" : ""} : la caisse en exige ${exigee}.`,
    };
  }

  if (clause === "OUI" && annees != null && exigee != null && annees >= exigee) {
    return {
      verdict: "OUI",
      motif: `Partenaire désigné et ${annees} ans de vie commune (${exigee} exigés).`,
    };
  }

  if (clause === "OUI") {
    return { verdict: "A_VERIFIER", motif: "Partenaire désigné ; la durée de vie commune exigée reste à confirmer." };
  }

  return {
    verdict: "A_VERIFIER",
    motif: annees == null
      ? "Concubinage : la durée de vie commune n'est pas renseignée."
      : "Concubinage : la désignation du partenaire auprès de la caisse n'est pas connue.",
  };
}

/**
 * Faut-il alerter le client ?
 *
 * L'alerte est une INVITATION À VÉRIFIER, pas un constat : on la déclenche dès
 * que la vie commune atteint la durée usuelle et que la désignation n'est pas
 * confirmée. C'est le moment où l'oubli devient coûteux — avant, il n'y a rien
 * à faire ; après, il est trop tard le jour où ça compte.
 *
 * Un client qui a répondu « oui », ou qui a demandé à ne plus voir le message,
 * n'est plus sollicité. Le respecter est la condition pour être écouté le jour
 * où l'on a vraiment quelque chose à dire.
 */
export function doitAlerterClause(
  situation: SituationConcubinage,
  bloc?: BlocRegles | null,
  anneeCourante: number = new Date().getFullYear(),
): boolean {
  if (!estConcubinage(situation.etatCivil)) return false;
  if (situation.clauseBeneficiaire === "OUI") return false;
  if (situation.rappelMasque) return false;

  const annees = anneesViecommune(situation.concubinageDepuis, anneeCourante);
  if (annees == null) return false;                    // on ne sait pas encore

  const seuil = dureeExigeeParReglement(bloc) ?? DUREE_DEFAUT_ANS;
  return annees >= seuil;
}

/**
 * Le petit triangle d'avertissement, à côté du partenaire dans les données
 * personnelles : affiché tant que la désignation n'est pas renseignée.
 *
 * Contrairement à l'alerte, il ne dépend PAS de la durée ni du « ne plus voir » :
 * c'est un état de complétude du dossier, pas une sollicitation. Il disparaît
 * dès que le client a répondu, quelle que soit sa réponse.
 */
export function afficherAvertissementPartenaire(situation: SituationConcubinage): boolean {
  if (!estConcubinage(situation.etatCivil)) return false;
  return (situation.clauseBeneficiaire ?? "INCONNU") === "INCONNU";
}

/** Nom complet du partenaire, pour les messages qui s'adressent au client. */
export function nomPartenaire(situation: SituationConcubinage): string {
  return [situation.partenairePrenom, situation.partenaireNom]
    .map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}
