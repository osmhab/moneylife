// app/profil/_client/form-wizard/sections/PrenomSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PrenomSection({
  form,
}: {
  form: UseFormReturn<MinimalForm>;
}) {
  const { getValues, setValue } = form;

  // buffer local pour éviter le remount bug
  const [localPrenom, setLocalPrenom] = useState<string>("");

  // hydrate depuis RHF à l'arrivée sur la section
  useEffect(() => {
    const current = (getValues("Enter_prenom") as string | undefined) ?? "";
    setLocalPrenom(current);
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalPrenom(e.target.value);
    // pas de setValue ici → on laisse taper tranquillement
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? "";
    const trimmed = raw.trim();
    setValue("Enter_prenom", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setLocalPrenom(trimmed);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pour commencer, indiquez votre <span className="font-medium">prénom</span>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="field-Enter_prenom">Prénom</Label>
        <Input
          id="field-Enter_prenom"
          type="text"
          autoComplete="given-name"
          placeholder="Ex. Marie"
          value={localPrenom}
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