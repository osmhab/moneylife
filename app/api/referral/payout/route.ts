// app/api/referral/payout/route.ts
// Enregistre les coordonnées de versement du parrain (IBAN / TWINT) sur clients/{uid}.
// Mêmes champs que l'entretien conseil (referralIban / referralPaymentMethod / referralPhone).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db } from "@/lib/firebase/admin";

type Body = { iban?: string; method?: "IBAN" | "TWINT"; phone?: string };

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  try {
    const b = (await req.json()) as Body;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof b.iban === "string") patch.referralIban = b.iban.trim().toUpperCase().replace(/\s+/g, "");
    if (b.method === "IBAN" || b.method === "TWINT") patch.referralPaymentMethod = b.method;
    if (typeof b.phone === "string") patch.referralPhone = b.phone.trim();
    await db.collection("clients").doc(uid).set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
