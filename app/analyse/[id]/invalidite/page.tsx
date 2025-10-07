import { Suspense } from 'react';
import { db } from '@/lib/firebaseAdmin';
import InvalidityClient from './view-client';

export const dynamic = 'force-dynamic';

async function getAnalysis(id: string) {
  const snap = await db.collection('analyses').doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) }) : null;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) return <div className="p-6">Analyse introuvable</div>;

  const clientDocPath = analysis?.clientToken ? `clients/${analysis.clientToken}` : `analyses/${id}`;
  const docSnap = await db.doc(clientDocPath).get();
  const data = docSnap.data() || {};
  const invalidity = data?.prestations?.invalidity || null;
  const meta = data?.prestationsMeta || null;

  return (
    <Suspense>
      <InvalidityClient id={id} clientDocPath={clientDocPath} invalidity={invalidity} meta={meta} />
    </Suspense>
  );
}
