// app/api/share/[id]/verify/route.ts
//
// Vérifie le code OTP. Au succès : ouvre une session courte (jeton) et renvoie
// la liste des documents (sans URL). Les fichiers sont ensuite servis par
// /api/share/[id]/file/[idx]?token=… tant que la session est valide.

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { hashOtp, generateToken } from "@/lib/server/share";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { code } = await req.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: "Code manquant" }, { status: 400 });

  const ref = db.collection("shares").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const d = snap.data()!;
  if (Date.now() > (d.expiresAt || 0)) return NextResponse.json({ error: "EXPIRED" }, { status: 410 });

  const otp = d.otp;
  if (!otp) return NextResponse.json({ error: "Aucun code demandé." }, { status: 400 });
  if (Date.now() > otp.expiresAt) return NextResponse.json({ error: "Code expiré." }, { status: 400 });
  if ((otp.attempts || 0) >= 3) {
    return NextResponse.json({ error: "Trop d'essais. Redemandez un code." }, { status: 429 });
  }

  if (hashOtp(id, String(code)) !== otp.hash) {
    await ref.update({ "otp.attempts": (otp.attempts || 0) + 1 });
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  // Succès : session de 30 min, OTP consommé.
  const token = generateToken();
  await ref.update({
    status: "verified",
    sessionToken: token,
    sessionExpiresAt: Date.now() + 30 * 60 * 1000,
    otp: null,
  });

  const documents = (d.documents || []).map((doc: any, i: number) => ({ name: doc.name, idx: i }));
  return NextResponse.json({ ok: true, token, documents });
}
