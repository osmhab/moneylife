import { NextRequest, NextResponse } from "next/server";
import "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

type OfferFlowStatus = "SIGNED" | "SIGNED_WAITING_HEALTH" | "SIGNED_FINALIZING";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "missing_bearer_token" }, { status: 401 });
    }

    const decoded = await getAuth().verifyIdToken(token);

    const body = await req.json();
    const { sessionId, status } = body ?? {};

    if (!sessionId || !status) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const allowed: OfferFlowStatus[] = ["SIGNED", "SIGNED_WAITING_HEALTH", "SIGNED_FINALIZING"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const db = getFirestore();

    // 1) lire la session pour récupérer requestId + clientUid
    const sessionRef = db.collection("offers_signing_sessions").doc(String(sessionId));
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = sessionSnap.data() as any;
    const requestId: string = session.requestId;
    const clientUid: string = session.clientUid;

    // sécurité: l'appelant doit être le propriétaire
    if (clientUid !== decoded.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 2) update offers_requests_3e (doc global de la demande)
    const reqRef = db.collection("offers_requests_3e").doc(requestId);
    await reqRef.set(
      {
        clientFlowStatus: status,
        clientFlowStatusUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3) (optionnel mais utile) garder la session synchronisée aussi
    await sessionRef.set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[offers/3epilier/status] error", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}