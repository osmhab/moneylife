//app/profil/_client/LppCertForm.tsx

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  subscribeDonneesPersonnelles,
  upsertDonneesPersonnelles,
} from "../../lib/data/donneesPersonnelles";



// firebase client à la racine du repo
import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";

// types + helpers (imports RELATIFS vers app/lib/**)
import type { ClientData } from "../../lib/core/types";
import { normalizeDateMask, isValidDateMask } from "../../lib/core/dates";
import { parseMoneyToNumber, formatMoneyDisplay } from "../../lib/core/format";

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



/* ---------- Zod schema ---------- */
const CertSchema = z.object({
  // Métadonnées certificat
  Enter_dateCertificatLPP: z.string().refine(isValidDateMask, "jj.mm.aaaa").optional(),

  // Salaire annuel (peut provenir d'une étape précédente)
  Enter_salaireAnnuel: z.number().nonnegative().optional(),

  // Type de salaire assuré (général vs split épargne/risque)
  Enter_typeSalaireAssure: z.enum(['general','split']).optional(),
  Enter_salaireAssureLPP: z.number().nonnegative().optional(),       // si general
  Enter_salaireAssureLPPRisque: z.number().nonnegative().optional(), // si split
  Enter_salaireAssureLPPEpargne: z.number().nonnegative().optional(),// si split

  // Rémunérations / rentes LPP (an)
  Enter_rentevieillesseLPP65: z.number().nonnegative().optional(),
  Enter_renteInvaliditeLPP: z.number().nonnegative().optional(),
  Enter_renteEnfantInvaliditeLPP: z.number().nonnegative().optional(),
  Enter_renteOrphelinLPP: z.number().nonnegative().optional(),

  // Conjoint / partenaire (0 = conjoint, 1 = partenaire)
  Enter_RenteConjointOuPartenaireLPP: z.union([z.literal(0), z.literal(1)]).optional(),
  Enter_renteConjointLPP: z.number().nonnegative().optional(),
  Enter_rentePartenaireLPP: z.number().nonnegative().optional(),

  // Avoirs / libre passage / capitaux
  Enter_avoirVieillesseObligatoire: z.number().nonnegative().optional(),
  Enter_avoirVieillesseTotal: z.number().nonnegative().optional(),
  Enter_librePassageObligatoire: z.number().nonnegative().optional(),
  Enter_librePassageTotal: z.number().nonnegative().optional(),
  Enter_prestationCapital65: z.number().nonnegative().optional(),
  Enter_rachatPossible: z.number().nonnegative().optional(),
  Enter_versementsAnticipesLogement: z.number().nonnegative().optional(),
  Enter_eplPossibleMax: z.number().nonnegative().optional(),
  Enter_miseEnGage: z.boolean().optional(),

  // Capitaux décès (certificat) — flats historiques (compat)
  Enter_CapitalAucuneRente: z.number().nonnegative().optional(),
  Enter_CapitalPlusRente: z.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteMal: z.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteAcc: z.number().nonnegative().optional(),
  Enter_CapitalPlusRenteMal: z.number().nonnegative().optional(),
  Enter_CapitalPlusRenteAcc: z.number().nonnegative().optional(),

  // Nouveau : Repeater "capitaux décès" saisis comme sur le certificat
  DecesCapitaux: z.array(z.object({
    amount: z.number().positive(),
    plusRente: z.enum(['oui','non','np']),
    condition: z.enum(['accident','maladie','les_deux','np']),
  })).optional(),
})
.refine((d) => {
  if (!d.Enter_typeSalaireAssure || d.Enter_typeSalaireAssure === 'general') return true;
  return typeof d.Enter_salaireAssureLPPRisque === 'number'
      && typeof d.Enter_salaireAssureLPPEpargne === 'number';
}, { message: 'Complétez salaire assuré (split : risque + épargne).' });

type CertForm = z.infer<typeof CertSchema>;

/* ---------- Composant champ monétaire (sécurisé côté hooks) ---------- */
type MoneyFieldProps = {
  name: keyof CertForm;
  watch: (name: keyof CertForm) => unknown;
  setValue: (name: keyof CertForm, value: any, opts?: any) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

function MoneyField({
  name,
  watch,
  setValue,
  placeholder,
  disabled,
  id,
}: MoneyFieldProps) {
  // valeur numérique actuelle du formulaire
  const raw = watch(name) as number | undefined;

  // état local "vue" (string formatée)
  const [view, setView] = useState<string>(() => formatMoneyDisplay(raw ?? 0));

  // si la valeur RHF change ailleurs (reset, préremplissage…), resynchroniser l’affichage
  const currentVal = watch(name) as number | undefined;
useEffect(() => {
  setView(formatMoneyDisplay(currentVal ?? 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentVal]);

  // pendant la saisie : on accepte ce que tape l’utilisateur, on essaie de parser et
  // on pousse au form (pour validations live), sans reformater tout de suite
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setView(nextStr);
    const parsed = parseMoneyToNumber(nextStr);
    setValue(name, Number.isFinite(parsed) ? parsed : 0, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // au blur : reformater joliment
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

function CapitalDecesRepeater({
  items,
  onChange,
}: {
  items?: Array<{ amount: number; plusRente: 'oui'|'non'|'np'; condition: 'accident'|'maladie'|'les_deux'|'np'; }>;
  onChange: (v: Array<{ amount: number; plusRente: 'oui'|'non'|'np'; condition: 'accident'|'maladie'|'les_deux'|'np'; }>) => void;
}) {
  const list = items ?? [];
  const add = () => onChange([...list, { amount: 0, plusRente: 'np', condition: 'np' }]);
  const del = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const upd = (i: number, patch: Partial<(typeof list)[number]>) =>
    onChange(list.map((it, idx) => idx === i ? { ...it, ...patch } : it));

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

export default function LppCertForm() {
  const [loading, setLoading] = useState(true);

  // Scan (OCR+IA) inline
  const [isScanning, setIsScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { register, handleSubmit, setValue, watch, reset } = useForm<CertForm>({
    resolver: zodResolver(CertSchema),
    defaultValues: {},
  });

  // Préremplissage depuis Firestore
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const unsub = subscribeDonneesPersonnelles(u.uid, (data: Partial<ClientData> | null) => {
      if (data) {
        reset((prev) => ({ ...prev, ...data }));
      }
      setLoading(false);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [reset]);

const onSubmit = async (values: CertForm) => {
  // Reset des flats
  values.Enter_CapitalPlusRenteAcc = 0;
  values.Enter_CapitalPlusRenteMal = 0;
  values.Enter_CapitalAucuneRenteAcc = 0;
  values.Enter_CapitalAucuneRenteMal = 0;

  // Conserver champs "généraux" si non précisé (compat)
  values.Enter_CapitalPlusRente = values.Enter_CapitalPlusRente ?? 0;
  values.Enter_CapitalAucuneRente = values.Enter_CapitalAucuneRente ?? 0;

  // Mapping depuis le repeater
  (values.DecesCapitaux || []).forEach(({ amount, plusRente, condition }) => {
    const addPlus = () => {
      if (condition === 'accident' || condition === 'les_deux' || condition === 'np') {
        values.Enter_CapitalPlusRenteAcc! += amount;
      }
      if (condition === 'maladie' || condition === 'les_deux' || condition === 'np') {
        values.Enter_CapitalPlusRenteMal! += amount;
      }
      if (condition === 'np') {
        values.Enter_CapitalPlusRente! += amount;
      }
    };
    const addAucune = () => {
      if (condition === 'accident' || condition === 'les_deux' || condition === 'np') {
        values.Enter_CapitalAucuneRenteAcc! += amount;
      }
      if (condition === 'maladie' || condition === 'les_deux' || condition === 'np') {
        values.Enter_CapitalAucuneRenteMal! += amount;
      }
      if (condition === 'np') {
        values.Enter_CapitalAucuneRente! += amount;
      }
    };

    if (plusRente === 'oui') addPlus();
    else if (plusRente === 'non') addAucune();
    else addPlus(); // "non précisé" → comme "plus rente" par convention
  });

  // Mise en gage décochée → on laisse le reste intact (pas de suppression agressive)

  await upsertDonneesPersonnelles(values);
};


// ---- Mapping IA → Form (CertForm) ----
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

function aiToFormPatch(ai: LppAiResult): Partial<CertForm> {
  const patch: Partial<CertForm> = {};

  // Date certificat
  if (ai.dateCertificat) {
    patch.Enter_dateCertificatLPP = normalizeDateMask(ai.dateCertificat);
  }

  // Salaire annuel : on remplace si on a un "salaire déterminant"
  if (typeof ai.salaireDeterminant === 'number') {
    patch.Enter_salaireAnnuel = ai.salaireDeterminant;
  }

  // Salaire assuré : split vs général
  const hasRisque = typeof ai.salaireAssureRisque === 'number';
  const hasEpargne = typeof ai.salaireAssureEpargne === 'number';
  if (hasRisque || hasEpargne) {
    if (hasRisque && hasEpargne && ai.salaireAssureRisque !== ai.salaireAssureEpargne) {
      patch.Enter_typeSalaireAssure = 'split';
      patch.Enter_salaireAssureLPPRisque = ai.salaireAssureRisque ?? undefined;
      patch.Enter_salaireAssureLPPEpargne = ai.salaireAssureEpargne ?? undefined;
    } else {
      patch.Enter_typeSalaireAssure = 'general';
      // si égaux ou un seul disponible → valeur générale
      patch.Enter_salaireAssureLPP = (ai.salaireAssureEpargne ?? ai.salaireAssureRisque) ?? undefined;
    }
  }

  // Rentes (annuelles, déjà annualisées côté IA)
  if (typeof ai.renteInvaliditeAnnuelle === 'number') patch.Enter_renteInvaliditeLPP = ai.renteInvaliditeAnnuelle;
  if (typeof ai.renteEnfantInvaliditeAnnuelle === 'number') patch.Enter_renteEnfantInvaliditeLPP = ai.renteEnfantInvaliditeAnnuelle;
  if (typeof ai.renteOrphelinAnnuelle === 'number') patch.Enter_renteOrphelinLPP = ai.renteOrphelinAnnuelle;
  if (typeof ai.renteConjointAnnuelle === 'number') {
    // Par défaut on positionne la rente "conjoint" et on garde le sélecteur tel quel
    patch.Enter_renteConjointLPP = ai.renteConjointAnnuelle;
  }

  // Retraite (65 ans)
  if (typeof ai.renteRetraite65Annuelle === 'number') patch.Enter_rentevieillesseLPP65 = ai.renteRetraite65Annuelle;
  if (typeof ai.capitalRetraite65 === 'number') patch.Enter_prestationCapital65 = ai.capitalRetraite65;

  // Avoirs / LP
  if (typeof ai.avoirVieillesse === 'number') patch.Enter_avoirVieillesseTotal = ai.avoirVieillesse;
  if (typeof ai.avoirVieillesseSelonLpp === 'number') patch.Enter_avoirVieillesseObligatoire = ai.avoirVieillesseSelonLpp;

  // Rachat / EPL / Mise en gage
  if (typeof ai.rachatPossible === 'number') patch.Enter_rachatPossible = ai.rachatPossible;
  if (typeof ai.eplDisponible === 'number') patch.Enter_eplPossibleMax = ai.eplDisponible;
  if (typeof ai.miseEnGage === 'boolean') patch.Enter_miseEnGage = ai.miseEnGage;

  // Capitaux décès : IA legacy renvoie un "capitalDeces" générique → on l’ajoute comme item "non précisé"
  if (typeof ai.capitalDeces === 'number' && ai.capitalDeces > 0) {
    const existing = (watch("DecesCapitaux") as any) ?? [];
    patch.DecesCapitaux = [...existing, { amount: ai.capitalDeces, plusRente: 'np', condition: 'np' }];
  }

  return patch;
}

// ---- Scan flow ----
async function handleScanFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const u = auth.currentUser;
  if (!u) return;

  try {
    setIsScanning(true);
    setScanPct(10);

    // On prend le 1er fichier (PDF conseillé pour multi-pages, images acceptées)
    const f = files[0];
    const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    const ext = isPdf ? "pdf" : (f.type.split("/")[1] || "jpg").toLowerCase();
    const fileId = crypto.randomUUID();
    const storagePath = `clients/${u.uid}/lpp_raw/${fileId}.${ext}`;

    // Upload vers Storage
    await uploadBytes(ref(storage, storagePath), f);
    setScanPct(40);

    // Appel API parse
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

    // Récupérer le doc parsé
    const snap = await getDoc(doc(db, "clients", u.uid, "lpp_parsed", docId));
    if (!snap.exists()) throw new Error("Document parsé introuvable");
    const parsed = snap.data() as LppAiResult;
    setScanPct(85);

    // Mapper vers le form
    const patch = aiToFormPatch(parsed);
    Object.entries(patch).forEach(([k, v]) => {
      setValue(k as keyof CertForm, v as any, { shouldDirty: true, shouldValidate: true });
    });

    setScanPct(100);
  } catch (e:any) {
    console.error("Scan error:", e);
    // (optionnel) afficher un toast/alert : ici on reste silencieux dans ce patch
  } finally {
    setIsScanning(false);
    setTimeout(()=> setScanPct(0), 600);
    // reset l'input pour pouvoir re-sélectionner le même fichier si besoin
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
}

function clickScan() {
  fileInputRef.current?.click();
}



  // Masque date
  const onCertDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const norm = normalizeDateMask(e.target.value);
    setValue("Enter_dateCertificatLPP", norm, { shouldValidate: true });
  };

  if (loading) return null;

  return (
  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
    {/* Barre légère d’état scan (optionnel, discrète) */}
    {isScanning && (
      <div className="rounded-xl border px-3 py-2 text-sm flex items-center justify-between">
        <span>Analyse du certificat…</span>
        <span className="tabular-nums">{Math.round(scanPct)}%</span>
      </div>
    )}

    {/* Actions haut de formulaire */}
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
      {/* Ligne 1 : métadonnées + salaire assuré + rente vieillesse */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
  <Label htmlFor="date-certif">Date du certificat</Label>
  <Input id="date-certif" {...register("Enter_dateCertificatLPP")} onBlur={onCertDateBlur} />
</div>
<div>
  <Label htmlFor="sal-annuel">Salaire annuel (brut)</Label>
  <MoneyField
    id="sal-annuel"
    name="Enter_salaireAnnuel"
    watch={watch}
    setValue={setValue}
    placeholder="96'000"
  />
</div>
<div>
  <Label htmlFor="sal-lpp">Salaire assuré LPP (an)</Label>
  <MoneyField
    id="sal-lpp"
    name="Enter_salaireAssureLPP"
    watch={watch}
    setValue={setValue}
    placeholder="58'800"
  />
</div>
<div>
  <Label htmlFor="rente-vieillesse">Rente vieillesse LPP (an)</Label>
  <MoneyField
    id="rente-vieillesse"
    name="Enter_rentevieillesseLPP65"
    watch={watch}
    setValue={setValue}
    placeholder="24'000"
  />
</div>
      </div>

      {/* Type de salaire assuré */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  <div>
    <Label>Type de salaire assuré</Label>
    <Select
  value={watch("Enter_typeSalaireAssure") ?? 'general'}
  onValueChange={(v) =>
    setValue("Enter_typeSalaireAssure", v as 'general'|'split', {
      shouldDirty: true,
      shouldValidate: true,
    })
  }
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
        <MoneyField
          id="sal-split-risque"
          name="Enter_salaireAssureLPPRisque"
          watch={watch}
          setValue={setValue}
          placeholder="58'800"
        />
      </div>
      <div>
        <Label htmlFor="sal-split-epargne">Salaire assuré (part épargne)</Label>
        <MoneyField
          id="sal-split-epargne"
          name="Enter_salaireAssureLPPEpargne"
          watch={watch}
          setValue={setValue}
          placeholder="58'800"
        />
      </div>
    </>
  )}
</div>

{/* Ligne 2 : invalidité + enfants + orphelin */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="rente-inv">Rente invalidité LPP (an)</Label>
          <MoneyField
            id="rente-inv"
            name="Enter_renteInvaliditeLPP"
            watch={watch}
            setValue={setValue}
          />
        </div>
        <div>
          <Label htmlFor="rente-enf-inv">Rente enfant d’invalide LPP (an)</Label>
          <MoneyField
            id="rente-enf-inv"
            name="Enter_renteEnfantInvaliditeLPP"
            watch={watch}
            setValue={setValue}
          />
        </div>
        <div>
          <Label htmlFor="rente-orphelin">Rente orphelin LPP (an)</Label>
          <MoneyField
            id="rente-orphelin"
            name="Enter_renteOrphelinLPP"
            watch={watch}
            setValue={setValue}
          />
        </div>
      </div>

      {/* Ligne 3 : conjoint/partenaire + rentes associées */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Conjoint ou partenaire (pour rentes)</Label>
          <Select
              value={String(watch("Enter_RenteConjointOuPartenaireLPP") ?? 0)}
              onValueChange={(v) =>
                setValue("Enter_RenteConjointOuPartenaireLPP", Number(v) as 0 | 1, {
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
          <MoneyField
            id="rente-conj"
            name="Enter_renteConjointLPP"
            watch={watch}
            setValue={setValue}
          />
        </div>
        <div>
          <Label htmlFor="rente-part">Rente partenaire (an)</Label>
          <MoneyField
            id="rente-part"
            name="Enter_rentePartenaireLPP"
            watch={watch}
            setValue={setValue}
          />
        </div>
      </div>

      {/* Ligne 4 : Avoirs & Libre passage */}
      <div className="pt-2 border-t">
        <Label className="font-medium">Avoir / Libre passage (au jour du certificat)</Label>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-2">
          <div>
            <Label htmlFor="av-oblig">AV obligatoire</Label>
            <MoneyField
              id="av-oblig"
              name="Enter_avoirVieillesseObligatoire"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="av-total">AV total</Label>
            <MoneyField
              id="av-total"
              name="Enter_avoirVieillesseTotal"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="lp-oblig">Libre passage oblig.</Label>
            <MoneyField
              id="lp-oblig"
              name="Enter_librePassageObligatoire"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="lp-total">Libre passage total</Label>
            <MoneyField
              id="lp-total"
              name="Enter_librePassageTotal"
              watch={watch}
              setValue={setValue}
            />
          </div>
        </div>
      </div>

      {/* Ligne 5 : Capitaux / EPL / Rachat */}
      <div className="pt-2 border-t">
        <Label className="font-medium">Capitaux & options</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div>
            <Label htmlFor="prest-cap-65">Prestation capital à 65 ans</Label>
            <MoneyField
              id="prest-cap-65"
              name="Enter_prestationCapital65"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="rachat-poss">Rachat possible</Label>
            <MoneyField
              id="rachat-poss"
              name="Enter_rachatPossible"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="epl-poss-max">EPL possible max</Label>
            <MoneyField
              id="epl-poss-max"
              name="Enter_eplPossibleMax"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="epl-verse">Versements anticipés (EPL)</Label>
            <MoneyField
              id="epl-verse"
              name="Enter_versementsAnticipesLogement"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="miseengage"
              checked={!!watch("Enter_miseEnGage")}
              onChange={(e) =>
                setValue("Enter_miseEnGage", e.target.checked, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <Label htmlFor="miseengage">Mise en gage</Label>
          </div>
        </div>
      </div>

      {/* Ligne 6 : Capitaux décès (certificat) */}
<div className="pt-2 border-t">
  <Label className="font-medium">Capitaux décès (certificat)</Label>

  {/* Saisie libre (style certificat) */}
  <div className="mt-2 mb-4">
    <CapitalDecesRepeater
      items={(watch("DecesCapitaux") as any) ?? []}
      onChange={(v) => setValue("DecesCapitaux" as any, v, { shouldDirty: true, shouldValidate: true })}
    />
  </div>

  {/* Champs flats historiques (compat calculs) */}
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div>
            <Label htmlFor="cap-none-gen">Capital aucune rente (général)</Label>
            <MoneyField
              id="cap-none-gen"
              name="Enter_CapitalAucuneRente"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="cap-plus-gen">Capital + rente (général)</Label>
            <MoneyField
              id="cap-plus-gen"
              name="Enter_CapitalPlusRente"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="cap-none-mal">Capital aucune rente (maladie)</Label>
            <MoneyField
              id="cap-none-mal"
              name="Enter_CapitalAucuneRenteMal"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="cap-none-acc">Capital aucune rente (accident)</Label>
            <MoneyField
              id="cap-none-acc"
              name="Enter_CapitalAucuneRenteAcc"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="cap-plus-mal">Capital + rente (maladie)</Label>
            <MoneyField
              id="cap-plus-mal"
              name="Enter_CapitalPlusRenteMal"
              watch={watch}
              setValue={setValue}
            />
          </div>
          <div>
            <Label htmlFor="cap-plus-acc">Capital + rente (accident)</Label>
            <MoneyField
              id="cap-plus-acc"
              name="Enter_CapitalPlusRenteAcc"
              watch={watch}
              setValue={setValue}
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="mt-2">Enregistrer</Button>
    </form>
  );
}