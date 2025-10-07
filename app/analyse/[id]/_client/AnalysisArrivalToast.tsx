// app/analyse/[id]/_client/AnalysisArrivalToast.tsx
'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

type Props = {
  analysisId: string;          // ex: "1fc9cf68-5585-4812-bb69-28f1cee66e28"
  confidence?: number | null;  // 0..1
  isVerified: boolean;
  /** option de debug: forcer l'affichage même si déjà vu en session */
  force?: boolean;
};

export default function AnalysisArrivalToast({ analysisId, confidence, isVerified, force = false }: Props) {
  const shownRef = useRef(false);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // log de debug (visible dans la console)
    // si tu ne vois PAS cette ligne → le composant n'est pas rendu / pas client
    console.debug('[ArrivalToast] hook', { analysisId, isVerified, confidence });

    if (isVerified) return;            // rien si déjà vérifié
    if (shownRef.current) return;      // protéger contre double mount
    const key = `ml-arrival-${analysisId}`;

    // anti-spam session (1x par session et par analyse)
    if (!force && sessionStorage.getItem(key) === '1') return;

    shownRef.current = true;
    if (!force) sessionStorage.setItem(key, '1');

    const pct = Math.round(((confidence ?? 0.7) * 100));
    toastIdRef.current = toast.warning(
      `Scan terminé • Taux de succès ${pct}%`,
      {
        description: 'Pour des calculs fiables, veuillez vérifier les informations.',
        duration: Infinity, // permanent jusqu’à action
        action: {
          label: 'Vérifier',
          onClick: () => {
            const trigger = document.getElementById('robot-accordion-trigger') as HTMLButtonElement | null;
            if (trigger) {
              if (trigger.getAttribute('data-state') !== 'open') trigger.click();
              trigger.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (toastIdRef.current) {
              toast.dismiss(toastIdRef.current);
              toastIdRef.current = null;
            }
          },
        },
      }
    );

    return () => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, [analysisId, confidence, isVerified, force]);

  return null;
}
