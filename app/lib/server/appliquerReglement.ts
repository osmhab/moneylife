// app/lib/server/appliquerReglement.ts
//
// LE SAVOIR DE CREDITX, APPLIQUÉ À UN CLIENT.
//
// Deux chemins mènent ici, et c'est tout l'intérêt :
//
//   · un client scanne le RÈGLEMENT de sa caisse  → on qualifie ses plans ;
//   · un client scanne son CERTIFICAT             → on regarde si la caisse est
//     déjà connue de la bibliothèque, et si oui on qualifie son plan
//     immédiatement, sans qu'il ait rien d'autre à fournir.
//
// C'est le second chemin qui fait de CreditX un expert : ce qu'un client nous a
// appris sert à tous les suivants de la même caisse. Le RÈGLEMENT est mutualisé
// (c'est le même texte pour tous les employés) ; le PDF, lui, reste le document
// privé de celui qui l'a fourni.

import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import {
  memeCaisse, blocApplicable, appliquerCapitalDeces, montantCertificatCapitalDeces,
  type Reglement, type BlocRegles,
} from "app/lib/core/reglement";
import { evaluerPrestationsLPP, type SituationClient } from "app/lib/core/eligibilite";
import { completerRetraite } from "app/lib/core/retraite";
import { doitAlerterClause, nomPartenaire, type ClauseBeneficiaire } from "app/lib/core/concubinage";
import { notifyClient } from "app/lib/server/notify";

const TYPES_CAISSE = ["LPP_BASE", "LPP_COMPL", "LPP"];

/** Marqueur technique de la notification de clause bénéficiaire (anti-doublon). */
const SUJET_CLAUSE = "clause-beneficiaire";

export interface PlanQualifie {
  id: string;
  institution: string;
  notes: string[];
}

export interface ResultatQualification {
  plansVerifies: PlanQualifie[];
  plansAVerifier: PlanQualifie[];
}

/* =========================================================
 * 1. La situation du client
 * =======================================================*/

/**
 * État civil, enfants et statut professionnel — ce qui décide du DROIT aux
 * prestations, indépendamment de ce qu'imprime le certificat.
 *
 * Absence de données ≠ absence de droits : les champs manquants restent
 * indéfinis, et l'évaluation répondra « à vérifier » plutôt que « non ».
 */
export async function lireSituation(clientUid: string): Promise<SituationClient> {
  const snap = await db.collection("clients").doc(clientUid)
    .collection("DonneePersonnelles").doc("current").get();
  const d = snap.data() ?? {};
  const enfants = Array.isArray(d.Enter_enfants) ? d.Enter_enfants : null;
  return {
    etatCivil: typeof d.Enter_etatCivil === "number" ? d.Enter_etatCivil : null,
    // Seuls les enfants réellement saisis comptent : une ligne vide en cours de
    // saisie ne doit pas ouvrir un droit à une rente d'orphelin.
    nombreEnfants: enfants ? enfants.filter((e: Record<string, unknown>) => !!e?.Enter_dateNaissance).length : null,
    statutProfessionnel: typeof d.Enter_statutProfessionnel === "number" ? d.Enter_statutProfessionnel : null,
    // Concubinage : la rente de partenaire dépend d'une démarche du client.
    concubinageDepuis: typeof d.Enter_concubinageDepuis === "number" ? d.Enter_concubinageDepuis : null,
    clauseBeneficiaire: (d.Enter_partenaireClauseBeneficiaire as ClauseBeneficiaire) ?? null,
    rappelMasque: d.Enter_partenaireClauseRappelMasque === true,
    partenairePrenom: (d.Enter_spousePrenom as string) ?? null,
    partenaireNom: (d.Enter_spouseNom as string) ?? null,
  };
}

/* =========================================================
 * 2. Le règlement connu pour une caisse
 * =======================================================*/

/**
 * Cherche dans la bibliothèque partagée le règlement de cette caisse.
 *
 * À millésimes multiples, on retient le PLUS RÉCENT : c'est celui en vigueur.
 * La comparaison de noms est tolérante (un certificat imprime « aevum » là où le
 * règlement dit « Aevum Fondation de Prévoyance »), mais jamais au point de
 * rapprocher deux caisses différentes — appliquer le règlement d'une caisse aux
 * assurés d'une autre serait pire que de ne rien appliquer.
 */
export async function reglementConnuPour(caisse?: string | null): Promise<Reglement | null> {
  if (!caisse || !caisse.trim()) return null;
  const snap = await db.collection("reglements").get();

  let meilleur: Reglement | null = null;
  let meilleureAnnee = -1;
  for (const doc of snap.docs) {
    const r = doc.data() as Reglement;
    if (!memeCaisse(r.caisse, caisse)) continue;
    const annee = Number(doc.id.match(/(19|20)\d{2}$/)?.[0] ?? 0);
    if (annee >= meilleureAnnee) { meilleureAnnee = annee; meilleur = r; }
  }
  return meilleur;
}

/* =========================================================
 * 3. Qualifier les plans
 * =======================================================*/

/**
 * Range les montants du certificat dans les bonnes cases et pose, pour chaque
 * prestation, un verdict interne de droit.
 *
 * On ne CHANGE PAS les montants : le certificat reste la source du chiffre. On
 * corrige la case — c'est-à-dire la condition à laquelle il est dû — et on note
 * à quoi le client a droit compte tenu de sa situation.
 *
 * Un plan dont une règle demande l'avis d'un conseiller reste « non vérifié » :
 * annoncer « vérifié » sans l'être serait pire que de ne rien annoncer.
 */
export async function qualifierPlans(
  clientUid: string,
  /**
   * Règlement applicable, ou `null` quand la caisse n'est pas encore connue.
   *
   * Sans règlement, on évalue quand même le DROIT aux prestations : l'état
   * civil, les enfants et le statut professionnel suffisent à écarter une rente
   * de conjoint chez un célibataire ou une rente d'orphelin sans enfant. Seul
   * le capital décès reste en suspens — c'est la seule prestation dont la
   * condition tient au règlement.
   */
  reglement: Reglement | null,
  options: { pdfUrl?: string | null; planId?: string | null } = {},
): Promise<ResultatQualification> {
  const situation = await lireSituation(clientUid);
  const plans = db.collection("clients").doc(clientUid).collection("plans");
  const docs = options.planId
    ? [await plans.doc(options.planId).get()].filter((d) => d.exists)
    : (await plans.get()).docs;

  const verifies: PlanQualifie[] = [];
  const aVerifier: PlanQualifie[] = [];
  // Retenus pour le rappel de clause bénéficiaire : il s'adresse au client,
  // pas au plan, et doit nommer sa caisse.
  let dernierBloc: BlocRegles | null = null;
  const caisses: string[] = [];

  for (const doc of docs) {
    const plan = doc.data() as Record<string, any>;
    if (!TYPES_CAISSE.includes(String(plan.type ?? "").toUpperCase())) continue;
    const data = (plan.data ?? {}) as Record<string, any>;
    // Le scan ramène `institutionName` à une liste fermée (« CPVAL »), ce qui
    // perd les fondations gérant PLUSIEURS caisses — CPVAL en a deux, ouverte
    // et fermée, aux règlements différents. Le nom tel qu'imprimé, quand le
    // scan l'a relevé, désigne la bonne ; il passe donc en premier.
    const nomCaisse = String(data.Enter_nomCaisseComplet ?? "").trim() || plan.institutionName;
    if (reglement && !memeCaisse(nomCaisse, reglement.caisse)) continue;
    const bloc = reglement ? blocApplicable(reglement, data.Enter_nomPlan ?? data.Enter_plan ?? null) : null;
    const deces = bloc
      ? appliquerCapitalDeces(montantCertificatCapitalDeces(data), bloc, data)
      : { patch: {} as Record<string, number | null>, notes: [] as string[], automatique: false };

    // La RETRAITE, que tout assuré touchera : on comble les rentes que le
    // certificat n'imprime pas, et on signale — sans corriger — les écarts avec
    // le taux de conversion du règlement.
    const retraite = completerRetraite(data, bloc);

    const patch: Record<string, number | null> = { ...deces.patch, ...retraite.patch };
    const notes = [...deces.notes, ...retraite.notes];
    // Un seul point à confirmer suffit à retenir le « vérifié » : mieux vaut ne
    // rien annoncer qu'annoncer à tort.
    const automatique = deces.automatique && retraite.automatique;
    const prestations = evaluerPrestationsLPP(situation, bloc);
    if (bloc) dernierBloc = bloc;
    if (plan.institutionName) caisses.push(String(plan.institutionName));

    const maj: Record<string, unknown> = {
      "metadata.reglementApplique": admin.firestore.FieldValue.serverTimestamp(),
      // ⚠️ Distinct de `reviewStatus` (Contrôle Expert PAYANT par un conseiller).
      "metadata.reglementStatut": automatique ? "VERIFIE" : "NON_VERIFIE",
      // Verdicts INTERNES, jamais affichés tels quels : ils servent à nettoyer
      // l'analyse des prestations auxquelles ce client n'a pas droit.
      "metadata.prestations": prestations,
    };
    if (reglement) {
      maj["metadata.reglementCle"] = reglement.cle;
      maj["metadata.reglementCaisse"] = reglement.caisse;
      maj["metadata.reglementNotes"] = notes;
    }
    if (options.pdfUrl) maj["metadata.reglementUrl"] = options.pdfUrl;
    for (const [k, v] of Object.entries(patch)) maj[`data.${k}`] = v;

    await doc.ref.update(maj);
    (automatique ? verifies : aVerifier).push({
      id: doc.id, institution: String(plan.institutionName ?? ""), notes,
    });
  }

  await rappelerClauseBeneficiaire(clientUid, situation, dernierBloc, caisses);

  return { plansVerifies: verifies, plansAVerifier: aVerifier };
}

/**
 * Prévient le client que son partenaire n'est peut-être pas reconnu par sa
 * caisse — le seul cas où une prestation dépend d'une démarche qu'il doit
 * faire lui-même.
 *
 * On n'écrit qu'UNE notification, et seulement si aucune n'est déjà en attente :
 * répéter le même message chaque fois qu'un plan est requalifié transformerait
 * une information utile en bruit, et le client cesserait de nous lire.
 */
async function rappelerClauseBeneficiaire(
  clientUid: string,
  situation: SituationClient,
  bloc: BlocRegles | null,
  caisses: string[],
): Promise<void> {
  if (!doitAlerterClause(situation, bloc)) return;

  const dejaEnvoyee = await db.collection("clients").doc(clientUid).collection("notifications")
    .where("sujet", "==", SUJET_CLAUSE).limit(1).get();
  if (!dejaEnvoyee.empty) return;

  const partenaire = nomPartenaire(situation);
  const caisse = caisses[0] ?? "";
  await notifyClient({
    uid: clientUid,
    category: "PREVOYANCE",
    sujet: SUJET_CLAUSE,
    type: "warning",
    title: "Votre partenaire est-il reconnu par votre caisse de pension ?",
    content: partenaire
      ? `Sans désignation écrite, ${partenaire} pourrait ne rien percevoir de votre 2e pilier${caisse ? ` (${caisse})` : ""}.`
      : `Sans désignation écrite, votre partenaire pourrait ne rien percevoir de votre 2e pilier${caisse ? ` (${caisse})` : ""}.`,
  });
}

/**
 * Après un scan de CERTIFICAT : la caisse est-elle déjà connue de CreditX ?
 *
 * C'est le chemin qui rend le savoir cumulatif — le client n'a rien scanné de
 * plus, mais son plan est qualifié parce qu'un autre assuré de la même caisse
 * nous a fourni le règlement.
 */
export async function qualifierDepuisBibliotheque(
  clientUid: string, planId: string,
): Promise<(ResultatQualification & { reglement: Reglement | null }) | null> {
  const snap = await db.collection("clients").doc(clientUid).collection("plans").doc(planId).get();
  if (!snap.exists) return null;

  const plan = snap.data() as Record<string, any>;
  if (!TYPES_CAISSE.includes(String(plan.type ?? "").toUpperCase())) return null;

  // Même sans règlement connu, on évalue le droit aux prestations : c'est la
  // situation du client, pas le règlement, qui écarte une rente d'orphelin chez
  // quelqu'un sans enfant.
  const nomImprime = String((plan.data ?? {}).Enter_nomCaisseComplet ?? "").trim();
  const reglement = await reglementConnuPour(nomImprime || plan.institutionName);
  const r = await qualifierPlans(clientUid, reglement, { planId });
  return { ...r, reglement };
}
