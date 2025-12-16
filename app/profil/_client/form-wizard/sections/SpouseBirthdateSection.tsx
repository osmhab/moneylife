"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

export default function SpouseBirthdateSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_spouseDateNaissance?: string;
    }
  >;
}) {
  const { getValues, setValue } = form;

  // 🔹 State local pour la saisie
  const [localVal, setLocalVal] = useState<string>("");

  // Hydratation initiale depuis RHF
  useEffect(() => {
    const current =
      (getValues("Enter_spouseDateNaissance") as string | undefined) || "";
    setLocalVal(current);
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
    // pas de validation ici, on laisse taper librement
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setLocalVal(norm);
    setValue("Enter_spouseDateNaissance" as any, norm, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="field-Enter_spouseDateNaissance">
        Date de naissance du conjoint / partenaire (jj.mm.aaaa)
      </Label>
      <Input
        id="field-Enter_spouseDateNaissance"
        inputMode="numeric"
        placeholder="01.01.1984"
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <div className="text-xs text-muted-foreground">
        Cela permet de projeter l’évolution des rentes en cas de décès ou
        d’invalidité.
      </div>
    </div>
  );
}