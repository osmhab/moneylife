// app/api/offers/process-now/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return NextResponse.json({ ok: false, error: 'token manquant' }, { status: 400 });

    // 1) Poll Gmail (sauve les PJ dans offers/raw/<token>/...)
    const pollRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/gmail/poll`, {
      method: 'GET',
    });
    const pollJson = await pollRes.json();
    if (!pollRes.ok) throw new Error(pollJson?.error || 'Échec gmail/poll');

    // 2) Parse OCR+LLM pour ce token (prefix du dossier)
    const prefix = `offers/raw/${token}/`;
    const parseRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/jobs/parse?prefix=${encodeURIComponent(prefix)}&token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
    const parseJson = await parseRes.json();
    if (!parseRes.ok) throw new Error(parseJson?.error || 'Échec jobs/parse');

    return NextResponse.json({
      ok: true,
      saved: pollJson.saved?.filter((x: any) => x.token === token) ?? [],
      parsed: parseJson.results ?? [],
    });
  } catch (e: any) {
    console.error('[offers/process-now] error:', e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
