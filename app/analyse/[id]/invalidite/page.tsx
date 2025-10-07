// app/analyse/[id]/invalidite/page.tsx
import { Suspense } from 'react';
import { db } from '@/lib/firebaseAdmin';
import InvalidityClient from './view-client';

// Next.js en mode dynamique
export const dynamic = 'force-dynamic';

async function getAnalysis(id: string) {
  const snap = await db.collection('analyses').doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) }) : null;
}

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  const analysis = await getAnalysis(id);
  if (!analysis) return <div className="p-6">Analyse introuvable</div>;

  // Chemin vers le document client ou l’analyse
  const clientDocPath = analysis.clientToken
    ? `clients/${analysis.clientToken}`
    : `analyses/${id}`;

  // Récupération des prestations (LAA/AI/LPP) et métadonnées
  const docSnap = await db.doc(clientDocPath).get();
  const data = docSnap.data() || {};

  const invalidityRaw = data?.prestations?.invalidity ?? null;
  const metaRaw = data?.prestationsMeta ?? null;

  // On convertit les objets bruts en objets plaines pour éviter les classes Firestore
  const invalidity = invalidityRaw ? JSON.parse(JSON.stringify(invalidityRaw)) : null;

  // Conversion du timestamp Firestore (updatedAt) en ISO
  let meta: any = null;
  if (metaRaw) {
    meta = JSON.parse(JSON.stringify(metaRaw));
    if (meta.updatedAt?._seconds !== undefined) {
      meta.updatedAt = new Date(
        meta.updatedAt._seconds * 1000 +
          Math.floor(meta.updatedAt._nanoseconds / 1e6),
      ).toISOString();
    }
  }

  return (
    <Suspense fallback={<div>Chargement…</div>}>
      <InvalidityClient
        id={id}
        clientDocPath={clientDocPath}
        invalidity={invalidity}
        meta={meta}
      />
    </Suspense>
  );
}
