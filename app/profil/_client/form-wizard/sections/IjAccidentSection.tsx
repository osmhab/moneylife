"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export default function IjAccidentSection({
  form,
}: {
  form: UseFormReturn<MinimalForm & { Enter_ijAccidentTaux?: number }>;
}) {
  const { getValues, setValue } = form;

  // 🔹 State local pour le taux (évite les blocages du slider)
  const [localTaux, setLocalTaux] = useState<number>(80);

  // Hydratation initiale depuis RHF
  useEffect(() => {
    const initial = Number(getValues("Enter_ijAccidentTaux") ?? 80);
    const safe =
      Number.isFinite(initial) && initial >= 80 && initial <= 100
        ? initial
        : 80;
    setLocalTaux(safe);
  }, [getValues]);

  const handleSliderChange = (vals: number[]) => {
    setLocalTaux(vals[0]); // uniquement local → super fluide
  };

  const commitToForm = () => {
    setValue("Enter_ijAccidentTaux" as any, localTaux, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleKeyUp: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
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
        Taux IJ <b>accident</b> (%)
      </Label>

      <div
        className="flex items-center gap-3"
        onPointerUp={commitToForm}
        onKeyUp={handleKeyUp}
      >
        <div className="flex-1">
          <Slider
            min={80}
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
        Entre 80% et 100% du salaire annuel.
      </div>
    </div>
  );
}