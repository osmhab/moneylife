"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Utils montants CHF
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

export default function LppOptionsSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_prestationCapital65?: number;
      Enter_rachatPossible?: number;
      Enter_eplPossibleMax?: number;
      Enter_versementsAnticipesLogement?: number;
      Enter_miseEnGage?: boolean;
    }
  >;
}) {
  const { getValues, setValue, watch } = form;

  // 🔹 States locaux pour les 4 montants
  const [prestCap, setPrestCap] = useState<string>("");
  const [rachat, setRachat] = useState<string>("");
  const [eplMax, setEplMax] = useState<string>("");
  const [eplVerse, setEplVerse] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const p = Number(getValues("Enter_prestationCapital65") ?? 0);
    const r = Number(getValues("Enter_rachatPossible") ?? 0);
    const eMax = Number(getValues("Enter_eplPossibleMax") ?? 0);
    const eVers = Number(
      getValues("Enter_versementsAnticipesLogement") ?? 0
    );

    setPrestCap(formatMoneyDisplay(p));
    setRachat(formatMoneyDisplay(r));
    setEplMax(formatMoneyDisplay(eMax));
    setEplVerse(formatMoneyDisplay(eVers));
  }, [getValues]);

  const makeBlurHandler =
    (
      field:
        | "Enter_prestationCapital65"
        | "Enter_rachatPossible"
        | "Enter_eplPossibleMax"
        | "Enter_versementsAnticipesLogement",
      setter: (v: string) => void
    ) =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const n = parseMoneyToNumber(raw);
      const safe = Number.isFinite(n) && n >= 0 ? n : 0;

      setValue(field as any, safe, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setter(formatMoneyDisplay(safe));
    };

  const miseEnGage = !!watch("Enter_miseEnGage");

  return (
    <div className="space-y-4">
      <Label className="font-medium">Capitaux & options</Label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <div className="space-y-1">
          <Label htmlFor="field-prest-cap-65">
            Prestation en capital à 65 ans
          </Label>
          <Input
            id="field-prest-cap-65"
            type="text"
            inputMode="decimal"
            value={prestCap}
            onChange={(e) => setPrestCap(e.target.value)}
            onBlur={makeBlurHandler(
              "Enter_prestationCapital65",
              setPrestCap
            )}
            placeholder="ex. 150’000"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="field-rachat-poss">Rachat possible</Label>
          <Input
            id="field-rachat-poss"
            type="text"
            inputMode="decimal"
            value={rachat}
            onChange={(e) => setRachat(e.target.value)}
            onBlur={makeBlurHandler("Enter_rachatPossible", setRachat)}
            placeholder="ex. 40’000"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="field-epl-max">EPL possible max</Label>
          <Input
            id="field-epl-max"
            type="text"
            inputMode="decimal"
            value={eplMax}
            onChange={(e) => setEplMax(e.target.value)}
            onBlur={makeBlurHandler("Enter_eplPossibleMax", setEplMax)}
            placeholder="ex. 100’000"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="field-epl-verse">Versements anticipés (EPL)</Label>
          <Input
            id="field-epl-verse"
            type="text"
            inputMode="decimal"
            value={eplVerse}
            onChange={(e) => setEplVerse(e.target.value)}
            onBlur={makeBlurHandler(
              "Enter_versementsAnticipesLogement",
              setEplVerse
            )}
            placeholder="ex. 20’000"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          id="field-mise-en-gage"
          type="checkbox"
          checked={miseEnGage}
          onChange={(e) =>
            setValue("Enter_miseEnGage" as any, e.target.checked, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <Label htmlFor="field-mise-en-gage">Mise en gage</Label>
      </div>

      <div className="text-xs text-muted-foreground">
        Cochez “Mise en gage” si le certificat indique qu’une partie de l’avoir
        est mise en garantie.
      </div>
    </div>
  );
}