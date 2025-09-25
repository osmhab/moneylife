// app/analyse/_components/AnalysisGapsPanel.tsx

'use client';
import React, { useState } from 'react';
import ParametresRapides from './ParametresRapides';
import GapBar from './GapBar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useGaps,
  type AvsInputs,
  type LppInputs,
  type LaaParams,
  type GapsCtx,
  type NeedsSliders,
  type SurvivorContextLite,
  type EventKind,
} from '../_hooks/useGaps';

type Props = {
  annualIncome: number;
  avs: AvsInputs;
  lpp: LppInputs;
  survivorDefault: SurvivorContextLite;
  laaParams?: LaaParams;
  initialTargets?: NeedsSliders; // { invalidityPctTarget?, deathPctTarget?, retirementPctTarget? }
  initialCtx?: Partial<GapsCtx>;
  thirdPillar?: { invalidityMonthly?: number; deathMonthly?: number; retirementMonthly?: number };
  onParamsChange?: (next: { targets: NeedsSliders; ctx: GapsCtx }) => void; // autosave optionnel
};

export default function AnalysisGapsPanel(props: Props) {
  const {
    annualIncome, avs, lpp, survivorDefault, laaParams,
    initialTargets, initialCtx, thirdPillar, onParamsChange,
  } = props;

  // ---- fusion propre de initialCtx (sans dupliquer "survivor") ----
  const init = initialCtx ?? {};
  const initSurvivor: Partial<SurvivorContextLite> = (init as any).survivor ?? {};
  const { survivor: _omit, ...initRest } = init; // retire "survivor" du reste

  const survivorMerged: SurvivorContextLite = {
    ...survivorDefault,
    ...initSurvivor,
    hasChild: (initSurvivor.hasChild ?? survivorDefault.hasChild) ?? false,
  };

  // v4.2 : plus de doubleOrphans ici
  const defaultCtx: GapsCtx = {
    eventInvalidity: 'maladie',
    eventDeath: 'maladie',
    invalidityDegreePct: 100,
    childrenCount: 0,
    weeklyHours: undefined,
    ...initRest,
    survivor: survivorMerged,
  };

  const [params, setParams] = useState<{
    targets: NeedsSliders;
    ctx: GapsCtx;
  }>({
    targets: {
      invalidityPctTarget: initialTargets?.invalidityPctTarget ?? 90,
      deathPctTarget: initialTargets?.deathPctTarget ?? 80,
      retirementPctTarget: initialTargets?.retirementPctTarget ?? 80,
    },
    ctx: defaultCtx,
  });

  const out = useGaps({
    annualIncome,
    targets: params.targets,
    avs,
    lpp,
    ctx: params.ctx,
    laaParams,
    thirdPillar,
  });

  const handleChange = (next: typeof params) => {
    setParams(next);
    onParamsChange?.(next);
  };

  // --- petits toggles réutilisables (Maladie / Accident) ---
  function EventToggle({
    value,
    onChange,
    ariaLabel,
  }: {
    value: EventKind;
    onChange: (v: EventKind) => void;
    ariaLabel: string;
  }) {
    return (
      <div className="inline-flex gap-1 rounded-xl border p-1" aria-label={ariaLabel}>
        {(['maladie','accident'] as EventKind[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              'px-3 py-1 rounded-lg text-xs ' +
              (value === v ? 'bg-[#0030A8] text-white' : 'hover:bg-gray-50')
            }
            aria-pressed={value === v}
          >
            {v === 'maladie' ? 'Maladie' : 'Accident'}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Panneau des paramètres rapides (sans toggles évènement désormais) */}
      <ParametresRapides value={params} onChange={handleChange} />

      {/* Cartes graphiques : Invalidité / Décès / Retraite */}
      <div className="grid gap-3 md:grid-cols-3">
        {/* Invalidité */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`inv-${params.ctx.eventInvalidity}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Invalidité</h3>
              <EventToggle
                value={params.ctx.eventInvalidity}
                onChange={(v) =>
                  handleChange({ ...params, ctx: { ...params.ctx, eventInvalidity: v } })
                }
                ariaLabel="Invalidité — Événement"
              />
            </div>
            <GapBar title={`(${params.ctx.eventInvalidity})`} data={out.invalidity.current} />
          </motion.div>
        </AnimatePresence>

        {/* Décès */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`death-${params.ctx.eventDeath}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Décès</h3>
              <EventToggle
                value={params.ctx.eventDeath}
                onChange={(v) =>
                  handleChange({ ...params, ctx: { ...params.ctx, eventDeath: v } })
                }
                ariaLabel="Décès — Événement"
              />
            </div>
            <GapBar title={`(${params.ctx.eventDeath})`} data={out.death.current} />
          </motion.div>
        </AnimatePresence>

        {/* Retraite (pas de toggle ici) */}
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          className="rounded-2xl border bg-white p-3"
        >
          <h3 className="mb-2 text-sm font-semibold">Retraite</h3>
          <GapBar title="" data={out.retirement} />
        </motion.div>
      </div>
    </section>
  );
}
