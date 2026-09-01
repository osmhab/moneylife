// app/api/admin/dossier-images/route.ts
//
// Bibliothèque d'images du dossier PDF (page de garde, bandeaux de thème, page
// de clôture). Réservée aux collaborateurs (`requireInternal`).
//
// MODÈLE À DEUX NIVEAUX
// ---------------------
//   1. un JEU MAISON, global, dans `settings/dossierImages` — les images
//      utilisées par défaut pour tous les dossiers ;
//   2. des EXCEPTIONS par client, dans `clients/{uid}/Analyse/dossierImages`,
//      qui ne portent que sur les emplacements réellement remplacés.
// La résolution se fait côté client : exception si elle existe, sinon jeu maison.
// Stocker l'exception en PARTIEL (et non une copie complète) évite qu'un dossier
// ancien reste figé sur d'anciennes images quand le jeu maison évolue.
//
// Les fichiers vivent dans Storage sous `dossier-images/` et ne sont JAMAIS
// exposés publiquement : l'affichage passe par /api/admin/files/view, déjà
// authentifié.
//
// ACCÈS — deux niveaux, et la frontière est « paramétrage » vs « usage »
// ---------------------------------------------------------------------
//   · PARAMÉTRAGE (propriétaire seul) : téléverser ou retirer une image de la
//     bibliothèque, et définir le jeu maison. Ce sont les gabarits de tous les
//     dossiers de l'entreprise.
//   · USAGE (tout collaborateur interne) : lire la bibliothèque, et affecter
//     ou recadrer une image POUR SON CLIENT.
// Un conseiller recruté demain doit pouvoir se servir des visuels, pas les
// redéfinir pour tout le monde.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, bucket } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { requireOwner, isOwnerDecoded } from "@/lib/server/requireOwner";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Emplacements d'image du dossier, dans l'ordre de lecture du document. */
export const SLOTS = ["cover", "retraite", "invalidite", "deces", "closing"] as const;
type Slot = (typeof SLOTS)[number];

const PREFIX = "dossier-images/";
const ALLOWED = ["jpg", "jpeg", "png", "webp"];
const MAX_BYTES = 12 * 1024 * 1024;

const HOUSE_DOC = "settings/dossierImages";
const clientDoc = (uid: string) => `clients/${uid}/Analyse/dossierImages`;

function guard(e: unknown) {
  const msg = (e as Error)?.message;
  const status = msg === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

/** Affectation d'un emplacement : le fichier + son recadrage (0–100 %). */
export type SlotValue = { path: string; x: number; y: number };

const clampPct = (v: any, def = 50) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : def;
};

/**
 * Ne retient que les emplacements connus pointant vers la bibliothèque.
 * Accepte aussi l'ancienne forme (une simple chaîne de chemin), pour ne pas
 * perdre les affectations enregistrées avant l'ajout du recadrage.
 */
function sanitizeSlots(raw: any): Partial<Record<Slot, SlotValue>> {
  const out: Partial<Record<Slot, SlotValue>> = {};
  for (const slot of SLOTS) {
    const v = raw?.[slot];
    const path = typeof v === "string" ? v : v?.path;
    if (typeof path !== "string" || !path) continue;
    // Un chemin arbitraire laisserait lire n'importe quel objet du bucket via
    // /api/admin/files/view : on impose le préfixe de la bibliothèque.
    if (!path.startsWith(PREFIX) || path.includes("..")) continue;
    out[slot] = { path, x: clampPct(v?.x), y: clampPct(v?.y) };
  }
  return out;
}

function safeName(name: string) {
  const base = (name.split(/[\\/]/).pop() || "image").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

/** Bibliothèque + jeu maison + exceptions du client (si `uid` est fourni). */
export async function GET(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  try {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    const library = files
      .filter((f) => !f.name.endsWith("/"))
      .map((f) => ({
        path: f.name,
        name: f.name.slice(PREFIX.length),
        size: Number(f.metadata?.size) || 0,
        updated: f.metadata?.updated || null,
      }))
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));

    const [houseSnap, clientSnap] = await Promise.all([
      db.doc(HOUSE_DOC).get(),
      uid ? db.doc(clientDoc(uid)).get() : Promise.resolve(null as any),
    ]);

    return NextResponse.json({
      library,
      house: sanitizeSlots(houseSnap.data()?.slots),
      client: uid ? sanitizeSlots(clientSnap?.data()?.slots) : {},
      notes: uid ? String(clientSnap?.data()?.notes || "") : "",
      // Pilote l'affichage : les commandes de paramétrage sont masquées pour
      // les non-propriétaires. Le serveur refuse de toute façon.
      canManage: isOwnerDecoded(decoded),
    });
  } catch (e: any) {
    console.error("[dossier-images] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Téléverse une image dans la bibliothèque. */
export async function POST(req: NextRequest) {
  try {
    await requireOwner(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json({ error: `Format refusé : .${ext}` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image trop lourde (12 Mo maximum)." }, { status: 400 });
    }

    // Préfixe aléatoire : deux photos peuvent porter le même nom sans s'écraser.
    const path = `${PREFIX}${randomUUID().slice(0, 8)}-${safeName(file.name)}`;
    await bucket.file(path).save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "image/jpeg",
    });

    return NextResponse.json({ ok: true, path, name: path.slice(PREFIX.length) });
  } catch (e: any) {
    console.error("[dossier-images] téléversement:", e?.message || e);
    return NextResponse.json({ error: "Téléversement impossible." }, { status: 500 });
  }
}

/**
 * Enregistre une affectation d'emplacements.
 * `scope: "house"` écrit le jeu global ; `scope: "client"` (avec `uid`) les
 * exceptions du client.
 */
export async function PUT(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const body = await req.json();
    const slots = sanitizeSlots(body?.slots);
    const scope = body?.scope === "client" ? "client" : "house";
    const uid = String(body?.uid || "");

    // Le jeu maison sert TOUS les dossiers : sa modification est du paramétrage.
    if (scope === "house" && !isOwnerDecoded(decoded)) {
      return NextResponse.json(
        { error: "Le jeu maison ne peut être modifié que par le propriétaire du compte." },
        { status: 403 },
      );
    }
    if (scope === "client" && !uid) {
      return NextResponse.json({ error: "uid requis pour une exception client." }, { status: 400 });
    }

    // Notes d'entretien : propres au client, imprimées dans le dossier.
    const notes = String(body?.notes ?? "").slice(0, 4000);
    const payload: Record<string, any> = {
      slots,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decoded?.email || decoded?.uid || null,
    };
    if (scope === "client" && body?.notes !== undefined) payload.notes = notes;

    await db.doc(scope === "client" ? clientDoc(uid) : HOUSE_DOC).set(payload, { merge: true });

    return NextResponse.json({ ok: true, slots });
  } catch (e: any) {
    console.error("[dossier-images] enregistrement:", e?.message || e);
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}

/** Retire une image de la bibliothèque (le fichier Storage est supprimé). */
export async function DELETE(req: NextRequest) {
  try {
    await requireOwner(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const { path } = (await req.json()) as { path?: string };
    if (!path || !path.startsWith(PREFIX) || path.includes("..")) {
      return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
    }
    await bucket.file(path).delete().catch(() => { /* déjà absent */ });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[dossier-images] suppression:", e?.message || e);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
