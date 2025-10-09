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

import { usePrestationsSync } from '@/app/analyse/_hooks/usePrestationsSync';

// ✅ Extension locale — source de vérité pour l’UI
type SurvivorExt = SurvivorContextLite & {
  partnerDesignated?: boolean;
  cohabitationYears?: number;
};

// ✅ GapsCtx étendu côté UI (state local)
type GapsCtxExt = Omit<GapsCtx, 'survivor'> & {
  survivor: SurvivorExt;
};



import { useGaps } from '../_hooks/useGaps';
import { useQuickParamsSync } from "@/app/analyse/_hooks/useQuickParamsSync";
import { useQuickParamsLoad } from "@/app/analyse/_hooks/useQuickParamsLoad";
import { useParams } from "next/navigation";


import { motion, useMotionValue, animate } from 'framer-motion';
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
import { Activity, HeartPulse, Settings2, PlaneTakeoff, CircleDashed, HandCoins } from "lucide-react";

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


import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';


import { useRouter } from "next/navigation";

import {
  onAuthStateChanged,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  linkWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

import { getFunctions, httpsCallable } from "firebase/functions";







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

// --- enfants: dates ISO + sanitizer (UI) ---
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FR_DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function isValidDate(y: number, m: number, d: number) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isoToFR(iso?: string): string {
  if (!iso || !ISO_DATE_RE.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function frToISO(fr?: string): string {
  if (!fr) return '';
  const digits = fr.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4, 8));
  if (!isValidDate(yyyy, mm, dd)) return '';
  const now = new Date();
  const dt = new Date(yyyy, mm - 1, dd);
  if (yyyy < 1900 || dt > now) return '';
  return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const sanitizeBirthdatesUI = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  return v
    .map((s) => (typeof s === 'string' ? s : ''))
    .filter((s) => ISO_DATE_RE.test(s))
    .slice(0, 20);
};
const todayISO = new Date().toISOString().slice(0, 10);


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
  childrenBirthdates,
  onChildBirthdateChange,
  targetsPct,
  onTargetsChange,
  unit,
  onUnitChange,
  weeklyHours,
  onWeeklyHoursChange,
  scenario,
  onScenarioChange,

  /* ===== Nouveaux champs passés en props ===== */
  startWorkYearCH,
  onStartWorkYearChange,
  missingYearsMode,
  onMissingYearsModeChange,
  missingYears,
  onMissingYearsChange,
  caregiving,
  onCaregivingChange,

  className,
  compact,
  isSaving,
  lastSavedAt,
}: {
  sex?: 'F' | 'M';
  onSexChange: (s: 'F' | 'M' | undefined) => void;
  survivor: SurvivorExt;
  onSurvivorChange: (s: SurvivorExt) => void;
  childrenCount: number;
  onChildrenChange: (n: number) => void;
  childrenBirthdates?: string[];
  onChildBirthdateChange: (index: number, iso: string) => void;
  targetsPct: TargetsDisplay;
  onTargetsChange: (t: TargetsDisplay) => void;
  unit: AmountUnit;
  onUnitChange: (u: AmountUnit) => void;
  weeklyHours?: number;
  onWeeklyHoursChange: (wh?: number) => void;
  scenario: EventKind;
  onScenarioChange: (val: EventKind) => void;

  /* ===== Typage des nouveaux champs ===== */
  startWorkYearCH?: number;
  onStartWorkYearChange: (n?: number) => void;
  missingYearsMode: 'none' | 'some';
  onMissingYearsModeChange: (m: 'none' | 'some') => void;
  missingYears: number[];
  onMissingYearsChange: (arr: number[]) => void;
  caregiving: { hasCare: boolean; years: number[] };
  onCaregivingChange: (c: { hasCare: boolean; years: number[] }) => void;

  className?: string;
  compact?: boolean;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
}) {


const s = survivor;

  
const marriedOrReg = isMarriedOrReg(survivor);



// (optionnel) si tu gardais birthYearsDraft, tu peux supprimer l'ancien state/effets

// === Drawer contrôlé + commit des dates UNIQUEMENT à la fermeture ===
const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

// Refs non-contrôlées pour les inputs "date JJ/MM/AAAA"
const dateRefs = React.useRef<Array<HTMLInputElement | null>>([]);
const setDateRef = (i: number) => (el: HTMLInputElement | null) => {
  dateRefs.current[i] = el;
};



const commitChildDates = React.useCallback(() => {
  const nn = Math.max(0, childrenCount ?? 0);
  for (let i = 0; i < nn; i++) {
    const fr = (dateRefs.current[i]?.value ?? '').trim();
    const iso = frToISO(fr); // '' si invalide/incomplet
    onChildBirthdateChange(i, iso);
  }
}, [childrenCount, onChildBirthdateChange]);











    // Zone de scroll du Drawer + util pour amener un input en vue
  const drawerScrollRef = React.useRef<HTMLDivElement | null>(null);

  const ensureVisible = React.useCallback((el: HTMLElement | null) => {
    if (!el || !drawerScrollRef.current) return;
    const container = drawerScrollRef.current;

    const crect = container.getBoundingClientRect();
    const erect = el.getBoundingClientRect();

    // marge visuelle sous l’entête du drawer
    const margin = 12;

    // si au-dessus de la zone visible → scroll jusqu’en haut (avec marge)
    if (erect.top < crect.top + margin) {
      const delta = erect.top - crect.top - margin;
      container.scrollBy({ top: delta, behavior: 'smooth' });
      return;
    }

    // si en-dessous de la zone visible → scroll pour dégager le bas (avec marge)
    if (erect.bottom > crect.bottom - margin) {
      const delta = erect.bottom - crect.bottom + margin;
      container.scrollBy({ top: delta, behavior: 'smooth' });
    }
  }, []);


  function renderParamsFields() {

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



          {/* Concubin — paramètres LPP partenaire */}
{s.maritalStatus === 'concubinage' && (
  <>
    <Field label="Partenaire désigné (clause déposée)">
      <Switch
        checked={Boolean(s.partnerDesignated)}
        onCheckedChange={(checked) =>
          onSurvivorChange({
            ...s,
            partnerDesignated: checked,
            cohabitationYears: checked ? (s.cohabitationYears ?? 5) : 0,
          })
        }
        />
    </Field>

    <Field label="Années de vie commune">
      <input
        type="number"
        min={0}
        className="w-full rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
        value={Number(s.cohabitationYears ?? 0)}
        onChange={(e) =>
          onSurvivorChange({
            ...s,
            cohabitationYears: Math.max(0, Number(e.target.value || 0)),
          })
        }
        disabled={!s.partnerDesignated}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Minimum 5 ans requis pour activer la rente partenaire LPP.
      </p>
    </Field>
  </>
)}



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
                onFocus={(e) => setTimeout(() => ensureVisible(e.currentTarget), 60)}

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
{/* DATE DE NAISSANCE (JJ/MM/AAAA, non-contrôlé) */}
{(childrenCount ?? 0) > 0 && (
  <div className="sm:col-span-2 space-y-3" data-vaul-no-drag>
    <div className="text-xs text-muted-foreground">Date de naissance des enfant(s) (JJ/MM/AAAA)</div>

    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      {Array.from({ length: Math.max(0, childrenCount) }).map((_, i) => (
  <Field key={i} label={`Enfant ${i + 1}`}>
    <input
  type="text"
  inputMode="numeric"
  enterKeyHint="done"
  autoComplete="off"
  autoCorrect="off"
  autoCapitalize="off"
  spellCheck={false}
  placeholder="JJ/MM/AAAA"
  defaultValue={isoToFR(childrenBirthdates?.[i])}  // NON-contrôlé : seed depuis ISO
  ref={setDateRef(i)}
  onInput={(e) => {
    // masque JJ/MM/AAAA (garde 0-9 + insère '/'), sans setState → pas de re-render
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;

    let digits = el.value.replace(/\D/g, '').slice(0, 8);
    let masked = digits;
    if (digits.length >= 5) masked = digits.replace(/^(\d{2})(\d{2})(\d{0,4}).*$/, '$1/$2/$3');
    else if (digits.length >= 3) masked = digits.replace(/^(\d{2})(\d{0,2}).*$/, '$1/$2');

    // met à jour la valeur DOM directement (pas de state)
    el.value = masked;

    // caret à la fin (comportement naturel pour un masque)
    const pos = masked.length;
    try { el.setSelectionRange(pos, pos); } catch {}
  }}
  onPaste={(e) => {
    e.preventDefault();
    const el = e.currentTarget;
    const text = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 8);
    let masked = text;
    if (text.length >= 5) masked = text.replace(/^(\d{2})(\d{2})(\d{0,4}).*$/, '$1/$2/$3');
    else if (text.length >= 3) masked = text.replace(/^(\d{2})(\d{0,2}).*$/, '$1/$2');
    el.value = masked;
    const pos = masked.length;
    try { el.setSelectionRange(pos, pos); } catch {}
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); // ferme le clavier mobile
  }}
  onFocus={(e) => setTimeout(() => ensureVisible?.(e.currentTarget), 60)}
  className="h-10 w-full rounded-lg border bg-background shadow-sm px-3 text-sm
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
             focus-visible:ring-offset-2 ring-offset-background"
/>


  </Field>
))}

    </div>

    <p className="text-[11px] text-muted-foreground">
      Saisissez JJ/MM/AAAA. La date sera enregistrée (format ISO) à la fermeture du panneau.
    </p>
  </div>
)}





          <Field label="Travaille ≥ 8h/sem ?">
            <Switch
              checked={Number(weeklyHours ?? 0) >= 8}
              onCheckedChange={(checked) => onWeeklyHoursChange(checked ? 9 : 0)}
            />

          </Field>
                </div>

        {/* SECTION 3 — Carrière AVS */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Début activité lucrative en Suisse (année) */}
          <Field label="Début activité lucrative en Suisse (année)">
            <input
              type="number"
              inputMode="numeric"
              placeholder="ex. 2010"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={typeof startWorkYearCH === 'number' ? startWorkYearCH : ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onStartWorkYearChange(Number.isFinite(n) ? n : undefined);
                }}
              onFocus={(e) => setTimeout(() => ensureVisible(e.currentTarget), 60)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Si vous ne savez pas : nous estimerons par défaut année de naissance + 21.
            </p>
          </Field>

          {/* Années sans cotisations (simple) */}
          <Field label="Années sans cotisations AVS ?">
            <Select
              value={missingYearsMode}
              onChange={(v) => onMissingYearsModeChange((v as 'none' | 'some') ?? 'none')}
              options={[
                { label: 'Aucune', value: 'none' },
                { label: 'Oui (à préciser)', value: 'some' },
              ]}
            />
            {missingYearsMode === 'some' && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Saisir les années séparées par des virgules, ex: 2012,2013"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={missingYears.join(',')}
                  onChange={(e) => {
                    const arr = e.target.value
                      .split(',')
                      .map((s) => Number(s.trim()))
                      .filter((y) => Number.isFinite(y));
                    onMissingYearsChange(arr);
                  }}
                  onFocus={(e) => setTimeout(() => ensureVisible(e.currentTarget), 60)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Laissez vide si vous ne voulez pas préciser maintenant.
                </p>
              </div>
            )}
          </Field>

          {/* Tâches d’assistance */}
          <Field label="Tâches d’assistance (soin d’un proche) ?">
            <div className="flex items-center gap-3">
              <Switch
                checked={caregiving.hasCare}
                onCheckedChange={(checked) =>
                  onCaregivingChange({ hasCare: Boolean(checked), years: caregiving.years })
                }
              />
              <span className="text-sm text-muted-foreground">
                Cochez si vous avez soigné un proche dépendant.
              </span>
            </div>
            {caregiving.hasCare && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Années séparées par virgules, ex: 2018,2019"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={caregiving.years.join(',')}
                  onChange={(e) => {
                    const arr = e.target.value
                      .split(',')
                      .map((s) => Number(s.trim()))
                      .filter((y) => Number.isFinite(y));
                    onCaregivingChange({ hasCare: true, years: arr });
                  }}

                  onFocus={(e) => setTimeout(() => ensureVisible(e.currentTarget), 60)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Optionnel — vous pouvez préciser plus tard.
                </p>
              </div>
            )}
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
            <Drawer
  open={isDrawerOpen}
  onOpenChange={(open) => {
    if (!open) {
      // Commit groupé des dates à la fermeture
      commitChildDates();
    }
    setIsDrawerOpen(open);
  }}
>

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
              <DrawerContent className="p-0">
  <DrawerHeader className="px-6 pt-6">
    <DrawerTitle>Paramètres avancés</DrawerTitle>
  </DrawerHeader>

  {/* zone scrollable dans le drawer */}
  <div
    ref={drawerScrollRef}
    className="px-6 pb-2 max-h-[75vh] overflow-y-auto overscroll-contain"
    data-vaul-no-drag
    >
    {renderParamsFields()}


  </div>

  <DrawerFooter className="px-6 pb-6">
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
                    label: "/mois",
                    icon: <HandCoins className="h-4 w-4" />,
                  },
                  {
                    value: "annual",
                    label: "/an",
                    icon: <HandCoins className="h-4 w-4" />,
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
              {renderParamsFields()}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SeeDetailsButton({
  analysisId,
}: {
  analysisId?: string;
}) {
  const router = useRouter();
  const [userState, setUserState] = React.useState<"loading" | "anon" | "member">("loading");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        await signInAnonymously(auth).catch(() => {});
        setUserState("anon");
      } else {
        setUserState(u.isAnonymous ? "anon" : "member");
      }
    });
    return () => unsub();
  }, []);

  // Migration réelle via Callable Functions
async function migrateIfNeeded(anonUid: string, newUid: string) {
  if (!anonUid || !newUid || anonUid === newUid) return;
  const fn = httpsCallable(getFunctions(/* éventuellement: undefined, "europe-west6" */), "migrateClientData");
  await fn({ fromUid: anonUid, toUid: newUid });
  try {
    localStorage.setItem("ml_clientDocPath", `clients/${newUid}`);
  } catch {}
}


  function go() {
    if (!analysisId) return;
    router.push(`/analyse/${analysisId}/invalidite`);
  }

  async function onLinkEmail() {
    setBusy(true);
    setErr(null);
    const current = auth.currentUser;
    if (!current) return;
    try {
      const cred = EmailAuthProvider.credential(email, pwd);
      await linkWithCredential(current, cred); // ✅ garde le même UID
      setOpen(false);
      go();
    } catch (e: any) {
      if (e?.code === "auth/email-already-in-use") {
        try {
          const anonUid = current.uid;
          const res = await signInWithEmailAndPassword(auth, email, pwd);
          const newUid = res.user.uid;
          if (newUid !== anonUid) await migrateIfNeeded(anonUid, newUid);
          setOpen(false);
          go();
        } catch (e2: any) {
          setErr(e2?.message || "Connexion au compte existant impossible.");
        }
      } else {
        setErr(e?.message || "Création du compte impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onLinkGoogle() {
    setBusy(true);
    setErr(null);
    const current = auth.currentUser;
    if (!current) return;
    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(current, provider); // ✅ garde le même UID
      setOpen(false);
      go();
    } catch (e: any) {
      if (e?.code === "auth/credential-already-in-use" || e?.code === "auth/account-exists-with-different-credential") {
        try {
          const anonUid = current.uid;
          const res = await signInWithPopup(auth, provider);
          const newUid = res.user.uid;
          if (newUid !== anonUid) await migrateIfNeeded(anonUid, newUid);
          setOpen(false);
          go();
        } catch (e2: any) {
          setErr(e2?.message || "Connexion Google impossible.");
        }
      } else {
        setErr(e?.message || "Lien Google impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="link"
        className="px-0"
        onClick={() => {
          if (userState === "member") go();
          else if (userState === "anon") setOpen(true);
        }}
      >
        Voir détails
      </Button>

      <AlertDialog open={open} onOpenChange={(o: boolean) => setOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Créez votre compte pour accéder aux détails</AlertDialogTitle>
            <AlertDialogDescription>
              Les détails (timeline, pièces, prestations) sont protégés. Créez un compte pour y accéder.
              Vos données anonymes seront rattachées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="Mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} />
              {err ? <p className="text-sm text-red-600">{err}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button className="w-full" onClick={onLinkEmail} disabled={busy || !email || !pwd}>
                {busy ? "Création…" : "Créer mon compte"}
              </Button>
              <Button className="w-full" variant="outline" onClick={onLinkGoogle} disabled={busy}>
                Google
              </Button>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

 // Auth anonyme + uid en state (déclenche l'écriture sur clients/{uid})
const [uid, setUid] = React.useState<string | null>(auth?.currentUser?.uid ?? null);

React.useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    if (!u) {
      signInAnonymously(auth).catch((e) =>
        console.warn('[auth] anon sign-in failed', e)
      );
    }
    setUid(u?.uid ?? null);
  });
  return () => unsub();
}, []);



  const { id } = useParams() as { id?: string };
  const analysisId = id ?? ''; // string (évite 'undefined' dans l'URL)
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

// 🟢 APRÈS
const [currentCtx, setCurrentCtx] = useState<GapsCtxExt>({
  eventInvalidity,
  eventDeath,
  invalidityDegreePct: clamp(initialCtx?.invalidityDegreePct ?? 100, 40, 100),
  childrenCount: initialCtx?.childrenCount ?? 0,
  childrenBirthdates: initialCtx?.childrenBirthdates,
  weeklyHours: initialCtx?.weeklyHours ?? undefined,
  birthDateISO: (initialCtx as any)?.birthDateISO,
  survivor: {
  maritalStatus:
    initialCtx?.survivor?.maritalStatus ?? survivorDefault.maritalStatus ?? 'celibataire',

  // hasChild : privilégie la vérité issue du serveur si fournie
  hasChild:
    initialCtx?.survivor?.hasChild ??
    survivorDefault.hasChild ??
    ((initialCtx?.childrenCount ?? 0) > 0),

  // ✅ très important : NE PAS forcer 45 par défaut !
  // On prend d'abord l'age du state, sinon celui envoyé par la page, sinon 0.
  ageAtWidowhood: (() => {
  const fromState  = initialCtx?.survivor?.ageAtWidowhood;
  const fromServer = survivorDefault.ageAtWidowhood;
  if (fromState === 45 && typeof fromServer === 'number' && fromServer > 0 && fromServer < 45) {
    return fromServer; // priorité à l'âge réel si quickParams contient l'ancien 45
  }
  return (fromState ?? fromServer ?? 0);
})(),


  // même logique : on respecte la valeur serveur si dispo
  marriedSince5y:
  initialCtx?.survivor?.marriedSince5y ??
  survivorDefault.marriedSince5y ??
  false,


  // champs étendus : on reprend côté serveur si le state est vide
  partnerDesignated:
    (initialCtx?.survivor as any)?.partnerDesignated ??
    survivorDefault.partnerDesignated ??
    undefined,

  cohabitationYears:
    (initialCtx?.survivor as any)?.cohabitationYears ??
    survivorDefault.cohabitationYears ??
    undefined,
},

});

  const [sexState, setSexState] = useState<'F' | 'M' | undefined>(sex);

/* ===== Nouveaux paramètres carrière AVS (états locaux) ===== */
const [startWorkYearCH, setStartWorkYearCH] = useState<number | undefined>(undefined);
const [missingYearsMode, setMissingYearsMode] = useState<'none' | 'some'>('none');
const [missingYears, setMissingYears] = useState<number[]>([]);
const [caregiving, setCaregiving] = useState<{ hasCare: boolean; years: number[] }>({
  hasCare: false,
  years: [],
});

// 🔗 Chemin Firestore effectif (prop si fournie, sinon depuis localStorage)
const [clientPath, setClientPath] = React.useState<string | undefined>(clientDocPath);

React.useEffect(() => {
  try {
    if (clientDocPath) {
      setClientPath(clientDocPath);
      localStorage.setItem('ml_clientDocPath', clientDocPath);
    } else {
      const cachedPath = localStorage.getItem('ml_clientDocPath');
      if (cachedPath) setClientPath(cachedPath);
    }
  } catch {}
}, [clientDocPath]);


  const [qpReady, setQpReady] = React.useState(false);

  // === Keys locales (scopées par le token/analyse) ===
  const anonToken = React.useMemo(() => {
    
  if (clientPath && clientPath.startsWith('clients/')) {
    const parts = clientPath.split('/');
    return parts[1] ?? null;
  }
  return null;
}, [clientPath]);


const prestationsDocPath = uid ? `clients/${uid}` : '';


// === DEV LOG: observe le doc TOKEN (clients/1kbNUA6EgwOBvTaucAMGSRUnGZv2) ===
React.useEffect(() => {
  if (process.env.NODE_ENV === 'production') return;
  const tokenId = '1kbNUA6EgwOBvTaucAMGSRUnGZv2'; // NB: la collection est "clients" (pluriel)
  const ref = doc(db, `clients/${tokenId}`);
  const unsub = onSnapshot(ref, (snap) => {
    const data = snap.data() ?? {};
    console.group(`[DEV][TOKEN] clients/${tokenId}`);
    console.log('quickParams ►', data.quickParams);
    console.log('prestations ►', data.prestations);
    console.groupEnd();
  });
  return () => unsub();
}, []);


// === DEV LOG: observe le doc UID (clients/{uid}) utilisé par prestations ===
React.useEffect(() => {
  if (process.env.NODE_ENV === 'production') return;
  if (!uid) return;
  const ref = doc(db, `clients/${uid}`);
  const unsub = onSnapshot(ref, (snap) => {
    const data = snap.data() ?? {};
    console.group(`[DEV][UID] clients/${uid}`);
    console.log('quickParams ►', data.quickParams);
    console.log('prestations ►', data.prestations);
    console.groupEnd();
  });
  return () => unsub();
}, [uid]);







// 🔒 Namespace stable basé sur l’analyse en cours
const { id: analysisIdParam } = useParams() as { id?: string };
const storageNS = React.useMemo(
  () => (analysisIdParam ?? clientDocPath ?? anonToken ?? 'analysis'),
  [analysisIdParam, clientDocPath, anonToken]
);

const storageKeyUnit     = React.useMemo(() => `ml_qp_unit_${storageNS}`, [storageNS]);
const storageKeyScenario = React.useMemo(() => `ml_qp_scenario_${storageNS}`, [storageNS]);
const storageKeyQuick    = React.useMemo(() => `ml_qp_cache_${storageNS}`, [storageNS]);



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
        childrenBirthdates: sanitizeBirthdatesUI(cached?.childrenBirthdates) ?? prev.childrenBirthdates,

        survivor: {
          ...prev.survivor,
          maritalStatus: isMaritalStatus(normMarital(cached?.survivor?.maritalStatus))
            ? (normMarital(cached.survivor.maritalStatus) as SurvivorContextLite['maritalStatus'])
            : prev.survivor.maritalStatus,
          hasChild: typeof cached?.survivor?.hasChild === 'boolean' ? cached.survivor.hasChild : prev.survivor.hasChild,
          ageAtWidowhood: typeof cached?.survivor?.ageAtWidowhood === 'number' ? cached.survivor.ageAtWidowhood : prev.survivor.ageAtWidowhood,
          marriedSince5y: typeof cached?.survivor?.marriedSince5y === 'boolean' ? cached.survivor.marriedSince5y : prev.survivor.marriedSince5y,
          partnerDesignated:
            typeof cached?.survivor?.partnerDesignated === 'boolean'
              ? cached.survivor.partnerDesignated
              : prev.survivor.partnerDesignated,
          cohabitationYears:
            typeof cached?.survivor?.cohabitationYears === 'number'
              ? cached.survivor.cohabitationYears
              : prev.survivor.cohabitationYears,
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

            /* ===== Nouveaux paramètres carrière AVS (cache local) ===== */
      if (typeof cached?.startWorkYearCH === 'number') {
        setStartWorkYearCH(cached.startWorkYearCH);
      }

      setMissingYearsMode(
        cached?.missingYearsMode === 'some' ? 'some' : 'none'
      );

      setMissingYears(
        Array.isArray(cached?.missingYears)
          ? cached.missingYears.filter((y: any) => Number.isFinite(y))
          : []
      );

      setCaregiving({
        hasCare: Boolean(cached?.caregiving?.hasCare),
        years: Array.isArray(cached?.caregiving?.years)
          ? cached.caregiving.years.filter((y: any) => Number.isFinite(y))
          : [],
      });


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
  clientDocPath: clientPath ?? clientDocPath, // ✅ chemin stable
  apply: (qp) => {
  if (!qp) return;

  // Sexe
  if (qp.sex === 'F' || qp.sex === 'M') {
    setSexState(qp.sex);
  }

  // 🔧 IMPORTANT : typage local étendu du survivant de Firestore
  const qpS = (qp.survivor ?? {}) as Partial<SurvivorExt>;

  // Contexte (enfants, heures, survivant)
  setCurrentCtx((prev) => ({
    ...prev,
    weeklyHours: typeof qp.weeklyHours === 'number' ? qp.weeklyHours : prev.weeklyHours,
    childrenCount:
      typeof qp.childrenCount === 'number' ? qp.childrenCount : prev.childrenCount,
    childrenBirthdates: Array.isArray(qp.childrenBirthdates)
      ? qp.childrenBirthdates
      : prev.childrenBirthdates,

    survivor: {
      ...prev.survivor,

      // ⚖️ Champs de base
      maritalStatus: isMaritalStatus(qpS.maritalStatus)
        ? (normMarital(qpS.maritalStatus!) as SurvivorContextLite['maritalStatus'])
        : prev.survivor.maritalStatus,
      hasChild:
        typeof qpS.hasChild === 'boolean'
          ? qpS.hasChild!
          : prev.survivor.hasChild,
      ageAtWidowhood:
        typeof qpS.ageAtWidowhood === 'number'
          ? qpS.ageAtWidowhood!
          : prev.survivor.ageAtWidowhood,
      marriedSince5y:
  typeof qpS.marriedSince5y === 'boolean'
    ? qpS.marriedSince5y
    : prev.survivor.marriedSince5y,




      // ✅ Champs étendus (TS ne râle plus car on lit via qpS: Partial<SurvivorExt>)
      partnerDesignated:
        typeof qpS.partnerDesignated === 'boolean'
          ? qpS.partnerDesignated!
          : prev.survivor.partnerDesignated,
      cohabitationYears:
        typeof qpS.cohabitationYears === 'number'
          ? qpS.cohabitationYears!
          : prev.survivor.cohabitationYears,
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

/* ===== Nouveaux paramètres carrière AVS : hydratation (typé, NON destructif) ===== */
const hasCareerKeys =
  ('startWorkYearCH' in qp) ||
  ('missingYearsMode' in qp) ||
  ('missingYears' in qp) ||
  ('caregiving' in qp);

if (hasCareerKeys) {
  if ('startWorkYearCH' in qp) {
    setStartWorkYearCH(
      typeof qp.startWorkYearCH === 'number' ? qp.startWorkYearCH : undefined
    );
  }
  if ('missingYearsMode' in qp) {
    setMissingYearsMode(qp.missingYearsMode === 'some' ? 'some' : 'none');
  }
  if ('missingYears' in qp) {
    setMissingYears(
      Array.isArray(qp.missingYears)
        ? qp.missingYears.filter((y: any) => Number.isFinite(y))
        : []
    );
  }
  if ('caregiving' in qp) {
    setCaregiving({
      hasCare: Boolean(qp.caregiving?.hasCare),
      years: Array.isArray(qp.caregiving?.years)
        ? qp.caregiving.years.filter((y: any) => Number.isFinite(y))
        : [],
    });
  }
}
  // Signal prêt pour la sync
  setQpReady(true);
},


  });

const ctx: GapsCtx = {
  ...currentCtx,
  eventInvalidity,
  eventDeath,
  survivor: {
    ...currentCtx.survivor,
    hasChild: (currentCtx.childrenCount ?? 0) > 0,
  },
  birthDateISO: currentCtx.birthDateISO, // ← expose la date au hook (projection 65)

  // 🔹 Nouveaux paramètres carrière AVS → passés au hook
  avsCareer: {
    startWorkYearCH: typeof startWorkYearCH === 'number' ? startWorkYearCH : undefined,
    missingYearsMode,
    missingYears: missingYearsMode === 'some' ? missingYears : [],
    caregiving: {
      hasCare: caregiving.hasCare,
      years: caregiving.hasCare ? caregiving.years : [],
    },
  },
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

  

  

   const { saving: prestSaving, error: prestError } = usePrestationsSync({
  clientDocPath: prestationsDocPath,               // 🔒 écrit dans clients/{uid} si auth anonyme active
  token: anonToken,
  gaps,                                            // l’objet renvoyé par useGaps
  unit: unit === 'annual' ? 'annual' : 'monthly',  // ton sélecteur /mois /an
 enabled: qpReady && Boolean(prestationsDocPath), // évite d’écrire tant que le chemin n’est pas prêt
  debounceMs: 800,
});








  console.log("GAPS >>>", gaps);


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
    childrenBirthdates: Array.isArray(ctx.childrenBirthdates) ? ctx.childrenBirthdates : undefined,


    

    /* ===== Carrière AVS : nouveaux champs ===== */
    startWorkYearCH: typeof startWorkYearCH === 'number' ? startWorkYearCH : undefined,
    missingYearsMode,
    missingYears: missingYearsMode === 'some' ? missingYears : [],
    caregiving: {
      hasCare: caregiving.hasCare,
      years: caregiving.hasCare ? caregiving.years : [],
    },

    survivor: {
      maritalStatus: ctx.survivor.maritalStatus,
      hasChild: ctx.survivor.hasChild,
      ageAtWidowhood: ctx.survivor.ageAtWidowhood,
      marriedSince5y: ctx.survivor.marriedSince5y,
      // ✅ lire depuis le state étendu
      partnerDesignated: currentCtx.survivor.partnerDesignated,
      cohabitationYears: currentCtx.survivor.cohabitationYears,
    },

    sex: sexState,
    targets: {
      invalidityPctTarget: displayTargets.invalidity,
      deathPctTarget: displayTargets.death,
      retirementPctTarget: displayTargets.retirement,
    },
  } as const;


  const { isSaving, lastSavedAt } = useQuickParamsSync({
  clientDocPath: clientPath ?? "",
  token: anonToken,
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

// Écrit aussi le cache local IMMÉDIATEMENT quand les paramètres changent
React.useEffect(() => {
  if (!qpReady) return; // ⛔️ ne rien écrire tant qu'on n'a pas hydraté
  try {
    localStorage.setItem(storageKeyQuick, JSON.stringify(savePayload));
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [
  qpReady, // ✅ garde supplémentaire
  // Nouveaux champs carrière
  startWorkYearCH,
  missingYearsMode,
  JSON.stringify(missingYears),
  JSON.stringify(caregiving),

  // 🔁 Anciens champs qui “repartaient à défaut” entre pages
  sexState,
  currentCtx.survivor.maritalStatus,
  currentCtx.survivor.marriedSince5y,
  currentCtx.childrenCount,
  JSON.stringify(currentCtx.childrenBirthdates),
  currentCtx.weeklyHours,
]);




  React.useEffect(() => {
    onParamsChange?.({
      targets: currentTargets,
      ctx,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(currentTargets), JSON.stringify(ctx)]);

  // ⚠️ Attendre la première lecture Firestore pour afficher les paramètres
if (!qpReady) {
  return (
    <motion.section className="w-full space-y-8">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Paramètres rapides</CardTitle>
          <CardDescription>Chargement…</CardDescription>
        </CardHeader>
        <CardContent>
          {/* petit placeholder minimal */}
          <div className="h-6 w-48 rounded bg-muted/50 mb-3" />
          <div className="h-6 w-64 rounded bg-muted/50 mb-3" />
          <div className="h-6 w-56 rounded bg-muted/50" />
        </CardContent>
      </Card>
    </motion.section>
  );
}


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
      survivor={currentCtx.survivor}
      onSurvivorChange={(next) => setCurrentCtx((prev) => ({ ...prev, survivor: next }))}
      childrenCount={ctx.childrenCount}
      onChildrenChange={(n) => {
        const nn = Math.max(0, n);
        setCurrentCtx((prev) => {
          const next = (prev.childrenBirthdates ?? []).slice(0, nn);
          while (next.length < nn) next.push('');
          return {
            ...prev,
            childrenCount: nn,
            childrenBirthdates: next,
            survivor: { ...prev.survivor, hasChild: nn > 0 },
          };
        });
      }}
      childrenBirthdates={ctx.childrenBirthdates}
      onChildBirthdateChange={(index, iso) => {
        setCurrentCtx((prev) => {
          const arr = (prev.childrenBirthdates ?? []).slice();
          arr[index] = ISO_DATE_RE.test(iso) ? iso : '';
          return { ...prev, childrenBirthdates: arr };
        });
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

      /* ===== Nouvelles props ===== */
      startWorkYearCH={startWorkYearCH}
      onStartWorkYearChange={(n) => setStartWorkYearCH(n)}
      missingYearsMode={missingYearsMode}
      onMissingYearsModeChange={(m) => setMissingYearsMode(m)}
      missingYears={missingYears}
      onMissingYearsChange={(arr) => setMissingYears(arr)}
      caregiving={caregiving}
      onCaregivingChange={(c) => setCaregiving(c)}

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
                <SeeDetailsButton analysisId={analysisId} />
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
                <Link href={analysisId ? `/analyse/${analysisId}/deces` : '#'}>Voir détails</Link>
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
                <Link href={analysisId ? `/analyse/${analysisId}/retraite` : '#'}>Voir détails</Link>

              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
