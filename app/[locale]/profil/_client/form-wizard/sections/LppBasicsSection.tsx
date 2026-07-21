"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2),
    mm = d.slice(2, 4),
    yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

export default function LppBasicsSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_dateCertificatLPP?: string;
      Enter_typeSalaireAssure?: "general" | "split";
    }
  >;
}) {
  const { getValues, setValue, watch } = form;

  // 🔹 State local pour la date (évite les sorties de champ)
  const [localDate, setLocalDate] = useState<string>("");

  // Hydratation initiale
  useEffect(() => {
    const current =
      (getValues("Enter_dateCertificatLPP") as string | undefined) || "";
    setLocalDate(current);
  }, [getValues]);

  const typ =
    (watch("Enter_typeSalaireAssure") as "general" | "split" | undefined) ??
    "general";

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalDate(e.target.value);
    // On ne touche pas encore RHF → pas de jump
  };

  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setLocalDate(norm);
    setValue("Enter_dateCertificatLPP" as any, norm, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="field-Enter_dateCertificatLPP">
          Date du certificat LPP (optionnel)
        </Label>
        <Input
          id="field-Enter_dateCertificatLPP"
          inputMode="numeric"
          placeholder="jj.mm.aaaa"
          value={localDate}
          onChange={handleDateChange}
          onBlur={handleDateBlur}
        />
      </div>

      <div className="space-y-2">
        <Label>Type de salaire assuré</Label>
        <Select
          value={typ}
          onValueChange={(v) =>
            setValue("Enter_typeSalaireAssure" as any, v as any, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">Salaire assuré — général</SelectItem>
            <SelectItem value="split">Distinction épargne / risque</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}