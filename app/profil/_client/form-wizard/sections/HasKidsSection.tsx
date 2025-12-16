"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

function ToggleCard({
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

export default function HasKidsSection({ form }: { form: UseFormReturn<MinimalForm> }) {
  const { watch, setValue } = form;
  const v = !!watch("Enter_hasEnfants");

  return (
    <div className="space-y-3">
      <Label>Avez-vous des enfants à charge ?</Label>
      <div className="grid grid-cols-2 gap-3">
        <ToggleCard
          label="Oui"
          active={v === true}
          onClick={() => setValue("Enter_hasEnfants", true, { shouldValidate: true, shouldDirty: true })}
        />
        <ToggleCard
          label="Non"
          active={v === false}
          onClick={() => setValue("Enter_hasEnfants", false, { shouldValidate: true, shouldDirty: true })}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Si vous choisissez “Oui”, vous pourrez ajouter la date de naissance de chaque enfant à l’étape suivante.
      </div>
    </div>
  );
}