"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

function Card({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        active ? "border-teal-400 ring-2 ring-teal-200" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base">{label}</span>
        {active && <span className="text-teal-500 text-sm">✓</span>}
      </div>
    </button>
  );
}

export default function SpouseSexSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_spouseSexe?: number;
    }
  >;
}) {
  const { watch, setValue } = form;
  const v = watch("Enter_spouseSexe");

  return (
    <div className="space-y-3">
      <Label>Sexe du conjoint / partenaire</Label>
      <div className="grid grid-cols-2 gap-3">
        <Card
          label="Homme"
          active={v === 0}
          onClick={() =>
            setValue("Enter_spouseSexe" as any, 0, { shouldDirty: true, shouldValidate: true })
          }
        />
        <Card
          label="Femme"
          active={v === 1}
          onClick={() =>
            setValue("Enter_spouseSexe" as any, 1, { shouldDirty: true, shouldValidate: true })
          }
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Cette information est utilisée pour calculer correctement les rentes de survivants.
      </div>
    </div>
  );
}