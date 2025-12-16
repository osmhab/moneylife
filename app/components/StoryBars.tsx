// app/components/StoryBars.tsx
"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Label,
} from "recharts";
import { Switch } from "@/components/ui/switch";

// === Types & registry
import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

const { meta } = Legal_Echelle44_2025;

// === Compute (source de vérité)
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import { computeRetraite } from "@/lib/calculs/events/retraite";

/* ========================= Utils / Thème ========================= */
const COLORS = {
  needLine: "rgba(0,0,0,0.25)", // ligne salaire + label discret mais visible
  full: "#4FD1C5",              // >=100%
  mid:  "#F0AB00",              // 90–100%
  low:  "#FF5858",              // <90%
  axis: "rgba(0,0,0,0.55)",
  grid: "rgba(0,0,0,0.12)",
};

const chf = (n: number) =>
  new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n));

function kFormat(n: number) {
  const abs = Math.abs(n);
  if (abs < 1000) return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(n);
  const v = n / 1000;
  const s = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(v);
  return `${s} k`;
}

const yearDate   = (y: number) => new Date(y, 0, 1);
const currentYear = () => new Date().getFullYear();
function getBirthYearFromClient(client: any): number | undefined {
  const raw = client?.Enter_dateNaissance as string | undefined;
  if (!raw) return undefined;
  const m = raw.replace(/\s/g, "");
  const m1 = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(m);
  if (m1) {
    return Number(m1[3]);
  }
  const d = new Date(m);
  if (!isNaN(d.getTime())) return d.getFullYear();
  return undefined;
}
const monthShort  = (d: Date) =>
  ["jan.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."][d.getMonth()];

function roundUpToStep(n: number, step: number) {
  return Math.ceil(n / step) * step;
}
function chooseNiceStep(max: number) {
  if (max > 240_000) return 50_000;
  if (max > 120_000) return 20_000;
  if (max > 70_000)  return 10_000;
  if (max > 40_000)  return 5_000;
  return 2_000;
}
function buildYTicks(yMax: number, salary: number) {
  const step = chooseNiceStep(yMax);
  const upper = roundUpToStep(yMax, step);
  const ticks: number[] = [];
  for (let v = step; v <= upper; v += step) ticks.push(v);
  if (!ticks.includes(salary)) ticks.push(salary);
  return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

type Matrix = {
  headerYears: number[];
  rows: { label: string; cells: (number | string)[] }[];
};

type StoryBarsProps = {
  client: ClientData;
  legal: Legal_Settings;
  kind: "invalidite-maladie" | "invalidite-accident" | "deces-maladie" | "deces-accident" | "retraite";
  labelOverrides?: Record<number, string>;
  height?: number;
  barWidthPx?: number;
  /** horizon par défaut (en années) sauf pour retraite qui gère 65→87 */
  horizonYears?: number;
};

/* ====== Fallback légal propre (corrige l’avertissement TS 2783) ====== */
const LEGAL_DEFAULT_2025: Legal_Settings = {
  Legal_SalaireAssureMaxLAA: 148_200,
  Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
  Legal_DeductionCoordinationMinLPP: 26_460,
  Legal_SeuilEntreeLPP: 22_680,
  Legal_SalaireMaxLPP: 90_720,
  Legal_SalaireAssureMaxLPP: 64_260,
  Legal_SalaireAssureMinLPP: 3_780,
  Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
  Legal_CotisationsMinLPP: {},
  Legal_AgeRetraiteAVS: 65,
  Legal_AgeLegalCotisationsAVS: 21,
  Legal_Echelle44Version: "2025-01",
  Legal_ijAccidentTaux: 80, // 80% du salaire brut annuel, dès le 3e jour jusqu'au 730e.

  // 🆕 Bonifications AVS (hydratées depuis l’échelle 44)
  Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
  Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
  Legal_BTE_SplitMarried: 0.5,
};
function localLegal(legal: Partial<Legal_Settings> | undefined): Legal_Settings {
  return { ...LEGAL_DEFAULT_2025, ...(legal || {}) };
}

function getRow(matrix: Matrix, label: string): number[] {
  const r = matrix.rows.find((x) => x.label === label);
  if (!r) return matrix.headerYears.map(() => 0);
  return r.cells.map((v) => (typeof v === "string" ? Number(v) : (v as number)) || 0);
}

/* ====== Extraction heuristique des dates de naissance des enfants ====== */
function extractChildrenBirthDates(client: any): Date[] {
  const out: Date[] = [];
  const tryParse = (val: any) => {
    if (!val || typeof val !== "string") return;
    const m1 = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(val);
    if (m1) {
      const d = new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
      if (!isNaN(d.getTime())) out.push(d);
      return;
    }
    const d2 = new Date(val);
    if (!isNaN(d2.getTime())) out.push(d2);
  };
  const scan = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(scan); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        const key = (k || "").toLowerCase();
        if (typeof v === "string" && (key.includes("naiss") || key.includes("birth"))) {
          tryParse(v);
        } else if (typeof v === "object" || Array.isArray(v)) {
          if (/(enfant|children|kid|dependant|enfantsacharge|kids)/i.test(key)) scan(v);
        }
      }
    }
  };
  scan(client);
  return out;
}

/* ====== Libellés automatiques : mois courant, fin IJ (+2 ans), mois des 18 ans ====== */
function buildAutoLabelOverrides(
  kind: StoryBarsProps["kind"],
  client: any,
  years: number[],
  base?: Record<number, string>
): Record<number, string> {
  const out: Record<number, string> = { ...(base || {}) };
  if (years.length === 0) return out;

  const now = new Date();
  const y0  = years[0];

  // Mois courant sur l'année de départ
  if (out[0] === undefined) out[0] = `${monthShort(now)} ${y0}`;

  // Fin IJ : même mois + 2 ans (invalidité)
  if ((kind === "invalidite-maladie" || kind === "invalidite-accident")) {
    const idx = years.findIndex((y) => y === y0 + 2);
    if (idx >= 0 && out[idx] === undefined) out[idx] = `${monthShort(now)} ${years[idx]}`;
  }

  // Mois des 18 ans des enfants
  const kids = extractChildrenBirthDates(client);
  for (const bd of kids) {
    const turn18 = new Date(bd);
    turn18.setFullYear(bd.getFullYear() + 18);
    const i = years.findIndex((y) => y === turn18.getFullYear());
    if (i >= 0 && out[i] === undefined) out[i] = `${monthShort(turn18)} ${years[i]}`;
  }
  return out;
}

/* ====== Données pour Recharts (inclut IJ) ====== */
function buildDataFromMatrix(
  matrix: Matrix,
  needAnnual: number,
  labelOverrides: Record<number, string>,
  optimized = false
) {
  const avs   = getRow(matrix, "AVS/AI");
  const lpp   = getRow(matrix, "LPP");
  const laa   = getRow(matrix, "LAA");
  const ijMal = getRow(matrix, "Indemnités journalières Maladie");
  const ijAcc = getRow(matrix, "Indemnités journalières Accident");
  const total = getRow(matrix, "Prestation totale");
  const years = matrix.headerYears;

  return years.map((y, i) => {
  const need = needAnnual;
  const ij   = (ijMal[i] || 0) + (ijAcc[i] || 0);
  const label = labelOverrides?.[i] ?? String(y);

  const originalTotal = total[i];
  const gap = Math.max(0, need - originalTotal);

  // En mode Optimisé : on “remplit” visuellement jusqu’au besoin (100%) pour l’effet avant/après
  const shownTotal = optimized ? Math.max(originalTotal, need) : originalTotal;
  const pct  = need > 0 ? shownTotal / need : 0;

  return {
    i, year: y, label,
    need,
    total: shownTotal,      // ce que le BarChart dessine
    originalTotal,          // pour le tooltip
    avs: avs[i],
    lpp: lpp[i],
    laa: laa[i],
    ij,
    gap,                    // devient “Optimisation” en mode optimisé
    pct,
  };
});
}

/* ====== Tooltip format lignes ====== */
const CustomTooltip = ({ active, payload, label, optimized }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as {
    ij: number; avs: number; laa: number; lpp: number; total: number; gap: number; originalTotal?: number; need?: number;
  };

  const lines: { k: string; v: number }[] = [];
  if (d.ij  > 0) lines.push({ k: "Indemnités journ. ", v: d.ij });
  if (d.avs > 0) lines.push({ k: "AVS/AI",  v: d.avs });
  if (d.laa > 0) lines.push({ k: "LAA",     v: d.laa });
  if (d.lpp > 0) lines.push({ k: "LPP",     v: d.lpp });

  // Quand “Optimisé” est activé, on remplace l’intitulé “Lacune” par “Optimisation”
  const gapLabel = optimized ? "Optimisation" : "Lacune";

  // Total affiché : si optimisé, on montre le “Total optimisé” (= min(need, originalTotal + gap) → visuellement 100%).
  const shownTotal = optimized && d.need ? Math.max(d.originalTotal ?? d.total, Math.min(d.need, d.total + d.gap)) : d.total;

  return (
    <div
    className="rounded-xl border bg-white/95 shadow p-3 text-[12px] leading-5"
    style={{ minWidth: 220, maxWidth: "90vw", whiteSpace: "normal", wordBreak: "break-word" }}
    >
      <div className="font-medium mb-1">{label}</div>
      <div className="font-mono">
        {lines.map(({ k, v }) => (
          <div key={k} className="flex justify-between">
            <span>{k}</span>
            <span>{chf(v)}</span>
          </div>
        ))}
        <div className="border-t my-1" />
        <div className="flex justify-between">
          <span>Total{optimized ? " (optimisé)" : ""}</span>
          <span>{chf(shownTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>{gapLabel} :</span>
          <span>{chf(d.gap)}</span>
        </div>
      </div>
    </div>
  );
};

function colorForPct(pct: number) {
  if (pct >= 1)   return COLORS.full;
  if (pct >= 0.9) return COLORS.mid;
  return COLORS.low;
}

/* ========================= Matrix builders (avec IJ pour invalidité) ========================= */
function buildInvaliditeMaladieMatrix(
  client: ClientData,
  legalIn: Legal_Settings,
  _horizonYears = 12
): Matrix {
  const legal = localLegal(legalIn);
  const y0 = currentYear();
  const by = getBirthYearFromClient(client);
  const retireYear = (by ?? y0) + (legal?.Legal_AgeRetraiteAVS ?? 65);
  const endY = Math.max(y0, retireYear);
  const years = Array.from({ length: endY - y0 + 1 }, (_, i) => y0 + i);

  const rows = [
    { label: "AVS/AI",                        cells: [] as number[] },
    { label: "LPP",                           cells: [] as number[] },
    { label: "LAA",                           cells: [] as number[] },
    { label: "Indemnités journalières Maladie", cells: [] as number[] },
    { label: "Prestation totale",             cells: [] as number[] },
  ];

  const start = computeInvaliditeMaladie(yearDate(y0), client, legal, Legal_Echelle44_2025.rows);
  const ij0   = start?.phaseIj?.annualIj ?? 0;

  years.forEach((y, idx) => {
    if (idx < 2) {
      // Phase IJ : uniquement IJ
      rows[0].cells.push(0);
      rows[1].cells.push(0);
      rows[2].cells.push(0);
      rows[3].cells.push(ij0);
      rows[4].cells.push(ij0);
    } else {
      const r   = computeInvaliditeMaladie(yearDate(y), client, legal, Legal_Echelle44_2025.rows);
      const ai  = (r?.phaseRente?.annual as any)?.aiTotal ?? r?.phaseRente?.annual?.ai ?? 0;
      const lpp = (r?.phaseRente?.annual?.lppInvalidite ?? 0) + (r?.phaseRente?.annual?.lppEnfants ?? 0);
      rows[0].cells.push(ai);
      rows[1].cells.push(lpp);
      rows[2].cells.push(0);
      rows[3].cells.push(0);
      rows[4].cells.push(ai + lpp);
    }
  });

  return { headerYears: years, rows };
}

function buildInvaliditeAccidentMatrix(
  client: ClientData,
  legalIn: Legal_Settings,
  _horizonYears = 12
): Matrix {
  const legal = localLegal(legalIn);
  const y0 = currentYear();
  const by = getBirthYearFromClient(client);
  const retireYear = (by ?? y0) + (legal?.Legal_AgeRetraiteAVS ?? 65);
  const endY = Math.max(y0, retireYear);
  const years = Array.from({ length: endY - y0 + 1 }, (_, i) => y0 + i);

  const rows = [
    { label: "AVS/AI",                        cells: [] as number[] },
    { label: "LPP",                           cells: [] as number[] },
    { label: "LAA",                           cells: [] as number[] },
    { label: "Indemnités journalières Accident", cells: [] as number[] },
    { label: "Prestation totale",             cells: [] as number[] },
  ];

  const start = computeInvaliditeAccident(
    client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y0) }
  );
  const ij0 = start?.phaseIj?.annualIj ?? 0;

  years.forEach((y, idx) => {
    if (idx < 2) {
      // Phase IJ : uniquement IJ
      rows[0].cells.push(0);
      rows[1].cells.push(0);
      rows[2].cells.push(0);
      rows[3].cells.push(ij0);
      rows[4].cells.push(ij0);
    } else {
      const r   = computeInvaliditeAccident(
        client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y) }
      );
      const ai  = r?.phaseRente?.annual?.aiTotal ?? 0;
      const lpp = r?.phaseRente?.annual?.lppAfterCap ?? 0;
      const laa = r?.phaseRente?.annual?.laaAfterCap ?? 0;
      rows[0].cells.push(ai);
      rows[1].cells.push(lpp);
      rows[2].cells.push(laa);
      rows[3].cells.push(0);
      rows[4].cells.push(ai + lpp + laa);
    }
  });

  return { headerYears: years, rows };
}

function buildDecesMaladieMatrix(
  client: ClientData,
  legalIn: Legal_Settings,
  _horizonYears = 12
): Matrix {
  const legal = localLegal(legalIn);
  const y0 = currentYear();
  const by = getBirthYearFromClient(client);
  const retireYear = (by ?? y0) + (legal?.Legal_AgeRetraiteAVS ?? 65);
  const endY = Math.max(y0, retireYear);
  const years = Array.from({ length: endY - y0 + 1 }, (_, i) => y0 + i);

  const rows = [
    { label: "AVS/AI",            cells: [] as number[] },
    { label: "LPP",               cells: [] as number[] },
    { label: "LAA",               cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
  ];

const deathRef = new Date(); // décès figé au jour de l’analyse
years.forEach((y) => {
  const r   = computeDecesMaladie(
    deathRef,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) } // enfants calculés à la date de paiement (colonne)
  );
  const avs = r?.annual?.avs ?? 0;
  const lpp = r?.annual?.lppRentes ?? 0;
  rows[0].cells.push(avs);
  rows[1].cells.push(lpp);
  rows[2].cells.push(0);
  rows[3].cells.push(avs + lpp);
});

  return { headerYears: years, rows };
}

function buildDecesAccidentMatrix(
  client: ClientData,
  legalIn: Legal_Settings,
  _horizonYears = 12
): Matrix {
  const legal = localLegal(legalIn);
  const y0 = currentYear();
  const by = getBirthYearFromClient(client);
  const retireYear = (by ?? y0) + (legal?.Legal_AgeRetraiteAVS ?? 65);
  const endY = Math.max(y0, retireYear);
  const years = Array.from({ length: endY - y0 + 1 }, (_, i) => y0 + i);

  const rows = [
    { label: "AVS/AI",            cells: [] as number[] },
    { label: "LPP",               cells: [] as number[] },
    { label: "LAA",               cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
  ];

const deathRef = new Date(); // décès figé au jour de l’analyse
years.forEach((y) => {
  const r   = computeDecesAccident(
    deathRef,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) } // enfants calculés à la date de paiement (colonne)
  );
  const avs = r?.annual?.avs ?? 0;
  const lpp = r?.annual?.lppAfterCap ?? 0;
  const laa = r?.annual?.laaAfterCap ?? 0;
  rows[0].cells.push(avs);
  rows[1].cells.push(lpp);
  rows[2].cells.push(laa);
  rows[3].cells.push(avs + lpp + laa);
});

  return { headerYears: years, rows };
}

function buildRetraiteMatrix(
  client: ClientData,
  legalIn: Legal_Settings,
  horizonYears = 23 // 65→87
): Matrix {
  const legal = localLegal(legalIn);
  const y0 = currentYear();
  const byMask = (client as any)?.Enter_dateNaissance as string | undefined;
  let birthYear: number | undefined;
  if (byMask) {
    const m = byMask.replace(/\s/g, "");
    const ok = /^\d{2}\.\d{2}\.\d{4}$/.test(m) || /^\d{8}$/.test(m);
    if (ok) birthYear = Number(m.length === 8 ? m.slice(4) : m.split(".")[2]);
  }
  const startAt = (birthYear ?? y0) + legal.Legal_AgeRetraiteAVS;
  const endY    = startAt + Math.max(1, horizonYears);
  const years   = Array.from({ length: endY - startAt + 1 }, (_, i) => startAt + i);

  const rows = [
    { label: "AVS/AI",            cells: [] as number[] },
    { label: "LPP",               cells: [] as number[] },
    { label: "LAA",               cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
  ];

  years.forEach(() => {
    const r   = computeDeprecationSafeRetraite(client, legal);
    const avs = r?.annual?.avs ?? 0;
    const lpp = r?.annual?.lpp ?? 0;
    rows[0].cells.push(avs);
    rows[1].cells.push(lpp);
    rows[2].cells.push(0);
    rows[3].cells.push(avs + lpp);
  });

  return { headerYears: years, rows };
}

// Retraite : certains schémas de données LPP/AVS peuvent différer ; garde une couche de robustesse.
function computeDeprecationSafeRetraite(client: ClientData, legal: Legal_Settings) {
  try {
    return computeRetraite(client, legal, Legal_Echelle44_2025.rows);
  } catch {
    // fallback simple si signature diverge
    return computeRetraite(client as any, legal as any, (Legal_Echelle44_2025 as any).rows);
  }
}


const CustomYAxisTick = (props: any) => {
  const { x, y, payload, compact } = props;
  const dx = compact ? -4 : -6;
  const fontSize = compact ? 11 : 12;

  return (
    <g>
      <text
        x={(x ?? 0) + dx}
        y={(y ?? 0) + 4}
        textAnchor="end"
        fill="rgba(0,0,0,0.55)"
        fontSize={fontSize}
      >
        {kFormat(payload.value)}
      </text>
    </g>
  );
};

/* ========================= Composant principal ========================= */
export default function StoryBars({
  client,
  legal,
  kind,
  labelOverrides,
  barWidthPx = 28,
  horizonYears = 12,
}: StoryBarsProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const [optimized, setOptimized] = useState(false);
  const needAnnual = client?.Enter_salaireAnnuel ?? 0;

  const baseMatrix = useMemo<Matrix>(() => {
    switch (kind) {
      case "invalidite-maladie":  return buildInvaliditeMaladieMatrix(client, legal, horizonYears);
      case "invalidite-accident": return buildInvaliditeAccidentMatrix(client, legal, horizonYears);
      case "deces-maladie":       return buildDecesMaladieMatrix(client, legal, horizonYears);
      case "deces-accident":      return buildDecesAccidentMatrix(client, legal, horizonYears);
      case "retraite":            return buildRetraiteMatrix(client, legal, 23);
      default:                    return { headerYears: [], rows: [] };
    }
  }, [client, legal, kind, horizonYears]);

  const autoLabels = useMemo(
    () => buildAutoLabelOverrides(kind, client, baseMatrix.headerYears, labelOverrides),
    [kind, client, baseMatrix.headerYears, labelOverrides]
  );

  const data = useMemo(
  () => buildDataFromMatrix(baseMatrix, needAnnual, autoLabels, optimized),
  [baseMatrix, needAnnual, autoLabels, optimized]
);

  const chartWidth = Math.max(320, data.length * (barWidthPx + 14) + 40);
  const yMax = Math.max(...data.map((d) => Math.max(d.need ?? 0, d.total ?? 0)), 1) * 1.1;
  const yTicks = buildYTicks(yMax, needAnnual);

  return (
  <div className="relative left-1/2 -translate-x-1/2 w-[95vw] md:w-[80vw] lg:w-[80vw]">
    <div className="w-full overflow-x-auto">
      <div style={{ width: chartWidth }} className="relative h-[46vh] md:h-[56vh] lg:h-[60vh]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, left: isMobile ? 24 : 96, right: 12, bottom: 28 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.axis }} tickMargin={8} interval={0} />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              width={isMobile ? 52 : 88}
              tick={(tickProps) => (
                <CustomYAxisTick
                  {...tickProps}
                  compact={isMobile}
                />
              )}
            />

            <Tooltip
          content={<CustomTooltip optimized={optimized} />}
          offset={0}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
        />
            <Bar dataKey="total" radius={[8, 8, 4, 4]}>
              {data.map((d, idx) => (
                <Cell key={idx} fill={colorForPct(d.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div className="mt-3 flex justify-end">
  <div className="flex items-center gap-2 pr-2 md:pr-3">
    <span className="text-[12px] text-zinc-600">
      Visulalisez l’effet d’une couverture à 100%.
    </span>
    <Switch checked={optimized} onCheckedChange={setOptimized} aria-label="Activer mode optimisé" />
  </div>
</div>
  </div>
);
}