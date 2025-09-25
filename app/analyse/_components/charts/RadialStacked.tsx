'use client';

import * as React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Source = 'AVS' | 'LPP' | 'LAA' | 'P3';
type Seg = { label: string; value: number; source?: Source };

const COLOR_AVS = '#026EC8';
const COLOR_LPP = '#00B2D4';
const COLOR_P3  = '#4fd1c5';  // success MoneyLife
const COLOR_LAA = '#0EA762';
const COLOR_TRACK = '#F3F4F6';

const SOURCE_COLORS: Record<Source, string> = {
  AVS: COLOR_AVS,
  LPP: COLOR_LPP,
  LAA: COLOR_LAA,
  P3:  COLOR_P3,
};

type PartName = Source | '_rest';
type Part = { name: PartName; value: number; color: string };


function aggregateBySource(segments: Seg[], target: number) {
  const safeTarget = Math.max(1, Math.round(target || 1));
  const totals: Record<Source, number> = { AVS: 0, LPP: 0, LAA: 0, P3: 0 };
  let remaining = safeTarget;

  for (const s of segments) {
    if (remaining <= 0) break;
    const src = (s.source ?? 'AVS') as Source;
    const v = Math.max(0, Math.min(Math.round(s.value || 0), remaining));
    if (v > 0) {
      totals[src] += v;
      remaining -= v;
    }
  }

  const parts: Part[] = (Object.keys(totals) as Source[])
    .filter((k) => totals[k] > 0)
    .map((k) => ({ name: k, value: totals[k], color: SOURCE_COLORS[k] }));

  const rest = safeTarget - parts.reduce((a, x) => a + x.value, 0);
  if (rest > 0) {
    parts.push({ name: '_rest', value: rest, color: 'transparent' });
  }

  return { parts, target: safeTarget };
}


export default function RadialStacked({
  inv,
  dec,
  ret,
  height = 220,
  ringWidth = 12,
  gap = 8,
  startInner = 44,
}: {
  inv: { target: number; segments: Seg[] };
  dec: { target: number; segments: Seg[] };
  ret: { target: number; segments: Seg[] };
  height?: number;
  ringWidth?: number;   // épaisseur de chaque anneau
  gap?: number;         // espace entre anneaux
  startInner?: number;  // rayon interne de l’anneau le plus intérieur
}) {
  // Prépare chaque anneau
  const rings = [
    { key: 'Invalidité', ...aggregateBySource(inv.segments || [], inv.target) },
    { key: 'Décès',      ...aggregateBySource(dec.segments || [], dec.target) },
    { key: 'Retraite',   ...aggregateBySource(ret.segments || [], ret.target) },
  ];

  // Calcule rayons concentriques
  const radii = rings.map((_, idx) => {
    const inner = startInner + idx * (ringWidth + gap);
    const outer = inner + ringWidth;
    return { inner, outer };
  });

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {rings.map((ring, idx) => {
            const { inner, outer } = radii[idx];

            // Track gris
            const track = [{ name: 'track', value: ring.target }];
            return (
              <React.Fragment key={ring.key}>
                <Pie
                  data={track}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={inner}
                  outerRadius={outer}
                  isAnimationActive={false}
                  stroke="none"
                >
                  <Cell fill={COLOR_TRACK} />
                </Pie>

                {/* parts colorées + reste transparent pour normaliser à target */}
                <Pie
                  data={ring.parts}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={inner}
                  outerRadius={outer}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive
                  animationDuration={420}
                  // coins légèrement arrondis pour le look shadcn
                  cornerRadius={6}
                >
                  {ring.parts.map((d, i) => (
                    <Cell key={`${ring.key}-cell-${i}`} fill={d.color} />
                  ))}
                </Pie>
              </React.Fragment>
            );
          })}
        </PieChart>
      </ResponsiveContainer>

      {/* Légendes d’anneaux (à droite, discrètes) */}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 space-y-1.5 pr-1 text-xs text-muted-foreground">
        {rings.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{
                width: 6,
                height: 6,
                background:
                  'linear-gradient(90deg,' +
                  `${COLOR_AVS},${COLOR_LPP},${COLOR_LAA},${COLOR_P3}` +
                  ')',
              }}
            />
            <span>{r.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
