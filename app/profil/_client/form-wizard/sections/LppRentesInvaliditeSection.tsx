"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Utils locaux pour montants CHF
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

export default function LppRentesInvaliditeSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_renteInvaliditeLPP?: number;
      Enter_renteEnfantInvaliditeLPP?: number;
    }
  >;
}) {
  const { getValues, setValue } = form;

  // 🔹 States locaux pour les 2 montants
  const [invVal, setInvVal] = useState<string>("");
  const [enfInvVal, setEnfInvVal] = useState<string>("");

  // Hydratation initiale depuis RHF
  useEffect(() => {
    const inv = Number(getValues("Enter_renteInvaliditeLPP") ?? 0);
    const enfInv = Number(getValues("Enter_renteEnfantInvaliditeLPP") ?? 0);

    setInvVal(formatMoneyDisplay(inv));
    setEnfInvVal(formatMoneyDisplay(enfInv));
  }, [getValues]);

  const handleBlur =
    (
      field: "Enter_renteInvaliditeLPP" | "Enter_renteEnfantInvaliditeLPP",
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
      {/* Rente d’invalidité */}
      <div className="space-y-2">
        <Label htmlFor="field-rente-inv">
          Rente d’invalidité LPP (par an)
        </Label>
        <Input
          id="field-rente-inv"
          type="text"
          inputMode="decimal"
          placeholder="24’000"
          value={invVal}
          onChange={(e) => setInvVal(e.target.value)}
          onBlur={handleBlur("Enter_renteInvaliditeLPP", setInvVal)}
        />
      </div>

      {/* Rente par enfant d’invalide */}
      <div className="space-y-2">
        <Label htmlFor="field-rente-enf-inv">
          Rente par enfant d’invalide (par an)
        </Label>
        <Input
          id="field-rente-enf-inv"
          type="text"
          inputMode="decimal"
          placeholder="7’200"
          value={enfInvVal}
          onChange={(e) => setEnfInvVal(e.target.value)}
          onBlur={handleBlur(
            "Enter_renteEnfantInvaliditeLPP",
            setEnfInvVal
          )}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Vous pouvez laisser un montant à 0 s’il n’est pas indiqué sur le
        certificat.
      </div>
    </div>
  );
}