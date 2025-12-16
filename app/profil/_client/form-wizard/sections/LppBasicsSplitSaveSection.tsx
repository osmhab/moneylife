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

export default function LppBasicsSplitSaveSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_typeSalaireAssure?: "general" | "split";
      Enter_salaireAssureLPPEpargne?: number;
      Enter_salaireAssureLPP?: number;
    }
  >;
}) {
  const { watch, getValues, setValue } = form;
  const typ = watch("Enter_typeSalaireAssure");

  // 🔹 States locaux pour les deux variantes
  const [localGeneral, setLocalGeneral] = useState<string>("");
  const [localEpargne, setLocalEpargne] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const gen = Number(getValues("Enter_salaireAssureLPP") ?? 0);
    const ep = Number(getValues("Enter_salaireAssureLPPEpargne") ?? 0);
    setLocalGeneral(formatMoneyDisplay(gen));
    setLocalEpargne(formatMoneyDisplay(ep));
  }, [getValues]);

  /* ---------- Mode GENERAL ---------- */
  if (typ === "general") {
    const handleGenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalGeneral(e.target.value);
    };

    const handleGenBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const n = parseMoneyToNumber(e.target.value);
      const safe = Number.isFinite(n) && n >= 0 ? n : 0;
      setValue("Enter_salaireAssureLPP" as any, safe, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setLocalGeneral(formatMoneyDisplay(safe));
    };

    return (
      <div className="space-y-2">
        <Label htmlFor="field-Enter_salaireAssureLPP">
          Salaire assuré (général)
        </Label>
        <Input
          id="field-Enter_salaireAssureLPP"
          type="text"
          inputMode="decimal"
          placeholder="58’800"
          value={localGeneral}
          onChange={handleGenChange}
          onBlur={handleGenBlur}
        />
      </div>
    );
  }

  /* ---------- Mode NON APPLICABLE ---------- */
  if (typ !== "split") {
    return (
      <div className="text-sm text-muted-foreground">Étape non applicable.</div>
    );
  }

  /* ---------- Mode SPLIT → part ÉPARGNE ---------- */
  const handleEpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalEpargne(e.target.value);
  };

  const handleEpBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const n = parseMoneyToNumber(e.target.value);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;
    setValue("Enter_salaireAssureLPPEpargne" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setLocalEpargne(formatMoneyDisplay(safe));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="field-Enter_salaireAssureLPPEpargne">
        Salaire assuré (part <b>épargne</b>)
      </Label>
      <Input
        id="field-Enter_salaireAssureLPPEpargne"
        type="text"
        inputMode="decimal"
        placeholder="58’800"
        value={localEpargne}
        onChange={handleEpChange}
        onBlur={handleEpBlur}
      />
    </div>
  );
}