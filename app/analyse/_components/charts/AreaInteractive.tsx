'use client'

import * as React from 'react'
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
} from 'recharts'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

export type TimelinePoint = {
  t: string // YYYY-MM
  target: number
  covered: number
  // --- mode “classique”
  avs?: number
  lpp?: number
  laa?: number
  p3?: number
  // --- mode “invalidité détaillée”
  avsInvalid?: number
  avsInvalidChild?: number
  lppInvalid?: number
  lppInvalidChild?: number
  // ---
  gap?: number
}

export type AreaInteractiveProps = {
  title: string
  subtitle?: string
  unit: 'mois' | 'an'
  onUnitChange?: (u: 'mois' | 'an') => void
  data: TimelinePoint[]
  markers?: { x: string; label: string }[]
  showGap?: boolean
  className?: string
}

function formatCHF(n: number) {
  const v = Math.round(n)
  return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(v)
}

/** Détecte si les données sont en “invalidité détaillée” (nouvelles clés). */
function hasInvalidityDetailedShape(data: TimelinePoint[]): boolean {
  const first = data?.[0]
  if (!first) return false
  return (
    ('avsInvalid' in first) ||
    ('avsInvalidChild' in first) ||
    ('lppInvalid' in first) ||
    ('lppInvalidChild' in first)
  )
}

/** Renvoie la configuration des séries (clé, libellé, couleur) selon la forme des données. */
function getSeriesConfig(data: TimelinePoint[]) {
  const detailed = hasInvalidityDetailedShape(data)
  if (detailed) {
    return [
      { key: 'avsInvalid',       name: 'AVS/AI — Invalidité',         color: '#026EC8' },
      { key: 'avsInvalidChild',  name: 'AVS/AI — Enfant d’invalide',  color: '#5AA8E6' },
      { key: 'lppInvalid',       name: 'LPP — Invalidité',            color: '#00B2D4' },
      { key: 'lppInvalidChild',  name: 'LPP — Enfant invalidité',     color: '#6ADAE8' },
      { key: 'laa',              name: 'LAA',                         color: '#0EA762' },
      { key: 'p3',               name: '3e pilier',                   color: '#4fd1c5' },
    ] as const
  }
  return [
    { key: 'avs', name: 'AVS/AI', color: '#026EC8' },
    { key: 'lpp', name: 'LPP',    color: '#00B2D4' },
    { key: 'laa', name: 'LAA',    color: '#0EA762' },
    { key: 'p3',  name: '3e pilier', color: '#4fd1c5' },
  ] as const
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
  // Détermine les séries à représenter d’après les données
  const series = React.useMemo(() => getSeriesConfig(data), [data])

  // Visibilité par série (toutes visibles par défaut)
  const [vis, setVis] = React.useState<Record<string, boolean>>({})
  React.useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const s of series) next[s.key] = vis[s.key] ?? true
    setVis(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.map(s => s.key).join('|')])

  // Toggle helper
  const toggle = (key: string) => setVis(v => ({ ...v, [key]: !v[key] }))

  // Convert unit and scale dynamically all relevant keys
  const factor = unit === 'an' ? 12 : 1
  const scaled = React.useMemo(() => {
    const keysToScale = Array.from(
      new Set([
        'target', 'covered', 'gap',
        ...series.map(s => s.key),
      ])
    )
    return data.map(p => {
      const out: any = { ...p }
      for (const k of keysToScale) {
        const val = (p as any)[k]
        if (typeof val === 'number') out[k] = val * factor
        else if (k === 'gap') out[k] = ((p.gap ?? Math.max(0, p.target - p.covered)) * factor)
      }
      // Valeurs manquantes → 0 pour recharts
      for (const s of series) {
        if (typeof out[s.key] !== 'number') out[s.key] = 0
      }
      return out
    })
  }, [data, factor, series])

  const yFormatter = (v: number) => formatCHF(v)

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
          </div>

          <div className="flex items-center gap-6">
            {/* Unité */}
            <div className="flex items-center gap-2">
              <span className={cn('text-xs', unit === 'mois' && 'font-semibold')}>mois</span>
              <Switch
                checked={unit === 'an'}
                onCheckedChange={(checked: boolean) => onUnitChange?.(checked ? 'an' : 'mois')}
              />
              <span className={cn('text-xs', unit === 'an' && 'font-semibold')}>an</span>
            </div>

            {/* Toggles séries (dynamiques) */}
            <div className="hidden md:flex items-center gap-3 flex-wrap">
              {series.map(s => (
                <label key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  <span>{s.name}</span>
                  <Switch checked={!!vis[s.key]} onCheckedChange={() => toggle(s.key)} />
                </label>
              ))}
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="w-full h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scaled} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} interval={Math.max(0, Math.ceil(scaled.length / 12) - 1)} />
              <YAxis tickFormatter={yFormatter} width={80} />
              <Tooltip formatter={(value: any, name: string) => [formatCHF(Number(value)), name]} />
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



              {/* Séries empilées (dynamiques) */}
{series
  .filter(s => vis[s.key])
  .map(s => (
    <Area
      key={s.key}                 // ✅ clé unique
      type="stepAfter"            // escalier net
      dataKey={s.key}
      stackId="1"
      name={s.name}
      fill={s.color}
      stroke={s.color}
      isAnimationActive={false}   // évite lissage visuel
      strokeLinejoin="miter"      // (optionnel) bords carrés
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
                  isAnimationActive={false}   // ✅ pas d’animation
                />
              )}

              {/* Marqueurs */}
              {markers.map(m => (
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
  )
}
