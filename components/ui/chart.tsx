"use client";

import * as React from "react";
import { Tooltip as RechartsTooltip } from "recharts";

/** Déclare les couleurs via CSS vars: var(--color-<key>) */
export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
    valueFormatter?: (v: any) => string;
  }
>;

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {};
  Object.entries(config).forEach(([k, v]) => {
    if (v?.color) (style as any)[`--color-${k}`] = v.color;
  });

  return (
    <div className={["relative", className || ""].join(" ")} style={style}>
      {children}
    </div>
  );
}

export function ChartTooltip(
  props: React.ComponentProps<typeof RechartsTooltip>
) {
  return <RechartsTooltip {...props} wrapperStyle={{ outline: "none" }} />;
}

/** Typage minimal compatible Recharts v2/v3 */
type TooltipEntry = {
  color?: string;
  name?: string | number;
  value?: number | string | null;
  dataKey?: string | number;
};

type TooltipMinimalProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
};

export function ChartTooltipContent({
  indicator = "dot",
  valueFormatter,
  active,
  label,
  payload,
}: {
  indicator?: "dot" | "line" | "none";
  valueFormatter?: (v: any, name?: string, key?: string) => string;
} & TooltipMinimalProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-2 text-xs shadow-sm">
      {label != null && (
        <div className="mb-1 font-medium text-gray-700">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const color = entry.color as string | undefined;
          const name = String(entry.name ?? "");
          const key = String(entry.dataKey ?? "");
          const raw = entry.value;
          const val = valueFormatter
            ? valueFormatter(raw, name, key)
            : String(raw ?? "");
          return (
            <div key={i} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                {indicator !== "none" && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: color }}
                  />
                )}
                <span className="text-gray-600">{name}</span>
              </div>
              <span className="font-medium">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
