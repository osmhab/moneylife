'use client';

import * as React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
  ComposedChart,
  Line,
} from 'recharts';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

/**
 * Type de point de la timeline. On y ajoute un index signature
 * pour autoriser des clés dynamiques (ex. avsInvalidChild_1, lppInvalidChild_2, etc.).
 */
export type TimelinePoint = {
  t: string;      // YYYY-MM
  target: number;
  covered: number;
  gap?: number;
  avs?: number;
  lpp?: number;
  laa?: number;
  p3?: number;
  avsInvalid?: number;
  avsInvalidChild?: number;
  lppInvalid?: number;
  lppInvalidChild?: number;
  [key: string]: any; // autorise les clés dynamiques avsInvalidChild_X, lppInvalidChild_X, etc.
};

export type AreaInteractiveProps = {
  title: string;
  subtitle?: string;
  unit: 'mois' | 'an';
  onUnitChange?: (u: 'mois' | 'an') => void;
  data: TimelinePoint[];
  markers?: { x: string; label: string }[];
  showGap?: boolean;
  className?: string;
};

/** Formate un nombre en CHF. */
function formatCHF(n: number) {
  const v = Math.round(n);
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Éclaircit une couleur hexadécimale en la rapprochant du blanc.
 * Facteur = 0 signifie couleur d’origine, 1 signifie blanc complet.
 */
function lighten(hex: string, factor: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, x));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = clamp(Math.round(r + (255 - r) * factor));
  const ng = clamp(Math.round(g + (255 - g) * factor));
  const nb = clamp(Math.round(b + (255 - b) * factor));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * Génère la configuration des séries (clé, nom, couleur) en fonction des données.
 * Elle détecte les clés dynamiques pour les enfants (suffixes _1, _2, ...).
 */
function getSeriesConfig(data: TimelinePoint[]) {
  if (!data || data.length === 0) {
    return [] as const;
  }
  const first = data[0] as any;
  const keys = Object.keys(first).filter(
    (k) =>
      typeof first[k] === 'number' &&
      !['t', 'target', 'covered', 'gap'].includes(k),
  );

  // Sépare les clés en catégories
  const dynamicAvsChildren = keys.filter((k) => /^avsInvalidChild_\d+$/.test(k));
  const dynamicLppChildren = keys.filter((k) => /^lppInvalidChild_\d+$/.test(k));
  const hasDynamic = dynamicAvsChildren.length > 0 || dynamicLppChildren.length > 0;

  // Série de sortie
  const series: Array<{ key: string; name: string; color: string }> = [];

  // AVS/AI adulte invalidité
  if (keys.includes('avsInvalid')) {
    series.push({
      key: 'avsInvalid',
      name: 'AVS/AI — Invalidité',
      color: '#026EC8',
    });
  }
  // Séries enfants AVS/AI
  if (dynamicAvsChildren.length > 0) {
    dynamicAvsChildren.sort();
    dynamicAvsChildren.forEach((k, idx) => {
      series.push({
        key: k,
        name: `AVS/AI — Enfant ${idx + 1}`,
        color: lighten('#026EC8', 0.2 + idx * 0.2),
      });
    });
  } else if (keys.includes('avsInvalidChild')) {
    series.push({
      key: 'avsInvalidChild',
      name: 'AVS/AI — Enfant d’invalide',
      color: '#5AA8E6',
    });
  }

  // LPP adulte invalidité
  if (keys.includes('lppInvalid')) {
    series.push({
      key: 'lppInvalid',
      name: 'LPP — Invalidité',
      color: '#00B2D4',
    });
  }
  // Séries enfants LPP
  if (dynamicLppChildren.length > 0) {
    dynamicLppChildren.sort();
    dynamicLppChildren.forEach((k, idx) => {
      series.push({
        key: k,
        name: `LPP — Enfant ${idx + 1}`,
        color: lighten('#00B2D4', 0.2 + idx * 0.2),
      });
    });
  } else if (keys.includes('lppInvalidChild')) {
    series.push({
      key: 'lppInvalidChild',
      name: 'LPP — Enfant invalidité',
      color: '#6ADAE8',
    });
  }

  // Autres sources
  if (keys.includes('laa')) {
    series.push({ key: 'laa', name: 'LAA', color: '#0EA762' });
  }
  if (keys.includes('p3')) {
    series.push({ key: 'p3', name: '3e pilier', color: '#4fd1c5' });
  }

  // Cas agrégé (retraite/décès)
  if (!hasDynamic) {
    // Ces clés n’existent que pour d’autres thèmes
    if (keys.includes('avs')) {
      series.push({ key: 'avs', name: 'AVS/AI', color: '#026EC8' });
    }
    if (keys.includes('lpp')) {
      series.push({ key: 'lpp', name: 'LPP', color: '#00B2D4' });
    }
  }

  return series;
}

export default function AreaInteractive({
  title,
  subtitle,
  unit,
  onUnitChange,
  data,
  markers = [],
  showGap = true,
  className,
}: AreaInteractiveProps) {
  // Détermine la config des séries en fonction des données
  const series = React.useMemo(() => getSeriesConfig(data), [data]);

  // Suivi de visibilité par série
  const [vis, setVis] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const s of series) next[s.key] = vis[s.key] ?? true;
    setVis(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.map((s) => s.key).join('|')]);

  // Toggle helper
  const toggle = (key: string) => setVis((v) => ({ ...v, [key]: !v[key] }));

  // Ajuste toutes les valeurs selon l’unité (mensuel/annuel)
const factor = unit === 'an' ? 12 : 1;
const scaled = React.useMemo(() => {
  // Liste des clés numériques à mettre à l’échelle
  const keysToScale = Array.from(
    new Set(['target', 'covered', 'gap', ...series.map((s) => s.key)]),
  );
  return data.map((p) => {
    const out: any = { ...p };
    for (const k of keysToScale) {
      const val = (p as any)[k];
      if (typeof val === 'number') {
        out[k] = val * factor;
      } else if (k === 'gap') {
        // recalculer gap si manquant
        // ✅ on retire le “?? 0” car l’opérande de gauche est déjà un nombre
        out[k] =
          (p.gap ?? Math.max(0, (p.target ?? 0) - (p.covered ?? 0))) * factor;
      }
    }
    // Initialise les clés manquantes à 0 pour recharts
    for (const s of series) {
      if (typeof out[s.key] !== 'number') out[s.key] = 0;
    }
    return out;
  });
}, [data, factor, series]);


  const yFormatter = (v: number) => formatCHF(v);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            {subtitle && (
              <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-6">
            {/* Unité */}
            <div className="flex items-center gap-2">
              <span className={cn('text-xs', unit === 'mois' && 'font-semibold')}>
                mois
              </span>
              <Switch
                checked={unit === 'an'}
                onCheckedChange={(checked: boolean) =>
                  onUnitChange?.(checked ? 'an' : 'mois')
                }
              />
              <span className={cn('text-xs', unit === 'an' && 'font-semibold')}>
                an
              </span>
            </div>
            {/* Toggles séries */}
            <div className="hidden md:flex items-center gap-3 flex-wrap">
              {series.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                    <span>{s.name}</span>
                    <Switch
                      checked={!!vis[s.key]}
                      onCheckedChange={() => toggle(s.key)}
                    />
                  </label>
                ))}
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="w-full h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={scaled}
              margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11 }}
                interval={Math.max(0, Math.ceil(scaled.length / 12) - 1)}
              />
              <YAxis tickFormatter={yFormatter} width={80} />
              <Tooltip
                formatter={(value: any, name: string) => [
                  formatCHF(Number(value)),
                  name,
                ]}
              />
              <Legend />

              {/* Cible */}
              <Line
                type="stepAfter"
                dataKey="target"
                name="Cible"
                stroke="#0030A8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />

              {/* Séries empilées */}
              {series
                .filter((s) => vis[s.key])
                .map((s) => (
                  <Area
                    key={s.key}
                    type="stepAfter"
                    dataKey={s.key}
                    stackId="1"
                    name={s.name}
                    fill={s.color}
                    stroke={s.color}
                    isAnimationActive={false}
                    strokeLinejoin="miter"
                  />
                ))}

              {/* Lacune */}
              {showGap && (
                <Area
                  type="step"
                  dataKey="gap"
                  name="Lacune"
                  fill="#E5E7EB"
                  stroke="#9CA3AF"
                  opacity={0.6}
                  isAnimationActive={false}
                />
              )}

              {/* Marqueurs */}
              {markers.map((m) => (
                <ReferenceLine
                  key={m.x}
                  x={m.x}
                  stroke="#111827"
                  strokeDasharray="3 3"
                  label={{ value: m.label, position: 'top', fontSize: 11 }}
                />
              ))}

              <Brush dataKey="t" height={24} travellerWidth={8} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
