// app/api/gmail/poll/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { bucket } from '@/lib/firebaseAdmin';

function base64urlToBuffer(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, '_');
}

function extractToken(toList: string[], ccList: string[], subject: string | undefined): string | null {
  const hay = [...(toList || []), ...(ccList || []), subject || ''].join(' ').toLowerCase();
  const m1 = hay.match(/offers\+([a-z0-9\-]{6,})@moneylife\.ch/);
  if (m1?.[1]) return m1[1];
  const m2 = hay.match(/\[token:([a-z0-9\-]{6,})\]/);
  if (m2?.[1]) return m2[1];
  return null;
}

type GmailPart = {
  filename?: string | null;
  mimeType?: string | null;
  body?: { size?: number | null; attachmentId?: string | null } | null;
  parts?: GmailPart[] | null;
};

function collectParts(parts?: GmailPart[] | null, out: GmailPart[] = []): GmailPart[] {
  if (!parts) return out;
  for (const p of parts) {
    out.push(p);
    if (p.parts && p.parts.length) collectParts(p.parts, out);
  }
  return out;
}

export async function GET() {
  try {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Gmail ENV manquantes' }, { status: 500 });
    }

    const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox has:attachment newer_than:7d',
      maxResults: 5,
    });

    const messages = list.data.messages ?? [];
    const saved: Array<{ id: string; token: string; files: string[] }> = [];

    for (const m of messages) {
      if (!m.id) continue;
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id });

      const headers = msg.data.payload?.headers ?? [];
      const to = headers.filter(h => h.name?.toLowerCase() === 'to').map(h => h.value || '');
      const cc = headers.filter(h => h.name?.toLowerCase() === 'cc').map(h => h.value || '');
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';

      const token = extractToken(to, cc, subject) || 'unknown';
      const allParts = collectParts(msg.data.payload?.parts as GmailPart[] | undefined, []);
      const files: string[] = [];

      for (const p of allParts) {
        if (p.filename && p.body?.attachmentId) {
          const att = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: m.id!,
            id: p.body.attachmentId!,
          });

          const data64 = att.data.data || '';
          const buf = data64 ? base64urlToBuffer(data64) : Buffer.alloc(0);
          const dest = `offers/raw/${token}/${Date.now()}_${sanitize(p.filename)}`;

          const file = bucket.file(dest);
          await file.save(buf, {
            resumable: false,
            contentType: p.mimeType || 'application/octet-stream',
          });
          files.push(dest);
        }
      }

      saved.push({ id: m.id, token, files });
    }

    return NextResponse.json({ ok: true, saved });
  } catch (err: any) {
    console.error('[gmail/poll] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
