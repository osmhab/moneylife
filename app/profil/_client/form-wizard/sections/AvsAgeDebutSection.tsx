"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function AvsAgeDebutSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_ageDebutCotisationsAVS?: number;
      Enter_anneeDebutCotisationAVS?: number;
    }
  >;
}) {
  const { getValues, setValue, watch } = form;

  // 🔹 Buffer local pour l'âge (on tape ici, on push dans RHF au blur)
  const [localAge, setLocalAge] = useState<string>("");

  // Hydratation initiale de l'âge depuis RHF
  useEffect(() => {
    const age = getValues("Enter_ageDebutCotisationsAVS");
    setLocalAge(
      age != null && Number.isFinite(age as any) ? String(age) : ""
    );
  }, [getValues]);

  // L'année calculée peut continuer à venir de RHF (mise à jour par l'effet global)
  const year = watch("Enter_anneeDebutCotisationAVS");

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalAge(e.target.value);
    // pas de setValue ici, on laisse l'utilisateur taper librement
  };

  const handleAgeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const n = Number(raw);
    const safe = Number.isFinite(n) && n > 0 ? n : 0;
    setLocalAge(raw === "" ? "" : String(safe));
    setValue("Enter_ageDebutCotisationsAVS" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="field-Enter_ageDebutCotisationsAVS">
          À quel âge avez-vous commencé à cotiser à l’AVS ?
        </Label>
        <Input
          id="field-Enter_ageDebutCotisationsAVS"
          inputMode="numeric"
          placeholder="21"
          value={localAge}
          onChange={handleAgeChange}
          onBlur={handleAgeBlur}
        />
      </div>

      <div className="space-y-1">
        <Label>Année de début (calculée automatiquement)</Label>
        <Input
          disabled
          value={year != null ? String(year) : ""}
          placeholder="—"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        L’année est calculée à partir de votre date de naissance et de l’âge
        renseigné.
      </div>
    </div>
  );
}