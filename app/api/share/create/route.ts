// app/api/share/create/route.ts
//
// Crée un partage sécurisé et envoie l'invitation au destinataire (e-mail OU SMS).
// Authentifié (jeton Firebase de l'expéditeur). Le message ne contient PAS les
// documents : juste un lien vers la page d'accès, débloquée ensuite par un code.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { storagePathFromUrl, baseUrlFromRequest, normalizePhone } from "@/lib/server/share";
import { sendShareInvitationEmail } from "lib/mail/creditx-mailer";
import { sendSms } from "@/lib/server/twilio";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const channel: "email" | "sms" = body.channel === "sms" ? "sms" : "email";
    const documents = body.documents;

    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: "Aucun document" }, { status: 400 });
    }

    // Destinataire selon le canal.
    let email = "";
    let phone = "";
    if (channel === "email") {
      email = String(body.recipientEmail || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "E-mail invalide" }, { status: 400 });
      }
    } else {
      const norm = normalizePhone(String(body.recipientPhone || ""));
      if (!norm) return NextResponse.json({ error: "Numéro invalide" }, { status: 400 });
      phone = norm;
    }

    // Autorisation : on ne garde que les documents appartenant à l'expéditeur.
    const prefix = `clients/${uid}/`;
    const docs = documents
      .map((d: any) => {
        const path = (typeof d.path === "string" && d.path) ? d.path : storagePathFromUrl(d.url || "");
        return { name: String(d.name || "Document"), path: path || "" };
      })
      .filter((d) => d.path.startsWith(prefix));
    if (docs.length === 0) {
      return NextResponse.json({ error: "Aucun document valide" }, { status: 400 });
    }

    // Nom de l'expéditeur depuis la fiche client (on ne fait pas confiance au client).
    let senderName = "Un client CreditX";
    try {
      const snap = await db.collection("clients").doc(uid).collection("DonneePersonnelles").doc("current").get();
      const p = snap.data() || {};
      const full = [p.Enter_prenom, p.Enter_nom].filter(Boolean).join(" ").trim();
      if (full) senderName = full;
    } catch { /* défaut conservé */ }

    const ref = db.collection("shares").doc();
    const now = Date.now();
    await ref.set({
      senderUid: uid,
      senderName,
      channel,
      recipientEmail: email,
      recipientPhone: phone,
      documents: docs,
      status: "pending",
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // lien valable 7 jours
      otp: null,
      sessionToken: null,
      sessionExpiresAt: null,
    });

    const shareUrl = `${baseUrlFromRequest(req)}/fr/share/${ref.id}`;
    const docWord = docs.length > 1 ? `${docs.length} documents` : "un document";

    if (channel === "sms") {
      await sendSms(phone, `${senderName} a partagé ${docWord} avec vous via CreditX. Accédez-y (code requis) : ${shareUrl}`);
    } else {
      await sendShareInvitationEmail({ to: email, senderName, count: docs.length, shareUrl });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("share/create:", e?.message);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
