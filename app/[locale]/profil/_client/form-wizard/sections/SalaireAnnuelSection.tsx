"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Petit utilitaire pour parser un montant "fr-CH"
function parseMoneyToNumber(s: string) {
  const clean = (s || "")
    .replace(/[^0-9.,']/g, "") // garde chiffres, . , '
    .replace(/'/g, "")         // supprime apostrophes
    .replace(/,/g, ".");       // virgule → point
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyDisplay(n?: number) {
  const v = Number.isFinite(n as any) ? (n as number) : 0;
  return v === 0 ? "" : v.toLocaleString("fr-CH", { maximumFractionDigits: 0 });
}

export default function SalaireAnnuelSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_salaireAnnuel?: number;
    }
  >;
}) {
  const { getValues, setValue } = form;

  // 🔹 State local pour l'affichage dans le champ
  const [localVal, setLocalVal] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const initial = Number(getValues("Enter_salaireAnnuel") ?? 0);
    setLocalVal(formatMoneyDisplay(initial));
  }, [getValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // On laisse l'utilisateur taper ce qu'il veut
    setLocalVal(e.target.value);
    // IMPORTANT : on ne touche PAS à RHF ici
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const n = parseMoneyToNumber(raw);
    const safe = Number.isFinite(n) ? n : 0;

    // On met à jour RHF une seule fois, au blur
    setValue("Enter_salaireAnnuel" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Et on reformate l'affichage
    setLocalVal(formatMoneyDisplay(safe));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="field-Enter_salaireAnnuel">
          Salaire annuel brut (CHF)
        </Label>
        <Input
          id="field-Enter_salaireAnnuel"
          type="text"
          inputMode="decimal"
          placeholder="96’000"
          value={localVal}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Indiquez votre salaire brut annuel tel qu’indiqué sur votre contrat ou
        votre certificat LPP.
      </p>
    </div>
  );
}