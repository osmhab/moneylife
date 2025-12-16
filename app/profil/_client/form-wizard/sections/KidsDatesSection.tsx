"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2), mm = d.slice(2, 4), yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

type Kid = { Enter_dateNaissance: string };

export default function KidsDatesSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_enfants?: Kid[];
      Enter_hasEnfants?: boolean;
    }
  >;
}) {
  const { watch, getValues, setValue } = form;
  const has = !!watch("Enter_hasEnfants");

  // 🔹 State local pour les champs (on tape dedans, on sync RHF au blur)
  const [localKids, setLocalKids] = useState<Kid[]>([]);

  // Hydratation initiale depuis RHF quand on arrive sur la section
  useEffect(() => {
    if (!has) {
      setLocalKids([]);
      return;
    }
    const fromForm = (getValues("Enter_enfants") ?? []) as Kid[];
    setLocalKids(fromForm.length ? fromForm : [{ Enter_dateNaissance: "" }]);
  }, [has, getValues]);

  // Si pas d'enfants → étape non applicable
  if (!has) {
    return (
      <div className="text-sm text-muted-foreground">Étape non applicable.</div>
    );
  }

  const syncToForm = (kids: Kid[]) => {
    setValue("Enter_enfants" as any, kids, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const add = () => {
    const next = [...localKids, { Enter_dateNaissance: "" }];
    setLocalKids(next);
    syncToForm(next);
  };

  const del = (i: number) => {
    const next = localKids.filter((_, idx) => idx !== i);
    setLocalKids(next);
    syncToForm(next);
  };

  const onChangeKid = (i: number, v: string) => {
    const next = [...localKids];
    next[i] = { Enter_dateNaissance: v };
    setLocalKids(next);
    // ❗ On NE valide pas ici, on laisse l'utilisateur taper librement
  };

  const onBlurKid = (i: number) => {
    const raw = localKids[i]?.Enter_dateNaissance ?? "";
    const norm = normalizeDateMask(raw);
    const next = [...localKids];
    next[i] = { Enter_dateNaissance: norm };
    setLocalKids(next);
    syncToForm(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Dates de naissance des enfants</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Ajouter
        </Button>
      </div>

      {localKids.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Aucun enfant saisi pour l’instant.
        </div>
      )}

      <div className="space-y-2">
        {localKids.map((kid, i) => (
          <div
            key={i}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"
          >
            <Input
              id={`field-Enter_enfants.${i}.Enter_dateNaissance`}
              inputMode="numeric"
              placeholder="jj.mm.aaaa"
              value={kid.Enter_dateNaissance}
              onChange={(e) => onChangeKid(i, e.target.value)}
              onBlur={() => onBlurKid(i)}
            />
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start sm:justify-self-end"
              onClick={() => del(i)}
            >
              Supprimer
            </Button>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Format requis : jj.mm.aaaa
      </div>
    </div>
  );
}