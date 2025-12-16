// app/profil/_client/ClientPersonalForm.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  subscribeDonneesPersonnelles,
  upsertDonneesPersonnelles,
} from "../../lib/data/donneesPersonnelles";

import { auth } from "@/lib/firebase";

// types + helpers (imports RELATIFS)
import type { ClientData } from "../../lib/core/types";
import { normalizeDateMask, isValidDateMask } from "../../lib/core/dates";
import {
  parseMoneyToNumber,
  formatMoneyDisplay,
  monthlyWithMultiplierToAnnual,
} from "../../lib/core/format";
import {
  ENUM_EtatCivil,
  ENUM_Sexe,
  ENUM_StatutProfessionnel,
} from "../../lib/core/enums";

/* UI */
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import { Slider } from "@/components/ui/slider";

/* ---------- Constantes "légales" UI (miroir Legal_Settings) ---------- */
const LEGAL_SEUIL_ENTREE_LPP = 22_680;   // Legal_SeuilEntreeLPP
const LEGAL_IJ_ACCIDENT_TAUX_MIN = 80;   // Legal_ijAccidentTaux

/* ---------- Zod schema (personnel + enfants + AVS + IJ) ---------- */
const ChildSchema = z.object({
  Enter_dateNaissance: z.string().refine(isValidDateMask, "jj.mm.aaaa"),
});

const PersonalSchema = z.object({
  // Identité
  Enter_prenom: z.string().min(1),
  Enter_nom: z.string().min(1),
  Enter_dateNaissance: z.string().refine(isValidDateMask, "jj.mm.aaaa"),
  Enter_sexe: z.number().int().min(0).max(1),

  // État civil / conjoint / concubinage
  Enter_etatCivil: z.number().int().min(0).max(5),
  Enter_spouseSexe: z.number().int().min(0).max(1).optional(),
  Enter_spouseDateNaissance: z.string().optional(),
  Enter_mariageDuree: z.union([z.literal(0), z.literal(1)]).optional(),
  Enter_menageCommun5Ans: z.boolean().optional(),
  Enter_partenaireDesigneLPP: z.boolean().optional(),

  // Activité / affiliation
  Enter_statutProfessionnel: z.number().int().min(0).max(2),
  Enter_travaillePlusde8HSemaine: z.boolean(),
  Enter_Affilie_LPP: z.boolean(),

  // Salaire (annuel stocké)
  Enter_salaireAnnuel: z.number().nonnegative(),

  // IJ (maladie/accident)
  Enter_ijMaladie: z.boolean().optional(),
  Enter_ijMaladieTaux: z.number().min(10).max(100).optional(),
  Enter_ijAccidentTaux: z.number().min(80).max(100).optional(),

  // Enfants
  Enter_hasEnfants: z.boolean().optional(),
  Enter_enfants: z.array(ChildSchema).optional(),

  // AVS (âge début requis, année auto)
  Enter_ageDebutCotisationsAVS: z.number().int().min(18),
  Enter_anneeDebutCotisationAVS: z.number().int().optional(),
  Enter_hasAnnesManquantesAVS: z.boolean().optional(),
  Enter_anneesManquantesAVS: z.array(z.number().int()).optional(),
});

type PersonalForm = z.infer<typeof PersonalSchema>;

export default function ClientPersonalForm() {
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, control, setValue, getValues, reset, watch } = useForm<PersonalForm>({
    resolver: zodResolver(PersonalSchema),
    defaultValues: {
      // Identité
      Enter_prenom: "",
      Enter_nom: "",
      Enter_dateNaissance: "",
      Enter_sexe: 0,

      // État civil / conjoint / concubinage
      Enter_etatCivil: 0,
      Enter_spouseSexe: undefined,
      Enter_spouseDateNaissance: "",
      Enter_mariageDuree: 0, // défaut = "Au moins 5 ans"
      Enter_menageCommun5Ans: false,
      Enter_partenaireDesigneLPP: false,

      // Activité
      Enter_statutProfessionnel: 0,
      Enter_travaillePlusde8HSemaine: true,
      Enter_Affilie_LPP: false,

      // Salaire
      Enter_salaireAnnuel: 0,

      // IJ
      Enter_ijMaladie: true,
      Enter_ijMaladieTaux: 80,
      Enter_ijAccidentTaux: 80,

      // Enfants
      Enter_hasEnfants: false,
      Enter_enfants: [],

      // AVS
      Enter_ageDebutCotisationsAVS: 21,
      Enter_anneeDebutCotisationAVS: undefined,
      Enter_hasAnnesManquantesAVS: false,
      Enter_anneesManquantesAVS: [],
    },
  });

  // Arrays RHF
  const { fields, append, remove } = useFieldArray({
    control,
    name: "Enter_enfants",
  });

  // ----------- PAS de hooks RHF additionnels : on lit tout en une fois -----------
  const f = watch(); // <- objet de TOUTES les valeurs (pas un Hook)

  // Préremplissage depuis Firestore (toujours appelé, avant le guard de rendu)
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const unsub = subscribeDonneesPersonnelles(
      u.uid,
      (data: Partial<ClientData> | null) => {
        if (data) {
          const withDefaults = {
            Enter_enfants: [],
            Enter_hasEnfants: Array.isArray((data as any)?.Enter_enfants) && (data as any).Enter_enfants.length > 0,
            ...data,
          } as Partial<PersonalForm>;
          reset((prev) => ({ ...prev, ...withDefaults }));
        }
        setLoading(false);
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [reset]);

  const onSubmit = async (values: PersonalForm) => {
  // Si le conjoint est saisi mais état civil non marié/partenaire → forcer "marié"
  const hasSpouse =
    !!values.Enter_spouseDateNaissance &&
    values.Enter_spouseDateNaissance.trim().length >= 8;

  const ec = String(values.Enter_etatCivil ?? "");
  const ecStr = ec.toLowerCase();
  const looksMarried = ec === "1" || /mari/i.test(ecStr) || ec === "3" || /parten/i.test(ecStr);

  if (hasSpouse && !looksMarried) {
    values.Enter_etatCivil = 1 as any; // 1 = marié(e) dans ton mapping actuel
  }

  // Défaut mariage : considérer "≥ 5 ans" si non renseigné
  if (values.Enter_etatCivil === 1 && (values.Enter_mariageDuree as any) == null) {
    values.Enter_mariageDuree = 0 as any; // "Au moins 5 ans"
  }

  await upsertDonneesPersonnelles(values);
};

  /* ---------- Masques dates ---------- */
  const onBirthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_dateNaissance", norm, { shouldValidate: true });
  };
  const onSpouseBirthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_spouseDateNaissance" as any, norm, { shouldValidate: true });
  };

  /* ---------- Salaire (parse + display) ---------- */
  const [salaireView, setSalaireView] = useState("");
  useEffect(() => {
    setSalaireView(formatMoneyDisplay(f?.Enter_salaireAnnuel ?? 0));
  }, [f?.Enter_salaireAnnuel]);

  /* ---------- Abonnement unique aux changements (LPP forcée + année AVS + enfants) ---------- */
useEffect(() => {
  const sub = watch((v) => {
    // 1) LPP forcée si salarié >= seuil — seulement si ça change
    const statut = v?.Enter_statutProfessionnel ?? 0;
    const sal = v?.Enter_salaireAnnuel ?? 0;
    if (statut === 0 && sal >= LEGAL_SEUIL_ENTREE_LPP) {
      const curAff = getValues("Enter_Affilie_LPP");
      if (curAff !== true) {
        setValue("Enter_Affilie_LPP", true, { shouldValidate: true, shouldDirty: false });
      }
    }

    // 2) Année début AVS auto — seulement si ça change
    const birth = v?.Enter_dateNaissance;
    const ageStart = v?.Enter_ageDebutCotisationsAVS;
    if (birth && isValidDateMask(birth) && Number.isFinite(ageStart as any)) {
      const [, , yyyy] = normalizeDateMask(birth).split(".");
      const startYear = Number(yyyy) + Number(ageStart);
      if (Number.isFinite(startYear)) {
        const curYear = getValues("Enter_anneeDebutCotisationAVS");
        if (curYear !== startYear) {
          setValue("Enter_anneeDebutCotisationAVS", startYear, { shouldValidate: false, shouldDirty: false });
        }
      }
    }

    // 3) Nettoyage enfants si toggle = false — seulement si liste non vide
    if (!v?.Enter_hasEnfants) {
      const curKidsLen = (getValues("Enter_enfants") ?? []).length;
      if (curKidsLen > 0) {
        setValue("Enter_enfants", [], { shouldValidate: true, shouldDirty: true });
      }
    }
  });

  return () => sub.unsubscribe();
}, [watch, setValue, getValues]);

  // ⚠️ Guard de rendu APRÈS tous les hooks
  if (loading) {
    return <div className="p-2 text-sm text-muted-foreground">Chargement…</div>;
  }

  /* Helpers typés pour éviter “unknown → ReactNode” sur SelectItem */
  const etatCivilEntries = Object.entries(ENUM_EtatCivil) as Array<[string, string]>;
  const sexeEntries = Object.entries(ENUM_Sexe) as Array<[string, string]>;
  const statutProEntries = Object.entries(ENUM_StatutProfessionnel) as Array<[string, string]>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* ===== Identité & activité ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Prénom</Label>
          <Input {...register("Enter_prenom")} />
        </div>
        <div>
          <Label>Nom</Label>
          <Input {...register("Enter_nom")} />
        </div>

        <div>
          <Label>Date de naissance (jj.mm.aaaa)</Label>
          <Input {...register("Enter_dateNaissance")} onBlur={onBirthBlur} />
        </div>

        <div>
          <Label>Sexe</Label>
          <Select
            value={String(f?.Enter_sexe ?? 0)}
            onValueChange={(v) => setValue("Enter_sexe", Number(v))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sexeEntries.map(([k, label]) => (
                <SelectItem key={k} value={k}>{label as unknown as React.ReactNode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>État civil</Label>
          <Select
            value={String(f?.Enter_etatCivil ?? 0)}
            onValueChange={(v) => setValue("Enter_etatCivil", Number(v))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {etatCivilEntries.map(([k, label]) => (
                <SelectItem key={k} value={k}>{label as unknown as React.ReactNode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Statut professionnel</Label>
          <Select
            value={String(f?.Enter_statutProfessionnel ?? 0)}
            onValueChange={(v) => setValue("Enter_statutProfessionnel", Number(v))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statutProEntries.map(([k, label]) => (
                <SelectItem key={k} value={k}>{label as unknown as React.ReactNode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Salaire annuel directement (source de vérité) */}
        <div>
          <Label>Salaire annuel (CHF)</Label>
          <Input
            value={formatMoneyDisplay(f?.Enter_salaireAnnuel ?? 0)}
            onChange={(e) => {
              const n = parseMoneyToNumber(e.target.value);
              setValue("Enter_salaireAnnuel", Number.isFinite(n) ? n : 0, { shouldValidate: true });
            }}
            inputMode="decimal"
          />
        </div>

        {/* Optionnel : aide saisie mensuelle ×12/×13 */}
        <div className="sm:col-span-2 grid grid-cols-3 gap-3 items-end">
          <div>
            <Label>Salaire mensuel (CHF)</Label>
            <Input
              inputMode="decimal"
              placeholder="5 000"
              onBlur={(e) => {
                const monthly = parseMoneyToNumber(e.target.value);
                const defaultMult = (f?.Enter_statutProfessionnel ?? 0) === 0 ? 13 : 12;
                const annual = monthlyWithMultiplierToAnnual(monthly, (defaultMult as 12 | 13));
                setValue("Enter_salaireAnnuel", Number.isFinite(annual) ? annual : 0, { shouldValidate: true });
              }}
            />
          </div>
          <div>
            <Label>Multiplicateur</Label>
            <Select
              value={String((f?.Enter_statutProfessionnel ?? 0) === 0 ? 13 : 12)}
              onValueChange={() => {
                // Option : mémoriser un mensuel saisi pour recalculer ici.
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12">×12</SelectItem>
                <SelectItem value="13">×13</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Astuce : pour les salariés, le 13e salaire est fréquent → ×13.
          </div>
        </div>

        {/* 8h/sem → salariés uniquement */}
        {(f?.Enter_statutProfessionnel ?? 0) === 0 && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="trav8h"
              checked={!!f?.Enter_travaillePlusde8HSemaine}
              onChange={(e) => setValue("Enter_travaillePlusde8HSemaine", e.target.checked, { shouldValidate: true })}
            />
            <Label htmlFor="trav8h">Travaille &gt; 8h/sem (LAA non pro)</Label>
          </div>
        )}

        {/* Affiliation LPP (cochée automatiquement si salarié ≥ seuil) */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="affLpp"
            checked={!!f?.Enter_Affilie_LPP}
            onChange={(e) => setValue("Enter_Affilie_LPP", e.target.checked, { shouldValidate: true })}
            disabled={(f?.Enter_statutProfessionnel ?? 0) === 0 && (f?.Enter_salaireAnnuel ?? 0) >= LEGAL_SEUIL_ENTREE_LPP}
          />
          <Label htmlFor="affLpp">
            Affilié LPP
            {(f?.Enter_statutProfessionnel ?? 0) === 0 && (f?.Enter_salaireAnnuel ?? 0) >= LEGAL_SEUIL_ENTREE_LPP && (
              <span className="ml-2 text-xs text-muted-foreground">(forcé ≥ {LEGAL_SEUIL_ENTREE_LPP} CHF)</span>
            )}
          </Label>
        </div>
      </div>

{/* ===== Indemnités journalières (IJ) ===== */}
{[0, 1].includes((f?.Enter_statutProfessionnel ?? -1) as number) && (
  <div className="pt-2 border-t space-y-4">
    {/* IJ Maladie */}
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="ijMal"
          checked={!!f?.Enter_ijMaladie}
          onChange={(e) => setValue("Enter_ijMaladie", e.target.checked, { shouldValidate: true })}
        />
        <Label htmlFor="ijMal">IJ en cas de <b>maladie</b> ?</Label>
      </div>

      {f?.Enter_ijMaladie && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <Label>Taux IJ maladie (%)</Label>
            <Input
              inputMode="numeric"
              value={String(f?.Enter_ijMaladieTaux ?? "")}
              onChange={(e) => setValue("Enter_ijMaladieTaux", Number(e.target.value), { shouldValidate: true })}
              placeholder="80"
            />
          </div>
        </div>
      )}
    </div>

    {/* IJ Accident — toujours demandé (Salarié/Indépendant), slider 80–100 */}
    <div className="space-y-2">
      <Label>Taux IJ accident (%)</Label>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Slider
            value={[Number(f?.Enter_ijAccidentTaux ?? 80)]}
            min={80}
            max={100}
            step={1}
            onValueChange={(vals) => setValue("Enter_ijAccidentTaux", vals[0], { shouldValidate: true })}
          />
        </div>
        <div className="w-24">
          <Input
            inputMode="numeric"
            value={String(f?.Enter_ijAccidentTaux ?? 80)}
            onChange={(e) => {
              const v = Math.max(80, Math.min(100, Number(e.target.value)));
              setValue("Enter_ijAccidentTaux", v, { shouldValidate: true });
            }}
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Entre 80% et 100% du salaire annuel. Défaut&nbsp;: {LEGAL_IJ_ACCIDENT_TAUX_MIN}%.
      </div>
    </div>
  </div>
)}

      {/* ===== Conjoint (affiché si marié/partenariat) ===== */}
      {(() => {
  const ec = String(f?.Enter_etatCivil ?? "");
  // On tolère les clés "1"/"3" OU des libellés si l'enum évolue
  const ecStr = String(ec).toLowerCase();
  const isMarried = ec === "1" || /mari/i.test(ecStr);
  const isPartner = ec === "3" || /parten/i.test(ecStr);
  return (isMarried || isPartner);
})() && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <Label>Sexe conjoint</Label>
            <Select
              value={String(f?.Enter_spouseSexe ?? 0)}
              onValueChange={(v) => setValue("Enter_spouseSexe", Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ENUM_Sexe).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label as unknown as React.ReactNode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date naissance conjoint</Label>
            <Input
              defaultValue={f?.Enter_spouseDateNaissance ?? ""}
              onBlur={onSpouseBirthBlur}
            />
          </div>
          <div>
            <Label>Durée mariage</Label>
            <Select
              value={String(f?.Enter_mariageDuree ?? 1)}
              onValueChange={(v) => setValue("Enter_mariageDuree", Number(v) as 0 | 1)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Au moins 5 ans</SelectItem>
                <SelectItem value="1">Moins de 5 ans</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ===== AVS ===== */}
      <div className="pt-2 border-t space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Âge de début des cotisations AVS</Label>
            <Input
              inputMode="numeric"
              value={String(f?.Enter_ageDebutCotisationsAVS ?? "")}
              onChange={(e) => setValue("Enter_ageDebutCotisationsAVS", Number(e.target.value), { shouldValidate: true })}
              placeholder="21"
            />
          </div>
          <div>
            <Label>Année de début (auto)</Label>
            <Input value={String(f?.Enter_anneeDebutCotisationAVS ?? "")} disabled />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasLacunes"
            checked={!!f?.Enter_hasAnnesManquantesAVS}
            onChange={(e) => setValue("Enter_hasAnnesManquantesAVS", e.target.checked, { shouldValidate: true })}
          />
          <Label htmlFor="hasLacunes">Périodes sans cotisations AVS ?</Label>
        </div>

        {f?.Enter_hasAnnesManquantesAVS && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Années manquantes (ex. 2010 2011)</Label>
              <Input
                placeholder="2010 2011"
                onBlur={(e) => {
                  const parts = e.target.value
                    .split(/\s+/)
                    .map((s) => Number(s))
                    .filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100);
                  setValue("Enter_anneesManquantesAVS", parts, { shouldValidate: true });
                }}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Séparez par un espace. Chaque année saisie sera transformée en tag côté backend.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Enfants ===== */}
      <div className="pt-2 border-t">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasKids"
              checked={!!f?.Enter_hasEnfants}
              onChange={(e) => setValue("Enter_hasEnfants", e.target.checked, { shouldValidate: true })}
            />
            <Label htmlFor="hasKids" className="font-medium">Enfant(s) à charge</Label>
          </div>

          {f?.Enter_hasEnfants && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ Enter_dateNaissance: "" })}
            >
              + Ajouter un enfant
            </Button>
          )}
        </div>

        {!f?.Enter_hasEnfants && (
          <div className="text-sm text-muted-foreground">Aucun enfant (toggle désactivé).</div>
        )}

        {f?.Enter_hasEnfants && (
          <>
            {fields.length === 0 && (
              <div className="text-sm text-muted-foreground">Aucun enfant ajouté.</div>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Label>Date de naissance enfant #{idx + 1} (jj.mm.aaaa)</Label>
                    <Input
                      {...register(`Enter_enfants.${idx}.Enter_dateNaissance` as const)}
                      onBlur={(e) => {
                        const norm = normalizeDateMask(e.target.value);
                        setValue(`Enter_enfants.${idx}.Enter_dateNaissance` as const, norm, {
                          shouldValidate: true,
                        });
                      }}
                      defaultValue={field.Enter_dateNaissance ?? ""}
                      placeholder="01.01.2015"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-amber-700"
                      onClick={() => remove(idx)}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Button type="submit" className="mt-2">Enregistrer</Button>
    </form>
  );
}