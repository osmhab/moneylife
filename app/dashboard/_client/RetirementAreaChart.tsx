// app/dashboard/_client/RetirementAreaChart.tsx
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

// ==== MOTEUR RETRAITE (mêmes briques que results/page.tsx) ====

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

import { computeRetraite } from "@/lib/calculs/events/retraite";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

type Mode = "retraite"; // on garde le pattern si plus tard tu ajoutes d'autres variantes

type Point = {
  year: number;
  age: number | null;
  salaire: number; // besoin (référence)
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

/**
 * Timeline Retraite : de l'âge légal jusqu'à 88 ans
 */
function buildRetraiteTimeline(
  client: ClientData,
  legal: Legal_Settings
): Point[] {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);

  // Âge légal
  const startAt = (by ?? currentYear()) + legal.Legal_AgeRetraiteAVS; // ex. 65 ans
  const endY = startAt + (88 - legal.Legal_AgeRetraiteAVS); // ex. 65 → 88 inclus

  const years = Array.from(
    { length: endY - startAt + 1 },
    (_, i) => startAt + i
  );

  return years.map((y) => {
    const res = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
    const ai = res.annual.avs;
    const lpp = res.annual.lpp;
    const laa = 0;

    const age = by != null ? y - by : null;

    return {
      year: y,
      age,
      salaire: need,
      avsAi: ai,
      laa,
      lpp,
    };
  });
}

// ==== CONFIG CHART ====

const chartConfig = {
  salaire: {
    label: "Salaire de référence",
    color: "hsl(var(--chart-1))",
  },
  avsAi: {
    label: "Rentes AVS",
    color: "hsl(var(--chart-2))",
  },
  laa: {
    label: "LAA (n/a)",
    color: "hsl(var(--chart-3))",
  },
  lpp: {
    label: "Rentes LPP",
    color: "hsl(var(--chart-4))",
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
          if (key === "salaire") return null;

          const conf = chartConfig[key as keyof typeof chartConfig];
          const v =
            typeof item.value === "number"
              ? item.value
              : Number(item.value ?? 0);
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
            <span className="text-muted-foreground">Total rentes</span>
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

export default function RetirementAreaChart() {
  const [mode] = React.useState<Mode>("retraite"); // placeholder si on étend plus tard
  const [uid, setUid] = React.useState<string | null>(null);
  const [client, setClient] = React.useState<ClientData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Auth
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

  // Données client
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

  const data = React.useMemo(
    () => (client ? buildRetraiteTimeline(client, legal) : []),
    [client, legal]
  );

  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];

  return (
    <Card className="h-full w-full border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-0 pb-4">
        <div>
          <CardTitle className="text-base sm:text-lg">
            Retraite — rentes AVS & LPP
          </CardTitle>
          <CardDescription>
            Projection de tes rentes AVS et LPP du départ à la retraite
            jusqu&apos;à 88 ans, comparées à ton salaire de référence.
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

        {/* Pour garder la même signature visuelle, on affiche juste un badge "Retraite" */}
        <div className="shrink-0 hidden sm:flex">
          <Tabs value="retraite" className="pointer-events-none opacity-70">
            <TabsList className="grid grid-cols-1">
              <TabsTrigger value="retraite">Retraite</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="sm:hidden w-[140px] opacity-70">
          <Select value="retraite" disabled>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retraite">Retraite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {loading || !client ? (
          <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
            {loading
              ? "Chargement des données retraite…"
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

                {/* Salaire = besoin (référence, non stackée) */}
                <Area
                  type="monotone"
                  dataKey="salaire"
                  fill="var(--chart-1)"
                  stroke="var(--chart-1)"
                  fillOpacity={0.18}
                />

                {/* Rentes stackées */}
                <Area
                  type="monotone"
                  dataKey="avsAi"
                  stackId="a"
                  fill="var(--chart-2)"
                  stroke="var(--chart-2)"
                  fillOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="laa"
                  stackId="a"
                  fill="var(--chart-3)"
                  stroke="var(--chart-3)"
                  fillOpacity={0.0} // LAA = 0 mais on garde pour consistance
                />
                <Area
                  type="monotone"
                  dataKey="lpp"
                  stackId="a"
                  fill="var(--chart-4)"
                  stroke="var(--chart-4)"
                  fillOpacity={0.45}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ce graphique reprend les mêmes hypothèses que la matrice Retraite :
          rentes AVS et LPP constantes sur la période, comparées à ton besoin.
        </p>
      </CardContent>
    </Card>
  );
}