"use client";

import React, { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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

export default function Travaille8hSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & { Enter_statutProfessionnel?: number; Enter_travaillePlusde8HSemaine?: boolean }
  >;
}) {
  const { watch, setValue } = form;
  const statut = watch("Enter_statutProfessionnel") ?? 0;
  const v = !!watch("Enter_travaillePlusde8HSemaine");

  useEffect(() => {
    if (statut !== 0 && v != null) {
      setValue("Enter_travaillePlusde8HSemaine" as any, undefined, { shouldDirty: true, shouldValidate: true });
    }
  }, [statut]); // eslint-disable-line react-hooks/exhaustive-deps

  if (statut !== 0) {
    return <div className="text-sm text-muted-foreground">Étape non applicable (réservée aux salarié·e·s).</div>;
  }

  return (
    <div className="space-y-3">
      <Label>Travaillez-vous plus de 8h par semaine ?</Label>
      <div className="grid grid-cols-2 gap-3">
        <Toggle
          label="Oui"
          active={v === true}
          onClick={() => setValue("Enter_travaillePlusde8HSemaine" as any, true, { shouldDirty: true, shouldValidate: true })}
        />
        <Toggle
          label="Non"
          active={v === false}
          onClick={() => setValue("Enter_travaillePlusde8HSemaine" as any, false, { shouldDirty: true, shouldValidate: true })}
        />
      </div>
      <div className="text-xs text-muted-foreground">Utile pour la couverture LAA non professionnelle.</div>
    </div>
  );
}