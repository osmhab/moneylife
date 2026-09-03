// app/api/scan-mobile/[token]/route.ts
//
// Face PUBLIQUE du scan mobile : le téléphone du collaborateur n'a pas de
// session Firebase, le jeton fait donc seule autorisation.
//
// CE QUE LE JETON N'AUTORISE PAS
// ------------------------------
// Rien qui se lise. `GET` ne renvoie que le type de document attendu et l'état
// de la session — jamais le nom du client, ni son dossier, ni les fichiers déjà
// déposés. `POST` n'ajoute que des images. Un lien intercepté permet donc, au
// pire, de déposer une photo que le conseiller voit arriver devant lui.
//
// Les fichiers atterrissent sous `clients/{uid}/documents/scans/`, exactement
// comme un dépôt fait depuis l'ordinateur : la suite du traitement ne fait
// aucune différence entre les deux, et c'est voulu.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, bucket } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_OCTETS = 15 * 1024 * 1024;
const MAX_FICHIERS = 12;
const TYPES_ACCEPTES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"];

const LIBELLE: Record<string, string> = {
  lpp: "Certificat de prévoyance (2e pilier)",
  insurance: "Police 3e pilier",
  bank: "Relevé 3a bancaire",
};

async function session(token: string) {
  const snap = await db.doc(`scanSessions/${token}`).get();
  if (!snap.exists) return null;
  const s = snap.data()!;
  if (s.expireLe?.toDate?.() && s.expireLe.toDate() < new Date()) return null;
  return { ref: snap.ref, ...s } as any;
}

/** État de la session, sans rien révéler du dossier. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const s = await session(token);
  if (!s) return NextResponse.json({ valide: false }, { status: 404 });

  return NextResponse.json({
    valide: true,
    libelle: LIBELLE[s.type] || "Document",
    // Un compteur, pas la liste : de quoi confirmer l'envoi, rien de plus.
    deposes: (s.fichiers || []).length,
    termine: !!s.termine,
  });
}

/** Dépose une ou plusieurs photos. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const s = await session(token);
  if (!s) return NextResponse.json({ error: "Lien expiré ou invalide" }, { status: 404 });

  // Clôture du lot. C'est le TÉLÉPHONE qui la déclenche, et c'est tout l'enjeu :
  // un certificat de prévoyance fait souvent trois pages, et `capture` n'ouvre
  // l'appareil photo que pour une prise à la fois. Sans ce signal, l'ordinateur
  // partait sur la première photo et fermait la session — le deuxième cliché
  // tombait sur « lien expiré ».
  if (req.nextUrl.searchParams.get("action") === "terminer") {
    if (!(s.fichiers || []).length) {
      return NextResponse.json({ error: "Aucune photo à envoyer" }, { status: 400 });
    }
    await s.ref.set({ termine: true, termineLe: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, termine: true, deposes: s.fichiers.length });
  }

  if (s.termine) {
    return NextResponse.json({ error: "Ce lot a déjà été envoyé" }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envoi illisible" }, { status: 400 });
  }

  const fichiers = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!fichiers.length) return NextResponse.json({ error: "Aucune photo" }, { status: 400 });

  const dejaLa = (s.fichiers || []).length;
  if (dejaLa + fichiers.length > MAX_FICHIERS) {
    return NextResponse.json({ error: `Maximum ${MAX_FICHIERS} photos par session` }, { status: 400 });
  }

  // `chemin` accompagne l'URL : c'est lui qui permettra de supprimer l'objet à
  // la clôture. Le déduire de l'URL supposerait de la décoder — fragile si le
  // format des URLs Storage change.
  const ajoutes: { url: string; nom: string; type: string; chemin: string }[] = [];
  for (const f of fichiers) {
    if (f.size > MAX_OCTETS) {
      return NextResponse.json({ error: `« ${f.name} » dépasse 15 Mo` }, { status: 400 });
    }
    // Le type est vérifié côté serveur : un appareil photo mal identifié ne doit
    // pas pouvoir faire passer autre chose qu'une image ou un PDF.
    if (f.type && !TYPES_ACCEPTES.includes(f.type)) {
      return NextResponse.json({ error: "Format non pris en charge" }, { status: 400 });
    }

    const jeton = randomUUID();
    const ext = (f.name?.split(".").pop() || "jpg").replace(/[^\w]+/g, "").slice(0, 5) || "jpg";
    const chemin = `clients/${s.clientUid}/documents/scans/${Date.now()}_mobile_${jeton}.${ext}`;

    await bucket.file(chemin).save(Buffer.from(await f.arrayBuffer()), {
      contentType: f.type || "image/jpeg",
      // `firebaseStorageDownloadTokens` rend l'objet lisible par URL directe —
      // c'est ce que fait aussi l'upload depuis le navigateur, et ce dont
      // l'écran d'analyse a besoin pour relire la photo.
      metadata: { metadata: { firebaseStorageDownloadTokens: jeton } },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(chemin)}?alt=media&token=${jeton}`;

    ajoutes.push({ url, nom: f.name || `photo.${ext}`, type: f.type || "image/jpeg", chemin });
  }

  await s.ref.set(
    { fichiers: FieldValue.arrayUnion(...ajoutes), majLe: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return NextResponse.json({ ok: true, deposes: dejaLa + ajoutes.length });
}
