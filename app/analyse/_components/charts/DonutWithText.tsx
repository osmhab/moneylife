//app/analyse/_components/chart/DonutWithText.tsx

'use client';

import * as React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Seg = { label: string; value: number; source?: 'AVS' | 'LPP' | 'LAA' | 'P3' };

const COLOR_AVS = '#026EC8';
const COLOR_LPP = '#00B2D4';
const COLOR_P3  = '#4fd1c5';
const COLOR_LAA = '#0EA762';
const COLOR_GAP = '#F3F4F6';

function segColor(source?: 'AVS' | 'LPP' | 'LAA' | 'P3') {
  switch (source) {
    case 'AVS': return COLOR_AVS;
    case 'LPP': return COLOR_LPP;
    case 'P3':  return COLOR_P3;
    case 'LAA': return COLOR_LAA;
    default:    return COLOR_AVS;
  }
}

function pctStr(target: number, covered: number) {
  if (!target || target <= 0) return '0%';
  const p = Math.max(0, Math.min(100, Math.round((covered / target) * 100)));
  return `${p}%`;
}

/**
 * Donut style shadcn (track + segments), centre avec texte.
 * - Le cercle complet représente la CIBLE (target).
 * - Les arcs colorés représentent les PRESTATIONS couvertes (segments)
 *   + un "slice" transparent pour normaliser à target.
 */
export default function DonutWithText({
  target,
  covered,
  segments,
  height = 180,
  innerRadius = 58,
  outerRadius = 78,
  centerLabel,     // ex: "72%"
  centerSub,       // ex: "couverture"
}: {
  target: number;
  covered: number;
  segments: Seg[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const safeTarget  = Math.max(1, Math.round(target || 1));
  const safeCovered = Math.max(0, Math.min(safeTarget, Math.round(covered || 0)));

  // Limite chaque segment à la part restante jusqu'à "covered"
  let remaining = safeCovered;
  const parts = segments
    .map((s) => {
      if (remaining <= 0) return { ...s, value: 0 };
      const val = Math.max(0, Math.min(Math.round(s.value || 0), remaining));
      remaining -= val;
      return { ...s, value: val };
    })
    .filter((s) => s.value > 0);

  // Ajoute un slice transparent pour que la somme == target (normalisation)
  const gapSlice = safeTarget - parts.reduce((acc, s) => acc + s.value, 0);
  const data = [
    ...parts.map((p) => ({ name: p.label, value: p.value, color: segColor(p.source) })),
    ...(gapSlice > 0 ? [{ name: '_rest', value: gapSlice, color: 'transparent' }] : []),
  ];

  // Track derrière (plein cercle)
  const track = [{ name: 'track', value: safeTarget }];

  const label = centerLabel ?? pctStr(safeTarget, safeCovered);
  const sub   = centerSub   ?? 'couverture';

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Track gris */}
          <Pie
            data={track}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            isAnimationActive={false}
            stroke="none"
          >
            <Cell fill={COLOR_GAP} />
          </Pie>

          {/* Segments colorés (normalisés à target) */}
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            startAngle={90}
            endAngle={-270} // sens horaire
            stroke="none"
            isAnimationActive
            animationDuration={420}
          >
            {data.map((d, i) => (
              <Cell key={`cell-${i}`} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Centre avec texte */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-semibold leading-none">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}
