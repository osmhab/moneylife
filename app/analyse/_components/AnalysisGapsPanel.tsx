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

  const defaultCtx: GapsCtx = {
    eventInvalidity: 'maladie',
    eventDeath: 'maladie',
    invalidityDegreePct: 100,
    childrenCount: 0,
    doubleOrphans: 0,
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

  return (
    <section className="space-y-4">
      <ParametresRapides value={params} onChange={handleChange} />

      <div className="grid gap-3 md:grid-cols-3">
  <AnimatePresence mode="wait">
    <motion.div
      key={`inv-${params.ctx.eventInvalidity}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <GapBar title={`Invalidité (${params.ctx.eventInvalidity})`} data={out.invalidity.current} />
    </motion.div>
  </AnimatePresence>

  <AnimatePresence mode="wait">
    <motion.div
      key={`death-${params.ctx.eventDeath}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <GapBar title={`Décès (${params.ctx.eventDeath})`} data={out.death.current} />
    </motion.div>
  </AnimatePresence>

  <motion.div layout transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
    <GapBar title="Retraite" data={out.retirement} />
  </motion.div>
</div>
    </section>
  );
}
