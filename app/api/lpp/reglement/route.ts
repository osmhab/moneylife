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
import { cleReglement, type Reglement } from "app/lib/core/reglement";
import { qualifierPlans } from "app/lib/server/appliquerReglement";
import { envoyerPush } from "app/lib/server/push";
import { analyserDocument, type FichierIA } from "app/lib/server/analyseIA";

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

NE CONFONDS JAMAIS deux capitaux voisins :
- "capitalDeces" = le capital décès PRINCIPAL, en règle générale égal au capital
  de prévoyance ou à l'avoir de vieillesse ;
- "capitalDecesSupplementaire" = un capital EN SUS, typiquement exprimé en % du
  salaire assuré, souvent réservé aux enfants ou barémé par âge.
Un article intitulé « capital décès supplémentaire » ne va JAMAIS dans
"capitalDeces", même si c'est le seul capital que l'annexe mentionne. Cherche
d'abord l'article du capital principal ; s'il n'existe pas dans l'annexe, laisse
"capitalDeces" à null — la partie générale s'appliquera. Se tromper de case fait
refuser à un assuré un capital qui lui est dû.

LE PARTENAIRE NON MARIÉ
"dureeViecommuneAns" = le nombre d'années de MÉNAGE COMMUN exigées d'un
partenaire non marié pour avoir droit à la rente (souvent 2 ou 5). N'y mets
RIEN d'autre : un règlement est plein de durées qui n'ont aucun rapport — une
différence d'âge (« plus de 20 ans plus jeune que l'assuré »), un délai de
carence, une durée de mariage. Si aucune durée de ménage commun n'est exigée
ou si elle n'est pas indiquée, mets null. Une valeur erronée ici supprime la
rente de survivant d'un couple qui y a droit.
"enfantsCommunsRemplacentDuree" = true si le règlement dispense de cette durée
lorsque le partenaire subvient à l'entretien d'enfants communs (formulation
typique : « … d'au moins cinq ans OU le partenaire doit subvenir à l'entretien
d'un ou plusieurs enfants communs »). Ce « ou » est décisif : l'ignorer refuse
la rente à un couple récent avec enfants.

NOMMER LES ANNEXES
"nom" doit être le NOM DU PLAN tel qu'il est imprimé dans l'annexe — par exemple
"Plan ex-PAT BVG", "Plans cadres" — et JAMAIS le numéro seul ("Annexe n° 8").
C'est par ce nom qu'un assuré est rattaché à son annexe : un numéro ne
correspond à rien sur son certificat, et le rattachement échouerait en silence.
Mets le numéro dans "numero", et dans "sappliqueA" la population visée, reprise
du texte.

Réponds en JSON strict :
{
 "caisse": {"nom":string,"enVigueurAu":string|null,"langue":string|null},
 "plansDetectes": [string],
 "general": BLOC,
 "annexes": [{"nom":string,"numero":string|null,"sappliqueA":string,"surcharges":BLOC}]
}
BLOC = {
 "capitalDeces": {"verse":"TOUJOURS"|"SI_AUCUNE_RENTE_PARTENAIRE"|"REDUIT_DU_FINANCEMENT_RENTE"|"NON_PREVU"|null,
   "base":string|null,"limiteHeritiersLegaux":number|null,
   "avantRetraiteUniquement":boolean|null,"article":string|null,"citation":string|null},
 "capitalDecesSupplementaire": {"pourcentageSalaire":number|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "rentePartenaire": {"pourcentage":number|null,"base":string|null,"dureeViecommuneAns":number|null,"enfantsCommunsRemplacentDuree":boolean|null,"conditions":string|null,"article":string|null,"citation":string|null},
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

  const estAdmin = !!email && (email.endsWith("@creditx.ch") || email.endsWith("@moneylife.ch"));

  try {
    // DEUX FORMES D'ENVOI, parce que les deux appelants diffèrent :
    //  · l'app iOS poste les pages en multipart (comme /api/lpp/parse-image) ;
    //  · l'outil conseiller passe des chemins Storage déjà téléversés.
    let fichiers: FichierIA[] = [];
    let clientUid = uid;
    // Adresse du PDF déjà rangé dans le coffre-fort par l'app. Posée sur les
    // plans concernés pour que leur fiche rouvre le règlement directement.
    let pdfUrl: string | null = null;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      if (files.length === 0) return NextResponse.json({ error: "Aucune page fournie" }, { status: 400 });

      // Un conseiller peut scanner POUR un client ; un client, jamais pour un autre.
      const demande = String(form.get("uid") ?? "").trim();
      if (demande && demande !== uid) {
        if (!estAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        clientUid = demande;
      }

      const url = String(form.get("pdfUrl") ?? "").trim();
      // Uniquement une adresse de notre propre stockage : un lien fourni par
      // l'appelant se retrouverait affiché au client, donc jamais n'importe lequel.
      if (/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(url)) pdfUrl = url;

      fichiers = await Promise.all(files.map(async (f) => ({
        mimeType: f.type || "application/pdf",
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
      })));
    } else {
      const { allPaths } = await req.json().catch(() => ({}));
      const paths: string[] = Array.isArray(allPaths) ? allPaths.filter((p) => typeof p === "string") : [];
      if (paths.length === 0) return NextResponse.json({ error: "Aucune page fournie" }, { status: 400 });

      // Le propriétaire est déduit du CHEMIN, jamais du corps de la requête :
      // sinon n'importe qui ferait écrire dans le dossier d'un autre.
      clientUid = paths[0].split("/")[1];
      if (uid !== clientUid && !estAdmin) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      fichiers = await Promise.all(paths.map(async (p) => {
        const [buffer] = await bucket.file(p).download();
        const ext = p.split(".").pop()?.toLowerCase();
        const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
        return { mimeType, base64: buffer.toString("base64") };
      }));
    }

    // Aiguillage réglable par `REGLEMENT_IA` (cf. analyseIA.ts) : le scan de
    // certificat reste sur Gemini Flash, mais la LECTURE JURIDIQUE d'un
    // règlement peut être confiée à un autre moteur sans toucher au code.
    const reponse = await analyserDocument(PROMPT, fichiers);
    if (reponse.replied) console.warn("[reglement] repli sur Gemini");
    const brut = reponse.texte;
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
    const resultat = await qualifierPlans(clientUid, reglement, { pdfUrl });

    // 3. L'analyse dure ~1 minute et tourne en arrière-plan : le client a pu
    //    fermer l'app. La notification est le seul moyen qu'il apprenne que
    //    c'est terminé sans y revenir de lui-même.
    const verifies = resultat.plansVerifies.length;
    await envoyerPush(
      clientUid,
      "Règlement analysé",
      verifies > 0
        ? `${nomCaisse} : ${verifies} plan${verifies > 1 ? "s" : ""} de 2e pilier revérifié${verifies > 1 ? "s" : ""}.`
        : `${nomCaisse} : règlement enregistré dans votre coffre-fort.`,
      { type: "reglement", cle },
    );

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
