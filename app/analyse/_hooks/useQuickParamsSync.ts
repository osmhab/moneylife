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
  const justEnabledRef = useRef(true); // skip 1er save après enable

  // reset du skip quand enabled passe de false -> true
  const prevEnabled = useRef(enabled);
  useEffect(() => {
    if (!prevEnabled.current && enabled) {
      justEnabledRef.current = true;
    }
    prevEnabled.current = enabled;
  }, [enabled]);

  const stableJson = JSON.stringify(payload);

  useEffect(() => {
    if (!enabled) return;

    // saute une seule fois le 1er tir après enable
    if (justEnabledRef.current) {
      justEnabledRef.current = false;
      return;
    }

    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(async () => {
      try {
        setIsSaving(true);
        setError(null);

        const uid = auth?.currentUser?.uid ?? null;

        if (uid && db) {
          await setDoc(
            doc(db, `clients/${uid}`),
            { quickParams: payload, anonymous: false, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } else if (token) {
          const res = await fetch(`/api/clients/${encodeURIComponent(token)}/save`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ quickParams: payload, project: null }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else if (clientDocPath && db) {
          await setDoc(
            doc(db, clientDocPath),
            { quickParams: payload, updatedAt: serverTimestamp() },
            { merge: true }
          );
        }

        setLastSavedAt(new Date());
      } catch (e) {
        setError(e);
        console.error('[useQuickParamsSync] save failed', e);
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
  }, [enabled, clientDocPath, token, stableJson, debounceMs]);

  return { isSaving, lastSavedAt, error };
}
