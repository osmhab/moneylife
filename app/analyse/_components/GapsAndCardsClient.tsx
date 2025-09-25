// app/analyse/_components/GapsAndCardsClient.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type {
  AvsInputs,
  LppInputs,
  LaaParams,
  GapsCtx,
  NeedsSliders,
  SurvivorContextLite,
  EventKind,
} from '../_hooks/useGaps';
import { useGaps } from '../_hooks/useGaps';
import { useQuickParamsSync } from "@/app/analyse/_hooks/useQuickParamsSync";
import { useQuickParamsLoad } from "@/app/analyse/_hooks/useQuickParamsLoad";

import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { Loader2 } from "lucide-react";

/* ===== shadcn/ui imports ===== */
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import DonutWithText from './charts/DonutWithText';
import { Segmented as UISegmented } from "@/components/ui/segmented";
import { Activity, HeartPulse, Calendar, CalendarRange, Settings2, PlaneTakeoff, CircleDashed, HandCoins } from "lucide-react";

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select as ShSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider as ShSlider } from '@/components/ui/slider';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

/* ========= Helpers format ========= */
const fmtCHF = (n: number | undefined | null) => {
  const v = Math.round(Math.max(0, Number(n ?? 0)));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
};
const fmtPct = (num: number | undefined | null) => {
  const v = Math.max(0, Math.min(100, Number(num ?? 0)));
  return `${Math.round(v)}%`;
};
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(n)));

function cn(...cls: Array<string | undefined | null | false>) {
  return cls.filter(Boolean).join(' ');
}

/* ---- Mapping NeedTargets ↔︎ affichage ---- */
type TargetsDisplay = { invalidity: number; death: number; retirement: number };

const fromNeedTargets = (nt?: NeedsSliders | any): TargetsDisplay => ({
  invalidity: Number(nt?.invalidityPctTarget ?? nt?.invalidity ?? 0),
  death: Number(nt?.deathPctTarget ?? nt?.death ?? 0),
  retirement: Number(nt?.retirementPctTarget ?? nt?.retirement ?? 0),
});

const toNeedTargets = (td: TargetsDisplay): NeedsSliders =>
  ({
    invalidityPctTarget: td.invalidity,
    deathPctTarget: td.death,
    retirementPctTarget: td.retirement,
  } as any);

type ThirdPillar = {
  invalidityMonthly?: number;
  deathMonthly?: number;
  retirementMonthly?: number;
};
type AmountUnit = 'monthly' | 'annual';

/* ========= UI utilitaires ========= */

/** KPI accepte ReactNode pour afficher AnimatedNumber */
function KPI({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warning';
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'warning' && 'border-amber-200 bg-amber-50'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground',
          tone === 'warning' && 'text-amber-700/80'
        )}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'text-lg font-semibold',
          tone === 'warning' && 'text-amber-700'
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* Taille des charts */
const CHART_H = 240;

/* Total des prestations */
const sumSegments = (segs: Array<{ value: number }> | undefined) =>
  Math.max(0, Math.round((segs ?? []).reduce((s, x) => s + Number(x?.value ?? 0), 0)));

/** Bouton-lien via shadcn Button */
function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" className="rounded-2xl">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/* ========= AnimatedNumber pour KPI ========= */

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = React.useState(0);
  const mv = useMotionValue(0);

  React.useEffect(() => {
    mv.set(display);
    const controls = animate(mv, Math.max(0, value), {
      duration: 0.45,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
      onComplete: () => setDisplay(Math.round(Math.max(0, value))),
    });
    return () => controls.stop();
  }, [value]);

  return <span>{display.toLocaleString('fr-CH').replace(/,/g, "'")}</span>;
}

/* ===== Palette & Légende ===== */

const COLOR_AVS = '#026EC8';
const COLOR_LPP = '#00B2D4';
const COLOR_P3 = '#4fd1c5';
const COLOR_LAA = '#0EA762';
const COLOR_GAP = '#F3F4F6';

function Legend() {
  const items: Array<{ key: string; label: string; style: React.CSSProperties }> = [
    { key: 'avs', label: 'AVS/AI', style: { backgroundColor: COLOR_AVS } },
    { key: 'lpp', label: 'LPP', style: { backgroundColor: COLOR_LPP } },
    { key: 'laa', label: 'LAA', style: { backgroundColor: COLOR_LAA } },
    { key: 'p3', label: '3e pilier', style: { backgroundColor: COLOR_P3 } },
    { key: 'gap', label: 'Lacune', style: { backgroundColor: COLOR_GAP } },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-2 group relative">
          <span className="inline-block h-3 w-3 rounded" style={it.style} />
          {it.label}
          <span className="pointer-events-none absolute left-0 top-6 opacity-0 group-hover:opacity-100 transition text-[11px] bg-gray-900 text-white px-2 py-1 rounded">
            Part affichée selon la cible (glissez pour voir l’effet)
          </span>
        </span>
      ))}
    </div>
  );
}

/* ========= Paramètres rapides ========= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: {
  value?: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <ShSelect value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={[
          'w-full h-10 rounded-lg border bg-background shadow-sm',
          'text-sm data-[placeholder]:text-muted-foreground',
          'transition focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/30',
          'focus-visible:ring-offset-2 ring-offset-background',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        ].join(' ')}
      >
        <SelectValue placeholder={placeholder ?? 'Sélectionner…'} />
      </SelectTrigger>

      <SelectContent
        className={[
          'rounded-lg border bg-popover text-popover-foreground shadow-md',
          'overflow-hidden',
        ].join(' ')}
        position="popper"
        sideOffset={6}
      >
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="text-sm focus:bg-accent focus:text-accent-foreground cursor-pointer"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShSelect>
  );
}

/** PctSlider — version shadcn “pure”, idéale dans un Drawer */
function PctSlider({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  const v = clamp(value, min, max);
  return (
    <div className="flex w-full items-center gap-4" data-vaul-no-drag>
      <ShSlider
        value={[v]}
        min={min}
        max={max}
        step={1}
        onValueChange={([nv]) => onChange(clamp(Number(nv), min, max))}
        aria-label={label ?? "Sélecteur pourcentage"}
        className="w-full"
      />
      <span className="w-12 text-right text-sm font-medium">{fmtPct(v)}</span>
    </div>
  );
}

function TargetSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{fmtPct(value)}</span>
      </div>
      <ShSlider
        value={[clamp(value, min, max)]}
        min={min}
        max={max}
        step={1}
        onValueChange={([nv]) => onChange(clamp(Number(nv), min, max))}
        className="w-full"
      />
    </div>
  );
}

// ===== Aides état civil (normalisation) =====
// Valeurs autorisées par SurvivorContextLite['maritalStatus']
const MARITAL_VALUES = [
  'celibataire',
  'marie',
  'mariee',
  'divorce',
  'divorcee',
  'partenariat_enregistre',
  'concubinage',
] as const;

type MaritalStatus = (typeof MARITAL_VALUES)[number];

function isMaritalStatus(x: unknown): x is MaritalStatus {
  return typeof x === 'string' && (MARITAL_VALUES as readonly string[]).includes(x);
}

// Normalisations d'affichage/stockage
const normMarital = (v?: string) =>
  v === 'mariee' ? 'marie' : v === 'divorcee' ? 'divorce' : v;

const denormIfNeeded = (v: string) => v; // point d'extension ultérieur si besoin de re-différencier F/M

function isMarriedOrReg(s: SurvivorContextLite) {
  return (
    s.maritalStatus === 'marie' ||
    s.maritalStatus === 'mariee' ||
    s.maritalStatus === 'partenariat_enregistre'
  );
}

function QuickParamsCard({
  sex,
  onSexChange,
  survivor,
  onSurvivorChange,
  childrenCount,
  onChildrenChange,
  targetsPct,
  onTargetsChange,
  unit,
  onUnitChange,
  weeklyHours,
  onWeeklyHoursChange,
  scenario,
  onScenarioChange,
  className,
  compact,
  isSaving,
  lastSavedAt,
}: {
  sex?: 'F' | 'M';
  onSexChange: (s: 'F' | 'M' | undefined) => void;
  survivor: SurvivorContextLite;
  onSurvivorChange: (s: SurvivorContextLite) => void;
  childrenCount: number;
  onChildrenChange: (n: number) => void;
  targetsPct: TargetsDisplay;
  onTargetsChange: (t: TargetsDisplay) => void;
  unit: AmountUnit;
  onUnitChange: (u: AmountUnit) => void;
  weeklyHours?: number;
  onWeeklyHoursChange: (wh?: number) => void;
  scenario: EventKind;
  onScenarioChange: (val: EventKind) => void;
  className?: string;
  compact?: boolean;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
}) {
  const marriedOrReg = isMarriedOrReg(survivor);

  function ParamsFields() {
    return (
      <div className="space-y-8">
        {/* SECTION 1 — Identité */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Sexe">
            <Select
              value={sex ?? undefined}
              onChange={(v) => onSexChange(v === 'unspecified' ? undefined : (v as 'F' | 'M'))}
              options={[
                { label: 'Non précisé', value: 'unspecified' },
                { label: 'Femme', value: 'F' },
                { label: 'Homme', value: 'M' },
              ]}
              placeholder="—"
            />
          </Field>

          <Field label="État civil">
            <Select
              value={normMarital(survivor.maritalStatus)}
              onChange={(v) =>
                onSurvivorChange({
                  ...survivor,
                  maritalStatus: denormIfNeeded(v) as SurvivorContextLite['maritalStatus'],
                  marriedSince5y:
                    v === 'marie' || v === 'mariee' || v === 'partenariat_enregistre'
                      ? survivor.marriedSince5y ?? false
                      : undefined,
                })
              }
              options={[
                { label: 'Célibataire', value: 'celibataire' },
                { label: 'Marié(e)', value: 'marie' },
                { label: 'Divorcé(e)', value: 'divorce' },
                { label: 'Partenariat enregistré', value: 'partenariat_enregistre' },
                { label: 'Concubinage', value: 'concubinage' },
              ]}
            />
          </Field>

          <Field label="Marié(e) depuis plus de 5 ans ?">
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                checked={Boolean(survivor.marriedSince5y)}
                onCheckedChange={(checked) =>
                  onSurvivorChange({
                    ...survivor,
                    marriedSince5y: marriedOrReg ? checked : undefined,
                  })
                }
                disabled={!marriedOrReg}
              />
            </div>
          </Field>
        </div>

        <div className="h-px bg-border" />

        {/* SECTION 2 — Famille & travail */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Enfants à charge">
            <div className="inline-flex w-full items-center rounded-md border bg-background">
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-sm border-r rounded-none"
                onClick={() => onChildrenChange(Math.max(0, (childrenCount ?? 0) - 1))}
              >
                −
              </Button>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm text-center outline-none"
                value={childrenCount}
                min={0}
                onChange={(e) => onChildrenChange(Math.max(0, Number(e.target.value)))}
              />
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-sm border-l rounded-none"
                onClick={() => onChildrenChange((childrenCount ?? 0) + 1)}
              >
                +
              </Button>
            </div>
          </Field>

          <Field label="Travaille ≥ 8h/sem ?">
            <Switch
              checked={Boolean(weeklyHours && weeklyHours >= 8)}
              onCheckedChange={(checked) => onWeeklyHoursChange(checked ? 9 : 0)}
            />
          </Field>
        </div>

        <div className="h-px bg-border" />
      </div>
    );
  }

  // MODE COMPACT : barre + Sheet pour les détails
  if (compact) {
    return (
      <Card className={cn('shadow-none border border-muted/40 bg-muted/10', className)}>
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-2">
            <Drawer>
              <DrawerTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-full border border-muted/40 bg-muted/30
                     text-muted-foreground hover:text-foreground hover:bg-background shadow-sm
                     focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4fd1c5]"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="p-6">
                <DrawerHeader>
                  <DrawerTitle>Paramètres avancés</DrawerTitle>
                </DrawerHeader>
                <div className="py-2">
                  <ParamsFields />
                </div>
                <DrawerFooter>
                  <DrawerClose asChild>
                    <Button variant="outline">Fermer</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>

            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Paramètres rapides</CardTitle>
                <span className="text-[11px] text-muted-foreground" aria-live="polite">
                  {isSaving ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Enregistrement…
                    </span>
                  ) : lastSavedAt ? (
                    "Enregistré"
                  ) : null}
                </span>
              </div>

              <CardDescription className="text-xs">
                Ajustez vos informations personnelles et le mode de simulation
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col w-full gap-2 lg:w-auto lg:flex-row lg:items-center">
            <div className="flex flex-col w-full gap-2 lg:w-auto lg:flex-row lg:items-center">
              <UISegmented
                value={scenario}
                onValueChange={(v) =>
                  onScenarioChange((v as "maladie" | "accident") ?? "maladie")
                }
                items={[
                  {
                    value: "maladie",
                    label: "Maladie",
                    icon: <HeartPulse className="h-4 w-4" />,
                  },
                  {
                    value: "accident",
                    label: "Accident",
                    icon: <Activity className="h-4 w-4" />,
                  },
                ]}
                className="w-full lg:w-auto bg-muted/40 p-0.5 border-transparent shadow-none"
              />

              <UISegmented
                value={unit}
                onValueChange={(v) =>
                  onUnitChange((v as "monthly" | "annual") ?? "monthly")
                }
                items={[
                  {
                    value: "monthly",
                    label: "CHF/mois",
                    icon: <Calendar className="h-4 w-4" />,
                  },
                  {
                    value: "annual",
                    label: "CHF/an",
                    icon: <CalendarRange className="h-4 w-4" />,
                  },
                ]}
                className="w-full lg:w-auto bg-muted/40 p-0.5 border-transparent shadow-none"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // MODE COMPLET (accordéon)
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Paramètres rapides</CardTitle>
          <CardDescription>Contexte utilisé pour l’aperçu ci-dessous.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <UISegmented
            value={scenario}
            onValueChange={(v) => onScenarioChange((v as "maladie" | "accident") ?? "maladie")}
            items={[
              { value: "maladie", label: "Maladie" },
              { value: "accident", label: "Accident" },
            ]}
            className="bg-muted/40 p-0.5 border-transparent shadow-none"
          />

          <UISegmented
            value={unit}
            onValueChange={(v) => onUnitChange((v as "monthly" | "annual") ?? "monthly")}
            items={[
              { value: "monthly", label: "CHF/mois" },
              { value: "annual", label: "CHF/an" },
            ]}
            className="bg-muted/40 p-0.5 border-transparent shadow-none"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Accordion type="single" collapsible className="w-full" defaultValue="open">
          <AccordionItem value="open" className="border-b-0">
            <AccordionTrigger className="text-sm">Afficher / masquer les paramètres</AccordionTrigger>
            <AccordionContent>
              <ParamsFields />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

/* ========= Composant principal ========= */

type Props = {
  annualIncome: number;
  avs: AvsInputs;
  lpp: LppInputs;
  survivorDefault: SurvivorContextLite;
  laaParams?: LaaParams;
  initialTargets?: NeedsSliders;
  initialCtx?: Partial<GapsCtx>;
  thirdPillar?: ThirdPillar;
  onParamsChange?: (next: { targets: NeedsSliders; ctx: GapsCtx }) => void;
  sex?: 'F' | 'M';
  lppCard?: any;
  laaCard?: any;
  avsCard?: any;
  clientDocPath?: string; // ex: `clients/${clientToken}`
};

export default function GapsAndCardsClient({
  annualIncome,
  avs,
  lpp,
  survivorDefault,
  laaParams,
  initialTargets,
  initialCtx,
  thirdPillar,
  sex,
  clientDocPath,
  onParamsChange,
}: Props) {
  const [eventInvalidity, setEventInvalidity] = useState<EventKind>(
    initialCtx?.eventInvalidity ?? 'maladie'
  );
  const [eventDeath, setEventDeath] = useState<EventKind>(
    initialCtx?.eventDeath ?? 'maladie'
  );

  /* Unités d’affichage des montants */
  const [unit, setUnit] = useState<AmountUnit>('monthly');
  const toUnit = (n: number) => Math.round(Math.max(0, n) * (unit === 'annual' ? 12 : 1));

  /* sliders/ctx en état local (éditables) */
  const initialDisplay = fromNeedTargets(initialTargets);
  const [currentTargets, setCurrentTargets] = useState<NeedsSliders>(
    toNeedTargets({
      invalidity: initialDisplay.invalidity || 70,
      death: initialDisplay.death || 70,
      retirement: initialDisplay.retirement || 70,
    })
  );

  const displayTargets = fromNeedTargets(currentTargets);

  const [currentCtx, setCurrentCtx] = useState<GapsCtx>({
    eventInvalidity,
    eventDeath,
    invalidityDegreePct: clamp(initialCtx?.invalidityDegreePct ?? 100, 40, 100),
    childrenCount: initialCtx?.childrenCount ?? 0,
    weeklyHours: initialCtx?.weeklyHours ?? undefined,
    survivor: {
      maritalStatus:
        initialCtx?.survivor?.maritalStatus ?? survivorDefault.maritalStatus ?? 'celibataire',
      hasChild: (initialCtx?.childrenCount ?? 0) > 0,
      ageAtWidowhood: initialCtx?.survivor?.ageAtWidowhood ?? 45,
      marriedSince5y: initialCtx?.survivor?.marriedSince5y ?? false,
    },
  });
  const [sexState, setSexState] = useState<'F' | 'M' | undefined>(sex);
  const [qpReady, setQpReady] = React.useState(false);

  // === Keys locales (scopées par le token/analyse) ===
  const anonToken = React.useMemo(() => {
    if (clientDocPath && clientDocPath.startsWith('clients/')) {
      const parts = clientDocPath.split('/');
      return parts[1] ?? null;
    }
    return null;
  }, [clientDocPath]);

  const storageKeyUnit = React.useMemo(
    () => `ml_qp_unit_${anonToken ?? 'default'}`,
    [anonToken]
  );
  const storageKeyScenario = React.useMemo(
    () => `ml_qp_scenario_${anonToken ?? 'default'}`,
    [anonToken]
  );
  const storageKeyQuick = React.useMemo(
    () => `ml_qp_cache_${anonToken ?? 'default'}`,
    [anonToken]
  );

  // Charger les préférences locales au premier montage (unit/scenario)
  React.useEffect(() => {
    try {
      const u = localStorage.getItem(storageKeyUnit);
      if (u === 'monthly' || u === 'annual') setUnit(u as 'monthly' | 'annual');

      const s = localStorage.getItem(storageKeyScenario);
      if (s === 'maladie' || s === 'accident') {
        const mode = s as EventKind;
        setEventInvalidity(mode);
        setEventDeath(mode);
        setCurrentCtx(prev => ({ ...prev, eventInvalidity: mode, eventDeath: mode }));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKeyUnit, storageKeyScenario]);

  // Hydratation instantanée via cache local (avant Firestore)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKeyQuick);
      if (!raw) return;
      const cached = JSON.parse(raw);

      // Sexe
      if (cached?.sex === 'F' || cached?.sex === 'M') {
        setSexState(cached.sex);
      }

      // Contexte
      setCurrentCtx((prev) => ({
        ...prev,
        weeklyHours: typeof cached?.weeklyHours === 'number' ? cached.weeklyHours : prev.weeklyHours,
        childrenCount: typeof cached?.childrenCount === 'number' ? cached.childrenCount : prev.childrenCount,
        survivor: {
          ...prev.survivor,
          maritalStatus: isMaritalStatus(normMarital(cached?.survivor?.maritalStatus))
            ? (normMarital(cached.survivor.maritalStatus) as SurvivorContextLite['maritalStatus'])
            : prev.survivor.maritalStatus,
          hasChild: typeof cached?.survivor?.hasChild === 'boolean' ? cached.survivor.hasChild : prev.survivor.hasChild,
          ageAtWidowhood: typeof cached?.survivor?.ageAtWidowhood === 'number' ? cached.survivor.ageAtWidowhood : prev.survivor.ageAtWidowhood,
          marriedSince5y: typeof cached?.survivor?.marriedSince5y === 'boolean' ? cached.survivor.marriedSince5y : prev.survivor.marriedSince5y,
        },
      }));

      // Targets
      if (cached?.targets) {
        setCurrentTargets(
          toNeedTargets({
            invalidity: clamp(Number(cached.targets.invalidityPctTarget ?? cached.targets.invalidity ?? 0), 50, 90),
            death: clamp(Number(cached.targets.deathPctTarget ?? cached.targets.death ?? 0), 50, 100),
            retirement: clamp(Number(cached.targets.retirementPctTarget ?? cached.targets.retirement ?? 0), 50, 100),
          })
        );
      }
    } catch {}
    // pas de qpReady ici — Firestore fera foi et activera qpReady à la fin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKeyQuick]);

  // Sauver l’unité (mois/an) à chaque changement
  React.useEffect(() => {
    try { localStorage.setItem(storageKeyUnit, unit); } catch {}
  }, [unit, storageKeyUnit]);

  // Sauver le scénario (maladie/accident) à chaque changement
  React.useEffect(() => {
    const scenario =
      eventInvalidity === 'accident' && eventDeath === 'accident'
        ? 'accident'
        : 'maladie';
    try { localStorage.setItem(storageKeyScenario, scenario); } catch {}
  }, [eventInvalidity, eventDeath, storageKeyScenario]);

  // util: forcer bornes propres
  const clampPct = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(Number(n ?? 0))));

  // charge 1x depuis Firestore et applique aux états locaux
  useQuickParamsLoad({
    clientDocPath,
    apply: (qp) => {
      if (!qp) return;

      // Sexe
      if (qp.sex === 'F' || qp.sex === 'M') {
        setSexState(qp.sex);
      }

      // Contexte (enfants, heures, survivant)
      setCurrentCtx((prev) => ({
        ...prev,
        weeklyHours: typeof qp.weeklyHours === 'number' ? qp.weeklyHours : prev.weeklyHours,
        childrenCount:
          typeof qp.childrenCount === 'number' ? qp.childrenCount : prev.childrenCount,
        survivor: {
          ...prev.survivor,
          maritalStatus: isMaritalStatus(qp.survivor?.maritalStatus)
            ? (normMarital(qp.survivor!.maritalStatus) as SurvivorContextLite['maritalStatus'])
            : prev.survivor.maritalStatus,
          hasChild:
            typeof qp.survivor?.hasChild === 'boolean'
              ? qp.survivor!.hasChild
              : prev.survivor.hasChild,
          ageAtWidowhood:
            typeof qp.survivor?.ageAtWidowhood === 'number'
              ? qp.survivor!.ageAtWidowhood
              : prev.survivor.ageAtWidowhood,
          marriedSince5y:
            typeof qp.survivor?.marriedSince5y === 'boolean'
              ? qp.survivor!.marriedSince5y
              : prev.survivor.marriedSince5y,
        },
      }));

      // Cibles %
      if (qp.targets) {
        setCurrentTargets(
          toNeedTargets({
            invalidity: clampPct(qp.targets.invalidity, 50, 90),
            death: clampPct(qp.targets.death, 50, 100),
            retirement: clampPct(qp.targets.retirement, 50, 100),
          })
        );
      }

      // Signal prêt pour la sync
      setQpReady(true);
    },
  });

  // ctx effectif
  const ctx: GapsCtx = {
    ...currentCtx,
    eventInvalidity,
    eventDeath,
    survivor: { ...currentCtx.survivor, hasChild: (currentCtx.childrenCount ?? 0) > 0 },
  };

  // recalculs
  const gaps = useGaps({
    annualIncome,
    targets: currentTargets,
    avs,
    lpp,
    ctx,
    laaParams,
    thirdPillar,
  });

  /* Data par thème */
  const inv = gaps.invalidity.current;
  const invPct = inv.target > 0 ? Math.min(100, (inv.covered / inv.target) * 100) : 0;

  const dec = gaps.death.current;
  const decPct = dec.target > 0 ? Math.min(100, (dec.covered / dec.target) * 100) : 0;

  const ret = gaps.retirement;
  const retPct = ret.target > 0 ? Math.min(100, (ret.covered / ret.target) * 100) : 0;

  const globalScenario: EventKind =
    eventInvalidity === 'accident' && eventDeath === 'accident' ? 'accident' : 'maladie';

  // Payload à sauvegarder (mappé sur Firestore)
  // ❌ on retire unit, eventInvalidity, eventDeath du payload persistant
  const savePayload = {
    weeklyHours: ctx.weeklyHours,
    childrenCount: ctx.childrenCount,
    survivor: {
      maritalStatus: ctx.survivor.maritalStatus,
      hasChild: ctx.survivor.hasChild,
      ageAtWidowhood: ctx.survivor.ageAtWidowhood,
      marriedSince5y: ctx.survivor.marriedSince5y,
    },
    sex: sexState,
    targets: {
      invalidityPctTarget: displayTargets.invalidity,
      deathPctTarget: displayTargets.death,
      retirementPctTarget: displayTargets.retirement,
    },
  } as const;

  const { isSaving, lastSavedAt } = useQuickParamsSync({
    clientDocPath: clientDocPath ?? "",
    token: anonToken,                 // permet le mode anonyme via API
    payload: savePayload,
    debounceMs: 700,
    enabled: qpReady,
  });

  // Écrit le cache local à chaque enregistrement réussi
  React.useEffect(() => {
    if (!lastSavedAt) return;
    try {
      localStorage.setItem(storageKeyQuick, JSON.stringify(savePayload));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSavedAt, storageKeyQuick]);

  React.useEffect(() => {
    onParamsChange?.({
      targets: currentTargets,
      ctx,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(currentTargets), JSON.stringify(ctx)]);

  return (
    <motion.section
      className="w-full space-y-8"
      initial="hidden"
      animate="show"
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
    >
      {/* Header simple */}
      <motion.div className="space-y-1" layout>
        <h2 className="text-xl md:text-2xl font-semibold">Votre analyse de prévoyance</h2>
        <p className="text-sm text-muted-foreground">
          Avec les Paramètres rapides, modifiez sexe, état civil, enfants… pour des résultats 100% personnalisés.
        </p>
      </motion.div>

      {/* Paramètres rapides — compact + Sheet */}
      <QuickParamsCard
        compact
        sex={sexState}
        onSexChange={(s) => setSexState(s)}
        survivor={ctx.survivor}
        onSurvivorChange={(next) => setCurrentCtx((prev) => ({ ...prev, survivor: next }))}
        childrenCount={ctx.childrenCount}
        onChildrenChange={(n) => {
          const nn = Math.max(0, n);
          setCurrentCtx((prev) => ({
            ...prev,
            childrenCount: nn,
            survivor: { ...prev.survivor, hasChild: nn > 0 },
          }));
        }}
        targetsPct={fromNeedTargets(currentTargets)}
        onTargetsChange={(t) => {
          const nextDisplay: TargetsDisplay = {
            invalidity: clamp(t.invalidity, 50, 90),
            death: clamp(t.death, 50, 100),
            retirement: clamp(t.retirement, 50, 100),
          };
          setCurrentTargets(toNeedTargets(nextDisplay));
        }}
        unit={unit}
        onUnitChange={setUnit}
        weeklyHours={ctx.weeklyHours}
        onWeeklyHoursChange={(wh) => setCurrentCtx((prev) => ({ ...prev, weeklyHours: wh }))}
        scenario={globalScenario}
        onScenarioChange={(m) => {
          const mode: EventKind = m === 'accident' ? 'accident' : 'maladie';
          setEventInvalidity(mode);
          setEventDeath(mode);
          setCurrentCtx((prev) => ({ ...prev, eventInvalidity: mode, eventDeath: mode }));
        }}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
      />

      {/* Grille 3 cartes: Invalidité / Décès / Retraite */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 xl:gap-8 [*]:min-w-0"
        layout
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        {/* INVALIDITÉ */}
        <motion.div layout whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }}>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Invalidité</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {eventInvalidity === "accident" ? (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <HeartPulse className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  Scénario :{" "}
                  <strong className="font-medium">
                    {eventInvalidity === "accident" ? "Accident" : "Maladie"}
                  </strong>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              <DonutWithText
                target={inv.target}
                covered={inv.covered}
                segments={inv.segments}
                height={CHART_H}
                centerLabel={fmtPct(invPct)}
                centerSub="couverture"
              />
              <div className="grid grid-cols-2 gap-3">
                <KPI
                  tone="warning"
                  label={`Lacune (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<CircleDashed className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(inv.gap)} />}
                />
                <KPI
                  label={`Prestations (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<HandCoins className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(sumSegments(inv.segments))} />}
                />
              </div>

              <TargetSlider
                label="Objectif Invalidité (% du revenu actuel)"
                value={clamp(displayTargets.invalidity, 50, 90)}
                min={50}
                max={90}
                onChange={(v) =>
                  setCurrentTargets(
                    toNeedTargets({
                      ...displayTargets,
                      invalidity: v,
                    })
                  )
                }
              />
              <Legend />
              <div className="flex justify-end">
                <LinkButton href="/analyse/invalidite">Voir détails</LinkButton>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* DÉCÈS */}
        <motion.div layout whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }}>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Décès</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {eventDeath === "accident" ? (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <HeartPulse className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  Scénario :{" "}
                  <strong className="font-medium">
                    {eventDeath === "accident" ? "Accident" : "Maladie"}
                  </strong>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              <DonutWithText
                target={dec.target}
                covered={dec.covered}
                segments={dec.segments}
                height={CHART_H}
                centerLabel={fmtPct(decPct)}
                centerSub="couverture"
              />
              <div className="grid grid-cols-2 gap-3">
                <KPI
                  tone="warning"
                  label={`Lacune (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<CircleDashed className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(dec.gap)} />}
                />
                <KPI
                  label={`Prestations (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<HandCoins className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(sumSegments(dec.segments))} />}
                />
              </div>
              <TargetSlider
                label="Objectif Décès (% du revenu actuel)"
                value={clamp(displayTargets.death, 50, 100)}
                min={50}
                max={100}
                onChange={(v) =>
                  setCurrentTargets(
                    toNeedTargets({
                      ...displayTargets,
                      death: v,
                    })
                  )
                }
              />
              <Legend />
              <div className="flex justify-end">
                <LinkButton href="/analyse/deces">Voir détails</LinkButton>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* RETRAITE */}
        <motion.div layout whileHover={{ y: -2 }} whileTap={{ scale: 0.995 }}>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Retraite</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <PlaneTakeoff className="h-4 w-4 text-muted-foreground" />
                Projection à la retraite
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              <DonutWithText
                target={ret.target}
                covered={ret.covered}
                segments={ret.segments}
                height={CHART_H}
                centerLabel={fmtPct(retPct)}
                centerSub="couverture"
              />
              <div className="grid grid-cols-2 gap-3">
                <KPI
                  tone="warning"
                  label={`Lacune (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<CircleDashed className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(ret.gap)} />}
                />
                <KPI
                  label={`Prestations (${unit === 'annual' ? 'CHF/an' : 'CHF/mois'})`}
                  icon={<HandCoins className="h-3.5 w-3.5" />}
                  value={<AnimatedNumber value={toUnit(sumSegments(ret.segments))} />}
                />
              </div>
              <TargetSlider
                label="Objectif Retraite (% du revenu actuel)"
                value={clamp(displayTargets.retirement, 50, 100)}
                min={50}
                max={100}
                onChange={(v) =>
                  setCurrentTargets(
                    toNeedTargets({
                      ...displayTargets,
                      retirement: v,
                    })
                  )
                }
              />
              <Legend />
              <div className="flex justify-end">
                <LinkButton href="/analyse/retraite">Voir détails</LinkButton>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
