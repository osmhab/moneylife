'use client';
import React from 'react';
import type { GapStack, GapSegment } from '../_hooks/useGaps';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

type Props = {
  title: string;
  data: GapStack;                 // { target, segments[], covered, gap }
  heightPx?: number;              // hauteur visuelle de la barre
  colors?: Partial<Record<'AVS'|'LPP'|'LAA'|'P3'|'gap', string>>;
};

const DEFAULT_COLORS = {
  AVS: '#0030A8',   // primary
  LPP: '#4fd1c5',   // success
  LAA: '#6b7280',   // gray-500
  P3:  '#10b981',   // emerald-500
  gap: '#F59E0B',   // amber-500
};

export default function GapBar({ title, data, heightPx = 180, colors = {} }: Props) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const { target, segments, gap } = data;
  const prefersReduced = useReducedMotion();

  // Normalisation (ne jamais dépasser la cible)
  const segs = normalize(segments, target);

  const totalCovered = Math.min(
    target,
    Math.max(0, segs.reduce((s, x) => s + (x.value || 0), 0))
  );

  const segsPct = segs.map(s => pct(s.value, target));
  const gapPct = pct(gap, target);

  const spring = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 250, damping: 28, mass: 0.7 };

  return (
    <div className="rounded-2xl border p-3 shadow-sm bg-white w-full">
      <div className="mb-2 text-sm font-semibold">{title}</div>

      {/* Barre verticale animée : segments (bottom-up) + lacune au-dessus */}
      <div className="flex items-end justify-center" style={{ height: heightPx }}>
        <div
          className="w-14 rounded-lg bg-gray-100 overflow-hidden flex flex-col-reverse"
          style={{ height: heightPx }}
          aria-label={`${title}: besoin ${fmtCHF(target)}/mois, couverture ${fmtCHF(totalCovered)}/mois, lacune ${fmtCHF(gap)}/mois`}
        >
          {/* Segments empilés */}
          <AnimatePresence initial={false}>
            {segsPct.map((p, i) =>
              p <= 0 ? null : (
                <motion.div
                  key={`${segs[i].label}-${i}`}
                  title={`${segs[i].label}: ${fmtCHF(segs[i].value)}/mois`}
                  initial={{ height: 0, opacity: 0.6 }}
                  animate={{ height: `${p * 100}%`, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring}
                  style={{ backgroundColor: C[(segs[i].source || 'LPP') as keyof typeof C] }}
                />
              )
            )}
          </AnimatePresence>

          {/* Lacune au-dessus */}
          <AnimatePresence initial={false}>
            {gapPct > 0 && (
              <motion.div
                key="gap"
                title={`Lacune: ${fmtCHF(gap)}/mois`}
                initial={{ height: 0, opacity: 0.6 }}
                animate={{ height: `${gapPct * 100}%`, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring}
                style={{ backgroundColor: C.gap }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Légende compacte avec micro animation des chiffres */}
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-600">
        <FadedLine>Besoin: <b>{fmtCHF(target)}/mois</b></FadedLine>
        <FadedLine className="text-right">Couverture: <b>{fmtCHF(totalCovered)}/mois</b></FadedLine>
        <FadedLine className="col-span-2">Lacune: <b className="text-amber-700">{fmtCHF(gap)}/mois</b></FadedLine>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function normalize(segments: GapSegment[], target: number) {
  const cleaned = segments.map(s => ({ ...s, value: Math.max(0, s.value || 0) }));
  const sum = cleaned.reduce((a, b) => a + b.value, 0);
  if (target <= 0 || sum <= target) return cleaned;
  const ratio = target / sum;
  return cleaned.map(s => ({ ...s, value: s.value * ratio }));
}

function pct(v: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, v / target));
}

function fmtCHF(n: number) {
  return Math.round(n).toLocaleString('fr-CH') + ' CHF';
}

/* Mini composant pour faire “fade-in” des lignes de légende */
function FadedLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}
