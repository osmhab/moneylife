"use client";

import React, { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AvsLacunesYearsSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_hasAnnesManquantesAVS?: boolean;
      Enter_anneesManquantesAVS?: number[];
    }
  >;
}) {
  const { watch, setValue } = form;
  const has = !!watch("Enter_hasAnnesManquantesAVS");
  const years = (watch("Enter_anneesManquantesAVS") as number[] | undefined) ?? [];
  const [inputValue, setInputValue] = useState("");

  if (!has) {
    return (
      <div className="text-sm text-muted-foreground">
        Étape non applicable (aucune lacune déclarée).
      </div>
    );
  }

  const commitYears = (nextYears: number[]) => {
    // On garde un tableau trié, unique
    const uniqueSorted = Array.from(new Set(nextYears)).sort((a, b) => a - b);
    setValue("Enter_anneesManquantesAVS" as any, uniqueSorted, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const tryAddYear = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const y = Number(trimmed);
    if (!Number.isInteger(y)) return;
    if (y < 1900 || y > 2100) return;
    if (years.includes(y)) return;

    commitYears([...years, y]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // On ne garde que des chiffres
    const raw = e.target.value.replace(/[^\d]/g, "");
    setInputValue(raw);

    // Dès que 4 chiffres sont saisis, on crée un tag automatiquement
    if (raw.length === 4) {
      tryAddYear(raw);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (inputValue.length === 4) {
        tryAddYear(inputValue);
        setInputValue("");
      }
    } else if (e.key === "Backspace" && inputValue === "" && years.length > 0) {
      // Backspace sur input vide → supprime le dernier tag
      const next = [...years];
      next.pop();
      commitYears(next);
    }
  };

  const handleBlur = () => {
    if (inputValue.length === 4) {
      tryAddYear(inputValue);
    }
    setInputValue("");
  };

  const removeYear = (year: number) => {
    commitYears(years.filter((y) => y !== year));
  };

  return (
    <div className="space-y-3">
      <Label>Années manquantes (inscrites comme lacunes AVS)</Label>

      {/* Zone de tags + input */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 bg-background">
        {years.map((y) => (
          <span
            key={y}
            className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 text-xs"
          >
            {y}
            <button
              type="button"
              className="ml-1 text-teal-700 hover:text-teal-900"
              onClick={() => removeYear(y)}
              aria-label={`Supprimer ${y}`}
            >
              ×
            </button>
          </span>
        ))}

        <Input
          className="flex-1 min-w-[5rem] border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-1 text-sm"
          placeholder={years.length === 0 ? "Ex. 2010 puis 2011…" : "Ajouter une année"}
          inputMode="numeric"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Tapez une année complète (par ex. <b>2010</b>) : elle se transforme en badge. Vous pouvez ensuite saisir
        directement la suivante (2011, 2012, …). Cliquez sur la croix d’un badge pour supprimer une année.
      </div>

      {years.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Années enregistrées :{" "}
          <span className="font-mono">
            {years.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}