"use client";

import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type DecesItem = {
  amount: number;
  plusRente: "oui" | "non" | "np";
  condition: "accident" | "maladie" | "les_deux" | "np";
};

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

/**
 * Champ de montant local, qui ne fait le commit vers le form (via onCommit)
 * qu'au blur → pas de setValue à chaque frappe.
 */
function LocalMoneyField({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id?: string;
  value: number;
  placeholder?: string;
  onCommit: (n: number) => void;
}) {
  const [localVal, setLocalVal] = useState<string>("");

  useEffect(() => {
    setLocalVal(formatMoneyDisplay(value));
  }, [value]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const n = parseMoneyToNumber(raw);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;
    onCommit(safe);
    setLocalVal(formatMoneyDisplay(safe));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
    />
  );
}

export default function LppCapitauxDecesSection({
  form,
}: {
  form: UseFormReturn<
    MinimalForm & {
      DecesCapitaux?: DecesItem[];
    }
  >;
}) {
  const { watch, setValue } = form;
  const list = (watch("DecesCapitaux") as DecesItem[] | undefined) ?? [];

  const updateList = (next: DecesItem[]) =>
    setValue("DecesCapitaux" as any, next, { shouldDirty: true, shouldValidate: true });

  const add = () =>
    updateList([
      ...list,
      { amount: 0, plusRente: "np", condition: "np" },
    ]);

  const del = (idx: number) =>
    updateList(list.filter((_, i) => i !== idx));

  const patch = (idx: number, partial: Partial<DecesItem>) =>
    updateList(list.map((it, i) => (i === idx ? { ...it, ...partial } : it)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Capitaux décès (certificat LPP)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Ajouter
        </Button>
      </div>

      {list.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Aucun capital décès saisi. Ajoutez une ligne par capital mentionné (maladie, accident, etc.).
        </div>
      )}

      <div className="space-y-3">
        {list.map((item, idx) => (
          <div
            key={idx}
              className="grid grid-cols-1 gap-3 p-3 border rounded-lg bg-muted/20"

          >
            <div className="space-y-1">
              <Label>Montant (CHF)</Label>
              <LocalMoneyField
                id={`field-deces-amount-${idx}`}
                value={item.amount}
                onCommit={(n: number) => patch(idx, { amount: n })}
                placeholder="50’000"
              />
            </div>

            <div className="space-y-1">
              <Label>En plus d’une rente ?</Label>
              <Select
                value={item.plusRente}
                onValueChange={(v) => patch(idx, { plusRente: v as DecesItem["plusRente"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oui">Oui (en plus de la rente due)</SelectItem>
                  <SelectItem value="non">Non (Si aucune rente n'est due)</SelectItem>
                  <SelectItem value="np">Non précisé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Condition</Label>
              <Select
                value={item.condition}
                onValueChange={(v) => patch(idx, { condition: v as DecesItem["condition"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accident">Accident</SelectItem>
                  <SelectItem value="maladie">Maladie</SelectItem>
                  <SelectItem value="les_deux">Accident + maladie</SelectItem>
                  <SelectItem value="np">Non précisé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-red-600"
                onClick={() => del(idx)}
              >
                Supprimer
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        Exemple : si le certificat indique un capital décès uniquement en cas d’accident, choisissez “Accident”.<br />
        Les agrégations (par maladie/accident, +rente ou non) seront calculées automatiquement à l’enregistrement.
      </div>
    </div>
  );
}