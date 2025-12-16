// app/api/admin/offers/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

const ALLOWED_STATUSES = [
  "nouvelle",
  "en_cours",
  "en_attente_client",
  "terminee",
] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { configId, status } = body ?? {};

    if (!configId || !status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid configId/status" },
        { status: 400 }
      );
    }

    const now = Date.now();

    const ref = db.collection("offers_requests_3e").doc(configId);

    await ref.set(
      {
        status,
        statusUpdatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin] Erreur POST /api/admin/offers/status:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}