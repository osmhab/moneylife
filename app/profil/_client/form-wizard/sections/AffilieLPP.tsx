"use client";

import React, { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const LEGAL_SEUIL_ENTREE_LPP = 22680; // même valeur que dans ProfilUnifiedForm

function ChoiceCard({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full rounded-xl border p-4 text-left transition ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : active
          ? "border-teal-400 ring-2 ring-teal-200"
          : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        {active && !disabled && (
          <span className="text-teal-500 text-sm font-medium">✓</span>
        )}
      </div>
    </button>
  );
}

type Form = MinimalForm & {
  Enter_Affilie_LPP?: boolean;
  Enter_salaireAnnuel?: number;
  Enter_statutProfessionnel?: number;
};

export default function AffilieLPPSection({
  form,
}: {
  form: UseFormReturn<Form>;
}) {
  const { watch, setValue } = form;
  const salaire = Number(watch("Enter_salaireAnnuel") ?? 0);
  const statut = Number(watch("Enter_statutProfessionnel") ?? 0); // 0 = salarié-e
  const affilie = watch("Enter_Affilie_LPP");

  const forceAffilie =
    statut === 0 && salaire >= LEGAL_SEUIL_ENTREE_LPP;

  // Si salarié + salaire >= seuil → forcer l'affiliation LPP
  useEffect(() => {
    if (forceAffilie && affilie !== true) {
      setValue("Enter_Affilie_LPP" as any, true, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [forceAffilie, affilie, setValue]);

  return (
    <div className="space-y-4">
      <Label className="font-medium">Affiliation au 2ᵉ pilier (LPP)</Label>

      {forceAffilie ? (
        <>
          <p className="text-sm text-muted-foreground">
            Vous avez indiqué un <b>salaire annuel de {salaire.toLocaleString("fr-CH")} CHF</b> en tant que{" "}
            <b>salarié·e</b>. À partir de <b>{LEGAL_SEUIL_ENTREE_LPP.toLocaleString("fr-CH")} CHF</b>,
            l’affiliation au 2ᵉ pilier (LPP) est <b>obligatoire</b>.
          </p>
          <div className="rounded-xl border bg-emerald-50/60 border-emerald-200 px-3 py-3 text-xs text-emerald-900">
            Vous êtes automatiquement considéré·e comme <b>affilié·e à un 2ᵉ pilier</b>. Les prochaines étapes
            vous permettront de renseigner ou de scanner votre certificat LPP.
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Êtes-vous actuellement <b>affilié·e à un 2ᵉ pilier (LPP)</b> ? Cette information permet
            d’inclure ou non votre prévoyance professionnelle dans l’analyse.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChoiceCard
              label="Oui, je suis affilié·e à un 2ᵉ pilier"
              active={affilie === true}
              onClick={() =>
                setValue("Enter_Affilie_LPP" as any, true, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <ChoiceCard
              label="Non, je n’ai pas de 2ᵉ pilier"
              active={affilie === false}
              onClick={() =>
                setValue("Enter_Affilie_LPP" as any, false, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        Si vous n’êtes pas certain·e, vérifiez vos fiches de salaire ou demandez à votre employeur.
      </p>
    </div>
  );
}