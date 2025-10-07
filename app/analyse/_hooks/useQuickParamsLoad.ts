// app/analyse/_hooks/useQuickParamsLoad.ts
'use client';

import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { EventKind } from './useGaps';



// --- enfants: dates de naissance (ISO) --- //
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sanitizeBirthdates = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((s) => typeof s === 'string' && ISO_DATE_RE.test(s))
    .slice(0, 20); // limite de sécurité
};


type TargetsDisplay = { invalidity: number; death: number; retirement: number };

type LoadedQuickParams = {
  unit?: 'monthly' | 'annual';
  eventInvalidity?: EventKind;
  eventDeath?: EventKind;
  weeklyHours?: number;
  childrenCount?: number;
  childrenBirthdates?: string[]; // YYYY-MM-DD
  sex?: 'F' | 'M';
  survivor?: {
    maritalStatus?: string;
    hasChild?: boolean;
    ageAtWidowhood?: number;
    marriedSince5y?: boolean;

    // 🔹 étendus (concubinage)
    partnerDesignated?: boolean;
    cohabitationYears?: number;
  };
  targets?: TargetsDisplay; // défini seulement si présent en base

  // 🔹 nouveaux champs carrière AVS
  startWorkYearCH?: number;
  missingYearsMode?: 'none' | 'some';
  missingYears?: number[];
  caregiving?: {
    hasCare: boolean;
    years?: number[];
  };
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
      applyRef.current({}); // ✅ signale "prêt" même sans chemin pour ne pas bloquer l’UI
      return;
    }




    (async () => {
      try {
        const snap = await getDoc(doc(db, clientDocPath));

        if (!snap.exists()) {
        applyRef.current({}); // ✅ signale chargement terminé même sans doc
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
          childrenBirthdates: sanitizeBirthdates(qp.childrenBirthdates),
          sex: qp.sex === 'F' || qp.sex === 'M' ? qp.sex : undefined,
          survivor: {
  maritalStatus:
    typeof qp.survivor?.maritalStatus === 'string'
      ? qp.survivor.maritalStatus
      : undefined,
  hasChild:
    typeof qp.survivor?.hasChild === 'boolean'
      ? qp.survivor.hasChild
      : undefined,
  // 🧼 si l'âge stocké vaut 45 (ancien défaut), on neutralise à 0
  ageAtWidowhood:
    typeof qp.survivor?.ageAtWidowhood === 'number'
      ? (qp.survivor.ageAtWidowhood === 45 ? 0 : qp.survivor.ageAtWidowhood)
      : undefined,
  marriedSince5y:
    typeof qp.survivor?.marriedSince5y === 'boolean'
      ? qp.survivor.marriedSince5y
      : undefined,

  // 🔹 étendus (concubinage)
  partnerDesignated:
    typeof qp.survivor?.partnerDesignated === 'boolean'
      ? qp.survivor.partnerDesignated
      : undefined,
  cohabitationYears:
    typeof qp.survivor?.cohabitationYears === 'number'
      ? qp.survivor.cohabitationYears
      : undefined,
},


                    ...(hasTargets ? {
            targets: {
              invalidity: Number(qp.targets?.invalidityPctTarget ?? qp.targets?.invalidity ?? 0),
              death: Number(qp.targets?.deathPctTarget ?? qp.targets?.death ?? 0),
              retirement: Number(qp.targets?.retirementPctTarget ?? qp.targets?.retirement ?? 0),
            },
          } : {}),

          // 🔹 nouveaux champs carrière AVS
          startWorkYearCH:
            typeof qp.startWorkYearCH === 'number' ? qp.startWorkYearCH : undefined,

          missingYearsMode:
            qp.missingYearsMode === 'some' ? 'some'
            : qp.missingYearsMode === 'none' ? 'none'
            : undefined,

          missingYears: Array.isArray(qp.missingYears)
            ? qp.missingYears.filter((y: any) => Number.isFinite(y))
            : undefined,

          caregiving: (typeof qp?.caregiving?.hasCare === 'boolean' || Array.isArray(qp?.caregiving?.years))
            ? {
                hasCare: Boolean(qp.caregiving?.hasCare),
                years: Array.isArray(qp.caregiving?.years)
                  ? qp.caregiving.years.filter((y: any) => Number.isFinite(y))
                  : undefined,
              }
            : undefined,

        });
      } catch (e) {
        console.warn('[useQuickParamsLoad] read failed:', e);
        applyRef.current({});
      }
    })();
  }, [clientDocPath]); // <-- surtout PAS 'apply'
}
