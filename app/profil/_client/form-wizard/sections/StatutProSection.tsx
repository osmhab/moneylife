"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

const OPTIONS: Array<{ v: number; label: string }> = [
  { v: 0, label: "Salarié·e" },
  { v: 1, label: "Indépendant·e" },
  { v: 2, label: "Autre / Sans activité" },
];

function Card({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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

export default function StatutProSection({
  form,
}: {
  form: UseFormReturn<MinimalForm & { Enter_statutProfessionnel?: number }>;
}) {
  const { watch, setValue } = form;
  const v = watch("Enter_statutProfessionnel") ?? 0;

  return (
    <div className="space-y-3">
      <Label>Votre statut professionnel</Label>
      <div className="grid grid-cols-1 gap-3">
        {OPTIONS.map((o) => (
          <Card
            key={o.v}
            label={o.label}
            active={v === o.v}
            onClick={() => setValue("Enter_statutProfessionnel" as any, o.v, { shouldDirty: true, shouldValidate: true })}
          />
        ))}
      </div>
    </div>
  );
}