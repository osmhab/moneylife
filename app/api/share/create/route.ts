// app/api/share/create/route.ts
//
// Crée un partage sécurisé et envoie l'invitation e-mail au destinataire.
// Authentifié (jeton Firebase de l'expéditeur). Le message ne contient PAS les
// documents : juste un lien vers la page d'accès, débloquée ensuite par un code.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { storagePathFromUrl } from "@/lib/server/share";
import { sendShareInvitationEmail } from "lib/mail/creditx-mailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const { recipientEmail, documents } = await req.json();
    const email = String(recipientEmail || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail invalide" }, { status: 400 });
    }
    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: "Aucun document" }, { status: 400 });
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
      recipientEmail: email,
      channel: "email",
      documents: docs,
      status: "pending",
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // lien valable 7 jours
      otp: null,
      sessionToken: null,
      sessionExpiresAt: null,
    });

    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://creditx.ch").replace(/\/$/, "");
    const shareUrl = `${base}/fr/share/${ref.id}`;
    await sendShareInvitationEmail({ to: email, senderName, count: docs.length, shareUrl });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("share/create:", e?.message);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
