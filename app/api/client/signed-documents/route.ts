// app/api/client/signed-documents/route.ts
//
// Documents signés du client qui ne vivent PAS dans clients/{uid}/plans :
// lettres de transfert 3a et résiliations 3b. Elles sont stockées dans la
// collection top-level `signing_requests` (PDF dans Storage, chemin `pdfPath`).
// On les expose au coffre-fort via une route authentifiée (jeton Firebase) —
// pas de lecture directe côté client sur une collection token-keyed.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    // Filtre simple sur clientUid (champ auto-indexé) ; le statut est filtré
    // en mémoire pour ne dépendre d'aucun index composite.
    const snap = await db
      .collection("signing_requests")
      .where("clientUid", "==", uid)
      .get();

    const documents = snap.docs
      .map((d) => {
        const data = d.data() as any;
        if (data.status !== "signed" || !data.pdfPath) return null;
        return {
          id: `signing_${d.id}`,
          signingDocId: d.id, // id réel pour l'édition (override titre/tags)
          pillarType: data.pillarType === "3b" ? "3b" : "3a",
          path: data.pdfPath, // le proxy /api/document régénère l'accès depuis ce chemin
          institution: data.details?.oldInstitution || null,
          signedAt: data.signedAt || data.createdAt || null,
          titleOverride: typeof data.titleOverride === "string" ? data.titleOverride : null,
          tagsOverride: Array.isArray(data.tagsOverride) ? data.tagsOverride : null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ documents });
  } catch (e: any) {
    console.error("signed-documents:", e?.message);
    return NextResponse.json({ documents: [] });
  }
}

// Édition du titre / des tags d'un document signé (le client ne peut pas écrire
// directement la collection token-keyed `signing_requests`).
export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const { docId, title, tags } = await req.json();
    if (!docId || typeof docId !== "string") {
      return NextResponse.json({ error: "docId manquant" }, { status: 400 });
    }

    const ref = db.collection("signing_requests").doc(docId);
    const snap = await ref.get();
    // On vérifie que le document appartient bien à l'appelant.
    if (!snap.exists || (snap.data() as any)?.clientUid !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await ref.update({
      titleOverride: typeof title === "string" ? title.trim() : "",
      tagsOverride: Array.isArray(tags) ? tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("signed-documents POST:", e?.message);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
