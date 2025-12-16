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

export default function LppAvoirsSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_avoirVieillesseObligatoire?: number;
      Enter_avoirVieillesseTotal?: number;
    }
  >;
}) {
  const { getValues, setValue } = form;

  // 🔹 States locaux pour les 2 montants
  const [avOblig, setAvOblig] = useState<string>("");
  const [avTotal, setAvTotal] = useState<string>("");

  // Hydratation initiale depuis le form
  useEffect(() => {
    const avo = Number(getValues("Enter_avoirVieillesseObligatoire") ?? 0);
    const avt = Number(getValues("Enter_avoirVieillesseTotal") ?? 0);

    setAvOblig(formatMoneyDisplay(avo));
    setAvTotal(formatMoneyDisplay(avt));
  }, [getValues]);

  const makeBlurHandler =
    (
      field: "Enter_avoirVieillesseObligatoire" | "Enter_avoirVieillesseTotal",
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

  return (
    <div className="space-y-4">
      <Label className="font-medium">
        Avoirs de vieillesse (au jour du certificat)
      </Label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <div className="space-y-1">
          <Label htmlFor="field-av-oblig">Avoir vieillesse obligatoire</Label>
          <Input
            id="field-av-oblig"
            type="text"
            inputMode="decimal"
            value={avOblig}
            onChange={(e) => setAvOblig(e.target.value)}
            onBlur={makeBlurHandler("Enter_avoirVieillesseObligatoire", setAvOblig)}
            placeholder="ex. 80’000"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="field-av-total">Avoir vieillesse total</Label>
          <Input
            id="field-av-total"
            type="text"
            inputMode="decimal"
            value={avTotal}
            onChange={(e) => setAvTotal(e.target.value)}
            onBlur={makeBlurHandler("Enter_avoirVieillesseTotal", setAvTotal)}
            placeholder="ex. 120’000"
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Laissez à 0 si la ligne n’est pas indiquée sur le certificat.
      </div>
    </div>
  );
}