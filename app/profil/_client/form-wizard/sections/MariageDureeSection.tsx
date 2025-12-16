"use client";

import React, { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

function Choice({
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

export default function MariageDureeSection({ form }: { form: UseFormReturn<MinimalForm> }) {
  const { watch, setValue } = form;
  const ec = watch("Enter_etatCivil");
  const v = watch("Enter_mariageDuree");

  // Si l’utilisateur quitte l’état "marié/partenaire", on nettoie gentiment la valeur
  useEffect(() => {
    const isMarriedOrPartner = ec === 1 || ec === 3;
    if (!isMarriedOrPartner && v != null) {
      setValue("Enter_mariageDuree", undefined as any, { shouldDirty: true, shouldValidate: true });
    }
  }, [ec]);

  return (
    <div className="space-y-3">
      <Label>Depuis quand êtes-vous marié·e ?</Label>
      <div className="grid grid-cols-1 gap-3">
        <Choice
          label="Au moins 5 ans"
          active={v === 0}
          onClick={() => setValue("Enter_mariageDuree", 0, { shouldValidate: true, shouldDirty: true })}
        />
        <Choice
          label="Moins de 5 ans"
          active={v === 1}
          onClick={() => setValue("Enter_mariageDuree", 1, { shouldValidate: true, shouldDirty: true })}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Cette information aide à déterminer certains droits (rentes de survivants, etc.).
      </div>
    </div>
  );
}