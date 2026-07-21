// app/profil/_client/form-wizard/sections/NomSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NomSection({
  form,
}: {
  form: UseFormReturn<MinimalForm>;
}) {
  const { getValues, setValue } = form;

  const [localNom, setLocalNom] = useState<string>("");

  // hydrate le buffer depuis RHF
  useEffect(() => {
    const current = (getValues("Enter_nom") as string | undefined) ?? "";
    setLocalNom(current);
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalNom(e.target.value);
    // pas de setValue → pas de remount
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? "";
    const trimmed = raw.trim();
    setValue("Enter_nom", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setLocalNom(trimmed);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="field-Enter_nom">Nom</Label>
        <Input
          id="field-Enter_nom"
          type="text"
          autoComplete="family-name"
          placeholder="Ex. Dupont"
          value={localNom}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <p className="text-xs text-muted-foreground">
          Utilisez le même prénom que sur vos documents officiels.
        </p>
      </div>
    </div>
  );
}