// app/api/admin/careers/applications/route.ts
//
// Back-office des candidatures (/admin/recrutement).
//
// Pourquoi passer par le SERVEUR plutôt que par le SDK client + règles Firestore
// (comme le fait la page Leads) :
//   1. Un dossier de candidature est de la donnée personnelle sensible (casier,
//      poursuites, formation). La rendre lisible par le SDK navigateur suppose
//      une règle `allow read: if isInternal()` — et donc que cette règle soit
//      effectivement déployée. Ici, rien ne se lit depuis le navigateur.
//   2. Aucun déploiement de `firestore.rules` n'est nécessaire pour que l'écran
//      fonctionne : l'Admin SDK contourne les règles, qui restent en refus total.
//
// Toutes les méthodes sont gardées par `requireInternal` (jeton Firebase +
// appartenance @creditx.ch / @moneylife.ch).

import { NextResponse } from "next/server";
import { db, bucket } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["nouveau", "en_cours", "entretien", "recrute", "refuse"];

function guardError(e: unknown) {
  const msg = (e as Error)?.message;
  if (msg === "UNAUTHENTICATED") return new NextResponse("Unauthorized", { status: 401 });
  if (msg === "FORBIDDEN") return new NextResponse("Forbidden", { status: 403 });
  return null;
}

export async function GET(req: Request) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guardError(e) ?? new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const snap = await db.collection("job_applications").orderBy("createdAt", "desc").limit(500).get();

    const applications = snap.docs.map((d) => {
      const x = d.data();
      return {
        ...x,
        id: d.id,
        // Le Timestamp Firestore n'est pas sérialisable tel quel en JSON.
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
        // Jamais renvoyés au navigateur : ils ne servent qu'à la traçabilité serveur.
        ip: undefined,
        userAgent: undefined,
      };
    });

    return NextResponse.json({ applications });
  } catch (e: any) {
    console.error("[careers/admin] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Met à jour le statut de suivi d'une candidature. */
export async function PATCH(req: Request) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guardError(e) ?? new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id, status } = (await req.json()) as { id?: string; status?: string };
    if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    if (!status || !STATUSES.includes(status)) {
      return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
    }

    await db.collection("job_applications").doc(id).update({ status });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[careers/admin] statut:", e?.message || e);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

/**
 * Supprime une candidature ET ses pièces dans Storage.
 * Laisser les fichiers derrière soi créerait des données personnelles orphelines,
 * que plus aucun écran ne permettrait de retrouver ni d'effacer.
 */
export async function DELETE(req: Request) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guardError(e) ?? new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

    const ref = db.collection("job_applications").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });

    const documents = (doc.data()?.documents ?? []) as { path: string }[];
    for (const d of documents) {
      await bucket.file(d.path).delete().catch(() => { /* déjà absent : sans conséquence */ });
    }
    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[careers/admin] suppression:", e?.message || e);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
