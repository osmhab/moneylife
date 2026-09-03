// app/api/admin/scan-mobile/route.ts
//
// « Scan mobile » : ouvre une session de capture depuis le téléphone du
// collaborateur, et lui en envoie le lien par SMS.
//
// LE PROBLÈME QU'ON RÉSOUT
// ------------------------
// Aujourd'hui le conseiller photographie le document, l'enregistre en PDF, le
// transfère sur son ordinateur, puis le retrouve dans ses fichiers pour le
// déposer. Quatre étapes pour une photo. Ici il clique, reçoit un lien, prend
// la photo, et le scan démarre sur son écran.
//
// POURQUOI UNE SESSION À DURÉE DE VIE COURTE
// ------------------------------------------
// La page de capture est PUBLIQUE : un téléphone n'a pas de session Firebase.
// Le jeton EST donc l'autorisation, et il porte tout ce qui limite la casse :
//   • il ne vaut que pour UN client et UN type de document ;
//   • il expire en 30 minutes ;
//   • il n'autorise que l'ajout de fichiers — jamais la lecture du dossier.
// Un lien intercepté ne donne accès à aucune donnée du client : il permet, au
// pire, d'y déposer une image, que le conseiller voit arriver sous ses yeux.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, bucket } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendSms, twilioConfigured } from "@/lib/server/twilio";
import { versE164 } from "@/lib/server/rappelRdv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Types de scan proposés, alignés sur les boutons « Scanner » de l'analyse. */
const TYPES = ["lpp", "insurance", "bank"] as const;
type TypeScan = (typeof TYPES)[number];

const LIBELLE: Record<TypeScan, string> = {
  lpp: "certificat de prévoyance (2e pilier)",
  insurance: "police 3e pilier",
  bank: "relevé 3a bancaire",
};

/** 30 minutes : le temps d'un entretien, pas celui d'un lien qui traîne. */
const DUREE_MIN = 30;

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  // Repli sur l'origine de la requête : en développement le lien doit pointer
  // vers le tunnel ou le poste local, pas vers la production.
  return req.nextUrl.origin.replace(/\/$/, "");
}

/** Ouvre une session et envoie le lien par SMS au collaborateur. */
export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const clientUid = req.nextUrl.searchParams.get("uid");
  const type = req.nextUrl.searchParams.get("type") as TypeScan | null;
  if (!clientUid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });
  if (!type || !TYPES.includes(type)) {
    return NextResponse.json({ error: "Type de scan inconnu" }, { status: 400 });
  }

  // Le numéro vient de la fiche du collaborateur, jamais du corps de la requête :
  // personne ne doit pouvoir se faire envoyer ce lien sur un autre téléphone.
  const staff = (await db.doc(`staff/${decoded.uid}`).get()).data() || {};
  const numero = versE164(staff.telephone || "");
  if (!numero) {
    return NextResponse.json(
      { error: "NUMERO_MANQUANT", message: "Renseignez votre mobile dans votre fiche conseiller pour recevoir le lien." },
      { status: 409 },
    );
  }
  if (!twilioConfigured()) {
    return NextResponse.json({ error: "SMS indisponible" }, { status: 503 });
  }

  const token = randomUUID();
  const expireLe = new Date(Date.now() + DUREE_MIN * 60000);

  await db.doc(`scanSessions/${token}`).set({
    clientUid,
    type,
    conseillerUid: decoded.uid,
    conseillerEmail: decoded.email || null,
    fichiers: [],
    expireLe: Timestamp.fromDate(expireLe),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Préfixe `/fr` obligatoire : la page vit sous `app/[locale]`, seul endroit où
  // le layout importe `globals.css`. Hors de là, Next sert un layout minimal
  // SANS feuille de style — la page s'affichait entièrement nue.
  const lien = `${baseUrl(req)}/fr/scan/${token}`;
  try {
    await sendSms(
      numero,
      `CreditX — Scan mobile\n\nPhotographiez le ${LIBELLE[type]} du client :\n${lien}\n\nLien valable ${DUREE_MIN} minutes.`,
    );
  } catch (e: any) {
    console.error("[scan-mobile] SMS:", e?.message || e);
    await db.doc(`scanSessions/${token}`).delete().catch(() => {});
    return NextResponse.json({ error: "Envoi du SMS impossible" }, { status: 502 });
  }

  // Le numéro est renvoyé MASQUÉ : de quoi vérifier qu'on l'a envoyé au bon
  // téléphone, sans l'étaler dans une interface ouverte pendant un entretien.
  return NextResponse.json({
    ok: true,
    token,
    expireLe: expireLe.toISOString(),
    numeroMasque: numero.replace(/^(\+\d{2})\d+(\d{2})$/, "$1 ••• •• $2"),
  });
}

/** Interrogé par l'écran d'analyse : des photos sont-elles arrivées ? */
export async function GET(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Paramètre token manquant" }, { status: 400 });

  const snap = await db.doc(`scanSessions/${token}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Session inconnue" }, { status: 404 });

  const s = snap.data()!;
  // Une session n'est lisible que par le conseiller qui l'a ouverte : le jeton
  // circule par SMS, il ne doit pas servir à observer le travail d'un collègue.
  if (s.conseillerUid !== decoded.uid) {
    return NextResponse.json({ error: "Session d'un autre conseiller" }, { status: 403 });
  }

  return NextResponse.json({
    clientUid: s.clientUid,
    type: s.type,
    fichiers: s.fichiers || [],
    // L'ordinateur n'attend PAS la première photo mais la clôture du lot :
    // c'est ce qui permet de photographier un document de plusieurs pages.
    termine: !!s.termine,
    expire: s.expireLe?.toDate?.() ? s.expireLe.toDate() < new Date() : false,
  });
}

/**
 * Le document assemblé est-il RÉELLEMENT arrivé à destination ?
 *
 * On ne se contente pas de l'existence d'un plan : on vérifie qu'il porte une
 * `sourceFileUrl` ET que le fichier correspondant existe bien dans Storage.
 * C'est cette URL que lisent le coffre-fort du client, l'app iOS et le bandeau
 * conseiller — il n'y a pas de seconde écriture à contrôler, ces trois vues
 * dérivent du même champ.
 *
 * La vérification est faite ICI et non dans le navigateur : c'est la condition
 * d'une suppression, elle ne doit pas dépendre d'un appelant qui pourrait se
 * tromper ou être interrompu.
 */
async function documentBienArchive(clientUid: string, depuis: Date): Promise<boolean> {
  const plans = await db.collection(`clients/${clientUid}/plans`).get();

  for (const d of plans.docs) {
    const m = d.data().metadata || {};
    const url = m.sourceFileUrl;
    if (!url) continue;

    // Seul un plan créé APRÈS l'ouverture de la session peut provenir de ce scan.
    const cree = m.createdAt?.toDate?.() || (m.createdAt ? new Date(m.createdAt) : null);
    if (!cree || cree < depuis) continue;

    const chemin = String(url).match(/\/o\/([^?]+)/);
    if (!chemin) continue;
    const [existe] = await bucket.file(decodeURIComponent(chemin[1])).exists();
    if (existe) return true;
  }
  return false;
}

/**
 * Ferme la session et supprime les photos de transport — MAIS SEULEMENT une fois
 * le document confirmé côté plan et coffre-fort.
 *
 * Ces photos n'ont servi qu'à porter les pages du téléphone vers l'ordinateur ;
 * ce qui compte est le PDF assemblé rattaché au plan. Mais les supprimer avant
 * confirmation reviendrait à perdre les pages si le scan avait échoué. En
 * l'absence de confirmation, on garde donc les photos et on le dit.
 */
export async function DELETE(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Paramètre token manquant" }, { status: 400 });

  const ref = db.doc(`scanSessions/${token}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.conseillerUid !== decoded.uid) {
    return NextResponse.json({ ok: true, supprimees: 0 });
  }

  const s = snap.data()!;
  const fichiers = (s.fichiers || []).filter((f: any) => f?.chemin);

  // `abandon=1` : le conseiller a annulé, aucun scan n'a eu lieu. Les photos ne
  // sont alors sauvegardées nulle part — mais elles ne servent plus non plus,
  // et personne ne les réclamera : on les retire.
  const abandon = req.nextUrl.searchParams.get("abandon") === "1";

  let confirme = abandon;
  if (!abandon && fichiers.length) {
    const depuis = s.createdAt?.toDate?.() || new Date(0);
    confirme = await documentBienArchive(s.clientUid, depuis);
  }

  if (!confirme && fichiers.length) {
    // On ferme la session (le lien ne doit plus servir) mais on CONSERVE les
    // photos : le scan n'a rien produit de vérifiable, elles sont la seule trace
    // du document. Le passage de nettoyage les reprendra si elles restent.
    await ref.set({ photosConservees: true, clotureLe: FieldValue.serverTimestamp() }, { merge: true });
    console.warn(`[scan-mobile] ${token} : archivage non confirmé, ${fichiers.length} photo(s) conservée(s)`);
    return NextResponse.json({ ok: true, supprimees: 0, confirme: false });
  }

  let supprimees = 0;
  for (const f of fichiers) {
    try {
      await bucket.file(f.chemin).delete();
      supprimees++;
    } catch (e: any) {
      // 404 : déjà absent, l'objectif est atteint. Toute autre erreur est
      // signalée sans faire échouer la clôture — le PDF, lui, est déjà archivé.
      if (e?.code !== 404) console.error("[scan-mobile] suppression:", f.chemin, e?.message || e);
    }
  }

  await ref.delete();
  return NextResponse.json({ ok: true, supprimees, confirme: true });
}
