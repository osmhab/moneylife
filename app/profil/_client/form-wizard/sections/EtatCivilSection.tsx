"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

const OPTIONS: Array<{ v: number; label: string }> = [
  { v: 0, label: "Célibataire" },
  { v: 1, label: "Marié·e" },
  { v: 2, label: "Divorcé·e" },
  { v: 3, label: "Partenariat enregistré" },
  { v: 4, label: "Concubinage" },
  { v: 5, label: "Veuf·ve" },
];

function OptionCard({
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

export default function EtatCivilSection({ form }: { form: UseFormReturn<MinimalForm> }) {
  const { watch, setValue } = form;
  const v = watch("Enter_etatCivil");

  return (
    <div className="space-y-3">
      <Label>Votre état civil</Label>
      <div className="grid grid-cols-1 gap-3">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.v}
            label={o.label}
            active={v === o.v}
            onClick={() => setValue("Enter_etatCivil", o.v, { shouldValidate: true, shouldDirty: true })}
          />
        ))}
      </div>
    </div>
  );
}