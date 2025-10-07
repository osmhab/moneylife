// app/analyse/_components/ParametresRapides.tsx
'use client';
import React from 'react';
import type { NeedsSliders, GapsCtx, SurvivorContextLite } from '../_hooks/useGaps';

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
    onChange({
      ...value,
      ctx: {
        ...ctx,
        ...patch,
        survivor: { ...ctx.survivor, ...(patch as any).survivor },
      },
    });

  // Helper pour le switch >8h/sem. sans changer les types existants :
  const travaillePlusDe8h = (ctx.weeklyHours ?? 0) >= 8;
  const setTravaillePlusDe8h = (yes: boolean) =>
    updateCtx({ weeklyHours: yes ? 9 : 0 }); // 9 = >=8h, 0 = <8h

  // Champs “carrière AVS” (stockés dans ctx en souplesse pour éviter les erreurs TS)
const debutActiviteYear = (ctx as any)?.debutActiviteYear as number | undefined;
const anneesSansCotisationList = ((ctx as any)?.anneesSansCotisationList as number[] | undefined) ?? [];


  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="mb-3 text-sm font-semibold">Paramètres rapides</div>

      {/* Sliders besoins */}
      <div className="grid gap-3 md:grid-cols-3">
        <Slider
          label="Besoin Invalidité"
          min={50}
          max={90}
          step={1}
          value={targets.invalidityPctTarget ?? 90}
          onChange={(n) => updateTargets({ invalidityPctTarget: n })}
          suffix="% (max 90%)"
        />
        <Slider
          label="Besoin Décès"
          min={60}
          max={100}
          step={1}
          value={targets.deathPctTarget ?? 80}
          onChange={(n) => updateTargets({ deathPctTarget: n })}
          suffix="%"
        />
        <Slider
          label="Besoin Retraite"
          min={60}
          max={100}
          step={1}
          value={targets.retirementPctTarget ?? 80}
          onChange={(n) => updateTargets({ retirementPctTarget: n })}
          suffix="%"
        />
      </div>

      {/* Contexte famille / invalidité */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {/* Début activité lucrative (année) */}
<NumberField
  label="Début activité lucrative en Suisse (année)"
  value={debutActiviteYear ?? 0}
  min={1950}
  onChange={(n) =>
    updateCtx({ ...(ctx as any), debutActiviteYear: Number.isFinite(n) && n > 0 ? n : undefined } as any)
  }
/>

{/* Années sans cotisation AVS (liste) */}
<div>
  <div className="mb-1 text-xs text-gray-600">Années sans cotisation AVS</div>
  <div className="flex items-center gap-2">
    <input
      type="number"
      inputMode="numeric"
      min={1950}
      max={new Date().getFullYear()}
      className="h-9 w-32 rounded-lg border px-3 text-sm"
      placeholder="ex. 2012"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) {
            const next = Array.from(new Set([...(anneesSansCotisationList ?? []), v])).sort();
            updateCtx({ ...(ctx as any), anneesSansCotisationList: next } as any);
            (e.target as HTMLInputElement).value = '';
          }
        }
      }}
    />
    <div className="flex flex-wrap gap-1">
      {(anneesSansCotisationList ?? []).map((y) => (
        <button
          key={y}
          type="button"
          className="rounded-full border px-2 py-0.5 text-xs hover:bg-gray-50"
          onClick={() => {
            const next = (anneesSansCotisationList ?? []).filter((k) => k !== y);
            updateCtx({ ...(ctx as any), anneesSansCotisationList: next } as any);
          }}
          title="Cliquer pour retirer"
        >
          {y} ✕
        </button>
      ))}
    </div>
  </div>
</div>

        <Select
          label="État civil"
          value={ctx.survivor.maritalStatus}
          options={[
            // Nettoyage : plus de variantes genrées ici (masculin/féminin gérées via 'Sexe')
            'celibataire',
            'marie',
            'divorce',
            'partenariat_enregistre',
            'concubinage',
          ]}
          onChange={(v) =>
            updateCtx({
              survivor: {
                ...ctx.survivor,
                maritalStatus: v as SurvivorContextLite['maritalStatus'],
              },
            })
          }
        />

        {ctx.survivor.maritalStatus === 'concubinage' && (
  <>
    <YesNo
      label="Partenaire désigné (clause déposée)"
      value={Boolean((ctx.survivor as any)?.partnerDesignated)}
      onChange={(yes) =>
        updateCtx({
          survivor: { ...(ctx.survivor as any), partnerDesignated: yes },
          // si on décoche, on remet cohabitationYears à 0
          ...(yes ? {} : { survivor: { ...(ctx.survivor as any), partnerDesignated: false, cohabitationYears: 0 } }),
        } as any)
      }
    />
    <NumberField
      label="Années de vie commune"
      value={Number((ctx.survivor as any)?.cohabitationYears ?? 0)}
      onChange={(n) =>
        updateCtx({
          survivor: { ...(ctx.survivor as any), cohabitationYears: Math.max(0, n) },
        } as any)
      }
    />
    <div className="text-[11px] text-gray-500 -mt-1">Minimum 5 ans requis pour rente partenaire LPP.</div>
  </>
)}


        {/* SEXE — Nouveau toggle F/M (source provisoire : ctx.survivor.sexe) */}
        <SexeToggle
          value={(ctx.survivor as any)?.sexe as 'F' | 'M' | undefined}
          onChange={(s) =>
            updateCtx({
              survivor: { ...(ctx.survivor as any), sexe: s as any },
            })
          }
        />

        {(['marie','partenariat_enregistre'].includes(ctx.survivor.maritalStatus)) && (
          <YesNo
            label="Marié(e) depuis au moins 5 ans ?"
            value={Boolean((ctx.survivor as any)?.marriedSince5y)}
            onChange={(yes) =>
              updateCtx({
                survivor: { ...(ctx.survivor as any), marriedSince5y: yes },
              })
            }
            hint="Requis AVS survivants sans enfant : ≥45 ans & ≥5 ans de mariage."
          />
        )}


        <NumberField
          label="Enfant(s) à charge"
          value={ctx.childrenCount}
          min={0}
          onChange={(n) =>
            updateCtx({
              childrenCount: n,
              survivor: { ...ctx.survivor, hasChild: n > 0 },
            })
          }
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Slider
          label="Invalidité — degré"
          min={40}
          max={100}
          step={5}
          value={ctx.invalidityDegreePct}
          onChange={(n) => updateCtx({ invalidityDegreePct: n })}
          suffix="%"
        />

        {/* Travaille >8h/sem — remplace l'ancien champ 'Heures/sem.' */}
        <YesNo
          label="Travaille plus de 8h par semaine"
          value={travaillePlusDe8h}
          onChange={setTravaillePlusDe8h}
          hint="≥ 8 h/sem → ANP (accidents non pro) couvert en LAA"
        />
      </div>
    </div>
  );
}

/* ---- sous-composants UI ---- */

// Nouveau : toggle Sexe (F/M)
function SexeToggle({
  value,
  onChange,
}: {
  value?: 'F' | 'M';
  onChange: (v: 'F' | 'M') => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">Sexe</div>
      <div className="inline-flex gap-1 rounded-xl border p-1">
        {(['F', 'M'] as Array<'F' | 'M'>).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              'px-3 py-1 rounded-lg text-sm ' +
              (value === v
                ? 'bg-[#4fd1c5] text-white shadow'
                : 'hover:bg-gray-50')
            }
            aria-pressed={value === v}
          >
            {v === 'F' ? 'Féminin' : 'Masculin'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-medium text-gray-800">
          {value}
          {suffix ? ' ' + suffix : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#4fd1c5]"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  hint?: string;
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

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-1.5 text-sm bg-white"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// Nouveau : Yes/No switch générique
function YesNo({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600">{label}</div>
      <div className="inline-flex gap-1 rounded-xl border p-1">
        {[
          { k: false, txt: 'Non' },
          { k: true, txt: 'Oui' },
        ].map(({ k, txt }) => (
          <button
            key={String(k)}
            type="button"
            onClick={() => onChange(k)}
            className={
              'px-3 py-1 rounded-lg text-sm ' +
              (value === k
                ? 'bg-[#0030A8] text-white'
                : 'hover:bg-gray-50')
            }
            aria-pressed={value === k}
          >
            {txt}
          </button>
        ))}
      </div>
      {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}
