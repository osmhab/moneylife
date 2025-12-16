"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mini normalisation JJ.MM.AAAA
function normalizeDateMask(s: string) {
  const digits = (s || "").replace(/\D+/g, "");
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const parts = [dd, mm, yyyy].filter(Boolean);
  return parts.join(".");
}

export default function BirthdateSection({
  form,
}: {
  form: UseFormReturn<MinimalForm>;
}) {
  const { getValues, setValue } = form;

  // 🔹 State local pour taper tranquillement
  const [localVal, setLocalVal] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const current = (getValues("Enter_dateNaissance") as string) || "";
    setLocalVal(current);
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
    // On ne valide pas ici, on laisse l'utilisateur taper librement
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setLocalVal(norm);
    setValue("Enter_dateNaissance", norm, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="field-Enter_dateNaissance">
        Date de naissance (jj.mm.aaaa)
      </Label>
      <Input
        id="field-Enter_dateNaissance"
        inputMode="numeric"
        placeholder="01.01.1984"
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <div className="text-xs text-muted-foreground">
        Format : jj.mm.aaaa
      </div>
    </div>
  );
}