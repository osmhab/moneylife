// app/api/share/[id]/send-code/route.ts
//
// Génère et envoie un code OTP (6 chiffres, 15 min) au destinataire du partage.
// Public, mais avec un cooldown anti-spam.

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { generateOtp, hashOtp, baseUrlFromRequest } from "@/lib/server/share";
import { sendShareCodeEmail } from "lib/mail/creditx-mailer";
import { sendSms } from "@/lib/server/twilio";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ref = db.collection("shares").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const d = snap.data()!;
  if (Date.now() > (d.expiresAt || 0)) return NextResponse.json({ error: "EXPIRED" }, { status: 410 });

  // Cooldown : 1 envoi / 30 s.
  const lastSentAt = d.otp?.lastSentAt || 0;
  if (Date.now() - lastSentAt < 30_000) {
    return NextResponse.json({ error: "Veuillez patienter avant de redemander un code." }, { status: 429 });
  }

  const code = generateOtp();
  await ref.update({
    otp: {
      hash: hashOtp(id, code),
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now(),
    },
  });

  if (d.channel === "sms" && d.recipientPhone) {
    await sendSms(d.recipientPhone, `CreditX : votre code de vérification est ${code} (valable 15 min). Ne le partagez pas.`);
  } else {
    await sendShareCodeEmail({ to: d.recipientEmail, code, shareUrl: `${baseUrlFromRequest(req)}/fr/share/${id}` });
  }

  return NextResponse.json({ ok: true });
}
