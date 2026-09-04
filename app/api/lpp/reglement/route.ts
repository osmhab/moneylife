// app/api/lpp/reglement/route.ts
//
// SCAN DU RÈGLEMENT DE CAISSE DE PENSION.
//
// Le certificat donne les MONTANTS, le règlement dit QUAND ils sont dus. Cette
// route lit le règlement, en extrait les règles, les range dans une BIBLIOTHÈQUE
// PARTAGÉE (`reglements/{cle}`) puis reclasse les montants des plans 2e pilier
// du client qui relèvent de cette caisse.
//
// POURQUOI UNE BIBLIOTHÈQUE PARTAGÉE
// ----------------------------------
// Un règlement n'est pas une donnée personnelle : c'est le même texte pour tous
// les employés de la caisse. Le mutualiser évite de refaire analyser 53 pages à
// chaque client, et le deuxième assuré d'une caisse déjà connue est vérifié sans
// rien scanner. Le PDF, lui, reste dans le coffre-fort PRIVÉ de celui qui l'a
// scanné — c'est son document.
//
// PAS DE SAISIE MANUELLE
// ----------------------
// Volontaire : un règlement fait des dizaines de pages d'articles. Ce qui a de la
// valeur, c'est le texte exact et sa citation — pas un formulaire que le client
// remplirait de mémoire.

import { NextRequest, NextResponse } from "next/server";
import { db, bucket } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { requireAuth } from "app/lib/server/requireAuth";
import { MULTILINGUAL_PREAMBLE } from "app/lib/core/multilingual";
import {
  cleReglement, memeCaisse, blocApplicable, appliquerCapitalDeces,
  montantCertificatCapitalDeces, type Reglement,
} from "app/lib/core/reglement";

export const maxDuration = 300;   // 53 pages à analyser : bien au-delà du défaut

const PROMPT = `${MULTILINGUAL_PREAMBLE}

Tu analyses le RÈGLEMENT DE PRÉVOYANCE d'une caisse de pension suisse (2e pilier).

Ce document est LA RÈGLE DU JEU : il dit COMMENT les prestations sont dues.
Un certificat de prévoyance donne des MONTANTS ; le règlement dit OÙ et QUAND ils
s'appliquent. Le certificat lui-même le rappelle : « en cas de divergences, c'est
le règlement qui fait foi ».

STRUCTURE À RESPECTER
Un règlement a une PARTIE GÉNÉRALE (articles numérotés) et souvent des ANNEXES par
plan. Une annexe SURCHARGE la partie générale pour les assurés qu'elle vise et
renvoie au règlement général pour le reste. Rends les DEUX niveaux SÉPARÉMENT,
jamais fusionnés : un bloc d'annexe ne contient QUE ce que l'annexe surcharge, le
reste à null.

RÈGLE ABSOLUE : n'invente RIEN. Pour chaque règle, cite la phrase EXACTE du
document ("citation") et son article ("article"). Si une règle n'est pas dans le
document, mets null partout. Une règle inventée fausse la prévoyance d'une
personne réelle : l'absence est toujours préférable à l'approximation.

POINT LE PLUS IMPORTANT — LE CAPITAL DÉCÈS
Le même montant peut être dû dans des cas très différents. Distingue :
- "TOUJOURS" : versé qu'il y ait ou non une rente de partenaire/conjoint
- "SI_AUCUNE_RENTE_PARTENAIRE" : versé UNIQUEMENT si aucune rente n'est échue
- "REDUIT_DU_FINANCEMENT_RENTE" : versé sous déduction du financement de la rente
- "NON_PREVU" : le règlement ne prévoit pas de capital décès
Attention : l'article qui fixe le MONTANT et celui qui pose la CONDITION sont
souvent distincts. Lis les deux avant de conclure.

Réponds en JSON strict :
{
 "caisse": {"nom":string,"enVigueurAu":string|null,"langue":string|null},
 "plansDetectes": [string],
 "general": BLOC,
 "annexes": [{"nom":string,"sappliqueA":string,"surcharges":BLOC}]
}
BLOC = {
 "capitalDeces": {"verse":"TOUJOURS"|"SI_AUCUNE_RENTE_PARTENAIRE"|"REDUIT_DU_FINANCEMENT_RENTE"|"NON_PREVU"|null,
   "base":string|null,"limiteHeritiersLegaux":number|null,
   "avantRetraiteUniquement":boolean|null,"article":string|null,"citation":string|null},
 "capitalDecesSupplementaire": {"pourcentageSalaire":number|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "rentePartenaire": {"pourcentage":number|null,"base":string|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "renteInvalidite": {"pourcentage":number|null,"base":string|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "renteOrphelin": {"pourcentage":number|null,"base":string|null,"conditions":string|null,"article":string|null,"citation":string|null}
}`;

/** Bloc vide : une clé absente de la réponse ne doit pas faire tomber la route. */
const BLOC_VIDE = {
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};

export async function POST(req: NextRequest) {
  let uid: string;
  let email: string | null;
  try {
    ({ uid, email } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { allPaths } = await req.json().catch(() => ({}));
    const paths: string[] = Array.isArray(allPaths) ? allPaths.filter((p) => typeof p === "string") : [];
    if (paths.length === 0) {
      return NextResponse.json({ error: "Aucune page fournie" }, { status: 400 });
    }

    // Le propriétaire du document est déduit du CHEMIN, jamais du corps de la
    // requête : sinon n'importe qui écrirait dans le dossier d'un autre.
    const clientUid = paths[0].split("/")[1];
    const estAdmin = !!email && (email.endsWith("@creditx.ch") || email.endsWith("@moneylife.ch"));
    if (uid !== clientUid && !estAdmin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Analyse indisponible" }, { status: 503 });

    const parts = await Promise.all(paths.map(async (p) => {
      const [buffer] = await bucket.file(p).download();
      const ext = p.split(".").pop()?.toLowerCase();
      const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
      return { inlineData: { mimeType, data: buffer.toString("base64") } };
    }));

    const rep = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, ...parts] }],
          // temperature 0 : sur un texte juridique, on veut la même lecture à
          // chaque passage — deux analyses divergentes seraient indéfendables.
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      },
    );
    if (!rep.ok) return NextResponse.json({ error: "L'analyse a échoué" }, { status: 502 });

    const brut = (await rep.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let extrait: {
      caisse?: { nom?: string; enVigueurAu?: string | null; langue?: string | null };
      plansDetectes?: string[];
      general?: typeof BLOC_VIDE;
      annexes?: { nom: string; sappliqueA: string; surcharges: Partial<typeof BLOC_VIDE> }[];
    };
    try {
      extrait = JSON.parse(brut.trim());
    } catch {
      return NextResponse.json({ error: "Réponse d'analyse illisible" }, { status: 502 });
    }

    const nomCaisse = (extrait?.caisse?.nom || "").trim();
    if (!nomCaisse) {
      return NextResponse.json(
        { error: "Ce document ne semble pas être un règlement de caisse de pension." },
        { status: 422 },
      );
    }

    const cle = cleReglement(nomCaisse, extrait.caisse?.enVigueurAu);
    const reglement: Reglement = {
      cle,
      caisse: nomCaisse,
      enVigueurAu: extrait.caisse?.enVigueurAu ?? null,
      langue: extrait.caisse?.langue ?? null,
      plansDetectes: Array.isArray(extrait.plansDetectes) ? extrait.plansDetectes.slice(0, 40) : [],
      general: { ...BLOC_VIDE, ...(extrait.general || {}) },
      annexes: (extrait.annexes || []).slice(0, 20).map((a) => ({
        nom: String(a?.nom ?? ""), sappliqueA: String(a?.sappliqueA ?? ""),
        surcharges: a?.surcharges || {},
      })),
    };

    // 1. Bibliothèque PARTAGÉE. `merge` : un rescan d'un millésime déjà connu
    //    rafraîchit les règles sans perdre le compteur d'usage.
    await db.collection("reglements").doc(cle).set(
      {
        ...reglement,
        misAJourLe: admin.firestore.FieldValue.serverTimestamp(),
        scannePar: admin.firestore.FieldValue.arrayUnion(clientUid),
      },
      { merge: true },
    );

    // 2. Application aux plans 2e pilier de CE client relevant de cette caisse.
    const resultat = await appliquerAuxPlans(clientUid, reglement);

    return NextResponse.json({
      ok: true,
      cle,
      caisse: nomCaisse,
      enVigueurAu: reglement.enVigueurAu,
      annexes: reglement.annexes.length,
      ...resultat,
    });
  } catch (e) {
    console.error("[reglement] échec", e);
    return NextResponse.json({ error: "L'analyse a échoué" }, { status: 500 });
  }
}

/**
 * Reclasse les montants des plans 2e pilier relevant de cette caisse.
 *
 * On ne CHANGE PAS les montants du certificat : on corrige la case, c'est-à-dire
 * la condition à laquelle ils sont dus. Un plan dont la règle demande l'avis d'un
 * conseiller reste « non vérifié » — annoncer « vérifié » sans l'être serait pire
 * que de ne rien annoncer.
 */
async function appliquerAuxPlans(clientUid: string, reglement: Reglement) {
  const snap = await db.collection("clients").doc(clientUid).collection("plans").get();
  const misAJour: { id: string; institution: string; notes: string[] }[] = [];
  const aVerifier: { id: string; institution: string; notes: string[] }[] = [];

  for (const doc of snap.docs) {
    const plan = doc.data() as Record<string, any>;
    const type = String(plan.type ?? "").toUpperCase();
    if (!["LPP_BASE", "LPP_COMPL", "LPP"].includes(type)) continue;
    if (!memeCaisse(plan.institutionName, reglement.caisse)) continue;

    const data = (plan.data ?? {}) as Record<string, any>;
    const bloc = blocApplicable(reglement, data.Enter_nomPlan ?? data.Enter_plan ?? null);
    const { patch, notes, automatique } = appliquerCapitalDeces(montantCertificatCapitalDeces(data), bloc);

    const maj: Record<string, unknown> = {
      "metadata.reglementCle": reglement.cle,
      "metadata.reglementCaisse": reglement.caisse,
      "metadata.reglementNotes": notes,
      "metadata.reglementApplique": admin.firestore.FieldValue.serverTimestamp(),
      // ⚠️ Distinct de `reviewStatus` (Contrôle Expert payant par un conseiller).
      "metadata.reglementStatut": automatique ? "VERIFIE" : "NON_VERIFIE",
    };
    for (const [k, v] of Object.entries(patch)) maj[`data.${k}`] = v;

    await doc.ref.update(maj);
    (automatique ? misAJour : aVerifier).push({
      id: doc.id, institution: String(plan.institutionName ?? ""), notes,
    });
  }

  return { plansVerifies: misAJour, plansAVerifier: aVerifier };
}
