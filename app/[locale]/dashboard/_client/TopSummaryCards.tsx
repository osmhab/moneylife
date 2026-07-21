// app/dashboard/_client/TopSummaryCards.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accessibility,
  Skull,
  TreePalm,
  TrendingDown,
  TrendingUp,
  HandCoins,
  ChevronRight
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import { LEGAL_2025 } from "@/lib/core/legal";

import {
  computeInvaliditeMaladie,
} from "@/lib/calculs/events/invaliditeMaladie";
import {
  computeInvaliditeAccident,
} from "@/lib/calculs/events/invaliditeAccident";
import {
  computeDecesMaladie,
} from "@/lib/calculs/events/decesMaladie";
import {
  computeDecesAccident,
} from "@/lib/calculs/events/decesAccident";
import {
  computeRetraite,
} from "@/lib/calculs/events/retraite";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

const COLORS = {
  navy: "#003263",
  gray: "#B9B9B9",
  neg: "#FF5858",
  mid: "#F0AB00",
  pos: "#4FD1C5",
};

const { meta } = Legal_Echelle44_2025;

const DEFAULT_LEGAL_2025 = LEGAL_2025;

function birthYearFromMask(mask?: string) {
  if (!mask || !isValidDateMask(mask)) return undefined;
  const [, , yyyy] = normalizeDateMask(mask).split(".");
  return Number(yyyy);
}
function currentYear() {
  return new Date().getFullYear();
}
function yearDate(y: number) {
  return new Date(y, 0, 1);
}

// renvoie la valeur la plus fréquente (mode)
function modeValue(arr: number[]): number {
  if (!arr.length) return 0;
  const freq = new Map<number, number>();
  for (const v of arr) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let best = arr[0];
  let bestCount = 0;
  for (const [v, c] of freq) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// utilise des lacunes mensuelles par année et renvoie (mode, yearOfMax)
function summarizeGaps(
  byYear: { year: number; gapMonthly: number }[]
): { modeMonthly: number; maxYear: number | null } {
  if (!byYear.length) return { modeMonthly: 0, maxYear: null };
  const rounded = byYear.map((g) => Math.round(g.gapMonthly));
  const mode = modeValue(rounded);
  // année où la lacune est maximale (en magnitude)
  const max = byYear.reduce(
    (acc, g) =>
      g.gapMonthly > acc.gapMonthly ? g : acc,
    byYear[0]
  );
  return { modeMonthly: mode, maxYear: max.year };
}

type Severity = "pos" | "mid" | "neg";

function getSeverity(gapMonthly: number, needMonthly: number): Severity {
  if (needMonthly <= 0) return "pos";
  if (gapMonthly <= 0) return "pos";
  const ratio = gapMonthly / needMonthly;
  if (ratio <= 0.1) return "mid";
  return "neg";
}

function formatChf(n: number): string {
  return new Intl.NumberFormat("fr-CH", {
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

type SummaryData = {
  needMonthly: number;
  invalidity: {
    scenario: "accident" | "maladie";
    gapMonthly: number;
    maxYear: number | null;
  };
  death: {
    scenario: "accident" | "maladie";
    gapMonthly: number;
    maxYear: number | null;
    capital: number;
  };
  retirement: {
    gapMonthly: number; // positif = lacune ; négatif = surplus
    maxYear: number | null;
  };
};

export function computeSummary(client: ClientData): SummaryData {
  const legal = DEFAULT_LEGAL_2025;
  const needAnnual = client.Enter_salaireAnnuel ?? 0;
  const needMonthly = needAnnual / 12;
  const by = birthYearFromMask((client as any).Enter_dateNaissance);
  const y0 = currentYear();
  const endWorkYear = Math.max(y0, (by ?? y0) + legal.Legal_AgeRetraiteAVS);

  // ==== INVALIDITÉ MALADIE ====
  const gapsInvMal: { year: number; gapMonthly: number }[] = [];
  const firstMal = computeInvaliditeMaladie(
    yearDate(y0),
    client,
    legal,
    Legal_Echelle44_2025.rows
  );
  const ijMal0 = (firstMal?.phaseIj?.annualIj ?? 0) / 12;

  for (let y = y0, idx = 0; y <= endWorkYear; y++, idx++) {
    if (idx < 2) {
      const gap = needMonthly - ijMal0;
      gapsInvMal.push({ year: y, gapMonthly: gap });
    } else {
      const r = computeInvaliditeMaladie(
        yearDate(y),
        client,
        legal,
        Legal_Echelle44_2025.rows
      );
      const ai =
        ((((r?.phaseRente?.annual as any)?.aiTotal ??
          r?.phaseRente?.annual?.ai) ??
          0) /
          12) || 0;
      const lpp =
        ((r?.phaseRente?.annual?.lppInvalidite ?? 0) +
          (r?.phaseRente?.annual?.lppEnfants ?? 0)) /
        12;
      const total = ai + lpp;
      const gap = needMonthly - total;
      gapsInvMal.push({ year: y, gapMonthly: gap });
    }
  }

  // ==== INVALIDITÉ ACCIDENT ====
  const gapsInvAcc: { year: number; gapMonthly: number }[] = [];
  const firstAcc = computeInvaliditeAccident(
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { referenceDate: yearDate(y0) }
  );
  const ijAcc0 = (firstAcc?.phaseIj?.annualIj ?? 0) / 12;

  for (let y = y0, idx = 0; y <= endWorkYear; y++, idx++) {
    if (idx < 2) {
      const gap = needMonthly - ijAcc0;
      gapsInvAcc.push({ year: y, gapMonthly: gap });
    } else {
      const r = computeInvaliditeAccident(
        client,
        legal,
        Legal_Echelle44_2025.rows,
        { referenceDate: yearDate(y) }
      );
      const ai = (r?.phaseRente?.annual?.aiTotal ?? 0) / 12;
      const lpp = (r?.phaseRente?.annual?.lppAfterCap ?? 0) / 12;
      const laa = (r?.phaseRente?.annual?.laaAfterCap ?? 0) / 12;
      const total = ai + lpp + laa;
      const gap = needMonthly - total;
      gapsInvAcc.push({ year: y, gapMonthly: gap });
    }
  }

  const invMalSummary = summarizeGaps(gapsInvMal);
  const invAccSummary = summarizeGaps(gapsInvAcc);

  const invalidScenario =
    invAccSummary.modeMonthly >= invMalSummary.modeMonthly
      ? "accident"
      : "maladie";
  const invalidGapMonthly =
    invalidScenario === "accident"
      ? invAccSummary.modeMonthly
      : invMalSummary.modeMonthly;
  const invalidMaxYear =
    invalidScenario === "accident"
      ? invAccSummary.maxYear
      : invMalSummary.maxYear;

  // ==== DÉCÈS MALADIE ====
  const gapsDecMal: { year: number; gapMonthly: number }[] = [];
  const deathRefMal = new Date();
  for (let y = y0; y <= endWorkYear; y++) {
    const r = computeDecesMaladie(
      deathRefMal,
      client,
      legal,
      Legal_Echelle44_2025.rows,
      { paymentRef: yearDate(y) }
    );
    const avs = (r?.annual?.avs ?? 0) / 12;
    const lpp = (r?.annual?.lppRentes ?? 0) / 12;
    const total = avs + lpp;
    const gap = needMonthly - total;
    gapsDecMal.push({ year: y, gapMonthly: gap });
  }

  const firstDecMal = computeDecesMaladie(
    deathRefMal,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y0) }
  );
  const capitalMal =
    firstDecMal?.capitals?.totalCapitalsMaladie ?? 0;

  // ==== DÉCÈS ACCIDENT ====
  const gapsDecAcc: { year: number; gapMonthly: number }[] = [];
  const deathRefAcc = new Date();
  for (let y = y0; y <= endWorkYear; y++) {
    const r = computeDecesAccident(
      deathRefAcc,
      client,
      legal,
      Legal_Echelle44_2025.rows,
      { paymentRef: yearDate(y) }
    );
    const avs = (r?.annual?.avs ?? 0) / 12;
    const lpp = (r?.annual?.lppAfterCap ?? 0) / 12;
    const laa = (r?.annual?.laaAfterCap ?? 0) / 12;
    const total = avs + lpp + laa;
    const gap = needMonthly - total;
    gapsDecAcc.push({ year: y, gapMonthly: gap });
  }

  const firstDecAcc = computeDecesAccident(
    deathRefAcc,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y0) }
  );
  const capitalAcc =
    firstDecAcc?.capitals?.totalCapitalsAccident ?? 0;

  const decMalSummary = summarizeGaps(gapsDecMal);
  const decAccSummary = summarizeGaps(gapsDecAcc);

  const deathScenario =
    decAccSummary.modeMonthly >= decMalSummary.modeMonthly
      ? "accident"
      : "maladie";
  const deathGapMonthly =
    deathScenario === "accident"
      ? decAccSummary.modeMonthly
      : decMalSummary.modeMonthly;
  const deathMaxYear =
    deathScenario === "accident"
      ? decAccSummary.maxYear
      : decMalSummary.maxYear;
  const deathCapital =
    deathScenario === "accident" ? capitalAcc : capitalMal;

  // ==== RETRAITE (65 → 88), gap pouvant être négatif (surplus) ====
  const gapsRet: { year: number; gapMonthly: number }[] = [];
  const startRetYear = (by ?? y0) + legal.Legal_AgeRetraiteAVS;
  const endRetYear = startRetYear + (88 - legal.Legal_AgeRetraiteAVS);

  for (let y = startRetYear; y <= endRetYear; y++) {
    const r = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
    const avs = (r?.annual?.avs ?? 0) / 12;
    const lpp = (r?.annual?.lpp ?? 0) / 12;
    const total = avs + lpp;
    const gap = needMonthly - total;
    gapsRet.push({ year: y, gapMonthly: gap });
  }

  const retSummary = summarizeGaps(gapsRet);

  return {
    needMonthly,
    invalidity: {
      scenario: invalidScenario,
      gapMonthly: invalidGapMonthly,
      maxYear: invalidMaxYear,
    },
    death: {
      scenario: deathScenario,
      gapMonthly: deathGapMonthly,
      maxYear: deathMaxYear,
      capital: deathCapital,
    },
    retirement: {
      gapMonthly: retSummary.modeMonthly,
      maxYear: retSummary.maxYear,
    },
  };
}

// ========================
// UI CARDS
// ========================



export type KpiCardProps = {
  title: string;
  icon: React.ReactNode;
  monthlyGap: number; // >0 = lacune (perte), <0 = surplus
  coverageDeltaPct: number; // ex. -45, -10, +13
  severity: Severity;
  subtitleTop?: string;
  subtitleBottom?: string;
  capital?: number | null;
  worstYearLabel?: string | null;
  onClick?: () => void;
  storyVariant?: "deces" | "invalidite" | "retraite";
 
};

export function KpiCard({
  title,
  icon,
  monthlyGap,
  coverageDeltaPct,
  severity,
  subtitleTop,
  subtitleBottom,
  capital,
  worstYearLabel,
  onClick,
  storyVariant,
}: KpiCardProps) {
  const isPositive = monthlyGap < 0;
  const gapAbs = Math.abs(monthlyGap);

  const color =
    severity === "pos"
      ? COLORS.pos
      : severity === "mid"
      ? COLORS.mid
      : COLORS.neg;

  const percentLabel =
    coverageDeltaPct > 0
      ? `+${coverageDeltaPct}%`
      : `${coverageDeltaPct}%`;

  const PercentIcon =
    coverageDeltaPct >= 0 ? TrendingUp : TrendingDown;

  // Icône de tendance pour la ligne "lacune/surplus plus important"
  const IconTrend = monthlyGap > 0 ? TrendingDown : TrendingUp;
  const iconColor = monthlyGap > 0 ? COLORS.neg : COLORS.pos;

  return (
  <Card
  className={cn(
    "relative group flex flex-col rounded-2xl border border-zinc-200/70 bg-gradient-to-b from-white to-zinc-50 px-4 py-4 cursor-pointer overflow-hidden",
    "shadow-[0_18px_50px_rgba(2,6,23,0.10)]",
    "transition-all duration-300 ease-out",
    "hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(2,6,23,0.16)]"
  )}
  onClick={onClick}
>
    {/* ✅ Overlay gris léger (desktop hover only) */}
  {/* ✅ Overlay gris léger (desktop hover only) */}
<div
  className={cn(
    "pointer-events-none absolute inset-0 hidden md:block",
    "bg-gradient-to-b from-transparent via-zinc-900/[0.03] to-zinc-900/[0.07]",
    "opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out"
  )}
/>



    
      <div className="relative z-10">
  {/* Header icône + label + pill % */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="text-zinc-600">{icon}</span>
          <span>{title}</span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] bg-white/80">
          <PercentIcon size={24} style={{ color }} />
          <span style={{ color }}>{percentLabel}</span>
        </div>
      </div>

      {/* Montant principal */}
      <div className="mt-4 mb-2">
        <div
            className={cn(
              "text-2xl sm:text-3xl font-bold tracking-tight",
              monthlyGap > 0 ? "text-red-600" : "text-[#003263]"
            )}
          >
            {monthlyGap > 0 ? "-" : "+"}
            {formatChf(gapAbs)}{" "}
            <span className="text-sm font-medium text-zinc-500">
              CHF/mois
            </span>
          </div>
        {capital != null && capital > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
            <HandCoins size={14} className="opacity-80" />
            <span>
              {formatChf(capital)}{" "}
              <span className="text-[10px]">CHF</span>
            </span>
          </div>
        )}
      </div>

            {/* Texte bas */}
      <div className="mt-2 text-[11px] text-zinc-600">
        {/* Lacune plus importante à partir de… (uniquement si vraie lacune) */}
        {worstYearLabel && (
  <div className="mb-0.5 flex items-center gap-1.5">
    <span>
      {monthlyGap > 0
        ? "Lacune plus importante à partir de "
        : "Surplus plus important à partir de "}
      <span className="font-medium">{worstYearLabel}</span>
    </span>
    <IconTrend size={12} className="opacity-80" style={{ color: iconColor }} />
  </div>
)}

        {/* Ligne principale de texte (par ex. Rentes suffisantes / insuffisantes) */}
        {subtitleTop && (
          <div className="mb-0.5">{subtitleTop}</div>
        )}

        {/* Ligne secondaire (par ex. Optimisation requise / Aucune optimisation requise) */}
        {subtitleBottom && (
  <>
    {/* Desktop : texte normal */}
    <div className="hidden md:block text-zinc-400">
      {subtitleBottom}
    </div>

    {/* Mobile : lien vers la story */}
    <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClick?.();
  }}
  className="md:hidden mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary"
>
  Voir ma story
  <ChevronRight className="h-4 w-4" />
</button>
  </>
)}
      </div>
            {/* ✅ Desktop : lien qui monte en bas au hover */}
      <div className="hidden md:flex justify-center pt-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className={cn(
            "inline-flex items-center gap-1 text-sm font-semibold text-primary",
            "opacity-0 translate-y-2",
            "group-hover:opacity-100 group-hover:translate-y-0",
            "transition-all duration-300 ease-out"
          )}
        >
          Voir ma story <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  </Card>
);
}

export default function TopSummaryCards() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid(null);
        setClient(null);
        setLoading(false);
        return;
      }
      setUid(u.uid);
      setLoading(true);
    });
    return () => unsub();
  }, []);

  // Data
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDonneesPersonnelles(uid, (d) => {
      setClient(d as ClientData | null);
      setLoading(false);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  const summary = useMemo(
    () => (client ? computeSummary(client) : null),
    [client]
  );

  if (!uid || loading || !client || !summary) {
    // skeleton simple
    return (
      <div className="grid auto-rows-min gap-4 md:grid-cols-3 md:items-start">
        <div className="h-28 rounded-2xl bg-zinc-100 animate-pulse" />
        <div className="h-28 rounded-2xl bg-zinc-100 animate-pulse" />
        <div className="h-28 rounded-2xl bg-zinc-100 animate-pulse" />
      </div>
    );
  }

  const { needMonthly, invalidity, death, retirement } = summary;

  // === INVALIDITÉ ===
  const invGap = invalidity.gapMonthly;
  const invGapSign = Math.sign(invGap) || 1;
  const invGapAbs = Math.abs(invGap);
  const invDeltaPct =
    needMonthly > 0
      ? -Math.round((invGap / needMonthly) * 100)
      : 0;
  const invSeverity = getSeverity(invGapAbs, needMonthly);
  const invWorstYear = invalidity.maxYear;

  // === DÉCÈS ===
  const deathGap = death.gapMonthly;
  const deathGapAbs = Math.abs(deathGap);
  const deathDeltaPct =
    needMonthly > 0
      ? -Math.round((deathGap / needMonthly) * 100)
      : 0;
  const deathSeverity = getSeverity(deathGapAbs, needMonthly);
  const deathWorstYear = death.maxYear;

  // === RETRAITE ===
  const retGap = retirement.gapMonthly;
  const retGapAbs = Math.abs(retGap);
  const retDeltaPct =
    needMonthly > 0
      ? -Math.round((retGap / needMonthly) * 100)
      : 0;
  const retSeverity = getSeverity(retGap, needMonthly);
  const retWorstYear = retirement.maxYear;

  const goToStory = () => router.push("/profil/story-mock");

  return (
    <div className="grid auto-rows-min gap-4 md:grid-cols-3">
      {/* Décès */}
      <KpiCard
  title="Couverture en cas de décès"
  icon={<Skull size={48} className="opacity-70" />}
  monthlyGap={deathGap}
  coverageDeltaPct={deathDeltaPct}
  severity={deathSeverity}
  subtitleBottom="Optimisation requise"
  capital={death.capital || null}
  worstYearLabel={deathWorstYear?.toString() ?? null}
  onClick={goToStory}
  storyVariant="deces"
/>

      {/* Invalidité */}
      <KpiCard
  title="Couverture en cas d’invalidité"
  icon={<Accessibility size={48} className="opacity-70" />}
  monthlyGap={invGap}
  coverageDeltaPct={invDeltaPct}
  severity={invSeverity}
  subtitleBottom="Optimisation requise"
  worstYearLabel={invalidity.maxYear?.toString() ?? null}
  onClick={goToStory}
  storyVariant="invalidite"
/>

      {/* Retraite */}
      <KpiCard
  title="Situation à la retraite"
  icon={<TreePalm size={48} className="opacity-70" />}
  monthlyGap={retGap}
  coverageDeltaPct={retDeltaPct}
  severity={retSeverity}
  subtitleTop={
    retGap <= 0
      ? "Rentes suffisantes"
      : "Rentes insuffisantes"
  }
  subtitleBottom={
    retGap <= 0
      ? "Aucune optimisation requise"
      : "Optimisation requise"
  }
  worstYearLabel={retWorstYear?.toString() ?? null}
  onClick={goToStory}
  storyVariant="retraite"
/>
    </div>
  );
}