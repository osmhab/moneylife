'use client';
import React from 'react';
import type { NeedsSliders, GapsCtx, SurvivorContextLite, EventKind } from '../_hooks/useGaps';

type Props = {
  value: {
    targets: NeedsSliders;
    ctx: GapsCtx;
  };
  onChange: (next: Props['value']) => void;
};

export default function ParametresRapides({ value, onChange }: Props) {
  const { targets, ctx } = value;

  const updateTargets = (patch: Partial<NeedsSliders>) =>
    onChange({ ...value, targets: { ...targets, ...patch } });

  const updateCtx = (patch: Partial<GapsCtx>) =>
    onChange({ ...value, ctx: { ...ctx, ...patch, survivor: { ...ctx.survivor, ...(patch as any).survivor } } });

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="mb-3 text-sm font-semibold">Paramètres rapides</div>

      {/* Toggles événements */}
      <div className="grid gap-3 md:grid-cols-2">
        <ToggleRow
          label="Invalidité — Événement"
          value={ctx.eventInvalidity}
          onChange={(v) => updateCtx({ eventInvalidity: v })}
        />
        <ToggleRow
          label="Décès — Événement"
          value={ctx.eventDeath}
          onChange={(v) => updateCtx({ eventDeath: v })}
        />
      </div>

      {/* Sliders besoins */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Slider
          label="Besoin Invalidité"
          min={50} max={90} step={1}
          value={targets.invalidityPctTarget ?? 90}
          onChange={(n) => updateTargets({ invalidityPctTarget: n })}
          suffix="% (max 90%)"
        />
        <Slider
          label="Besoin Décès"
          min={60} max={100} step={1}
          value={targets.deathPctTarget ?? 80}
          onChange={(n) => updateTargets({ deathPctTarget: n })}
          suffix="%"
        />
        <Slider
          label="Besoin Retraite"
          min={60} max={100} step={1}
          value={targets.retirementPctTarget ?? 80}
          onChange={(n) => updateTargets({ retirementPctTarget: n })}
          suffix="%"
        />
      </div>

      {/* Contexte famille / invalidité */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Select
          label="État civil"
          value={ctx.survivor.maritalStatus}
          options={[
            'celibataire','marie','mariee','divorce','divorcee','partenariat_enregistre','concubinage'
          ]}
          onChange={(v) => updateCtx({ survivor: { ...ctx.survivor, maritalStatus: v as SurvivorContextLite['maritalStatus'] } })}
        />
        <NumberField
          label="Enfants (ayant droit)"
          value={ctx.childrenCount}
          min={0}
          onChange={(n) => updateCtx({ childrenCount: n, survivor: { ...ctx.survivor, hasChild: n > 0 } })}
        />
        <NumberField
          label="Double orphelins"
          value={ctx.doubleOrphans ?? 0}
          min={0}
          onChange={(n) => updateCtx({ doubleOrphans: n })}
          hint="Décès accident: certains plans majorent le double orphelin"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Slider
          label="Invalidité — degré"
          min={40} max={100} step={5}
          value={ctx.invalidityDegreePct}
          onChange={(n) => updateCtx({ invalidityDegreePct: n })}
          suffix="%"
        />
        <NumberField
          label="Heures/sem."
          value={ctx.weeklyHours ?? 0}
          min={0}
          onChange={(n) => updateCtx({ weeklyHours: n })}
          hint="≥ 8 h/sem → AANP (accidents non pro) couvert"
        />
      </div>
    </div>
  );
}

/* ---- sous-composants UI ---- */

function ToggleRow({ label, value, onChange }: {
  label: string;
  value: EventKind;
  onChange: (v: EventKind) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">{label}</div>
      <div className="inline-flex gap-1 rounded-xl border p-1">
        {(['maladie','accident'] as EventKind[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              'px-3 py-1 rounded-lg text-sm ' +
              (value === v ? 'bg-[#0030A8] text-white' : 'hover:bg-gray-50')
            }
          >
            {v === 'maladie' ? 'Maladie' : 'Accident'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-medium text-gray-800">{value}{suffix ? ' ' + suffix : ''}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#4fd1c5]"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, hint }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">{label}</div>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border px-3 py-1.5 text-sm"
      />
      {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-1.5 text-sm bg-white"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
