// app/analyse/_hooks/usePrestationsSync.ts
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

type GapSegment = { label: string; value: number; source?: 'AVS' | 'LPP' | 'LAA' | 'P3' };
type GapStack = { target: number; covered: number; gap: number; segments?: GapSegment[] };

type GapsShape = {
  invalidity: { maladie: GapStack; accident: GapStack; current: GapStack };
  death: {
    maladie: GapStack;
    accident: GapStack;
    current: GapStack;
    capital?: { lpp?: number; total?: number; p3?: number; other?: number };
  };
  retirement: GapStack;
};


function isPlainObject(v: any) {
  return v && typeof v === 'object' && (v.constructor === Object || Object.getPrototypeOf(v) === null);
}

function sanitizeForFirestore(input: any): any {
  if (input === undefined) return null;
  if (input === null) return null;

  const t = typeof input;
  if (t === 'number') return Number.isFinite(input) ? input : null;
  if (t === 'string' || t === 'boolean') return input;

  if (Array.isArray(input)) return input.map(sanitizeForFirestore);

  if (isPlainObject(input)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      const sv = sanitizeForFirestore(v);
      out[k] = sv === undefined ? null : sv;
    }
    return out;
  }
  // FieldValue (ex: serverTimestamp) ou autres types → on laisse passer tel quel
  return input;
}

function extractBreakdown(g: GapStack) {
  const details = (g.segments ?? []).map((s) => ({
    label: s.label,
    value: Math.max(0, Math.round(Number(s.value ?? 0))),
    source: s.source ?? null,
  }));


  const sumBy = (src: 'AVS' | 'LPP' | 'LAA' | 'P3') =>
    Math.max(
      0,
      Math.round(
        (g.segments ?? [])
          .filter((s) => s.source === src)
          .reduce((s, x) => s + Number(x.value || 0), 0)
      )
    );







  // mini normalisation utile côté UI (composants par source)
  let aiAdult = 0, aiChild = 0, lppAdult = 0, lppChild = 0, laaConjoint = 0, laaOrphans = 0, p3 = 0;
  for (const seg of (g.segments ?? [])) {
    const val = Math.max(0, Math.round(Number(seg.value || 0)));
    const lbl = (seg.label || '').toLowerCase();
    const src = seg.source;
    if (src === 'AVS') {
  // Compte les enfants AVS/AI uniquement si le libellé mentionne explicitement "enfant d'invalide" / "orphelin"
  if (/\benfant d[’']?invalid|\borphelin\b/i.test(lbl)) aiChild += val;
  else aiAdult += val;
}
 else if (src === 'LPP') {
      if (lbl.includes('enfant')) lppChild += val; else lppAdult += val;
    } else if (src === 'LAA') {
      if (lbl.includes('conjoint')) laaConjoint += val;
      else if (lbl.includes('orphelin')) laaOrphans += val;
    } else if (src === 'P3') {
      p3 += val;
    }
  }

  return {
    target: Math.max(0, Math.round(g.target)),
    covered: Math.max(0, Math.round(g.covered)),
    gap: Math.max(0, Math.round(g.gap)),
    bySource: { AVS: sumBy('AVS'), LPP: sumBy('LPP'), LAA: sumBy('LAA'), P3: sumBy('P3') },
    components: { aiAdult, aiChild, lppAdult, lppChild, laaConjoint, laaOrphans, p3 },
    details,
  };
}

function normalizeDeathCapital(c: any) {
  const lpp = Math.max(0, Math.round(Number(c?.lpp ?? 0)));
  const p3 = Math.max(0, Math.round(Number(c?.p3 ?? 0)));
  const other = Math.max(0, Math.round(Number(c?.other ?? 0)));
  const total = Math.max(0, Math.round(Number(c?.total ?? (lpp + p3 + other))));
  const out: any = { total };
  if (lpp) out.lpp = lpp;
  if (p3) out.p3 = p3;
  if (other) out.other = other;
  return out;
}


export function usePrestationsSync({
  clientDocPath,
  token,
  gaps,
  unit = 'monthly',
  enabled = true,
  debounceMs = 800,
}: {
  clientDocPath?: string;
  token?: string | null;
  gaps: GapsShape;
  unit?: 'monthly' | 'annual';
  enabled?: boolean;
  debounceMs?: number;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSig = useRef<string | null>(null);

  // 🔗 même emplacement que quickParams : clientDocPath > clients/{uid} > clients/{token}
  const resolvedPath =
    (clientDocPath && clientDocPath.trim()) ||
    (auth?.currentUser?.uid ? `clients/${auth.currentUser.uid}` : '') ||
    (token ? `clients/${token}` : '');

  // Payloads mémoïsés
  const deathCapital = (gaps as any)?.death?.capital;

const prestationsPayload = useMemo(
  () => ({
    invalidity: {
      maladie: extractBreakdown(gaps.invalidity.maladie),
      accident: extractBreakdown(gaps.invalidity.accident),
      current: extractBreakdown(gaps.invalidity.current),
    },
    death: {
      maladie: extractBreakdown(gaps.death.maladie),
      accident: extractBreakdown(gaps.death.accident),
      current: extractBreakdown(gaps.death.current),
      ...(deathCapital ? { capital: normalizeDeathCapital(deathCapital) } : {}),
    },
    retirement: extractBreakdown(gaps.retirement),
  }),
  [gaps, deathCapital]
);


  const firestorePayload = useMemo(
    () => ({
      prestations: prestationsPayload,
      prestationsMeta: {
        unit,
        updatedAt: serverTimestamp(),         // Firestore sentinel (ok côté client)
        source: 'useGaps@client',
        version: 1,
      },
    }),
    [prestationsPayload, unit]
  );

  // Corps API (sans serverTimestamp → le backend peut timestamp-er)
  const apiBody = useMemo(
    () => ({
      prestations: prestationsPayload,
      prestationsMeta: {
        unit,
        source: 'useGaps@client',
        version: 1,
      },
    }),
    [prestationsPayload, unit]
  );

  // Signature (évite réécritures inutiles) + tient compte de l'unité
  const signature = useMemo(() => JSON.stringify(prestationsPayload), [prestationsPayload]);
  const writeKey = `${signature}|${unit}`;

  useEffect(() => {
    if (!enabled || !resolvedPath) return;

    // sécurité: doc path = nb de segments pair
    const segs = resolvedPath.split('/').filter(Boolean);
    if (segs.length % 2 !== 0) return;

    const h = setTimeout(async () => {
      if (writeKey === lastSig.current) return;

      setSaving(true);
      setError(null);
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[usePrestationsSync] write →', { path: resolvedPath, unit });
        }

        // 1) Tentative Firestore (merge)
        const ref = doc(db, resolvedPath);
        await setDoc(ref, sanitizeForFirestore(firestorePayload), { merge: true });

        // 2) Miroir API (non bloquant), comme pour quickParams
        if (token) {
          try {
            await fetch(`/api/clients/${encodeURIComponent(token)}/save`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(apiBody),
            });
          } catch {
            /* non bloquant */
          }
        }

        lastSig.current = writeKey;
      } catch (e: any) {
        // Firestore a échoué (permissions, offline, etc.) → fallback API si possible
        if (token) {
          try {
            await fetch(`/api/clients/${encodeURIComponent(token)}/save`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(apiBody),
            });
            lastSig.current = writeKey; // succès via API
          } catch (apiErr: any) {
            console.error('[usePrestationsSync] API fallback failed', apiErr);
            setError(apiErr?.message || 'Erreur sauvegarde prestations (API)');
          }
        } else {
          console.error('[usePrestationsSync] write error', e);
          setError(e?.message || 'Erreur sauvegarde prestations');
        }
      } finally {
        setSaving(false);
      }
    }, debounceMs);

    return () => clearTimeout(h);
  }, [resolvedPath, writeKey, unit, enabled, debounceMs, firestorePayload, apiBody, token]);

  return { saving, error };
}
