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
          pillarType: data.pillarType === "3b" ? "3b" : "3a",
          path: data.pdfPath, // le proxy /api/document régénère l'accès depuis ce chemin
          institution: data.details?.oldInstitution || null,
          signedAt: data.signedAt || data.createdAt || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ documents });
  } catch (e: any) {
    console.error("signed-documents:", e?.message);
    return NextResponse.json({ documents: [] });
  }
}
