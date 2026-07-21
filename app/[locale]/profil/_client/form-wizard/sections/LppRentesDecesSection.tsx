"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

function ChoiceCard({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        active ? "border-teal-400 ring-2 ring-teal-200" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base">{label}</span>
        {active && <span className="text-teal-500 text-sm">✓</span>}
      </div>
    </button>
  );
}

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

export default function LppRentesDecesSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      Enter_RenteConjointOuPartenaireLPP?: number; // 0 = que conjoint, 1 = conjoint + partenaire
      Enter_renteConjointLPP?: number;
      Enter_rentePartenaireLPP?: number;
      Enter_renteOrphelinLPP?: number;
    }
  >;
}) {
  const { getValues, setValue, watch } = form;

  // 0 = uniquement conjoint, 1 = conjoint + partenaire
  const flag = Number(watch("Enter_RenteConjointOuPartenaireLPP") ?? 0);
  const hasPartner = flag === 1;

  // 🔹 States locaux pour les montants
  const [localRenteConj, setLocalRenteConj] = useState<string>("");
  const [localRenteOrphe, setLocalRenteOrphe] = useState<string>("");

  // Hydratation initiale
  useEffect(() => {
    const rConj = Number(getValues("Enter_renteConjointLPP") ?? 0);
    const rOrphe = Number(getValues("Enter_renteOrphelinLPP") ?? 0);

    setLocalRenteConj(formatMoneyDisplay(rConj));
    setLocalRenteOrphe(formatMoneyDisplay(rOrphe));
  }, [getValues]);

  const commitRenteConjoint = (raw: string) => {
    const n = parseMoneyToNumber(raw);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;

    // Sauvegarde rente conjoint
    setValue("Enter_renteConjointLPP" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Si une rente de partenaire existe aussi → même montant
    if (hasPartner) {
      setValue("Enter_rentePartenaireLPP" as any, safe, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setLocalRenteConj(formatMoneyDisplay(safe));
  };

  const commitRenteOrphelin = (raw: string) => {
    const n = parseMoneyToNumber(raw);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;

    setValue("Enter_renteOrphelinLPP" as any, safe, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setLocalRenteOrphe(formatMoneyDisplay(safe));
  };

  const setMode = (withPartner: boolean) => {
    const newFlag = withPartner ? 1 : 0;
    setValue("Enter_RenteConjointOuPartenaireLPP" as any, newFlag, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (!withPartner) {
      // On efface la rente partenaire si on revient à "uniquement conjoint"
      setValue("Enter_rentePartenaireLPP" as any, 0, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      // On copie la rente de conjoint actuelle vers la rente partenaire
      const n = parseMoneyToNumber(localRenteConj);
      const safe = Number.isFinite(n) && n >= 0 ? n : 0;
      setValue("Enter_rentePartenaireLPP" as any, safe, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Choix : uniquement conjoint vs conjoint + partenaire */}
      <div className="space-y-2">
        <Label>Rente de survivant LPP</Label>
        <div className="grid grid-cols-2 gap-3">
          <ChoiceCard
            label="Rente de conjoint·e"
            active={!hasPartner}
            onClick={() => setMode(false)}
          />
          <ChoiceCard
            label="Rente de conjoint·e / partenaire"
            active={hasPartner}
            onClick={() => setMode(true)}
          />
        </div>
      </div>

      {/* Rente de conjoint (champ unique) */}
      <div className="space-y-2">
        <Label htmlFor="field-rente-conj">
          Rente de conjoint·e (par an)
        </Label>
        <Input
          id="field-rente-conj"
          type="text"
          inputMode="decimal"
          placeholder="24’000"
          value={localRenteConj}
          onChange={(e) => setLocalRenteConj(e.target.value)}
          onBlur={(e) => commitRenteConjoint(e.target.value)}
        />
        {hasPartner && (
          <p className="text-xs text-muted-foreground">
            Le même montant sera utilisé comme rente de partenaire.
          </p>
        )}
      </div>

      {/* Rente d’orphelin */}
      <div className="space-y-2">
        <Label htmlFor="field-rente-orphelin">
          Rente d’orphelin (par an)
        </Label>
        <Input
          id="field-rente-orphelin"
          type="text"
          inputMode="decimal"
          placeholder="7’200"
          value={localRenteOrphe}
          onChange={(e) => setLocalRenteOrphe(e.target.value)}
          onBlur={(e) => commitRenteOrphelin(e.target.value)}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Vous pouvez saisir les montants tels qu’indiqués sur le certificat.
        Si une rente de partenaire est prévue, elle sera considérée au même
        montant que la rente de conjoint·e.
      </div>
    </div>
  );
}