'use client';
import * as React from 'react';
import Link from 'next/link';
import { Segmented as UISegmented } from '@/components/ui/segmented';

type Stack = { target: number; covered: number; gap: number; details?: Array<{label:string; value:number; source?:string}> };

export default function InvalidityClient({
  id, clientDocPath, invalidity, meta
}: {
  id: string;
  clientDocPath: string;
  invalidity?: { current?: Stack|null; maladie?: Stack|null; accident?: Stack|null } | null;
  meta?: { unit?: 'monthly'|'annual' } | null;
}) {
  const [unit, setUnit] = React.useState<'mois'|'an'>(meta?.unit === 'annual' ? 'an' : 'mois');
  const [view, setView] = React.useState<'current'|'maladie'|'accident'>('current');

  const stack = (invalidity?.[view] ?? null) as Stack | null;

  const toDisp = (n?: number) => {
    const v = Math.max(0, Math.round(Number(n ?? 0)));
    return unit === 'an' ? v * 12 : v;
  };
  const fmt = (n:number) => n.toLocaleString('fr-CH', { maximumFractionDigits: 0 }).replace(/,/g,"'");

  const pct = React.useMemo(() => stack && stack.target ? Math.min(100, Math.round((stack.covered/stack.target)*100)) : null, [stack]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Invalidité — Prestations sauvegardées</h1>
        <div className="flex items-center gap-3">
          <UISegmented value={view} onValueChange={(v)=>setView((v as any) ?? 'current')}
            items={[{value:'current',label:'Courant'},{value:'maladie',label:'Maladie'},{value:'accident',label:'Accident'}]}
            className="bg-muted/40 p-0.5 border-transparent shadow-none" />
          <UISegmented value={unit} onValueChange={(v)=>setUnit((v as any) ?? 'mois')}
            items={[{value:'mois',label:'CHF/mois'},{value:'an',label:'CHF/an'}]}
            className="bg-muted/40 p-0.5 border-transparent shadow-none" />
          <Link href={`/analyse/${id}`} className="text-primary hover:underline">← Retour</Link>
        </div>
      </div>

      {!stack ? (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          Aucune donnée {view} dans <span className="font-mono">{clientDocPath}</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Objectif</div><div className="text-lg font-semibold">{fmt(toDisp(stack.target))}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Prestations</div><div className="text-lg font-semibold">{fmt(toDisp(stack.covered))}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Lacune</div><div className="text-lg font-semibold">{fmt(toDisp(stack.gap))}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">% de couverture</div><div className="text-lg font-semibold">{pct ?? '—'}%</div></div>
        </div>
      )}
    </div>
  );
}
