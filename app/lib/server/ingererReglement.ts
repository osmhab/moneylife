// app/lib/server/ingererReglement.ts
//
// LA PORTE D'ENTRÉE UNIQUE DES RÈGLEMENTS.
//
// Trois chemins y mènent, et ils doivent se comporter à l'identique :
//
//   · un CLIENT scanne le règlement de sa caisse depuis l'app ;
//   · un COLLABORATEUR dépose un PDF depuis le back-office ;
//   · un AGENT DE VEILLE ramène un PDF du site officiel d'une caisse.
//
// Une seule fonction pour les trois : sans cela, trois implémentations
// dériveraient, et un règlement déposé par un collaborateur ne serait pas lu de
// la même façon que le même document scanné par un client.
//
// LE DÉDOUBLONNAGE D'ABORD
// ------------------------
// On identifie AVANT d'analyser. Reconnaître un nom de caisse et une date coûte
// quelques centimes ; comprendre cinquante pages en coûte mille fois plus. Face
// à un document déjà connu, on s'arrête là — et on évite qu'une lecture
// légèrement différente vienne écraser une version déjà vérifiée.
//
// On ne remplace que sur une date STRICTEMENT plus récente.

import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import {
  cleReglement, estPlusRecent, type Reglement,
} from "app/lib/core/reglement";
import { analyserDocument, identifierReglement, type FichierIA } from "app/lib/server/analyseIA";
import { reglementConnuPour, qualifierPlans, type ResultatQualification } from "app/lib/server/appliquerReglement";
import { PROMPT_REGLEMENT, BLOC_VIDE } from "app/lib/server/promptReglement";

export type StatutIngestion =
  | "PAS_UN_REGLEMENT"
  | "DEJA_CONNU"     // même caisse, version pas plus récente : rien à refaire
  | "AJOUTE"         // caisse inconnue jusqu'ici
  | "REMPLACE";      // millésime plus récent que celui en bibliothèque

export interface ResultatIngestion {
  statut: StatutIngestion;
  cle: string | null;
  caisse: string | null;
  enVigueurAu: string | null;
  annexes: number;
  /** Renseigné seulement quand un client est concerné. */
  qualification?: ResultatQualification;
}

export interface OptionsIngestion {
  /** Client dont les plans doivent être qualifiés (parcours app). */
  clientUid?: string | null;
  /** PDF déjà archivé dans le coffre-fort du client. */
  pdfUrl?: string | null;
  /** D'où vient le document — trace d'audit. */
  source: "client" | "admin" | "veille";
  /** Qui a déposé (uid admin, ou l'URL d'origine pour la veille). */
  auteur?: string | null;
}

export async function ingererReglement(
  fichiers: FichierIA[],
  options: OptionsIngestion,
): Promise<ResultatIngestion> {
  const vide = { cle: null, caisse: null, enVigueurAu: null, annexes: 0 };

  // 1. Passe bon marché : de quoi parle-t-on ?
  const identite = await identifierReglement(fichiers);
  if (!identite.estUnReglement || !identite.caisse) {
    return { statut: "PAS_UN_REGLEMENT", ...vide };
  }

  // 2. Le connaît-on déjà, dans une version au moins aussi récente ?
  const connu = await reglementConnuPour(identite.caisse);
  if (connu && !estPlusRecent(identite.enVigueurAu, connu.enVigueurAu)) {
    // On s'arrête AVANT l'analyse coûteuse. Les plans du client sont tout de
    // même qualifiés : c'est le règlement déjà en bibliothèque qui s'applique,
    // et c'est exactement la promesse du savoir mutualisé.
    const qualification = options.clientUid
      ? await qualifierPlans(options.clientUid, connu, { pdfUrl: options.pdfUrl })
      : undefined;
    await tracer(connu.cle, options, "DEJA_CONNU");
    return {
      statut: "DEJA_CONNU", cle: connu.cle, caisse: connu.caisse,
      enVigueurAu: connu.enVigueurAu, annexes: (connu.annexes ?? []).length, qualification,
    };
  }

  // 3. Analyse de fond — seulement maintenant.
  const reponse = await analyserDocument(PROMPT_REGLEMENT, fichiers);
  if (reponse.replied) console.warn("[reglement] repli sur Gemini");

  let extrait: Record<string, any>;
  try {
    extrait = JSON.parse(reponse.texte.trim());
  } catch {
    throw new Error("Réponse d'analyse illisible");
  }

  const nomCaisse = String(extrait?.caisse?.nom ?? identite.caisse).trim();
  const enVigueurAu = extrait?.caisse?.enVigueurAu ?? identite.enVigueurAu ?? null;
  const cle = cleReglement(nomCaisse, enVigueurAu);

  const reglement: Reglement = {
    cle,
    caisse: nomCaisse,
    enVigueurAu,
    langue: extrait?.caisse?.langue ?? null,
    plansDetectes: Array.isArray(extrait?.plansDetectes) ? extrait.plansDetectes.slice(0, 40) : [],
    general: { ...BLOC_VIDE, ...(extrait?.general || {}) },
    annexes: (extrait?.annexes || []).slice(0, 20).map((a: Record<string, any>) => ({
      nom: String(a?.nom ?? ""),
      numero: a?.numero ?? null,
      sappliqueA: String(a?.sappliqueA ?? ""),
      surcharges: a?.surcharges || {},
    })),
  };

  await db.collection("reglements").doc(cle).set(
    {
      ...reglement,
      misAJourLe: admin.firestore.FieldValue.serverTimestamp(),
      // Le compteur d'usage ne vaut que pour un vrai client : un dépôt admin ou
      // un passage de veille ne signifie pas qu'un assuré est concerné.
      ...(options.clientUid ? { scannePar: admin.firestore.FieldValue.arrayUnion(options.clientUid) } : {}),
    },
    { merge: true },
  );

  const qualification = options.clientUid
    ? await qualifierPlans(options.clientUid, reglement, { pdfUrl: options.pdfUrl })
    : undefined;

  const statut: StatutIngestion = connu ? "REMPLACE" : "AJOUTE";
  await tracer(cle, options, statut);

  return {
    statut, cle, caisse: nomCaisse, enVigueurAu,
    annexes: reglement.annexes.length, qualification,
  };
}

/**
 * Journal d'ingestion — qui a apporté quoi, quand, et ce qu'on en a fait.
 *
 * Utile pour la veille (savoir qu'un site a été visité sans rien rapporter de
 * neuf) comme pour le back-office (retrouver qui a déposé un document erroné).
 * Écriture best-effort : perdre une ligne de journal ne doit jamais faire
 * échouer l'ingestion elle-même.
 */
async function tracer(cle: string, options: OptionsIngestion, statut: StatutIngestion): Promise<void> {
  try {
    await db.collection("reglements_journal").add({
      cle, statut,
      source: options.source,
      auteur: options.auteur ?? options.clientUid ?? null,
      le: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[reglement] journal non écrit", e);
  }
}
