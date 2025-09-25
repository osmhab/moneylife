'use client';

import * as React from 'react';

type SaveFn = (patch: any) => Promise<void>;

export function useAutosaveAnalysis(id: string, opts?: { debounceMs?: number; maxRetries?: number }): SaveFn {
  const debounceMs = opts?.debounceMs ?? 500;
  const maxRetries = opts?.maxRetries ?? 2;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = React.useRef<any | null>(null); // dernier patch en attente
  const inflight = React.useRef(false);
  const retries = React.useRef(0);

  const flush = React.useCallback(async () => {
    if (inflight.current || !queue.current) return;
    inflight.current = true;
    const payload = queue.current; // consomme le patch courant
    queue.current = null;
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(id)}/save`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // headers: { 'Content-Type': 'application/json', 'X-Client-Token': id },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      retries.current = 0;
    } catch (e) {
      // on remet en file et on retente
      queue.current = { ...(queue.current ?? {}), ...payload };
      if (retries.current < maxRetries) {
        retries.current += 1;
        setTimeout(flush, 800);
      } else {
        // on abandonne silencieusement (ou toast si tu veux)
        retries.current = 0;
      }
    } finally {
      inflight.current = false;
      // si entre-temps on a empilé un nouveau patch:
      if (queue.current) setTimeout(flush, 0);
    }
  }, [id]);

  return React.useCallback(async (patch: any) => {
    // merge progressif
    queue.current = { ...(queue.current ?? {}), ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceMs);
  }, [debounceMs, flush]);
}
