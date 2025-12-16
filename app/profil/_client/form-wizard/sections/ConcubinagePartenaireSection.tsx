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

export default function ConcubinagePartenaireSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_partenaireDesigneLPP?: boolean;
    }
  >;
}) {
  const { watch, setValue } = form;
  const v = watch("Enter_partenaireDesigneLPP");

  return (
    <div className="space-y-3">
      <Label>
        Votre partenaire est-il/elle inscrit·e dans la clause bénéficiaire auprès de votre caisse de pension (LPP) ?
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Card
          label="Oui"
          active={v === true}
          onClick={() =>
            setValue("Enter_partenaireDesigneLPP" as any, true, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <Card
          label="Non / Je ne sais pas"
          active={v === false}
          onClick={() =>
            setValue("Enter_partenaireDesigneLPP" as any, false, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Si votre partenaire n’est pas désigné, les prestations LPP peuvent être versées à d’autres bénéficiaires
        selon l’ordre légal.
      </div>
    </div>
  );
}