// app/api/share/[id]/info/route.ts
//
// Infos publiques (non sensibles) d'un partage, pour l'en-tête de la page d'accès.

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { maskEmail, maskPhone } from "@/lib/server/share";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const snap = await db.collection("shares").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const d = snap.data()!;
  const channel = d.channel === "sms" ? "sms" : "email";
  return NextResponse.json({
    senderName: d.senderName || "Un client CreditX",
    count: Array.isArray(d.documents) ? d.documents.length : 0,
    channel,
    recipientHint: channel === "sms" ? maskPhone(d.recipientPhone || "") : maskEmail(d.recipientEmail || ""),
    expired: Date.now() > (d.expiresAt || 0),
  });
}
