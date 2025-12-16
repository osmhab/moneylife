//app/dashboard/_client/InvalidityAreaChart.tsx
"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";


import { cn } from "@/lib/utils";

// ==== MOTEUR D'INVALIDITÉ (mêmes briques que results/page.tsx) ====

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

type Mode = "maladie" | "accident";

type Point = {
  year: number;
  age: number | null;
  salaire: number; // besoin
  ij: number;
  avsAi: number;
  laa: number;
  lpp: number;
};

const { meta } = Legal_Echelle44_2025;

const DEFAULT_LEGAL_2025: Legal_Settings = {
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
  Legal_ijAccidentTaux: 80,
  Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
  Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
  Legal_BTE_SplitMarried: 0.5,
};

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

/**
 * Construit la timeline d'invalidité Maladie (2 ans IJ, puis rentes)
 */
function buildInvaliditeTimelineMaladie(
  client: ClientData,
  legal: Legal_Settings
): Point[] {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  // IJ Maladie annuelle pour la phase 1
  const first = computeInvaliditeMaladie(
    yearDate(startY),
    client,
    legal,
    Legal_Echelle44_2025.rows
  );
  const ijAnnual = first.phaseIj.annualIj;

  return years.map((y, idx) => {
    const yearIndex = idx;
    let ai = 0,
      lpp = 0,
      laa = 0,
      ij = 0;

    if (yearIndex < 2) {
      ij = ijAnnual;
    } else {
      const res = computeInvaliditeMaladie(
        yearDate(y),
        client,
        legal,
        Legal_Echelle44_2025.rows
      );
      ai =
        (res.phaseRente.annual as any).aiTotal ??
        res.phaseRente.annual.ai ??
        0;
      lpp =
        (res.phaseRente.annual.lppInvalidite ?? 0) +
        (res.phaseRente.annual.lppEnfants ?? 0);
      laa = 0;
    }

    const age = by != null ? y - by : null;

    return {
      year: y,
      age,
      salaire: need,
      ij,
      avsAi: ai,
      laa,
      lpp,
    };
  });
}

/**
 * Construit la timeline d'invalidité Accident (2 ans IJ, puis rentes coord.)
 */
function buildInvaliditeTimelineAccident(
  client: ClientData,
  legal: Legal_Settings
): Point[] {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  // IJ Accident annuelle pour la phase 1
  const first = computeInvaliditeAccident(
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { referenceDate: yearDate(startY) }
  );
  const ijAnnual = first.phaseIj.annualIj;

  return years.map((y, idx) => {
    const yearIndex = idx;
    let ai = 0,
      lpp = 0,
      laa = 0,
      ij = 0;

    if (yearIndex < 2) {
      ij = ijAnnual;
    } else {
      const res = computeInvaliditeAccident(
        client,
        legal,
        Legal_Echelle44_2025.rows,
        { referenceDate: yearDate(y) }
      );
      ai = res.phaseRente.annual.aiTotal;
      lpp = res.phaseRente.annual.lppAfterCap;
      laa = res.phaseRente.annual.laaAfterCap;
    }

    const age = by != null ? y - by : null;

    return {
      year: y,
      age,
      salaire: need,
      ij,
      avsAi: ai,
      laa,
      lpp,
    };
  });
}

// ==== CONFIG CHART ====

const chartConfig = {
  salaire: {
    label: "Salaire brut",
    color: "hsl(var(--chart-1))",
  },
  ij: {
    label: "Indemnités journalières",
    color: "hsl(var(--chart-2))",
  },
  avsAi: {
    label: "AVS / AI",
    color: "hsl(var(--chart-3))",
  },
  laa: {
    label: "LAA",
    color: "hsl(var(--chart-4))",
  },
  lpp: {
    label: "LPP",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

type CustomTooltipPayloadItem = {
  dataKey?: string | number;
  value?: number | string | null;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string | number;
};

function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // On filtre les valeurs <= 0
  const filtered = (payload ?? []).filter((item: CustomTooltipPayloadItem) => {
    const v =
      typeof item.value === "number"
        ? item.value
        : Number(item.value ?? 0);
    return v > 0;
  });

  if (!filtered.length) return null;

  let salaire = 0;
  let totalPrestations = 0;

  filtered.forEach((item: CustomTooltipPayloadItem) => {
    const key = String(item.dataKey);
    const v =
      typeof item.value === "number"
        ? item.value
        : Number(item.value ?? 0);
    if (key === "salaire") {
      salaire = v;
    } else {
      totalPrestations += v;
    }
  });

  const hasLacune = salaire > 0;
  const gap = hasLacune ? salaire - totalPrestations : 0;

  const formatCHF = (n: number) =>
    `${Math.round(n).toLocaleString("fr-CH")} CHF`;

  return (
    <div className="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md">
      {/* Ligne titre (âge) */}
      <div className="mb-1 font-medium">
        {typeof label === "number" ? `${label} ans` : label}
      </div>

      {/* Lignes par couche */}
      <div className="space-y-1">
        {filtered.map((item: CustomTooltipPayloadItem) => {
          const key = String(item.dataKey);
          if (key === "salaire") return null; // on cache la ligne Salaire brut

          const conf = chartConfig[key as keyof typeof chartConfig];
          const v =
            typeof item.value === "number"
              ? item.value
              : Number(item.value ?? 0);

          // On réutilise directement la couleur définie dans chartConfig
          const color = conf?.color ?? "hsl(var(--foreground))";

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-muted-foreground">
                  {conf?.label ?? key}
                </span>
              </div>
              <span className="tabular-nums text-[11px]">
                {formatCHF(v)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Total + Lacune/Surplus */}
      {hasLacune && (
        <div className="mt-2 border-t pt-1.5 space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Total prestations</span>
            <span className="tabular-nums">
              {formatCHF(totalPrestations)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {gap >= 0 ? "Lacune" : "Surplus"}
            </span>
            <span
              className={cn(
                "tabular-nums",
                gap > 0
                  ? "text-red-500"
                  : gap < 0
                  ? "text-emerald-500"
                  : "text-muted-foreground"
              )}
            >
              {formatCHF(Math.abs(gap))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvalidityAreaChart() {
  const [mode, setMode] = React.useState<Mode>("maladie");
  const [uid, setUid] = React.useState<string | null>(null);
  const [client, setClient] = React.useState<ClientData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // 1) Auth → on récupère juste l'uid
  React.useEffect(() => {
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

  // 2) Données client → subscribeDonneesPersonnelles(uid)
  React.useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDonneesPersonnelles(uid, (d) => {
      setClient(d as ClientData | null);
      setLoading(false);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  const legal = DEFAULT_LEGAL_2025;

  const dataMaladie = React.useMemo(
    () => (client ? buildInvaliditeTimelineMaladie(client, legal) : []),
    [client, legal]
  );
  const dataAccident = React.useMemo(
    () => (client ? buildInvaliditeTimelineAccident(client, legal) : []),
    [client, legal]
  );

  const data = mode === "maladie" ? dataMaladie : dataAccident;

  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];

  return (
    <Card className="h-full w-full border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-0 pb-4">
        <div>
          <CardTitle className="text-base sm:text-lg">
            Invalidité — projection jusqu&apos;à 65 ans
          </CardTitle>
          <CardDescription>
            Prestations d'assurances Indemnités journalières / AVS-AI / LAA / LPP sur ta période
            d&apos;activité.
          </CardDescription>
          {firstPoint && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              De{" "}
              {firstPoint.age != null
                ? `${firstPoint.age} ans`
                : firstPoint.year}{" "}
              à{" "}
              {lastPoint?.age != null
                ? `${lastPoint.age} ans`
                : lastPoint?.year}
              .
            </p>
          )}
        </div>
                <div className="shrink-0 flex items-center gap-2">
          {/* Desktop / tablette large : Tabs */}
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            className="hidden sm:flex"
          >
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="maladie">Maladie</TabsTrigger>
              <TabsTrigger value="accident">Accident</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Mobile / petite tablette : Select */}
          <div className="sm:hidden w-[140px]">
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maladie">Maladie</SelectItem>
                <SelectItem value="accident">Accident</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {loading || !client ? (
          <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
            {loading
              ? "Chargement des données d'invalidité…"
              : "Aucune donnée client disponible."}
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="age"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        tickFormatter={(v) =>
          v == null || Number.isNaN(v) ? "" : `${v} ans`
        }
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={70}
        tickFormatter={(v) => `${Math.round((v as number) / 1000)}k`}
      />
            <Tooltip content={<CustomTooltip />} />
      {/* Salaire (besoin) → couche indépendante, non stackée */}
<Area
  type="monotone"
  dataKey="salaire"
  fill="var(--chart-1)"
  stroke="var(--chart-1)"
  fillOpacity={0.18}
/>

{/* Prestations stackées entre elles */}
<Area
  type="monotone"
  dataKey="ij"
  stackId="a"
  fill="var(--chart-2)"
  stroke="var(--chart-2)"
  fillOpacity={0.3}
/>
<Area
  type="monotone"
  dataKey="avsAi"
  stackId="a"
  fill="var(--chart-3)"
  stroke="var(--chart-3)"
  fillOpacity={0.35}
/>
<Area
  type="monotone"
  dataKey="laa"
  stackId="a"
  fill="var(--chart-4)"
  stroke="var(--chart-4)"
  fillOpacity={0.4}
/>
<Area
  type="monotone"
  dataKey="lpp"
  stackId="a"
  fill="var(--chart-5)"
  stroke="var(--chart-5)"
  fillOpacity={0.45}
/>
    </AreaChart>
  </ResponsiveContainer>
</ChartContainer>
        )}
                <p className="mt-2 text-[11px] text-muted-foreground">
          Ce graphique utilise le même moteur de calcul que la page
          &laquo;&nbsp;Prestations (matrices annuelles)&nbsp;&raquo; pour
          l&apos;invalidité (Maladie / Accident), mais en version visuelle
          cumulée.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          (Debug temporaire) Points: {data.length}
        </p>
      </CardContent>
    </Card>
  );
}