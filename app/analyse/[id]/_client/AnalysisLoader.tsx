'use client';

import React from 'react';
import GapsAndCardsClient from '../../_components/GapsAndCardsClient';

// ↓ Si tu as un composant Skeleton shadcn, tu peux l'utiliser ici. Sinon petit placeholder:
function Skeleton({ className }: { className?: string }) {
  return <div className={['animate-pulse rounded-lg bg-gray-100 h-6', className].filter(Boolean).join(' ')} />;
}

type AnalysisData = {
  // Adapte la forme à ta réponse API / Firestore
  annualIncome: number;
  avs: any;
  lpp: any;
  survivorDefault: any;
  laaParams?: any;
  initialTargets?: any;
  initialCtx?: any;
  thirdPillar?: any;
  sex?: 'F' | 'M';
};

async function fetchJSON<T>(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 12000, ...init } = opts ?? {};
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Essaie d’abord une route "officielle" (par ex. /api/analyses/[id]).
 * Si tu n’en as pas, garde un seul endpoint que tu possèdes déjà (ex: /api/jobs/aggregate?token=...).
 * IMPORTANT: côté client uniquement, donc aucun risque de bloquer le build.
 */
async function loadAnalysis(id: string): Promise<AnalysisData> {
    // 1) Essaie une route API dédiée (on la crée à l'étape 3)
    try {
      return await fetchJSON<AnalysisData>(`/api/analyses/${encodeURIComponent(id)}`);
    } catch (_) {
      // 2) (optionnel) tente une autre route interne si tu en as une
      // try {
      //   const agg = await fetchJSON<any>(`/api/aggregate?id=${encodeURIComponent(id)}`);
      //   return {
      //     annualIncome: agg.annualIncome ?? 95000,
      //     avs: agg.avs,
      //     lpp: agg.lpp,
      //     survivorDefault: agg.survivorDefault ?? { maritalStatus: 'celibataire' },
      //     laaParams: agg.laaParams,
      //     initialTargets: agg.initialTargets,
      //     initialCtx: agg.initialCtx,
      //     thirdPillar: agg.thirdPillar,
      //     sex: agg.sex ?? undefined,
      //   };
      // } catch {}
  
      // 3) Fallback local (mock) => te garantit un rendu même sans backend prêt
      return {
        annualIncome: 95000,
        avs: {
          invalidityMonthly: 1976,      // AI adulte (exemple des logs)
          invalidityChildMonthly: 790,  // par enfant
          widowMonthly: 1580,
          childMonthly: 790,
        },
        lpp: {
          // valeurs minimales "safe" pour éviter NaN côté calcul
          invalidityMonthly: 0,
          childMonthly: 0,
          widowMonthly: 0,
          orphanMonthly: 0,
          retirementMonthly: 0,
          // ajoute ici tout champ requis par ton type LppInputs si nécessaire
        },
        survivorDefault: { maritalStatus: 'celibataire' },
        laaParams: undefined,
        initialTargets: { invalidityPctTarget: 70, deathPctTarget: 70, retirementPctTarget: 70 },
        initialCtx: { childrenCount: 0, invalidityDegreePct: 100 },
        thirdPillar: {},
        sex: undefined,
      };
    }
  }
  

export default function AnalysisLoader({ id }: { id: string }) {
  const [state, setState] = React.useState<'idle'|'loading'|'ready'|'error'>('loading');
  const [data, setData] = React.useState<AnalysisData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setState('loading');
    setErr(null);
    loadAnalysis(id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? 'Erreur inconnue');
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state === 'loading') {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <div className="text-xl md:text-2xl font-semibold">Chargement de l’analyse…</div>
          <p className="text-sm text-muted-foreground">Merci de patienter.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border bg-white p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="rounded-2xl border bg-white p-6 space-y-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="rounded-2xl border bg-white p-6 space-y-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        <h1 className="text-xl md:text-2xl font-semibold mb-2">Analyse indisponible</h1>
        <p className="text-sm text-muted-foreground">
          Impossible de charger l’analyse <span className="font-mono">#{id}</span>. {err ? `(${err})` : ''}
        </p>
      </div>
    );
  }

  // ✅ Données prêtes → on affiche ton composant existant
  return (
    <GapsAndCardsClient
      annualIncome={data.annualIncome}
      avs={data.avs}
      lpp={data.lpp}
      survivorDefault={data.survivorDefault}
      laaParams={data.laaParams}
      initialTargets={data.initialTargets}
      initialCtx={data.initialCtx}
      thirdPillar={data.thirdPillar}
      sex={data.sex}
      onParamsChange={() => {}}
    />
  );
}
