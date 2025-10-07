"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,          // Analyse de prévoyance
  SlidersHorizontal,  // Configurateur 3e pilier
  GitCompare,         // Comparateur d’offres
  FileSignature,      // Signature en ligne
  CheckCircle2,       // UI interne
} from "lucide-react";

/* === Tailles "section" compactes === */
const SCENE_H   = "h-[560px] md:h-[620px] xl:h-[680px]";
const ICON_GAP  = "gap-4";
/* un peu moins de marge pour rapprocher le phone du centre */
const ICON_MR   = "mr-6 md:mr-8 xl:mr-10";

/* 🔒 Phone verrouillé en hauteur (pas de % → pas d'effet de souffle) */
const PHONE_H   = "h-[500px] md:h-[560px] xl:h-[600px]";
const PHONE_ASP = "aspect-[9/19.5]";

/** Étapes — icône + couleur + écran associé (contenu MoneyLife) */
const STEPS = [
  {
    key: "analysis",
    label: "Analyse de prévoyance",
    icon: BarChart3,
    color: "#06b6d4",
    screen: <PhoneAnalysis />,
  },
  {
    key: "config",
    label: "Configurateur 3e pilier",
    icon: SlidersHorizontal,
    color: "#10b981",
    screen: <PhoneConfigurator />,
  },
  {
    key: "compare",
    label: "Comparateur d’offres",
    icon: GitCompare,
    color: "#a855f7",
    screen: <PhoneComparator />,
  },
  {
    key: "sign",
    label: "Signature en ligne",
    icon: FileSignature,
    color: "#ec4899",
    screen: <PhoneSignature />,
  },
] as const;

type Step = (typeof STEPS)[number];
type StepKey = Step["key"];

function useAutoplay(count: number, ms = 3000, paused = false) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((v) => (v + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms, paused]);
  return [i, setI] as const;
}

export default function RightScene() {
  const [paused, setPaused] = React.useState(false);
  const [idx, setIdx] = useAutoplay(STEPS.length, 3000, paused);
  const active = STEPS[idx].key as StepKey;

  const onPick = (i: number) => {
    setIdx(i);
    setPaused(true);
  };

  const activeStep = STEPS[idx];

  return (
    <div className={`relative w-full ${SCENE_H}`}>
      {/* padding droite comme le hero : pr-6/md:8/xl:12 */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 md:pr-8 xl:pr-12">
        {/* Colonne d’icônes (boutons) — à gauche du phone */}
        <div className={ICON_MR}>
          <div className={`flex flex-col items-center ${ICON_GAP}`}>
            {STEPS.map((s, i) => {
              const isActive = s.key === active;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onPick(i)}
                  aria-label={s.label}
                  aria-pressed={isActive}
                  className={[
                    "grid h-12 w-12 place-items-center rounded-xl transition-all outline-none",
                    isActive ? "bg-white shadow-md" : "bg-transparent",
                    "focus-visible:ring-2 focus-visible:ring-slate-300",
                  ].join(" ")}
                  style={{ boxShadow: isActive ? "0 10px 20px rgba(2,6,23,0.10)" : "none" }}
                >
                  <Icon className="h-5 w-5" style={{ color: isActive ? s.color : "rgb(148,163,184)" }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Phone verrouillé + glow discret (masqué avant les bords) */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              WebkitMaskImage: "radial-gradient(60% 70% at 62% 50%, #000 58%, transparent 100%)",
              maskImage: "radial-gradient(60% 70% at 62% 50%, #000 58%, transparent 100%)",
              background: "radial-gradient(42% 52% at 60% 45%, rgba(2,6,23,0.06), transparent 70%)",
            }}
          />
          <div className={PHONE_H}>
            <div className={`${PHONE_ASP} h-full`}>
              <PhoneFrame className="h-full">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.35 }}
                    className="h-full"
                  >
                    {activeStep.screen}
                  </motion.div>
                </AnimatePresence>
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== Phone + écrans (contenu MoneyLife) =================== */

function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative h-full overflow-hidden",
        "rounded-[2.25rem] border border-slate-100 ring-1 ring-white/70",
        "bg-white shadow-[0_50px_100px_rgba(2,6,23,0.16)]",
        className,
      ].join(" ")}
      style={{ width: "auto", contain: "layout paint size" }}
    >
      <div className="absolute inset-x-10 top-0 h-6 rounded-b-xl bg-slate-100" />
      <div className="relative h-full p-4 overflow-hidden">{children}</div>
    </div>
  );
}

function PhoneHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
      </div>
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

/* --- ANALYSE --- */
function PhoneAnalysis() {
  return (
    <div className="h-full">
      <PhoneHeader title="Analyse de prévoyance" subtitle="Couvertures & projections" />
      {/* 3 tuiles KPI */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Invalidité", "72%"],
          ["Décès", "81%"],
          ["Retraite", "CHF 1’950"],
        ].map(([k, v], i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="text-[10px] text-slate-600">{k}</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {/* Graphique tabulaire simple */}
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-[12px] text-slate-800">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1.5">Indicateur</th>
              <th className="px-2 py-1.5">Valeur</th>
              <th className="px-2 py-1.5">Tendance</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Taux de charge", "33%", "→"],
              ["Taux d’épargne", "6%", "↑"],
              ["Écart cible", "−8%", "↓"],
            ].map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50">
                <td className="px-2 py-1.5">{r[0]}</td>
                <td className="px-2 py-1.5">{r[1]}</td>
                <td className="px-2 py-1.5">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --- CONFIGURATEUR 3e PILIER --- */
function PhoneConfigurator() {
  return (
    <div className="h-full">
      <PhoneHeader title="Configurateur 3a" subtitle="Temps réel" />
      {/* Allocation / curseurs factices */}
      <div className="space-y-3">
        {[
          ["Prime mensuelle", "CHF 280", 70],
          ["Part Épargne", "60%", 60],
          ["Part Risque", "40%", 40],
        ].map(([label, val, pct], i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-[12px] text-slate-600">
              <span>{label}</span>
              <span className="font-medium text-slate-900 tabular-nums">{val}</span>
            </div>
            <div className="h-2 w-full rounded bg-slate-200">
              <div className="h-2 rounded bg-[#0030A8]" style={{ width: `${pct as number}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Projection simple */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Capital 10 ans", "CHF 41’200"],
          ["Capital 20 ans", "CHF 98’300"],
          ["Capital 30 ans", "CHF 176’900"],
        ].map(([k, v], i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="text-[10px] text-slate-600">{k}</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- COMPARATEUR D’OFFRES --- */
function PhoneComparator() {
  return (
    <div className="h-full">
      <PhoneHeader title="Comparateur d’offres" subtitle="Top 3, taux fixes" />
      <div className="space-y-2">
        {[
          ["Banque A", "1.25 %", "10 ans"],
          ["Banque B", "1.28 %", "5 ans"],
          ["Banque C", "1.32 %", "15 ans"],
        ].map(([bank, rate, term], i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-600">{term}</span>
              <span>{bank}</span>
            </div>
            <strong className="text-slate-900">{rate}</strong>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700">
          Détails
        </button>
        <button className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[12px] font-semibold text-white">
          <CheckCircle2 className="h-3.5 w-3.5" /> Choisir
        </button>
      </div>
    </div>
  );
}

/* --- SIGNATURE EN LIGNE --- */
function PhoneSignature() {
  const steps = [
    ["Identité vérifiée", true],
    ["Données complètes", true],
    ["IBAN ajouté", true],
    ["Signature QES", false],
  ] as const;

  return (
    <div className="h-full">
      <PhoneHeader title="Signature en ligne" subtitle="Swisscom Sign" />
      <div className="space-y-2">
        {steps.map(([label, done], i) => (
          <div
            key={i}
            className={[
              "flex items-center justify-between rounded-lg px-3 py-2 text-[13px]",
              "border",
              done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
            ].join(" ")}
          >
            <span className="text-slate-800">{label}</span>
            {done ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> OK
              </span>
            ) : (
              <span className="text-slate-500">en attente</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end">
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white">
          Signer maintenant
        </button>
      </div>
    </div>
  );
}
