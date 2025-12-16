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

export default function AvsLacunesToggleSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_hasAnnesManquantesAVS?: boolean;
    }
  >;
}) {
  const { watch, setValue } = form;
  const has = !!watch("Enter_hasAnnesManquantesAVS");

  return (
    <div className="space-y-3">
      <Label>Vous avez des périodes sans cotisations AVS ?</Label>
      <div className="grid grid-cols-2 gap-3">
        <Card
          label="Oui"
          active={has === true}
          onClick={() =>
            setValue("Enter_hasAnnesManquantesAVS" as any, true, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <Card
          label="Non"
          active={has === false}
          onClick={() =>
            setValue("Enter_hasAnnesManquantesAVS" as any, false, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Si vous choisissez “Oui”, vous pourrez indiquer les années manquantes à l’étape suivante.
      </div>
    </div>
  );
}