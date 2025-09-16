// app/api/configs/prefill/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      clientToken,
      sexe = null,
      primeMonthlyMin,
      primeMonthlyMax,
      renteAiMonthlyTarget,
      capitalDecesTarget,
      source = "analysis_prefill",
    } = body || {};

    if (!clientToken) {
      return NextResponse.json({ ok: false, error: "clientToken manquant" }, { status: 400 });
    }

    const now = new Date();

    // On crée un doc configs/autoId
    const docRef = await db.collection("configs").add({
      clientToken,
      createdAt: now,
      updatedAt: now,
      source,
      // champs utilisés par ton configurateur 3a v4.2.1
      sexe: sexe ?? null,                // pré-rempli si connu (requis dans /configure)
      primeMonthlyMin: Number(primeMonthlyMin) || 0,
      primeMonthlyMax: Number(primeMonthlyMax) || 0,
      renteAiMonthlyTarget: Number(renteAiMonthlyTarget) || 0,
      capitalDecesTarget: Number(capitalDecesTarget) || 0,
      // statut & flags
      status: "draft",
      stage: "prefilled",
    });

    return NextResponse.json({ ok: true, configId: docRef.id });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
