// app/analyse/_hooks/useQuickParamsLoad.ts
'use client';

import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { EventKind } from './useGaps';

type TargetsDisplay = { invalidity: number; death: number; retirement: number };

type LoadedQuickParams = {
  unit?: 'monthly' | 'annual';
  eventInvalidity?: EventKind;
  eventDeath?: EventKind;
  weeklyHours?: number;
  childrenCount?: number;
  sex?: 'F' | 'M';
  survivor?: {
    maritalStatus?: string;
    hasChild?: boolean;
    ageAtWidowhood?: number;
    marriedSince5y?: boolean;
  };
  targets?: TargetsDisplay; // défini seulement si présent en base
};

export function useQuickParamsLoad({
  clientDocPath,
  apply,
}: {
  clientDocPath?: string;
  apply: (loaded: LoadedQuickParams) => void;
}) {
  // Ne PAS dépendre de 'apply' dans l'effet : stocker la dernière version dans un ref
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    // Pas de chemin → débloque l'autosave côté appelant
    if (!clientDocPath || !db) {
      applyRef.current({});
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, clientDocPath));

        if (!snap.exists()) {
          // doc absent → ready quand même
          applyRef.current({});
          return;
        }

        const data = snap.data() as any;
        const qp = (data?.quickParams ?? data) ?? {};

        const hasTargets =
          qp?.targets &&
          (
            typeof qp.targets.invalidityPctTarget === 'number' ||
            typeof qp.targets.deathPctTarget === 'number' ||
            typeof qp.targets.retirementPctTarget === 'number' ||
            typeof qp.targets.invalidity === 'number' ||
            typeof qp.targets.death === 'number' ||
            typeof qp.targets.retirement === 'number'
          );

        applyRef.current({
          unit: qp.unit === 'monthly' || qp.unit === 'annual' ? qp.unit : undefined,
          eventInvalidity:
            qp.eventInvalidity === 'accident' || qp.eventInvalidity === 'maladie'
              ? qp.eventInvalidity : undefined,
          eventDeath:
            qp.eventDeath === 'accident' || qp.eventDeath === 'maladie'
              ? qp.eventDeath : undefined,
          weeklyHours: typeof qp.weeklyHours === 'number' ? qp.weeklyHours : undefined,
          childrenCount: typeof qp.childrenCount === 'number' ? qp.childrenCount : undefined,
          sex: qp.sex === 'F' || qp.sex === 'M' ? qp.sex : undefined,
          survivor: {
            maritalStatus: typeof qp.survivor?.maritalStatus === 'string' ? qp.survivor.maritalStatus : undefined,
            hasChild: typeof qp.survivor?.hasChild === 'boolean' ? qp.survivor.hasChild : undefined,
            ageAtWidowhood: typeof qp.survivor?.ageAtWidowhood === 'number' ? qp.survivor.ageAtWidowhood : undefined,
            marriedSince5y: typeof qp.survivor?.marriedSince5y === 'boolean' ? qp.survivor.marriedSince5y : undefined,
          },
          ...(hasTargets ? {
            targets: {
              invalidity: Number(qp.targets?.invalidityPctTarget ?? qp.targets?.invalidity ?? 0),
              death: Number(qp.targets?.deathPctTarget ?? qp.targets?.death ?? 0),
              retirement: Number(qp.targets?.retirementPctTarget ?? qp.targets?.retirement ?? 0),
            },
          } : {}),
        });
      } catch (e) {
        console.warn('[useQuickParamsLoad] read failed:', e);
        applyRef.current({});
      }
    })();
  }, [clientDocPath]); // <-- surtout PAS 'apply'
}
