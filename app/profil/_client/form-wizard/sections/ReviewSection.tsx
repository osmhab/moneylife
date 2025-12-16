"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { Label } from "@/components/ui/label";

type ReviewForm = MinimalForm & {
  Enter_prenom?: string;
  Enter_nom?: string;
  Enter_hasEnfants?: boolean;
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

export default function ReviewSection({ form }: { form: UseFormReturn<ReviewForm> }) {
  const { watch } = form;
  const f = watch() as any;

  const etatCivilLabel = (() => {
  const ec = f.Enter_etatCivil;
  if (ec === 0) return "Célibataire";
  if (ec === 1) return "Marié·e";
  if (ec === 2) return "Divorcé·e";
  if (ec === 3) return "Partenariat enregistré";
  if (ec === 4) return "Concubinage";
  if (ec === 5) return "Veuf·ve";
  return undefined;
})();

  const statutLabel = (() => {
    const v = f.Enter_statutProfessionnel;
    if (v === 0) return "Salarié·e";
    if (v === 1) return "Indépendant·e";
    if (v === 2) return "Autre / sans activité";
    return undefined;
  })();

  const hasKids = !!f.Enter_hasEnfants;
  const kidsCount = Array.isArray(f.Enter_enfants) ? f.Enter_enfants.length : 0;

  const formatCHF = (n?: number) =>
    typeof n === "number" && Number.isFinite(n) && n !== 0
      ? n.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) + " CHF"
      : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Voici un résumé des informations saisies. Si quelque chose ne vous semble pas correct, vous pouvez revenir
        en arrière avant d’enregistrer définitivement.
      </p>

      {/* Identité */}
      <div className="rounded-xl border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Identité</Label>
        <Row label="Nom" value={[f.Enter_prenom, f.Enter_nom].filter(Boolean).join(" ")} />
        <Row label="Date de naissance" value={f.Enter_dateNaissance} />
        <Row label="État civil" value={etatCivilLabel} />
        <Row label="Enfants à charge" value={hasKids ? `${kidsCount} enfant(s)` : "Aucun"} />
      </div>

      {/* Activité & revenu */}
      <div className="rounded-xl border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Activité & revenu</Label>
        <Row label="Statut professionnel" value={statutLabel} />
        <Row label="Salaire annuel" value={formatCHF(f.Enter_salaireAnnuel)} />
        <Row
          label="IJ maladie"
          value={
            typeof f.Enter_ijMaladie === "boolean"
              ? f.Enter_ijMaladie
                ? `${f.Enter_ijMaladieTaux ?? 0}%`
                : "Non"
              : undefined
          }
        />
        <Row
          label="IJ accident"
          value={typeof f.Enter_ijAccidentTaux === "number" ? `${f.Enter_ijAccidentTaux}%` : undefined}
        />
      </div>

      {/* LPP */}
      <div className="rounded-xl border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">LPP</Label>
        <Row label="Date certificat" value={f.Enter_dateCertificatLPP} />
        <Row label="Salaire assuré LPP" value={formatCHF(f.Enter_salaireAssureLPP)} />
        <Row label="Avoir vieillesse total" value={formatCHF(f.Enter_avoirVieillesseTotal)} />
        <Row label="Libre passage total" value={formatCHF(f.Enter_librePassageTotal)} />
        <Row
          label="Prestation capital à 65 ans"
          value={formatCHF(f.Enter_prestationCapital65)}
        />
      </div>

      {/* AVS */}
      <div className="rounded-xl border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">AVS</Label>
        <Row
          label="Âge début cotisations AVS"
          value={typeof f.Enter_ageDebutCotisationsAVS === "number" ? f.Enter_ageDebutCotisationsAVS : undefined}
        />
        <Row
          label="Année début AVS"
          value={typeof f.Enter_anneeDebutCotisationAVS === "number" ? f.Enter_anneeDebutCotisationAVS : undefined}
        />
        <Row
          label="Années manquantes"
          value={
            f.Enter_hasAnnesManquantesAVS && Array.isArray(f.Enter_anneesManquantesAVS)
              ? f.Enter_anneesManquantesAVS.join(", ")
              : f.Enter_hasAnnesManquantesAVS === false
              ? "Aucune"
              : undefined
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Quand vous cliquerez sur <strong>Enregistrer</strong>, vos données seront sauvegardées dans MoneyLife pour
        générer votre analyse de prévoyance.
      </p>
    </div>
  );
}