"use client";

import FormWizardShell from "./form-wizard/FormWizardShell";
import { useSearchParams, usePathname } from "next/navigation";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";


import {
  subscribeDonneesPersonnelles,
  upsertDonneesPersonnelles,
} from "../../lib/data/donneesPersonnelles";

import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";

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
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

/* ---------- Constantes UI ---------- */
const LEGAL_SEUIL_ENTREE_LPP = 22_680;
const LEGAL_IJ_ACCIDENT_TAUX_MIN = 80;

/* ---------- Zod schemas fusionnés ---------- */
const ChildSchema = z.object({
  Enter_dateNaissance: z.string().refine(isValidDateMask, "jj.mm.aaaa"),
});

const UnifiedSchema = z.object({
  // ====== Données personnelles ======
  Enter_prenom: z.string().min(1),
  Enter_nom: z.string().min(1),
  Enter_dateNaissance: z.string().refine(isValidDateMask, "jj.mm.aaaa"),

  Enter_sexe: z.coerce.number().int().min(0).max(1),
  Enter_etatCivil: z.coerce.number().int().min(0).max(5),
  Enter_spouseSexe: z.coerce.number().int().min(0).max(1).optional(),
  Enter_spouseDateNaissance: z.string().optional(),
  Enter_mariageDuree: z.coerce.number().int().min(0).max(1).optional(), // 0: ≥5 ans ; 1: <5 ans
  Enter_menageCommun5Ans: z.boolean().optional(),
  Enter_partenaireDesigneLPP: z.boolean().optional(),

  Enter_statutProfessionnel: z.coerce.number().int().min(0).max(2),
  Enter_travaillePlusde8HSemaine: z.boolean(),
  Enter_Affilie_LPP: z.boolean(),

  Enter_salaireAnnuel: z.coerce.number().nonnegative(),

  Enter_ijMaladie: z.boolean().optional(),
  Enter_ijMaladieTaux: z.coerce.number().min(10).max(100).optional(),
  Enter_ijAccidentTaux: z.coerce.number().min(80).max(100).optional(),

  Enter_hasEnfants: z.boolean().optional(),
  Enter_enfants: z.array(z.object({
    Enter_dateNaissance: z.string().refine(isValidDateMask, "jj.mm.aaaa"),
  })).optional(),

  Enter_ageDebutCotisationsAVS: z.coerce.number().int().min(18),
  Enter_anneeDebutCotisationAVS: z.coerce.number().int().optional(),
  Enter_hasAnnesManquantesAVS: z.boolean().optional(),
  Enter_anneesManquantesAVS: z.array(z.coerce.number().int()).optional(),

  // ====== Certificat LPP ======
  Enter_dateCertificatLPP: z.string().refine(isValidDateMask, "jj.mm.aaaa").optional(),

  Enter_typeSalaireAssure: z.enum(['general','split']).optional(),
  Enter_salaireAssureLPP: z.coerce.number().nonnegative().optional(),
  Enter_salaireAssureLPPRisque: z.coerce.number().nonnegative().optional(),
  Enter_salaireAssureLPPEpargne: z.coerce.number().nonnegative().optional(),

  Enter_rentevieillesseLPP65: z.coerce.number().nonnegative().optional(),
  Enter_renteInvaliditeLPP: z.coerce.number().nonnegative().optional(),
  Enter_renteEnfantInvaliditeLPP: z.coerce.number().nonnegative().optional(),
  Enter_renteOrphelinLPP: z.coerce.number().nonnegative().optional(),

  // Si Firestore a déjà stocké "0"/"1" en string, on coerce aussi :
  Enter_RenteConjointOuPartenaireLPP: z.coerce.number().pipe(z.union([z.literal(0), z.literal(1)])).optional(),

  Enter_renteConjointLPP: z.coerce.number().nonnegative().optional(),
  Enter_rentePartenaireLPP: z.coerce.number().nonnegative().optional(),

  Enter_avoirVieillesseObligatoire: z.coerce.number().nonnegative().optional(),
  Enter_avoirVieillesseTotal: z.coerce.number().nonnegative().optional(),
  Enter_librePassageObligatoire: z.coerce.number().nonnegative().optional(),
  Enter_librePassageTotal: z.coerce.number().nonnegative().optional(),
  Enter_prestationCapital65: z.coerce.number().nonnegative().optional(),
  Enter_rachatPossible: z.coerce.number().nonnegative().optional(),
  Enter_versementsAnticipesLogement: z.coerce.number().nonnegative().optional(),
  Enter_eplPossibleMax: z.coerce.number().nonnegative().optional(),
  Enter_miseEnGage: z.boolean().optional(),

  Enter_CapitalAucuneRente: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRente: z.coerce.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteMal: z.coerce.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteAcc: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRenteMal: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRenteAcc: z.coerce.number().nonnegative().optional(),

  DecesCapitaux: z.array(z.object({
    amount: z.coerce.number().positive(),
    plusRente: z.enum(['oui','non','np']),
    condition: z.enum(['accident','maladie','les_deux','np']),
  })).optional(),
})
.refine((d) => {
  if (!d.Enter_typeSalaireAssure || d.Enter_typeSalaireAssure === 'general') return true;
  return typeof d.Enter_salaireAssureLPPRisque === 'number'
      && typeof d.Enter_salaireAssureLPPEpargne === 'number';
}, { message: 'Complétez salaire assuré (split : risque + épargne).' });

type UnifiedFormInput = z.input<typeof UnifiedSchema>;   // avant coercition (strings, unknown…)
type UnifiedForm      = z.output<typeof UnifiedSchema>;  // après coercition (numbers) // ✅ types après coercition
// (optionnel) si tu veux l’input aussi :
// type UnifiedFormInput = z.input<typeof UnifiedSchema>;

/* ---------- MoneyField réutilisable ---------- */
function MoneyField({
  name,
  watch,
  setValue,
  placeholder,
  disabled,
  id,
}: {
  name: keyof UnifiedForm;
  watch: (name: keyof UnifiedForm) => unknown;
  setValue: (name: keyof UnifiedForm, value: any, opts?: any) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const raw = watch(name) as number | undefined;
  const [view, setView] = useState<string>(() => formatMoneyDisplay(raw ?? 0));
  const currentVal = watch(name) as number | undefined;
  useEffect(() => { setView(formatMoneyDisplay(currentVal ?? 0)); }, [currentVal]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setView(nextStr);
    const parsed = parseMoneyToNumber(nextStr);
    setValue(name, Number.isFinite(parsed) ? parsed : 0, { shouldDirty: true, shouldValidate: true });
  };
  const onBlur = () => {
    const parsed = parseMoneyToNumber(view);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    setValue(name, safe, { shouldDirty: true, shouldValidate: true });
    setView(formatMoneyDisplay(safe));
  };




  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={view}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

/* ---------- Repeater capitaux décès ---------- */
function CapitalDecesRepeater({
  items,
  onChange,
  watch,
}: {
  items?: UnifiedForm["DecesCapitaux"];
  onChange: (v: NonNullable<UnifiedForm["DecesCapitaux"]>) => void;
  watch: (name: keyof UnifiedForm) => unknown;
}) {
  const list = items ?? [];
  const add = () => onChange([...(list as any), { amount: 0, plusRente: 'np', condition: 'np' }]);
  const del = (i: number) => onChange(list.filter((_, idx) => idx !== i) as any);
  const upd = (i: number, patch: any) => onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) as any);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Ajouter un capital décès (comme sur le certificat)</Label>
        <Button type="button" onClick={add}>Ajouter</Button>
      </div>

      {list.map((it, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 border rounded-lg">
          <div>
            <Label>Montant (CHF)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={formatMoneyDisplay(it.amount)}
              onChange={(e) => {
                const n = parseMoneyToNumber(e.target.value);
                upd(i, { amount: Number.isFinite(n) ? n : 0 });
              }}
            />
          </div>
          <div>
            <Label>En plus d’une rente ?</Label>
            <Select value={it.plusRente} onValueChange={(v) => upd(i, { plusRente: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
                <SelectItem value="np">Non précisé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condition</Label>
            <Select value={it.condition} onValueChange={(v) => upd(i, { condition: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="accident">Accident</SelectItem>
                <SelectItem value="maladie">Maladie</SelectItem>
                <SelectItem value="les_deux">Les deux</SelectItem>
                <SelectItem value="np">Non précisé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" className="w-full" onClick={() => del(i)}>Supprimer</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- OCR IA type ---------- */
type LppAiResult = {
  dateCertificat?: string | null;
  prenom?: string | null;
  nom?: string | null;
  dateNaissance?: string | null;
  salaireDeterminant?: number | null;
  deductionCoordination?: number | null;
  salaireAssureEpargne?: number | null;
  salaireAssureRisque?: number | null;
  avoirVieillesse?: number | null;
  avoirVieillesseSelonLpp?: number | null;
  renteInvaliditeAnnuelle?: number | null;
  renteEnfantInvaliditeAnnuelle?: number | null;
  renteConjointAnnuelle?: number | null;
  renteOrphelinAnnuelle?: number | null;
  capitalDeces?: number | null;
  capitalRetraite65?: number | null;
  renteRetraite65Annuelle?: number | null;
  rachatPossible?: number | null;
  eplDisponible?: number | null;
  miseEnGage?: boolean | null;
  proofs?: Record<string, { snippet: string }>;
  issues?: string[];
  confidence?: number | null;
};

export default function ProfilUnifiedForm() {
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
  register,
  handleSubmit,
  control,
  setValue,
  getValues,
  reset,
  watch,
  trigger,
  setFocus,
  formState: { errors, isSubmitting, isValid }
} = useForm<UnifiedFormInput, any, UnifiedForm>({
  resolver: zodResolver(UnifiedSchema),
    defaultValues: {
      // Perso
      Enter_prenom: "",
      Enter_nom: "",
      Enter_dateNaissance: "",
      Enter_sexe: 0,
      Enter_etatCivil: 0,
      Enter_spouseSexe: undefined,
      Enter_spouseDateNaissance: "",
      Enter_mariageDuree: 0, // défaut = ≥5 ans
      Enter_menageCommun5Ans: false,
      Enter_partenaireDesigneLPP: false,

      Enter_statutProfessionnel: 0,
      Enter_travaillePlusde8HSemaine: true,
      Enter_Affilie_LPP: false,

      Enter_salaireAnnuel: 0,

      Enter_ijMaladie: true,
      Enter_ijMaladieTaux: 80,
      Enter_ijAccidentTaux: 80,

      Enter_hasEnfants: false,
      Enter_enfants: [],

      Enter_ageDebutCotisationsAVS: 21,
      Enter_anneeDebutCotisationAVS: undefined,
      Enter_hasAnnesManquantesAVS: false,
      Enter_anneesManquantesAVS: [],

      // Certif
      Enter_dateCertificatLPP: undefined,
      Enter_typeSalaireAssure: 'general',
      Enter_salaireAssureLPP: undefined,
      Enter_salaireAssureLPPRisque: undefined,
      Enter_salaireAssureLPPEpargne: undefined,

      Enter_rentevieillesseLPP65: undefined,
      Enter_renteInvaliditeLPP: undefined,
      Enter_renteEnfantInvaliditeLPP: undefined,
      Enter_renteOrphelinLPP: undefined,

      Enter_RenteConjointOuPartenaireLPP: 0,
      Enter_renteConjointLPP: undefined,
      Enter_rentePartenaireLPP: undefined,

      Enter_avoirVieillesseObligatoire: undefined,
      Enter_avoirVieillesseTotal: undefined,
      Enter_librePassageObligatoire: undefined,
      Enter_librePassageTotal: undefined,
      Enter_prestationCapital65: undefined,
      Enter_rachatPossible: undefined,
      Enter_versementsAnticipesLogement: undefined,
      Enter_eplPossibleMax: undefined,
      Enter_miseEnGage: false,

      Enter_CapitalAucuneRente: 0,
      Enter_CapitalPlusRente: 0,
      Enter_CapitalAucuneRenteMal: 0,
      Enter_CapitalAucuneRenteAcc: 0,
      Enter_CapitalPlusRenteMal: 0,
      Enter_CapitalPlusRenteAcc: 0,

      DecesCapitaux: [],
    },
  });

  const { fields: childFields, append: addChild, remove: delChild } = useFieldArray({
    control, name: "Enter_enfants",
  });

  // --- Hooks de routing (doivent être appelés avant tout early-return)
const search = useSearchParams();
const pathname = usePathname();
const isWizard = search?.get("wizard") === "1" || pathname?.endsWith("/profil/wizard");



  // Préremplissage depuis Firestore (unique source)
  useEffect(() => {
    const u = auth.currentUser;
if (!u) {
  setLoading(false);
  return;
}
const unsub = subscribeDonneesPersonnelles(u.uid, (data: Partial<ClientData> | null) => {
      if (data) {
        const withDefaults: Partial<UnifiedForm> = {
          Enter_enfants: [],
          Enter_hasEnfants: Array.isArray((data as any)?.Enter_enfants) && (data as any).Enter_enfants.length > 0,
          ...data,
        };
        reset((prev) => ({ ...prev, ...withDefaults }));
      }
      setLoading(false);
    });
    return () => { if (unsub) unsub(); };
  }, [reset]);

  /* ---------- Abonnements logiques (LPP forcée, AVS année, enfants) ---------- */
  useEffect(() => {
    const sub = watch((v) => {
      // 1) LPP forcée si salarié >= seuil
      const statut = Number(v?.Enter_statutProfessionnel ?? 0);
    const sal = Number(v?.Enter_salaireAnnuel ?? 0);
    if (statut === 0 && sal >= LEGAL_SEUIL_ENTREE_LPP) {
        const curAff = getValues("Enter_Affilie_LPP");
        if (curAff !== true) setValue("Enter_Affilie_LPP" as const, true, { shouldValidate: true, shouldDirty: false });
      }

      // 2) Année début AVS auto
      const birth = v?.Enter_dateNaissance;
      const ageStart = v?.Enter_ageDebutCotisationsAVS;
      if (birth && isValidDateMask(birth) && Number.isFinite(ageStart as any)) {
        const [, , yyyy] = normalizeDateMask(birth).split(".");
        const startYear = Number(yyyy) + Number(ageStart);
        if (Number.isFinite(startYear)) {
          const curYear = getValues("Enter_anneeDebutCotisationAVS" as const);
          if (curYear !== startYear) {
            setValue("Enter_anneeDebutCotisationAVS" as const, startYear, { shouldValidate: false, shouldDirty: false });
          }
        }
      }

      // 3) Nettoyage enfants si toggle = false
      if (!v?.Enter_hasEnfants) {
        const curKidsLen = (getValues("Enter_enfants") ?? []).length;
        if (curKidsLen > 0) setValue("Enter_enfants" as const, [], { shouldValidate: true, shouldDirty: true });
      }
    });
    return () => sub.unsubscribe();
  }, [watch, setValue, getValues]);
  

  /* ---------- Dates blur ---------- */
  const onBirthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_dateNaissance", norm, { shouldValidate: true });
  };
  const onSpouseBirthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_spouseDateNaissance", norm as any, { shouldValidate: true });
  };
  const onCertDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_dateCertificatLPP", norm, { shouldValidate: true });
  };

  /* ---------- OCR mapping ---------- */
  function aiToFormPatch(ai: LppAiResult): Partial<UnifiedForm> {
    const patch: Partial<UnifiedForm> = {};
    if (ai.dateCertificat) patch.Enter_dateCertificatLPP = normalizeDateMask(ai.dateCertificat);
    if (typeof ai.salaireDeterminant === 'number') patch.Enter_salaireAnnuel = ai.salaireDeterminant;

    const hasRisque = typeof ai.salaireAssureRisque === 'number';
    const hasEpargne = typeof ai.salaireAssureEpargne === 'number';
    if (hasRisque || hasEpargne) {
      if (hasRisque && hasEpargne && ai.salaireAssureRisque !== ai.salaireAssureEpargne) {
        patch.Enter_typeSalaireAssure = 'split';
        patch.Enter_salaireAssureLPPRisque = ai.salaireAssureRisque ?? undefined;
        patch.Enter_salaireAssureLPPEpargne = ai.salaireAssureEpargne ?? undefined;
      } else {
        patch.Enter_typeSalaireAssure = 'general';
        patch.Enter_salaireAssureLPP = (ai.salaireAssureEpargne ?? ai.salaireAssureRisque) ?? undefined;
      }
    }
    if (typeof ai.renteInvaliditeAnnuelle === 'number') patch.Enter_renteInvaliditeLPP = ai.renteInvaliditeAnnuelle;
    if (typeof ai.renteEnfantInvaliditeAnnuelle === 'number') patch.Enter_renteEnfantInvaliditeLPP = ai.renteEnfantInvaliditeAnnuelle;
    if (typeof ai.renteOrphelinAnnuelle === 'number') patch.Enter_renteOrphelinLPP = ai.renteOrphelinAnnuelle;
    if (typeof ai.renteConjointAnnuelle === 'number') patch.Enter_renteConjointLPP = ai.renteConjointAnnuelle;

    if (typeof ai.renteRetraite65Annuelle === 'number') patch.Enter_rentevieillesseLPP65 = ai.renteRetraite65Annuelle;
    if (typeof ai.capitalRetraite65 === 'number') patch.Enter_prestationCapital65 = ai.capitalRetraite65;

    if (typeof ai.avoirVieillesse === 'number') patch.Enter_avoirVieillesseTotal = ai.avoirVieillesse;
    if (typeof ai.avoirVieillesseSelonLpp === 'number') patch.Enter_avoirVieillesseObligatoire = ai.avoirVieillesseSelonLpp;

    if (typeof ai.rachatPossible === 'number') patch.Enter_rachatPossible = ai.rachatPossible;
    if (typeof ai.eplDisponible === 'number') patch.Enter_eplPossibleMax = ai.eplDisponible;
    if (typeof ai.miseEnGage === 'boolean') patch.Enter_miseEnGage = ai.miseEnGage;

    if (typeof ai.capitalDeces === 'number' && ai.capitalDeces > 0) {
      const existing = (watch("DecesCapitaux") as any) ?? [];
      patch.DecesCapitaux = [...existing, { amount: ai.capitalDeces, plusRente: 'np', condition: 'np' }];
    }
    return patch;
  }

  async function handleScanFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const u = auth.currentUser;
    if (!u) return;
    try {
      setIsScanning(true);
      setScanPct(10);
      const f = files[0];
      const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
      const ext = isPdf ? "pdf" : (f.type.split("/")[1] || "jpg").toLowerCase();
      const fileId = crypto.randomUUID();
      const storagePath = `clients/${u.uid}/lpp_raw/${fileId}.${ext}`;
      await uploadBytes(ref(storage, storagePath), f);
      setScanPct(40);
      const jwt = await u.getIdToken(true);
      const res = await fetch(`/api/lpp/parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ filePath: storagePath }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> "");
        throw new Error(`Parse fail ${res.status} ${res.statusText} — ${txt}`);
      }
      const { docId } = await res.json();
      setScanPct(70);
      const snap = await getDoc(doc(db, "clients", u.uid, "lpp_parsed", docId));
      if (!snap.exists()) throw new Error("Document parsé introuvable");
      const parsed = snap.data() as LppAiResult;
      setScanPct(85);
      const patch = aiToFormPatch(parsed);
      Object.entries(patch).forEach(([k, v]) => {
        setValue(k as keyof UnifiedForm, v as any, { shouldDirty: true, shouldValidate: true });
      });
      setScanPct(100);
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setIsScanning(false);
      setTimeout(()=> setScanPct(0), 600);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  function clickScan() { fileInputRef.current?.click(); }

  /* ---------- Submit unique (sauvegarde complète) ---------- */
  const onSubmit = async (values: UnifiedForm) => {
    // Robustesse état civil : si conjoint saisi → forcer "marié" si incohérent
    const hasSpouse = !!values.Enter_spouseDateNaissance && values.Enter_spouseDateNaissance.trim().length >= 8;
    const ec = String(values.Enter_etatCivil ?? "");
    const ecStr = ec.toLowerCase();
    const looksMarried = ec === "1" || /mari/i.test(ecStr) || ec === "3" || /parten/i.test(ecStr);
    if (hasSpouse && !looksMarried) values.Enter_etatCivil = 1 as any;
    if (values.Enter_etatCivil === 1 && (values.Enter_mariageDuree as any) == null) {
      values.Enter_mariageDuree = 0 as any; // ≥ 5 ans
    }

    // Normalize “flats” capitaux décès depuis le repeater
    const v = { ...values };

    // Tous les agrégats de capitaux décès sont *entièrement dérivés* de DecesCapitaux
    v.Enter_CapitalPlusRenteAcc = 0;
    v.Enter_CapitalPlusRenteMal = 0;
    v.Enter_CapitalAucuneRenteAcc = 0;
    v.Enter_CapitalAucuneRenteMal = 0;
    v.Enter_CapitalPlusRente = 0;
    v.Enter_CapitalAucuneRente = 0;

    (v.DecesCapitaux || []).forEach(({ amount, plusRente, condition }) => {
      const addPlus = () => {
        // Spécifique accident / maladie
        if (condition === 'accident' || condition === 'les_deux') v.Enter_CapitalPlusRenteAcc! += amount;
        if (condition === 'maladie'  || condition === 'les_deux') v.Enter_CapitalPlusRenteMal! += amount;
        // Non précisé → va uniquement dans le "général"
        if (condition === 'np') v.Enter_CapitalPlusRente! += amount;
      };
      const addAucune = () => {
        if (condition === 'accident' || condition === 'les_deux') v.Enter_CapitalAucuneRenteAcc! += amount;
        if (condition === 'maladie'  || condition === 'les_deux') v.Enter_CapitalAucuneRenteMal! += amount;
        if (condition === 'np') v.Enter_CapitalAucuneRente! += amount;
      };
      if (plusRente === 'oui') addPlus();
      else if (plusRente === 'non') addAucune();
      else addPlus(); // "np" traité comme "plus rente"
    });

    await upsertDonneesPersonnelles(v);
  };





if (isWizard) {
  return (
    <FormWizardShell
      form={{
        register,
        handleSubmit,
        control,
        setValue,
        getValues,
        reset,
        watch,
        trigger,
        setFocus,
        formState: { errors, isSubmitting, isValid },
      } as any}
      onSubmitFinal={onSubmit} // on laisse le wizard faire handleSubmit
    />
  );
}



  const f = watch();
  const etatCivilEntries = Object.entries(ENUM_EtatCivil) as Array<[string, string]>;
  const sexeEntries = Object.entries(ENUM_Sexe) as Array<[string, string]>;
  const statutProEntries = Object.entries(ENUM_StatutProfessionnel) as Array<[string, string]>;

  return (
  <div className="p-4">
    <a href="/profil/wizard" className="inline-block mb-4 text-teal-500 underline">
      🚀 Tester le nouveau formulaire Wizard
    </a>
    <form
  onSubmit={handleSubmit(
    onSubmit,
    (errs) => {
      console.error("[ProfilUnifiedForm] Validation errors:", errs);
      alert("Merci de corriger les champs en rouge avant d’enregistrer.");
    }
  )}
  className="space-y-6"
>
      {/* Barre scan */}
      {isScanning && (
        <div className="rounded-xl border px-3 py-2 text-sm flex items-center justify-between">
          <span>Analyse du certificat…</span>
          <span className="tabular-nums">{Math.round(scanPct)}%</span>
        </div>
      )}

      {/* Actions haut */}
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleScanFiles(e.target.files)}
        />
        <Button type="button" variant="secondary" onClick={clickScan} disabled={isScanning}>
          {isScanning ? "Analyse…" : "Scanner mon certificat"}
        </Button>
      </div>

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
          <Input {...register("Enter_dateNaissance")} onBlur={(e)=> setValue("Enter_dateNaissance", normalizeDateMask(e.target.value), { shouldValidate:true })} />
        </div>
        <div>
          <Label>Sexe</Label>
          <Select value={String(f?.Enter_sexe ?? 0)} onValueChange={(v) => setValue("Enter_sexe", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sexeEntries.map(([k, label]) => (<SelectItem key={k} value={k}>{label as any}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>État civil</Label>
          <Select value={String(f?.Enter_etatCivil ?? 0)} onValueChange={(v) => setValue("Enter_etatCivil", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {etatCivilEntries.map(([k, label]) => (<SelectItem key={k} value={k}>{label as any}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Statut professionnel</Label>
          <Select value={String(f?.Enter_statutProfessionnel ?? 0)} onValueChange={(v) => setValue("Enter_statutProfessionnel", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statutProEntries.map(([k, label]) => (<SelectItem key={k} value={k}>{label as any}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* Salaire annuel */}
        <div>
          <Label>Salaire annuel (CHF)</Label>
          <Input
            value={formatMoneyDisplay(Number(f?.Enter_salaireAnnuel ?? 0))}
            onChange={(e) => {
                const parsed = parseMoneyToNumber(e.target.value);
                const val = typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
                setValue("Enter_salaireAnnuel" as const, val, { shouldValidate: true });
            }}
            inputMode="decimal"
            />
        </div>

        {/* Mensuel ×12/13 */}
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
            <Select value={String((f?.Enter_statutProfessionnel ?? 0) === 0 ? 13 : 12)} onValueChange={() => {}}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12">×12</SelectItem>
                <SelectItem value="13">×13</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">Astuce : salariés souvent ×13.</div>
        </div>

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

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="affLpp"
            checked={!!f?.Enter_Affilie_LPP}
            onChange={(e) => setValue("Enter_Affilie_LPP", e.target.checked, { shouldValidate: true })}
            disabled={Number(f?.Enter_statutProfessionnel ?? 0) === 0 && Number(f?.Enter_salaireAnnuel ?? 0) >= LEGAL_SEUIL_ENTREE_LPP}
          />
          <Label htmlFor="affLpp">
            Affilié LPP
            {Number(f?.Enter_statutProfessionnel ?? 0) === 0 &&
            Number(f?.Enter_salaireAnnuel ?? 0) >= LEGAL_SEUIL_ENTREE_LPP && (
                <span className="ml-2 text-xs text-muted-foreground">
                (forcé ≥ {LEGAL_SEUIL_ENTREE_LPP} CHF)
                </span>
            )}
          </Label>
        </div>
      </div>

      {/* ===== IJ ===== */}
      {[0, 1].includes((f?.Enter_statutProfessionnel ?? -1) as number) && (
        <div className="pt-2 border-t space-y-4">
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
              Entre 80% et 100% du salaire annuel. Défaut : {LEGAL_IJ_ACCIDENT_TAUX_MIN}%.
            </div>
          </div>
        </div>
      )}

      {/* ===== Conjoint (marié/partenariat) ===== */}
      {(() => {
        const ec = String(f?.Enter_etatCivil ?? "");
        const ecStr = ec.toLowerCase();
        const isMarried = ec === "1" || /mari/i.test(ecStr);
        const isPartner = ec === "3" || /parten/i.test(ecStr);
        return (isMarried || isPartner);
      })() && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <Label>Sexe conjoint</Label>
            <Select value={String(f?.Enter_spouseSexe ?? 0)} onValueChange={(v) => setValue("Enter_spouseSexe", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ENUM_Sexe).map(([k, label]) => (<SelectItem key={k} value={k}>{label as any}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date naissance conjoint</Label>
            <Input defaultValue={f?.Enter_spouseDateNaissance ?? ""} onBlur={(e)=> setValue("Enter_spouseDateNaissance", normalizeDateMask(e.target.value) as any, { shouldValidate:true })} />
          </div>
          <div>
            <Label>Durée mariage</Label>
            <Select value={String(f?.Enter_mariageDuree ?? 0)} onValueChange={(v) => setValue("Enter_mariageDuree", Number(v) as 0 | 1)}>
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
                Séparez par un espace. Chaque année sera transformée en tag.
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
            <Button type="button" variant="outline" size="sm" onClick={() => addChild({ Enter_dateNaissance: "" })}>
              + Ajouter un enfant
            </Button>
          )}
        </div>

        {!f?.Enter_hasEnfants && <div className="text-sm text-muted-foreground">Aucun enfant (toggle désactivé).</div>}

        {f?.Enter_hasEnfants && (
          <>
            {childFields.length === 0 && (
              <div className="text-sm text-muted-foreground">Aucun enfant ajouté.</div>
            )}
            <div className="space-y-2">
              {childFields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Label>Date de naissance enfant #{idx + 1} (jj.mm.aaaa)</Label>
                    <Input
                      {...register(`Enter_enfants.${idx}.Enter_dateNaissance` as const)}
                      onBlur={(e) => {
                        const norm = normalizeDateMask(e.target.value);
                        setValue(`Enter_enfants.${idx}.Enter_dateNaissance` as const, norm, { shouldValidate: true });
                      }}
                      defaultValue={(field as any).Enter_dateNaissance ?? ""}
                      placeholder="01.01.2015"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" className="text-amber-700" onClick={() => delChild(idx)}>
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ===== LPP : Certificat, salaire assuré, rentes ===== */}
      <div className="pt-2 border-t grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <Label htmlFor="date-certif">Date du certificat</Label>
          <Input id="date-certif" {...register("Enter_dateCertificatLPP")} onBlur={onCertDateBlur} />
        </div>
        <div>
          <Label htmlFor="sal-annuel">Salaire annuel (brut)</Label>
          <MoneyField id="sal-annuel" name="Enter_salaireAnnuel" watch={watch} setValue={setValue} placeholder="96'000" />
        </div>
        <div>
          <Label htmlFor="sal-lpp">Salaire assuré LPP (an)</Label>
          <MoneyField id="sal-lpp" name="Enter_salaireAssureLPP" watch={watch} setValue={setValue} placeholder="58'800" />
        </div>
        <div>
          <Label htmlFor="rente-vieillesse">Rente vieillesse LPP (an)</Label>
          <MoneyField id="rente-vieillesse" name="Enter_rentevieillesseLPP65" watch={watch} setValue={setValue} placeholder="24'000" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Type de salaire assuré</Label>
          <Select
            value={watch("Enter_typeSalaireAssure") ?? 'general'}
            onValueChange={(v) => setValue("Enter_typeSalaireAssure", v as 'general'|'split', { shouldDirty: true, shouldValidate: true })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Salaire assuré général</SelectItem>
              <SelectItem value="split">Distinction épargne / risque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {watch("Enter_typeSalaireAssure") === 'split' && (
          <>
            <div>
              <Label htmlFor="sal-split-risque">Salaire assuré (part risque)</Label>
              <MoneyField id="sal-split-risque" name="Enter_salaireAssureLPPRisque" watch={watch} setValue={setValue} placeholder="58'800" />
            </div>
            <div>
              <Label htmlFor="sal-split-epargne">Salaire assuré (part épargne)</Label>
              <MoneyField id="sal-split-epargne" name="Enter_salaireAssureLPPEpargne" watch={watch} setValue={setValue} placeholder="58'800" />
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="rente-inv">Rente invalidité LPP (an)</Label>
          <MoneyField id="rente-inv" name="Enter_renteInvaliditeLPP" watch={watch} setValue={setValue} />
        </div>
        <div>
          <Label htmlFor="rente-enf-inv">Rente enfant d’invalide LPP (an)</Label>
          <MoneyField id="rente-enf-inv" name="Enter_renteEnfantInvaliditeLPP" watch={watch} setValue={setValue} />
        </div>
        <div>
          <Label htmlFor="rente-orphelin">Rente orphelin LPP (an)</Label>
          <MoneyField id="rente-orphelin" name="Enter_renteOrphelinLPP" watch={watch} setValue={setValue} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Conjoint ou partenaire (pour rentes)</Label>
          <Select
            value={String(watch("Enter_RenteConjointOuPartenaireLPP") ?? 0)}
            onValueChange={(v) =>
            setValue("Enter_RenteConjointOuPartenaireLPP" as const, Number(v) as 0 | 1, {
                shouldDirty: true,
                shouldValidate: true,
            })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Rente de conjoint·e</SelectItem>
              <SelectItem value="1">Rente de partenaire</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="rente-conj">Rente conjoint (an)</Label>
          <MoneyField id="rente-conj" name="Enter_renteConjointLPP" watch={watch} setValue={setValue} />
        </div>
        <div>
          <Label htmlFor="rente-part">Rente partenaire (an)</Label>
          <MoneyField id="rente-part" name="Enter_rentePartenaireLPP" watch={watch} setValue={setValue} />
        </div>
      </div>

      <div className="pt-2 border-t">
        <Label className="font-medium">Avoir / Libre passage (au jour du certificat)</Label>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-2">
          <div><Label htmlFor="av-oblig">AV obligatoire</Label><MoneyField id="av-oblig" name="Enter_avoirVieillesseObligatoire" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="av-total">AV total</Label><MoneyField id="av-total" name="Enter_avoirVieillesseTotal" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="lp-oblig">Libre passage oblig.</Label><MoneyField id="lp-oblig" name="Enter_librePassageObligatoire" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="lp-total">Libre passage total</Label><MoneyField id="lp-total" name="Enter_librePassageTotal" watch={watch} setValue={setValue} /></div>
        </div>
      </div>

      <div className="pt-2 border-t">
        <Label className="font-medium">Capitaux & options</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div><Label htmlFor="prest-cap-65">Prestation capital à 65 ans</Label><MoneyField id="prest-cap-65" name="Enter_prestationCapital65" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="rachat-poss">Rachat possible</Label><MoneyField id="rachat-poss" name="Enter_rachatPossible" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="epl-poss-max">EPL possible max</Label><MoneyField id="epl-poss-max" name="Enter_eplPossibleMax" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="epl-verse">Versements anticipés (EPL)</Label><MoneyField id="epl-verse" name="Enter_versementsAnticipesLogement" watch={watch} setValue={setValue} /></div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="miseengage"
              checked={!!watch("Enter_miseEnGage")}
              onChange={(e) => setValue("Enter_miseEnGage", e.target.checked, { shouldDirty: true, shouldValidate: true })}
            />
            <Label htmlFor="miseengage">Mise en gage</Label>
          </div>
        </div>
      </div>

      {/* Capitaux décès */}
      <div className="pt-2 border-t">
        <Label className="font-medium">Capitaux décès (certificat)</Label>
        <div className="mt-2 mb-4">
          <CapitalDecesRepeater
            items={watch("DecesCapitaux") as any}
            onChange={(v) => setValue("DecesCapitaux", v as any, { shouldDirty: true, shouldValidate: true })}
            watch={watch}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div><Label htmlFor="cap-none-gen">Capital aucune rente (général)</Label><MoneyField id="cap-none-gen" name="Enter_CapitalAucuneRente" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="cap-plus-gen">Capital + rente (général)</Label><MoneyField id="cap-plus-gen" name="Enter_CapitalPlusRente" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="cap-none-mal">Capital aucune rente (maladie)</Label><MoneyField id="cap-none-mal" name="Enter_CapitalAucuneRenteMal" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="cap-none-acc">Capital aucune rente (accident)</Label><MoneyField id="cap-none-acc" name="Enter_CapitalAucuneRenteAcc" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="cap-plus-mal">Capital + rente (maladie)</Label><MoneyField id="cap-plus-mal" name="Enter_CapitalPlusRenteMal" watch={watch} setValue={setValue} /></div>
          <div><Label htmlFor="cap-plus-acc">Capital + rente (accident)</Label><MoneyField id="cap-plus-acc" name="Enter_CapitalPlusRenteAcc" watch={watch} setValue={setValue} /></div>
        </div>
      </div>

      {/* Bouton unique */}
      <div className="sticky bottom-2">
        <Button type="submit" className="w-full">Enregistrer</Button>
      </div>
    </form>
    </div>
);
}