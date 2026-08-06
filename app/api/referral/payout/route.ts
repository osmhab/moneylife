// app/api/referral/payout/route.ts
// Enregistre les coordonnées de versement du parrain (IBAN / TWINT) sur clients/{uid}.
// Mêmes champs que l'entretien conseil (referralIban / referralPaymentMethod / referralPhone).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db } from "@/lib/firebase/admin";

type Body = { prenom?: string; nom?: string; iban?: string; npa?: string; localite?: string };

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
    if (typeof b.prenom === "string") patch.referralPrenom = b.prenom.trim();
    if (typeof b.nom === "string") patch.referralNom = b.nom.trim();
    if (typeof b.iban === "string") patch.referralIban = b.iban.trim().toUpperCase().replace(/\s+/g, "");
    if (typeof b.npa === "string") patch.referralNpa = b.npa.trim();
    if (typeof b.localite === "string") patch.referralLocalite = b.localite.trim();
    await db.collection("clients").doc(uid).set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
