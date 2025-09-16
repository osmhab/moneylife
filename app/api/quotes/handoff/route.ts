// app/api/quotes/handoff/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { google } from "googleapis";

/**
 * POST body:
 * {
 *   quoteId: string,          // obligatoire
 *   clientToken: string,      // recommandé (cohérence)
 *   partnerEmail: string,     // email du partenaire qui reçoit la passation
 *   cc?: string[],            // ex. ["offers@moneylife.ch"]
 *   bcc?: string[],
 *   subject?: string,
 *   message?: string          // HTML, sinon message par défaut généré
 * }
 *
 * Effets:
 * 1) Update quotes/{quoteId}: { status:"chosen", chosenAt, chosenBy:"client", handoffId }
 * 2) Create handoffs/{handoffId}: { quoteRef, clientToken, partnerEmail, sentAt, gmail{...}, status:"SENT" }
 * 3) Email partenaire (Gmail API OAuth2)
 *
 * ENV attendues côté serveur:
 * - GMAIL_CLIENT_ID
 * - GMAIL_CLIENT_SECRET
 * - GMAIL_REFRESH_TOKEN
 * - GMAIL_USER = "offers@moneylife.ch"
 */

type Body = {
  quoteId: string;
  clientToken?: string;
  partnerEmail: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  message?: string;
};

function assertEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMime(opts: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string; // HTML
}) {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(", ")}`] : []),
    ...(opts.bcc?.length ? [`Bcc: ${opts.bcc.join(", ")}`] : []),
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.body,
  ].join("\r\n");
  return toBase64Url(headers);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.quoteId) return NextResponse.json({ error: "quoteId requis" }, { status: 400 });
    if (!body?.partnerEmail) return NextResponse.json({ error: "partnerEmail requis" }, { status: 400 });

    // 1) Lire la quote (pour enrichir l’email)
    const quoteRef = db.collection("quotes").doc(body.quoteId);
    const quoteSnap = await quoteRef.get();
    if (!quoteSnap.exists) {
      return NextResponse.json({ error: "Quote introuvable" }, { status: 404 });
    }
    const quote = quoteSnap.data() || {};
    const clientToken = body.clientToken || quote.clientToken || "N/A";
    const assureur = quote.assureur || "Assureur";
    const produit = quote.produit || "Produit";
    const primeMois = quote.primeMois != null ? `${quote.primeMois} CHF/mois` : "—";
    const primeAn = quote.primeAn != null ? `${quote.primeAn} CHF/an` : "—";

    // 2) Créer un handoff + envoyer l’email partenaire
    const subject =
      body.subject?.trim() ||
      `Handoff – Client ${clientToken} – ${assureur} / ${produit}`;

    const defaultBody = `
      <p>Bonjour,</p>
      <p>Le client <b>${clientToken}</b> a choisi votre offre <b>${assureur} – ${produit}</b>.</p>
      <ul>
        <li>Prime: ${primeMois} (${primeAn})</li>
        <li>Quote ID: <code>${body.quoteId}</code></li>
      </ul>
      <p>Merci de prendre contact avec le client pour finaliser la souscription.<br/>
      Si besoin, répondez à ce message pour toute précision.</p>
      <p>Cordialement,<br/>MoneyLife.ch</p>
    `.trim();

    const htmlBody = body.message?.trim() || defaultBody;

    // Gmail OAuth2 client
    const clientId = assertEnv("GMAIL_CLIENT_ID");
    const clientSecret = assertEnv("GMAIL_CLIENT_SECRET");
    const refreshToken = assertEnv("GMAIL_REFRESH_TOKEN");
    const user = assertEnv("GMAIL_USER");

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // construire & envoyer
    const raw = buildMime({
      from: user,
      to: [body.partnerEmail],
      cc: body.cc,
      bcc: body.bcc,
      subject,
      body: htmlBody,
    });

    const sendRes = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const threadId = sendRes.data.threadId || null;
    const msgId = sendRes.data.id || null;

    // 3) Écritures Firestore dans une batch atomique
    const handoffRef = db.collection("handoffs").doc();
    const now = new Date();

    const batch = db.batch();
    batch.update(quoteRef, {
      status: "chosen",
      chosenAt: now,
      chosenBy: "client",
      handoffId: handoffRef.id,
    });
    batch.set(handoffRef, {
      quoteId: body.quoteId,
      quoteRef: quoteRef.path,
      clientToken,
      partnerEmail: body.partnerEmail,
      cc: body.cc ?? [],
      bcc: body.bcc ?? [],
      subject,
      message: htmlBody,
      status: "SENT",
      sentAt: now,
      gmail: { threadId, messageId: msgId, from: user },
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      handoffId: handoffRef.id,
      threadId,
      messageId: msgId,
    });
  } catch (err: any) {
    console.error("[/api/quotes/handoff] ERROR", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
