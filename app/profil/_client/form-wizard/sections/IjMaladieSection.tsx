"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

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

export default function IjMaladieSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & { Enter_ijMaladie?: boolean; Enter_ijMaladieTaux?: number }
  >;
}) {
  const { watch, getValues, setValue } = form;

  const has = !!watch("Enter_ijMaladie");

  // 🔹 State local pour le taux (évite les blocages du slider)
  const [localTaux, setLocalTaux] = useState<number>(80);

  // Hydratation initiale depuis RHF
  useEffect(() => {
    const initial = Number(getValues("Enter_ijMaladieTaux") ?? 80);
    const safe =
      Number.isFinite(initial) && initial >= 10 && initial <= 100
        ? initial
        : 80;
    setLocalTaux(safe);
  }, [getValues]);

  const handleSliderChange = (vals: number[]) => {
    setLocalTaux(vals[0]); // seulement local, ultra fluide
  };

  // Commit dans RHF quand l'utilisateur lâche le slider
  const commitToForm = () => {
    setValue("Enter_ijMaladieTaux" as any, localTaux, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleKeyUp: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    // Quand on utilise les flèches/clavier sur le slider, on commit aussi
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(e.key)
    ) {
      commitToForm();
    }
  };

  return (
    <div className="space-y-3">
      <Label>
        Avez-vous des indemnités journalières en cas de <b>maladie</b> ?
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Choice
          label="Oui"
          active={has === true}
          onClick={() =>
            setValue("Enter_ijMaladie" as any, true, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        <Choice
          label="Non"
          active={has === false}
          onClick={() =>
            setValue("Enter_ijMaladie" as any, false, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
      </div>

      {has && (
        <div className="space-y-2">
          <Label>Taux IJ maladie (%)</Label>

          <div
            className="flex items-center gap-3"
            onPointerUp={commitToForm}
            onKeyUp={handleKeyUp}
          >
            <div className="flex-1">
              <Slider
                min={10}
                max={100}
                step={5}
                value={[localTaux]}
                onValueChange={handleSliderChange}
              />
            </div>
            <div className="w-10 text-right text-sm tabular-nums">
              {localTaux}%
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Entre 10% et 100% du salaire assuré.
          </div>
        </div>
      )}
    </div>
  );
}