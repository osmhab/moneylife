// app/api/lpp/[id]/save/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { upsertTemplateFromDoc } from '@/lib/learner';

export const dynamic = 'force-dynamic';

type LppReviewStatus = 'pending' | 'verified' | 'flagged';
type LppFieldSource = 'ocr' | 'manual';

function isReviewStatus(v: any): v is LppReviewStatus {
  return v === 'pending' || v === 'verified' || v === 'flagged';
}

function sanitiseSources(sources: any): Record<string, LppFieldSource> | undefined {
  if (!sources || typeof sources !== 'object') return undefined;
  const out: Record<string, LppFieldSource> = {};
  for (const [k, v] of Object.entries(sources)) {
    if (v === 'ocr' || v === 'manual') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> } // ⬅️ params asynchrone
) {
  try {
    const { id } = await ctx.params; // ⬅️ attendre params
    if (!id) return new NextResponse('Missing id', { status: 400 });

    const body = await req.json();

    // ---- Normalisations minimales & compat ----
    if (body?.id) delete body.id; // id ne doit jamais être écrite dans le doc

    // Accepter soit review: {status: ...} soit review: "verified"
    if (typeof body?.review === 'string') {
      body.review = { status: body.review as LppReviewStatus };
    }
    if (body?.review && typeof body.review === 'object') {
      const status = body.review.status;
      if (!isReviewStatus(status)) {
        delete body.review; // statut invalide → ignore l'update review
      } else {
        if (status === 'verified' || status === 'flagged') {
          body.review.reviewedAt = new Date().toISOString();
        }
        // Compat ancien champ needs_review
        if (status === 'verified') {
          body.needs_review = false;
        } else if (status === 'flagged') {
          body.needs_review = true;
        }
      }
    }

    // Sources: sécuriser la structure (champ → 'ocr' | 'manual')
    if ('sources' in body) {
      const safeSources = sanitiseSources(body.sources);
      if (safeSources) body.sources = safeSources;
      else delete body.sources;
    }

    // Marqueur d'update serveur (utile pour audit)
    body.updatedAt = new Date().toISOString();

    // ---- Merge Firestore ----
    const ref = db.collection('lpp_parsed').doc(id);
    await ref.set(body, { merge: true });

    // ---- Retourner le doc à jour ----
    const snap = await ref.get();
    const doc = { id, ...(snap.data() as any) };

    // Si on vient de marquer “verified”, on alimente le template Learner
    if (doc?.review?.status === 'verified') {
      try {
        await upsertTemplateFromDoc(doc);
      } catch (e) {
        console.error('[learner] upsertTemplateFromDoc failed', e);
      }
    }

    return NextResponse.json({ ok: true, doc });
  } catch (e: any) {
    console.error('[api] lpp.save PATCH error:', e);
    return new NextResponse(e?.message || 'Server error', { status: 500 });
  }
}
