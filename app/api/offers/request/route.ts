// app/api/offers/request/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/firebaseAdmin';

type Insurer = { name: string; email: string };

// TODO: remplace par ta vraie liste / ou lis Firestore `insurers`
const INSURERS: Insurer[] = [
  { name: 'AXA', email: 'osmhab@gmail.com' },
  { name: 'Allianz', email: 'habib.osmani@yahoo.fr' },
  { name: 'Helvetia', email: 'habibosmani@icloud.com' },
];

function ensureEnv() {
  const keys = [
    'EMAIL_FROM',
    'GMAIL_USER',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
  ];
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Variables manquantes: ${missing.join(', ')}`);
}

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

// Encode un message RFC822 en base64url
function toBase64Url(str: string) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

// Construit un email MIME (HTML + texte) avec Reply-To (pour router le token)
function buildMime({
  from,
  to,
  replyTo,
  subject,
  html,
  text,
}: {
  from: string; to: string; replyTo?: string; subject: string; html: string; text: string;
}) {
  const boundary = 'mixed_' + Math.random().toString(36).slice(2);
  return [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : undefined,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].filter(Boolean).join('\r\n');
}

export async function POST(req: Request) {
  try {
    ensureEnv();

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return NextResponse.json({ ok:false, error:'token manquant' }, { status:400 });

    // Charge le lead par ID=token (on a setDoc doc(leads, token) côté /estimation)
    const leadSnap = await db.collection('leads').doc(token).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok:false, error:`lead introuvable pour token=${token}` }, { status:404 });
    }
    const lead: any = leadSnap.data();

    const summary = {
      token,
      age: lead.age ?? null,
      etatCivil: lead.etatCivil ?? null,
      revenuAnnuelCHF: lead.revenuAnnuel ?? null,
      objectif: lead.objectif ?? null,
      horizon: lead.horizon ?? null,
      estimation: lead.estimation ?? null,
    };
    const summaryJson = JSON.stringify(summary, null, 2);

    const htmlSummary = `
      <h2>Demande d'offre 3ᵉ pilier – MoneyLife</h2>
      <p>Token client: <b>${htmlEscape(token)}</b></p>
      <table style="border-collapse:collapse" border="1" cellpadding="6">
        <tr><td>Âge</td><td>${summary.age ?? '—'}</td></tr>
        <tr><td>État civil</td><td>${htmlEscape(String(summary.etatCivil ?? '—'))}</td></tr>
        <tr><td>Revenu annuel</td><td>${summary.revenuAnnuelCHF ?? '—'} CHF</td></tr>
        <tr><td>Objectif</td><td>${htmlEscape(String(summary.objectif ?? '—'))}</td></tr>
        <tr><td>Horizon</td><td>${htmlEscape(String(summary.horizon ?? '—'))}</td></tr>
      </table>
      <p>Merci d'envoyer votre <b>offre en PDF</b> en répondant directement à cet email (la réponse sera traitée automatiquement).</p>
      <p style="font-size:12px;color:#666">Résumé JSON (machine-readable):</p>
      <pre style="font-size:12px;color:#444;background:#f6f6f6;padding:8px;border-radius:6px">${htmlEscape(summaryJson)}</pre>
    `;

    const textSummary =
      `Demande d'offre 3e pilier - Token: ${token}\n\n` +
      `Résumé:\n${summaryJson}\n\n` +
      `Merci de répondre avec un PDF en pièce jointe.`;

    // Auth Google (même OAuth que ton poll Gmail)
    const oAuth2 = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID!,
      process.env.GMAIL_CLIENT_SECRET!,
    );
    oAuth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });
    const gmail = google.gmail({ version: 'v1', auth: oAuth2 });

    const from = process.env.EMAIL_FROM!;
    const replyTo = `offers+${token}@moneylife.ch`; // plus-addressing
    const sent: Array<{ to: string; id: string }> = [];

    // Envoie 1 email par assureur
    for (const insurer of INSURERS) {
      const subject = `MoneyLife – Demande d’offre 3ᵉ pilier [TOKEN:${token}]`;
      const mime = buildMime({
        from,
        to: insurer.email,
        replyTo,
        subject,
        html: htmlSummary,
        text: textSummary,
      });

      const raw = toBase64Url(mime);
      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });

      const id = res.data.id || '';
      sent.push({ to: insurer.email, id });
    }

    // Trace
    await db.collection('offer_requests').doc(token).set(
      {
        token,
        createdAt: new Date(),
        insurers: INSURERS,
        sent,
        leadSnapshot: summary,
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    console.error('[offers/request] error:', e);
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
