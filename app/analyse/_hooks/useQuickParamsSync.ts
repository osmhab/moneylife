// app/analyse/_hooks/useQuickParamsSync.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

type Options = {
  clientDocPath?: string;
  token?: string | null;
  payload: any;
  debounceMs?: number;
  enabled?: boolean; // <--- ajout
};

type SyncState = {
  isSaving: boolean;
  lastSavedAt: Date | null;
  error: unknown;
};

export function useQuickParamsSync({
  clientDocPath,
  token,
  payload,
  debounceMs = 700,
  enabled = true,
}: Options): SyncState {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<unknown>(null);
  const tRef = useRef<number | null>(null);
  



  const stableJson = JSON.stringify(payload);

  useEffect(() => {
    if (!enabled) return;

   

    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(async () => {
      try {
        setIsSaving(true);
        setError(null);

                const uid = auth?.currentUser?.uid ?? null;

        // 🧼 Sanitize: normalise les quickParams avant persistance
const payloadSanitized = (() => {
  // JSON clone → retire automatiquement les undefined
  const p = JSON.parse(JSON.stringify(payload));

  // 1) Héritage ancien défaut
  if (p?.survivor?.ageAtWidowhood === 45) {
    delete p.survivor.ageAtWidowhood;
  }

  // 1bis) debutActiviteYear : nombre valide (1950..année courante) + miroir vers startWorkYearCH si absent
{
  const YNOW = new Date().getFullYear();
  if (
    typeof p.debutActiviteYear === 'number' &&
    Number.isFinite(p.debutActiviteYear) &&
    p.debutActiviteYear >= 1950 &&
    p.debutActiviteYear <= YNOW
  ) {
    // Miroir backward-compat
    if (typeof p.startWorkYearCH !== 'number' || !Number.isFinite(p.startWorkYearCH)) {
      p.startWorkYearCH = p.debutActiviteYear;
    }
  } else {
    delete p.debutActiviteYear;
  }
}


  // 2) startWorkYearCH : doit être un nombre valide
  if (typeof p.startWorkYearCH !== 'number' || !Number.isFinite(p.startWorkYearCH)) {
    delete p.startWorkYearCH;
  }

  // 3) Années sans cotisation : nouveau champ liste + compat 'missingYears'
{
  const fromList = Array.isArray(p.anneesSansCotisationList)
    ? p.anneesSansCotisationList.filter((y: any) => Number.isFinite(y))
    : [];

  if (fromList.length > 0) {
    // Source prioritaire → active le mode 'some' et reflète dans missingYears
    p.anneesSansCotisationList = fromList;
    p.missingYearsMode = 'some';
    p.missingYears = fromList;
  } else {
    // Pas de liste → on retombe sur l'ancien schéma/mode
    delete p.anneesSansCotisationList;
    if (p.missingYearsMode !== 'some') {
      p.missingYearsMode = 'none';
      p.missingYears = [];
    } else {
      p.missingYears = Array.isArray(p.missingYears)
        ? p.missingYears.filter((y: any) => Number.isFinite(y))
        : [];
    }
  }
}


  // 4) caregiving : objet stable { hasCare, years[] }
  const cg = p.caregiving ?? {};
  const hasCare = Boolean(cg.hasCare);
  const years = Array.isArray(cg.years)
    ? cg.years.filter((y: any) => Number.isFinite(y))
    : [];
  p.caregiving = {
    hasCare,
    years: hasCare ? years : [],
  };

  // 5) survivor étendu : partnerDesignated/cohabitationYears → normalisés si présents
  if (p.survivor) {
    if (typeof p.survivor.partnerDesignated !== 'boolean') {
      delete p.survivor.partnerDesignated;
    }
    if (typeof p.survivor.cohabitationYears !== 'number' || !Number.isFinite(p.survivor.cohabitationYears)) {
      delete p.survivor.cohabitationYears;
    }
  }

  // 6) targets : garder uniquement les % (déjà OK mais on s’assure de nombres)
  if (p.targets) {
    const t = p.targets;
    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const inv = num(t.invalidityPctTarget ?? t.invalidity);
    const dth = num(t.deathPctTarget ?? t.death);
    const ret = num(t.retirementPctTarget ?? t.retirement);
    p.targets = {
      ...(inv !== undefined ? { invalidityPctTarget: inv } : {}),
      ...(dth !== undefined ? { deathPctTarget: dth } : {}),
      ...(ret !== undefined ? { retirementPctTarget: ret } : {}),
    };
  }

  // clamp sécurité (facultatif)
if (p.targets) {
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  if (typeof p.targets.invalidityPctTarget === 'number')
    p.targets.invalidityPctTarget = clamp(p.targets.invalidityPctTarget, 0, 100);
  if (typeof p.targets.deathPctTarget === 'number')
    p.targets.deathPctTarget = clamp(p.targets.deathPctTarget, 0, 100);
  if (typeof p.targets.retirementPctTarget === 'number')
    p.targets.retirementPctTarget = clamp(p.targets.retirementPctTarget, 0, 100);
}


  // (Optionnel) Versionnage du schéma
  p.schemaVersion = 1;

  return p;
})();


        if (uid && db) {
  await setDoc(
    doc(db, `clients/${uid}`),
    { quickParams: payloadSanitized, anonymous: true, updatedAt: serverTimestamp() },
    { merge: true }
  );

  // ✅ miroir non bloquant côté token via API (Admin SDK)
  if (token) {
    try {
      await fetch(`/api/clients/${encodeURIComponent(token)}/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quickParams: payloadSanitized, project: null }),
      });
    } catch {
      // pas bloquant : on réessaiera au prochain change
    }
  }
} else if (token) {
  // pas d’uid (pas d’auth) → écrire au token via API
  const res = await fetch(`/api/clients/${encodeURIComponent(token)}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quickParams: payloadSanitized, project: null }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} else if (clientDocPath && db) {
  await setDoc(
    doc(db, clientDocPath),
    { quickParams: payloadSanitized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}



        setLastSavedAt(new Date());
      } catch (e) {
        setError(e);
        console.error('[useQuickParamsSync] save failed', e);
            } finally {
              setIsSaving(false);
              tRef.current = null;
            }

    }, debounceMs);

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
  }, [enabled, clientDocPath, token, stableJson, debounceMs]);

  return { isSaving, lastSavedAt, error };
}
