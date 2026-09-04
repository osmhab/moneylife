// app/lib/core/eligibilite.ts
//
// A-T-IL DROIT À CETTE PRESTATION ?
//
// Le scan d'un certificat se contente de RELEVER ce qui est imprimé : un
// certificat annonce une rente de conjoint parce que le plan la prévoit, pas
// parce que CE client y a droit. Un célibataire sans enfant reçoit exactement le
// même certificat qu'un père de famille marié — et jusqu'ici on additionnait
// tout, pour tout le monde.
//
// D'où cette couche, qui s'intercale entre le relevé et l'analyse :
//
//   1. le scan REMPLIT les champs, bêtement, comme une machine ;
//   2. ce module DÉCIDE, prestation par prestation, si le client y a droit
//      compte tenu de sa situation (état civil, enfants, statut professionnel) ;
//   3. le règlement de la caisse, s'il est connu, AFFINE ou CORRIGE ces verdicts
//      (cf. `reglement.ts`).
//
// Les verdicts ne sont JAMAIS montrés tels quels au client : ce sont des
// oui/non internes. Ce que le client voit, c'est une analyse déjà nettoyée des
// prestations auxquelles il n'a pas droit — ce qui est autrement plus clair
// qu'une liste de montants dont certains ne le concernent pas.

import type { BlocRegles } from "./reglement";
import { caseCapitalDeces, estSourcee } from "./reglement";
import { droitPartenaireConcubinage, type SituationConcubinage } from "./concubinage";

/** État civil : index Firestore (cf. ENUM_EtatCivil). */
const CELIBATAIRE = 0, MARIE = 1, DIVORCE = 2, PARTENARIAT = 3, CONCUBINAGE = 4, VEUF = 5;

/** Statut professionnel : 0 salarié, 1 indépendant (cf. ENUM_StatutProfessionnel). */
const SALARIE = 0;

export type Verdict = "OUI" | "NON" | "A_VERIFIER";

export interface PrestationEvaluee {
  cle: string;
  /** Verdict INTERNE — jamais affiché tel quel au client. */
  verdict: Verdict;
  /** Pourquoi, en clair : sert la piste d'audit et l'écran conseiller. */
  motif: string;
  /** Ce qui a tranché : la situation du client, ou le règlement de la caisse. */
  source: "situation" | "reglement";
}

export interface SituationClient extends SituationConcubinage {
  etatCivil?: number | null;
  /** Nombre d'enfants à charge (rente d'orphelin / d'enfant). */
  nombreEnfants?: number | null;
  statutProfessionnel?: number | null;
}

/* =========================================================
 * 1. Briques de situation
 * =======================================================*/

/**
 * Une rente de conjoint suppose un conjoint. Le partenariat enregistré est
 * assimilé au mariage par la LPP ; le concubinage ne l'est JAMAIS d'office —
 * il dépend de conditions propres à chaque caisse (durée de vie commune,
 * désignation écrite), d'où un verdict qui appelle une vérification plutôt
 * qu'un oui ou un non tranché à tort.
 */
export function droitRenteConjoint(situation: SituationClient, bloc?: BlocRegles | null): PrestationEvaluee {
  const e = situation.etatCivil;
  if (e === MARIE || e === PARTENARIAT) {
    return { cle: "renteConjoint", verdict: "OUI", motif: "Marié·e ou lié·e par un partenariat enregistré.", source: "situation" };
  }
  if (e === CONCUBINAGE) {
    // Seul cas où la prestation dépend d'une DÉMARCHE du client : désignation
    // écrite auprès de la caisse, et durée minimale de vie commune. Détaillé
    // dans `concubinage.ts`.
    const r = droitPartenaireConcubinage(situation, bloc);
    return { cle: "renteConjoint", verdict: r.verdict, motif: r.motif, source: bloc ? "reglement" : "situation" };
  }
  if (e === VEUF || e === DIVORCE || e === CELIBATAIRE) {
    return { cle: "renteConjoint", verdict: "NON", motif: "Aucun conjoint ni partenaire enregistré.", source: "situation" };
  }
  // ⚠️ Un état civil INCONNU n'est pas un « non ». Le confondre avec un
  // célibataire ferait disparaître la rente de conjoint d'un client dont le
  // profil est simplement incomplet — exactement l'erreur que ce module doit
  // éviter, dans l'autre sens.
  return { cle: "renteConjoint", verdict: "A_VERIFIER", motif: "État civil non renseigné.", source: "situation" };
}

/** Rentes liées aux enfants : orphelin (décès) et enfant d'invalide. */
export function droitPrestationsEnfants(situation: SituationClient, cle: string): PrestationEvaluee {
  const n = situation.nombreEnfants ?? 0;
  return n > 0
    ? { cle, verdict: "OUI", motif: `${n} enfant${n > 1 ? "s" : ""} à charge.`, source: "situation" }
    : { cle, verdict: "NON", motif: "Aucun enfant à charge.", source: "situation" };
}

/**
 * Les prestations d'ACCIDENT viennent de la LAA, qui assure les SALARIÉS.
 * Un indépendant n'y est pas soumis d'office (assurance facultative possible) :
 * lui compter une rente de décès par accident gonflerait sa couverture d'un
 * montant auquel il n'a, en l'état, aucun droit.
 */
export function droitPrestationsAccident(situation: SituationClient, cle: string): PrestationEvaluee {
  const s = situation.statutProfessionnel;
  if (s == null) return { cle, verdict: "A_VERIFIER", motif: "Statut professionnel inconnu.", source: "situation" };
  return s === SALARIE
    ? { cle, verdict: "OUI", motif: "Salarié·e : couvert·e par la LAA.", source: "situation" }
    : { cle, verdict: "A_VERIFIER", motif: "Indépendant·e : la LAA n'est pas obligatoire, couverture à confirmer.", source: "situation" };
}

/* =========================================================
 * 2. Capital décès — là où le règlement change tout
 * =======================================================*/

/**
 * Le capital décès est la prestation où la situation et le règlement se
 * combinent, et où l'on se trompait.
 *
 * Le certificat Aevum affiche « Capital décès 19'662.05 ». Le règlement (art. 63)
 * précise qu'il n'est versé QUE si aucune rente de partenaire n'est échue. Pour
 * une assurée mariée, ce montant ne sera donc jamais versé — et l'annoncer
 * revient à promettre une couverture décès qui n'existe pas.
 *
 * Sans règlement connu, on ne tranche pas : le montant est relevé, marqué à
 * vérifier, et le plan reste « règlement : non vérifié ».
 */
export function droitCapitalDeces(situation: SituationClient, bloc?: BlocRegles | null): PrestationEvaluee {
  const cle = "capitalDeces";
  const regle = bloc?.capitalDeces;

  if (!estSourcee(regle)) {
    return {
      cle, verdict: "A_VERIFIER",
      motif: "Le règlement de la caisse n'est pas connu : la condition de versement reste à confirmer.",
      source: "situation",
    };
  }

  const conjoint = droitRenteConjoint(situation, bloc);
  const cible = caseCapitalDeces(regle!.verse);
  const article = regle!.article ?? "";

  if (cible === "AUCUNE") {
    return { cle, verdict: "NON", motif: `Le règlement ne prévoit aucun capital décès (${article}).`, source: "reglement" };
  }
  if (cible === "PLUS_RENTE") {
    return { cle, verdict: "OUI", motif: `Versé dans tous les cas, en plus de la rente (${article}).`, source: "reglement" };
  }
  if (cible === "A_VERIFIER") {
    return {
      cle, verdict: "A_VERIFIER",
      motif: `Capital réduit du financement de la rente : montant à confirmer par un conseiller (${article}).`,
      source: "reglement",
    };
  }

  // Reste le cas conditionnel : le capital n'est dû qu'à DÉFAUT de rente.
  if (conjoint.verdict === "OUI") {
    return {
      cle, verdict: "NON",
      motif: `Une rente de partenaire est due : le capital n'est pas versé (${article}).`,
      source: "reglement",
    };
  }
  if (conjoint.verdict === "NON") {
    return {
      cle, verdict: "OUI",
      motif: `Aucune rente de partenaire n'est due : le capital est versé (${article}).`,
      source: "reglement",
    };
  }
  return {
    cle, verdict: "A_VERIFIER",
    motif: `Le droit dépend de l'existence d'une rente de partenaire, elle-même à confirmer (${article}).`,
    source: "reglement",
  };
}

/* =========================================================
 * 3. Vue d'ensemble
 * =======================================================*/

/**
 * Verdict de CHAQUE prestation d'un plan de 2e pilier.
 *
 * Retraite et invalidité ne dépendent pas de la situation familiale : tout
 * assuré actif y a droit. On les rend quand même, pour que l'analyse repose sur
 * une liste complète plutôt que sur des absences implicites.
 */
export function evaluerPrestationsLPP(
  situation: SituationClient,
  bloc?: BlocRegles | null,
): PrestationEvaluee[] {
  return [
    { cle: "capitalRetraite", verdict: "OUI", motif: "Tout assuré actif constitue un avoir de vieillesse.", source: "situation" },
    { cle: "renteVieillesse", verdict: "OUI", motif: "Tout assuré actif constitue un avoir de vieillesse.", source: "situation" },
    { cle: "renteInvalidite", verdict: "OUI", motif: "Couverture d'invalidité acquise dès l'affiliation.", source: "situation" },
    droitPrestationsEnfants(situation, "renteEnfantInvalide"),
    droitRenteConjoint(situation, bloc),
    droitPrestationsEnfants(situation, "renteOrphelin"),
    droitCapitalDeces(situation, bloc),
    droitPrestationsAccident(situation, "renteDecesAccident"),
  ];
}

/** Accès direct au verdict d'une prestation. */
export function verdictDe(prestations: PrestationEvaluee[], cle: string): Verdict {
  return prestations.find((p) => p.cle === cle)?.verdict ?? "A_VERIFIER";
}

/**
 * Prestations à ÉCARTER de l'analyse du client.
 *
 * Seul un « NON » écarte. Un « A_VERIFIER » est conservé : retirer en silence
 * une prestation dont on n'est pas sûr priverait le client d'une couverture
 * qu'il a peut-être — l'erreur inverse, mais aussi grave.
 */
export function prestationsAEcarter(prestations: PrestationEvaluee[]): string[] {
  return prestations.filter((p) => p.verdict === "NON").map((p) => p.cle);
}
