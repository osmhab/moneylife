// app/analyse/[id]/_client/RobotApprentiCard.tsx
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import type { LppParsed } from '@/lib/layoutTypes';
import { Button } from '@/components/ui/button';

import LppCertificateEditor from './LppCertificateEditor';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function RobotApprentiCard({ doc }: { doc: LppParsed }) {
  const [current, setCurrent] = useState<LppParsed>(doc);
  const [pending, startTransition] = useTransition();
  const isVerified = current.review?.status === 'verified';

  // états remontés par l'éditeur
  const [dirty, setDirty] = useState(false);
  const [hasEditing, setHasEditing] = useState(false);

  const router = useRouter();
  const stickyToastIdRef = useRef<string | number | null>(null);

  const canConfirm = !dirty && !hasEditing && !pending && !isVerified;

  const onConfirm = () => {
    startTransition(async () => {
      const res = await fetch(`/api/lpp/${current.id}/save`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review: { ...(current.review || {}), status: 'verified', reviewedAt: new Date().toISOString() },
          needs_review: false,
        }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const next: LppParsed =
          (json?.doc as LppParsed) || ({ ...current, review: { status: 'verified' } } as LppParsed);
        setCurrent(next);

        // fermer le toast s'il est ouvert + toast succès
        if (stickyToastIdRef.current) {
          toast.dismiss(stickyToastIdRef.current);
          stickyToastIdRef.current = null;
        }
        toast.success('Certificat vérifié');

        // 🔄 rafraîchir la page pour recharger les Server Components
        router.refresh();
      }
    });
  };

  // Toast permanent "Confirmer maintenant" dès qu'il y a des modifs non confirmées
  useEffect(() => {
    if (!isVerified && dirty) {
      if (!stickyToastIdRef.current) {
        stickyToastIdRef.current = toast.warning('Modifications en attente', {
          description: 'Confirmez maintenant pour valider le certificat LPP.',
          duration: Infinity, // permanent jusqu’à action
          action: {
            label: 'Vérifier maintenant',
            onClick: () => onConfirm(),
          },
        });
      }
    } else {
      if (stickyToastIdRef.current) {
        toast.dismiss(stickyToastIdRef.current);
        stickyToastIdRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, isVerified]);

  return (
    <div className="px-4 pb-4 md:px-6 md:pb-6">
       {/* Barre d’action interne : seulement le bouton Confirmer (pas de chip) */}
 {!isVerified && (
   <div className="mb-3 flex items-center justify-end">
     <Button
       variant="outline"
       onClick={onConfirm}
       disabled={!canConfirm}
       title={
         canConfirm
           ? 'Confirmer le scan'
           : 'Enregistrez d’abord vos modifications et terminez les lignes en édition'
       }
     >
       {pending ? '…' : 'Confirmer'}
     </Button>
   </div>
 )}

      <LppCertificateEditor
        initial={current}
        onSaved={(next) => setCurrent(next)}
        onDirtyChange={setDirty}
        onEditingChange={setHasEditing}
      />
    </div>
  );
}
