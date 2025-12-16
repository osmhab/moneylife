"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Utils locaux pour l'affichage CHF
function parseMoneyToNumber(s: string) {
  const clean = (s || "")
    .replace(/[^0-9.,']/g, "")
    .replace(/'/g, "")
    .replace(/,/g, ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyDisplay(n?: number) {
  const v = Number.isFinite(n as any) ? (n as number) : 0;
  return v === 0 ? "" : v.toLocaleString("fr-CH", { maximumFractionDigits: 0 });
}

export default function LppBasicsSplitRiskSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_typeSalaireAssure?: "general" | "split";
      Enter_salaireAssureLPPRisque?: number;
    }
  >;
}) {
  const { getValues, setValue, watch } = form;

  const typ = watch("Enter_typeSalaireAssure");

  // Si pas "split" → étape non applicable
  if (typ !== "split") {
    return (
      <div className="text-sm text-muted-foreground">
        Étape non applicable (type « split » requis).
      </div>
    );
  }

  // 🔹 State local pour la saisie du salaire "risque"
  const [localVal, setLocalVal] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const initial = Number(getValues("Enter_salaireAssureLPPRisque") ?? 0);
    setLocalVal(formatMoneyDisplay(initial));
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
    // Pas de setValue ici → on laisse l'utilisateur taper tranquille
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const n = parseMoneyToNumber(raw);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;

    // Commit dans le form
    setValue("Enter_salaireAssureLPPRisque" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Ré-affichage formaté
    setLocalVal(formatMoneyDisplay(safe));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="field-Enter_salaireAssureLPPRisque">
        Salaire assuré (part <b>risque</b>)
      </Label>
      <Input
        id="field-Enter_salaireAssureLPPRisque"
        type="text"
        inputMode="decimal"
        placeholder="58’800"
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}