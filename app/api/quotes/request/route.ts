// app/api/quotes/request/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { google } from "googleapis";

/**
 * ENV attendues côté serveur:
 * - GMAIL_CLIENT_ID
 * - GMAIL_CLIENT_SECRET
 * - GMAIL_REFRESH_TOKEN
 * - GMAIL_USER = "offers@moneylife.ch"
 *
 * Firestore:
 * - quotes_requests/{reqId}  (status, clientToken, configId, partners[], subject, message, sentAt, emailThreadId?)
 */

type RequestBody = {
  clientToken: string;
  configId: string;
  partners: string[];           // destinataires (TO)
  cc?: string[];                // optionnel
  bcc?: string[];               // optionnel
  subject?: string;             // optionnel (fallback généré)
  message?: string;             // optionnel (fallback généré)
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
  body: string;
}) {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(", ")}`] : []),
    ...(opts.bcc?.length ? [`Bcc: ${opts.bcc.join(", ")}`] : []),
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "", // blank line before body per RFC
    opts.body,
  ].join("\r\n");
  return toBase64Url(headers);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    // Validation basique
    if (!body?.clientToken) return NextResponse.json({ error: "clientToken requis" }, { status: 400 });
    if (!body?.configId) return NextResponse.json({ error: "configId requis" }, { status: 400 });
    if (!Array.isArray(body?.partners) || body.partners.length === 0) {
      return NextResponse.json({ error: "partners[] requis (au moins 1 email)" }, { status: 400 });
    }

    // Prépare contenu email
    const subject = body.subject?.trim() || `Demande d’offres 3a – client ${body.clientToken}`;
    const defaultBody = `
      <p>Bonjour,</p>
      <p>Merci d’adresser une <b>offre de 3e pilier (3a)</b> pour le client <code>${body.clientToken}</code>.
      Les paramètres et documents sont disponibles via MoneyLife (config <code>${body.configId}</code>).</p>
      <ul>
        <li>ClientToken: <code>${body.clientToken}</code></li>
        <li>ConfigId: <code>${body.configId}</code></li>
      </ul>
      <p>Merci de répondre à ce message avec vos PDF d’offre et précisions (frais, participation, rendement projeté, flexibilité, etc.).</p>
      <p>Cordialement,<br/>MoneyLife.ch</p>
    `.trim();
    const htmlBody = body.message?.trim() || defaultBody;

    // OAuth2 Gmail
    const clientId = assertEnv("GMAIL_CLIENT_ID");
    const clientSecret = assertEnv("GMAIL_CLIENT_SECRET");
    const refreshToken = assertEnv("GMAIL_REFRESH_TOKEN");
    const user = assertEnv("GMAIL_USER");

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Envoi message
    const raw = buildMime({
      from: user,
      to: body.partners,
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

    // Firestore: création de la demande
    const reqRef = await db.collection("quotes_requests").add({
      clientToken: body.clientToken,
      configId: body.configId,
      partners: body.partners,
      cc: body.cc ?? [],
      bcc: body.bcc ?? [],
      subject,
      message: htmlBody,
      status: "SENT",
      sentAt: new Date(),
      gmail: { threadId, messageId: msgId, from: user },
    });

    return NextResponse.json({ ok: true, reqId: reqRef.id, threadId, messageId: msgId });
  } catch (err: any) {
    console.error("[/api/quotes/request] ERROR", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
