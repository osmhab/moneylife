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

export default function ConcubinageMenageSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_menageCommun5Ans?: boolean;
    }
  >;
}) {
  const { watch, setValue } = form;
  const v = watch("Enter_menageCommun5Ans");

  return (
    <div className="space-y-3">
      <Label>
        Faites-vous ménage commun avec votre partenaire depuis au moins 5 ans ?
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Card
          label="5 ans ou plus"
          active={v === true}
          onClick={() =>
            setValue("Enter_menageCommun5Ans" as any, true, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <Card
          label="Moins de 5 ans"
          active={v === false}
          onClick={() =>
            setValue("Enter_menageCommun5Ans" as any, false, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Cette information est importante pour déterminer si votre partenaire peut être reconnu comme bénéficiaire
        LPP en cas de décès.
      </div>
    </div>
  );
}