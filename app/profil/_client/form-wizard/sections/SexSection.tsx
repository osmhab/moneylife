"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

function SelectCard({
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

export default function SexSection({ form }: { form: UseFormReturn<MinimalForm> }) {
  const { watch, setValue } = form;
  const v = watch("Enter_sexe");

  return (
    <div className="space-y-3">
      <Label>Votre sexe</Label>
      <div className="grid grid-cols-2 gap-3">
        <SelectCard
          label="Homme"
          active={v === 0}
          onClick={() => setValue("Enter_sexe", 0, { shouldValidate: true, shouldDirty: true })}
        />
        <SelectCard
          label="Femme"
          active={v === 1}
          onClick={() => setValue("Enter_sexe", 1, { shouldValidate: true, shouldDirty: true })}
        />
      </div>
    </div>
  );
}