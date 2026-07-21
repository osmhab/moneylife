//app/[locale]/dashboard/donnees-personnelles/_client/DonneesPersonnellesEditor.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

import {
  subscribeDonneesPersonnelles,
  upsertDonneesPersonnelles,
} from "@/lib/data/donneesPersonnelles";
import type { ClientData } from "@/lib/core/types";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, Download, Scan } from "lucide-react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { parseMoneyToNumber, formatMoneyDisplay } from "@/lib/core/format";
import { ENUM_EtatCivil, ENUM_Sexe, ENUM_StatutProfessionnel } from "@/lib/core/enums";

type AnyRec = Record<string, any>;

/* ===========================
   LPP inline scan (job)
=========================== */

type LppAiResult = {
  dateCertificat?: string | null;
  salaireDeterminant?: number | null;
  salaireAssureEpargne?: number | null;
  salaireAssureRisque?: number | null;

  renteInvaliditeAnnuelle?: number | null;
  renteEnfantInvaliditeAnnuelle?: number | null;
  renteOrphelinAnnuelle?: number | null;
  renteConjointAnnuelle?: number | null;

  renteRetraite65Annuelle?: number | null;
  capitalRetraite65?: number | null;

  avoirVieillesse?: number | null;
  avoirVieillesseSelonLpp?: number | null;

  rachatPossible?: number | null;
  eplDisponible?: number | null;
  miseEnGage?: boolean | null;

  capitalDeces?: number | null;
};

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2),
    mm = d.slice(2, 4),
    yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

function lppAiToDonneesPersonnellesPatch(ai: any): Record<string, any> {
  const patch: Record<string, any> = {};
  if (!ai) return patch;

  const toNum = (val: any) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val.replace(/[^-0-9.]/g, ""));
    return null;
  };

  // --- 1. IDENTITÉ & INSTITUTION ---
  if (ai.institutionName) patch.institutionName = ai.institutionName;
  if (ai.Enter_anneeCertificat) patch.Enter_anneeCertificat = ai.Enter_anneeCertificat;
  if (ai.Enter_nom) patch.Enter_nom = ai.Enter_nom;
  if (ai.Enter_prenom) patch.Enter_prenom = ai.Enter_prenom;

  // --- 2. SALAIRES & TAUX ---
  if (ai.Enter_salaireAnnuel) patch.Enter_salaireAnnuel = toNum(ai.Enter_salaireAnnuel);
  if (ai.Enter_lppTauxActivite) patch.Enter_lppTauxActivite = toNum(ai.Enter_lppTauxActivite);
  
  // Salaire assuré (Priorité au nouveau champ IA Risque)
  if (ai.Enter_lppSalaireAssureRisque) {
      patch.Enter_lppSalaireAssureRisque = toNum(ai.Enter_lppSalaireAssureRisque);
      patch.Enter_typeSalaireAssure = "split"; // Force le mode split si trouvé
  }
  if (ai.Enter_salaireAssureLPP) patch.Enter_salaireAssureLPP = toNum(ai.Enter_salaireAssureLPP);

  // --- 3. RENTES INVALIDITÉ (C'est ICI que tes graphiques vont revivre) ---
  if (ai.Enter_renteInvaliditeMaladie) patch.Enter_renteInvaliditeMaladie = toNum(ai.Enter_renteInvaliditeMaladie);
  if (ai.Enter_lppRenteInvaliditeAccident) patch.Enter_lppRenteInvaliditeAccident = toNum(ai.Enter_lppRenteInvaliditeAccident);
  if (ai.Enter_renteEnfantInvalideMaladie) patch.Enter_renteEnfantInvalideMaladie = toNum(ai.Enter_renteEnfantInvalideMaladie);
  if (ai.Enter_renteEnfantInvalideAccident) patch.Enter_renteEnfantInvalideAccident = toNum(ai.Enter_renteEnfantInvalideAccident);

  // --- 4. RENTES DÉCÈS ---
  if (ai.Enter_renteConjointLPP) patch.Enter_renteConjointLPP = toNum(ai.Enter_renteConjointLPP);
  if (ai.Enter_lppRenteConjointAccident) patch.Enter_lppRenteConjointAccident = toNum(ai.Enter_lppRenteConjointAccident);
  if (ai.Enter_renteOrphelinLPP) patch.Enter_renteOrphelinLPP = toNum(ai.Enter_renteOrphelinLPP);
  if (ai.Enter_lppRenteOrphelinAccident) patch.Enter_lppRenteOrphelinAccident = toNum(ai.Enter_lppRenteOrphelinAccident);

  // --- 5. RETRAITE & PROJECTIONS ---
  if (ai.Enter_rentevieillesseLPP65) patch.Enter_rentevieillesseLPP65 = toNum(ai.Enter_rentevieillesseLPP65);
  
  // Boucle automatique pour les paliers 58-64
  for (let age = 58; age <= 64; age++) {
    const key = `Enter_rentevieillesseLPP${age}`;
    if (ai[key]) patch[key] = toNum(ai[key]);
  }

  // --- 6. AVOIRS & LOGEMENT ---
  if (ai.Enter_avoirVieillesseTotal) patch.Enter_avoirVieillesseTotal = toNum(ai.Enter_avoirVieillesseTotal);
  if (ai.Enter_lppEPLPossible) patch.Enter_lppEPLPossible = toNum(ai.Enter_lppEPLPossible);
  if (ai.Enter_lppRachatPossible) patch.Enter_lppRachatPossible = toNum(ai.Enter_lppRachatPossible);

  // --- 7. CAPITAUX DÉCÈS SPÉCIFIQUES ---
  if (ai.Enter_CapitalPlusRenteMal) patch.Enter_CapitalPlusRenteMal = toNum(ai.Enter_CapitalPlusRenteMal);
  if (ai.Enter_CapitalAucuneRenteMal) patch.Enter_CapitalAucuneRenteMal = toNum(ai.Enter_CapitalAucuneRenteMal);
  if (ai.Enter_CapitalPlusRenteAcc) patch.Enter_CapitalPlusRenteAcc = toNum(ai.Enter_CapitalPlusRenteAcc);
  if (ai.Enter_CapitalAucuneRenteAcc) patch.Enter_CapitalAucuneRenteAcc = toNum(ai.Enter_CapitalAucuneRenteAcc);

  patch.Enter_lppScanMode = "scan";
  patch.Enter_lppScanDone = true;
  return patch;
}

function ensureArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function asBool(v: any): boolean {
  return v === true;
}
function asNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asString(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function toLabelMap(obj: Record<string, string>) {
  return Object.entries(obj).map(([k, v]) => ({ value: k, label: v }));
}

const sexeOptions = toLabelMap(ENUM_Sexe);
const etatCivilOptions = toLabelMap(ENUM_EtatCivil);
const statutProOptions = toLabelMap(ENUM_StatutProfessionnel);

const typeSalaireAssureOptions = [
  { value: "general", label: "Salaire assuré unique" },
  { value: "split", label: "Épargne + Risque (2 montants)" },
] as const;

/* ===========================
   BUFFER INPUTS (comme PrenomSection)
=========================== */

function BufferedText({
  id,
  value,
  placeholder,
  autoComplete,
  inputMode,
  commit,
  highlight,
}: {
  id: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  commit: (next: string) => void;
  highlight?: boolean;
}) {
  const [local, setLocal] = useState<string>(value ?? "");
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setLocal(value ?? "");
  }, [value]);

  return (
    <Input
      id={id}
      value={local}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      className={highlight ? "ring-2 ring-[#4FD1C5] border-[#4FD1C5] bg-[#4FD1C5]/5 animate-pulse transition-all duration-1000" : "transition-all duration-500"}
      onFocus={() => { editingRef.current = true; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={(e) => {
        editingRef.current = false;
        const trimmed = (e.target.value ?? "").trim();
        commit(trimmed);
        setLocal(trimmed);
      }}
    />
  );
}

function BufferedNumber({
  id,
  value,
  placeholder,
  commit,
  highlight,
}: {
  id: string;
  value: number;
  placeholder?: string;
  commit: (next: number) => void;
  highlight?: boolean;
}) {
  const [local, setLocal] = useState<string>(String(value ?? 0));
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setLocal(String(value ?? 0));
  }, [value]);

  return (
    <Input
      id={id}
      inputMode="numeric"
      value={local}
      placeholder={placeholder}
      className={highlight ? "ring-2 ring-[#4FD1C5] border-[#4FD1C5] bg-[#4FD1C5]/5 animate-pulse transition-all duration-1000" : "transition-all duration-500"}
      onFocus={() => { editingRef.current = true; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        editingRef.current = false;
        const n = Number(local);
        const safe = Number.isFinite(n) ? n : (Number.isFinite(value) ? value : 0);
        commit(safe);
        setLocal(String(safe));
      }}
    />
  );
}

function BufferedMoney({
  id,
  amount,
  placeholder,
  commit,
  highlight,
}: {
  id: string;
  amount: number;
  placeholder?: string;
  commit: (next: number) => void;
  highlight?: boolean;
}) {
  const [local, setLocal] = useState<string>("");
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) {
      setLocal(formatMoneyDisplay(Number.isFinite(amount) ? amount : 0));
    }
  }, [amount]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      className={highlight ? "ring-2 ring-[#4FD1C5] border-[#4FD1C5] bg-[#4FD1C5]/5 animate-pulse transition-all duration-1000" : "transition-all duration-500"}
      onFocus={() => { editingRef.current = true; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        editingRef.current = false;
        const parsed = parseMoneyToNumber(local);
        const next = Number.isFinite(parsed) ? parsed : (amount ?? 0);
        commit(next);
        setLocal(formatMoneyDisplay(next));
      }}
    />
  );
}

function BufferedTextarea({
  id,
  value,
  commit,
}: {
  id: string;
  value: string;
  commit: (next: string) => void;
}) {
  const [local, setLocal] = useState<string>(value ?? "");
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setLocal(value ?? "");
  }, [value]);

  return (
    <textarea
      id={id}
      className="w-full min-h-[260px] rounded-lg border bg-background p-3 font-mono text-xs"
      value={local}
      onFocus={() => {
        editingRef.current = true;
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        editingRef.current = false;
        commit(local);
      }}
      spellCheck={false}
    />
  );
}

/* ===========================
   PAGE
=========================== */

export default function DonneesPersonnellesEditor({ targetUid }: { targetUid?: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // snapshot firestore
  const [data, setData] = useState<AnyRec | null>(null);

  // draft editable (NE PAS écraser en live pendant la saisie)
  const [draft, setDraft] = useState<AnyRec>({});
  const didHydrateRef = useRef(false);

  const [isManuallyDirty, setIsManuallyDirty] = useState(false);

  const draftRef = useRef<AnyRec>({});
  const dataRef = useRef<AnyRec | null>(null);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { dataRef.current = data; }, [data]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmAdvancedOpen, setConfirmAdvancedOpen] = useState(false);

  const router = useRouter();

  // progressbar scroll window
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 20 });
  const barWidth = useTransform(progress, [0, 1], ["0%", "100%"]);

  const [advancedJson, setAdvancedJson] = useState<string>("{}");
  const [highlightedFields, setHighlightedFields] = useState<string[]>([]);

  const [lppDownloadLoading, setLppDownloadLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [scanPct, setScanPct] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastReqId, setLastReqId] = useState<string | null>(null);
  // Liste des clés de champs qui viennent d'être scannés
  

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setLoading(false);
      setError("Vous devez être connecté.");
      return;
    }

      const uidToUse = targetUid || u.uid;

      const unsub = subscribeDonneesPersonnelles(uidToUse, (d: Partial<ClientData> | null) => {
      const obj = (d ?? {}) as AnyRec;

      // data live
      setData(obj);

      // draft initial
      if (!didHydrateRef.current) {
        setDraft(obj);
        try {
          setAdvancedJson(JSON.stringify(obj, null, 2));
        } catch {
          setAdvancedJson("{}");
        }
        didHydrateRef.current = true;

        setLoading(false); // ✅ important : sinon page reste en "Chargement…"
        return;
      }

      // ✅ Sync draft ONLY if user didn't modify anything locally
      // (i.e. draft == previous data)
      try {
        const prevDraft = JSON.stringify(draftRef.current ?? {});
        const prevData = JSON.stringify(dataRef.current ?? {});
        if (prevDraft === prevData) {
          setDraft(obj);
          setAdvancedJson(JSON.stringify(obj, null, 2));
        }
      } catch {
        // ignore
      }

      setLoading(false);
    });

    return () => { if (unsub) unsub(); };
  }, []);

  const isDirty = useMemo(() => {
    // Le bouton s'active si le JSON est différent OU si l'utilisateur a touché un champ
    return isManuallyDirty || JSON.stringify(draft ?? {}) !== JSON.stringify(data ?? {});
  }, [draft, data, isManuallyDirty]);

const setField = (k: string, v: any) => {
  setIsManuallyDirty(true); // Active le bouton immédiatement
  setDraft((p) => {
    const next = { ...p, [k]: v };
    try {
      setAdvancedJson(JSON.stringify(next, null, 2));
    } catch (e) {
      console.warn("Erreur de synchronisation JSON:", e);
    }
    return next;
  });
};

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await upsertDonneesPersonnelles(draft as any, { targetUid });
      
      setHighlightedFields([]); 
      setIsManuallyDirty(false); // Réinitialise l'état du bouton
      
      toast("Enregistré ✅", { description: "Vos données ont été mises à jour." });
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const onToggleAdvanced = (next: boolean) => {
    if (next) setConfirmAdvancedOpen(true);
    else setShowAdvanced(false);
  };

  const downloadLpp = async () => {
    try {
      const path = (data?.Enter_lppFilePath || "").trim();
      if (!path) {
        toast("Aucun fichier", { description: "Aucun certificat LPP scanné trouvé." });
        return;
      }

      setLppDownloadLoading(true);
      const url = await getDownloadURL(storageRef(storage, path));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast("Erreur", { description: e?.message || "Impossible de télécharger le certificat." });
    } finally {
      setLppDownloadLoading(false);
    }
  };

    const canScanHere = (() => {
    const u = auth.currentUser;
    if (!u) return false;
    // ✅ Toujours autorisé. Si c'est un admin, les rules Firebase feront le reste.
    return true; 
  })();

  const handleClickScanLpp = () => {
    setScanError(null);
    setLastReqId(null);
    setScanState("idle");
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

const handleScanFile = async (file: File) => {
  const u = auth.currentUser;
  if (!u) {
    toast("Non authentifié", { description: "Connectez-vous pour scanner." });
    return;
  }

  // ✅ Définition de l'UID cible : targetUid (si admin sur fiche client) ou u.uid (si client lui-même)
  const uidToUse = targetUid || u.uid;

  try {
    setScanState("scanning");
    setScanPct(10);
    setScanError(null);

    // 1. Préparation du fichier
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const ext = isPdf ? "pdf" : (file.type.split("/")[1] || "jpg").toLowerCase();
    const fileId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    
    // ✅ On stocke dans le dossier du client concerné
    const storagePath = `clients/${uidToUse}/lpp_raw/${fileId}.${ext}`;

    // 2. Upload sur Firebase Storage
    await uploadBytes(storageRef(storage, storagePath), file);
    setScanPct(30);

    // 3. Appel de l'API d'analyse Gemini
    const jwt = await u.getIdToken();
    const res = await fetch(`/api/lpp/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      // L'API déduira le clientUid du chemin du fichier (storagePath)
      body: JSON.stringify({ filePath: storagePath }),
    });

    if (!res.ok) throw new Error("L'analyse n'a pas pu démarrer sur le serveur.");

    const { jobId } = await res.json();
    setScanPct(50);

    // 4. Écoute du résultat en temps réel dans la collection du client (uidToUse)
    const jobRef = doc(db, "clients", uidToUse, "lpp_jobs", jobId);
    
    const unsub = onSnapshot(jobRef, async (snap: any) => {
      if (!snap.exists()) return;
      const job = snap.data();

      // Cas de succès (Analyse rapide terminée)
      if (job.status === "DONE_FAST") {
        unsub(); // ✅ Arrêt de l'écouteur immédiat

        // Vibration de succès sur mobile
        if (typeof window !== "undefined" && navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }

        const aiPatch = lppAiToDonneesPersonnellesPatch(job.parsedFast);
        
        // On ajoute les métadonnées du fichier au patch final
        const patch = {
          ...aiPatch,
          Enter_lppFilePath: storagePath,
          Enter_lppOriginalFilename: file.name
        };
        
        // Activation de la surbrillance turquoise sur les nouveaux champs
        setHighlightedFields(Object.keys(patch));

        // Mise à jour du formulaire local (Draft)
        setDraft((prev) => {
          const next = { ...prev, ...patch };
          setAdvancedJson(JSON.stringify(next, null, 2));
          return next;
        });
        
        // Sauvegarde immédiate en base de données pour le client
        await upsertDonneesPersonnelles(patch as any, { targetUid });
        
        setScanState("success");
        setScanPct(100);
        toast.success("Analyse réussie ✅", { 
          description: "Les données du client ont été mises à jour et surlignées." 
        });
        
        // Petit délai pour laisser voir la barre à 100%
        setTimeout(() => setScanPct(0), 1500);
      
      } else if (job.status === "ERROR") {
        unsub();
        setScanState("error");
        setScanError(job.error || "L'IA n'a pas pu lire ce document.");
        toast.error("Erreur d'analyse", { description: job.error });
      }
    });

  } catch (e: any) {
    setScanState("error");
    setScanError(e.message);
    toast.error("Erreur technique", { description: e.message });
    setScanPct(0);
  }
};

  const saveAdvancedJson = async () => {
    try {
      setSaving(true);
      setError(null);
      const parsed = JSON.parse(advancedJson);
      if (!parsed || typeof parsed !== "object") throw new Error("JSON invalide.");
      await upsertDonneesPersonnelles(parsed as any, { targetUid });
      toast("Enregistré ✅", { description: "Données avancées sauvegardées." });

      // sync UI
      setDraft(parsed);
      setData(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Erreur JSON.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">Aucune donnée trouvée.</div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>
    );
  }

  const Section = ({ title, subtitle, children }: any) => (
    <div className="rounded-xl border bg-background">
      <div className="px-4 py-3 border-b">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );

  const Row = ({ label, helper, children }: any) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
      <div className="sm:col-span-1 space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );

  // arrays
  const enfants = ensureArray(draft.Enter_enfants);
  const anneesManquantes = ensureArray<number>(draft.Enter_anneesManquantesAVS);
  const decesCapitaux = ensureArray(draft.DecesCapitaux);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="sticky top-0 z-30 w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur border-b">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="max-w-4xl mx-auto w-full flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-muted transition"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-semibold truncate">Données personnelles</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Modifie tes informations puis enregistre.
              </p>
            </div>

            <Button onClick={save} disabled={saving || !isDirty}>
              {saving ? "Enregistrement…" : isDirty ? "Enregistrer" : "À jour"}
            </Button>
          </div>
        </div>

        <motion.div style={{ width: barWidth }} className="h-[2px]">
          <div
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(90deg, #001D38 0%, #4FD1C5 20%, #B9B9B9 40%, #F0AB00 60%, #FF5858 80%, #FF5EA9 100%)",
            }}
          />
        </motion.div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto space-y-4 px-4 py-4">
                {/* Input caché pour scan LPP (job direct) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (fileInputRef.current) fileInputRef.current.value = "";
            handleScanFile(f);
          }}
        />
        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {/* Identité */}
        <Section title="Identité" subtitle="Informations de base">
          <Row label="Prénom">
            <BufferedText
              id="dp-Enter_prenom"
              value={asString(draft.Enter_prenom)}
              placeholder="Ex. Marie"
              autoComplete="given-name"
              commit={(v) => setField("Enter_prenom", v)}
            />
          </Row>

          <Row label="Nom">
            <BufferedText
              id="dp-Enter_nom"
              value={asString(draft.Enter_nom)}
              placeholder="Ex. Dupont"
              autoComplete="family-name"
              commit={(v) => setField("Enter_nom", v)}
            />
          </Row>

          <Row label="Date de naissance" helper="Format jj.mm.aaaa">
            <BufferedText
              id="dp-Enter_dateNaissance"
              value={asString(draft.Enter_dateNaissance)}
              placeholder="01.01.1990"
              commit={(v) => setField("Enter_dateNaissance", v)}
            />
          </Row>

          <Row label="Sexe">
            <Select
              value={String(asNumber(draft.Enter_sexe, 0))}
              onValueChange={(v) => setField("Enter_sexe", Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sexeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="État civil">
            <Select
              value={String(asNumber(draft.Enter_etatCivil, 0))}
              onValueChange={(v) => setField("Enter_etatCivil", Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {etatCivilOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        {/*Adresse */}
        <Section title="Adresse" subtitle="Coordonnées de résidence">
          <Row label="Rue et numéro">
            <BufferedText
              id="dp-Enter_adresse"
              value={asString(draft.Enter_adresse)}
              placeholder="Route de la Gare 1"
              commit={(v) => setField("Enter_adresse", v)}
            />
          </Row>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <Label className="text-xs">NPA</Label>
              <BufferedText
                id="dp-Enter_npa"
                value={asString(draft.Enter_npa)}
                placeholder="1950"
                inputMode="numeric"
                commit={(v) => setField("Enter_npa", v)}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Localité</Label>
              <BufferedText
                id="dp-Enter_localite"
                value={asString(draft.Enter_localite)}
                placeholder="Sion"
                commit={(v) => setField("Enter_localite", v)}
              />
            </div>
          </div>
        </Section>

        {/* Situation pro */}
        <Section title="Situation professionnelle" subtitle="Activité et revenus">
          <Row label="Statut professionnel">
            <Select
              value={String(asNumber(draft.Enter_statutProfessionnel, 0))}
              onValueChange={(v) => setField("Enter_statutProfessionnel", Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statutProOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Salaire annuel (CHF)">
            <BufferedMoney
              id="dp-Enter_salaireAnnuel"
              amount={asNumber(draft.Enter_salaireAnnuel, 0)}
              commit={(n) => setField("Enter_salaireAnnuel", n)}
            />
          </Row>

          <Row label="Travaille + de 8h/sem" helper="Assurance accident non-pro (LAA)">
            <Switch
              checked={asBool(draft.Enter_travaillePlusde8HSemaine)}
              onCheckedChange={(v) => setField("Enter_travaillePlusde8HSemaine", v)}
            />
          </Row>

          <Row label="Affilié LPP">
            <Switch checked={asBool(draft.Enter_Affilie_LPP)} onCheckedChange={(v) => setField("Enter_Affilie_LPP", v)} />
          </Row>
        </Section>

        {/* Enfants */}
        <Section title="Enfants" subtitle="Enfant(s) à charge">
          <Row label="A des enfants à charge ?">
            <Switch
              checked={asBool(draft.Enter_hasEnfants)}
              onCheckedChange={(v) => setField("Enter_hasEnfants", v)}
            />
          </Row>

          {asBool(draft.Enter_hasEnfants) ? (
            <div className="space-y-3">
              {enfants.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun enfant ajouté.</div>
              ) : null}

              {enfants.map((kid: any, idx: number) => (
                <div key={idx} className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Enfant #{idx + 1}</div>

                  <Row label="Date de naissance" helper="jj.mm.aaaa">
                    <BufferedText
                      id={`dp-kid-${idx}-dob`}
                      value={asString(kid?.Enter_dateNaissance)}
                      placeholder="01.01.2015"
                      commit={(v) => {
                        const next = enfants.slice();
                        next[idx] = { ...(next[idx] ?? {}), Enter_dateNaissance: v };
                        setField("Enter_enfants", next);
                      }}
                    />
                  </Row>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const next = enfants.filter((_: any, i: number) => i !== idx);
                        setField("Enter_enfants", next);
                      }}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                onClick={() => setField("Enter_enfants", [...enfants, { Enter_dateNaissance: "" }])}
              >
                + Ajouter un enfant
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Aucun enfant (toggle désactivé).</div>
          )}
        </Section>

        {/* AVS */}
        <Section title="AVS" subtitle="Cotisations et lacunes">
          <Row label="Âge début cotisations AVS">
            <BufferedNumber
              id="dp-Enter_ageDebutCotisationsAVS"
              value={asNumber(draft.Enter_ageDebutCotisationsAVS, 21)}
              commit={(n) => setField("Enter_ageDebutCotisationsAVS", n)}
            />
          </Row>

          <Row label="Périodes sans cotisations ?">
            <Switch
              checked={asBool(draft.Enter_hasAnnesManquantesAVS)}
              onCheckedChange={(v) => setField("Enter_hasAnnesManquantesAVS", v)}
            />
          </Row>

          {asBool(draft.Enter_hasAnnesManquantesAVS) ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Années manquantes</div>

              <div className="flex flex-wrap gap-2">
                {anneesManquantes.map((y, idx) => (
                  <div key={`${y}-${idx}`} className="rounded-full border px-3 py-1 text-xs flex items-center gap-2">
                    <span>{y}</span>
                    <button
                      type="button"
                      className="text-muted-foreground"
                      onClick={() => {
                        const next = anneesManquantes.filter((_, i) => i !== idx);
                        setField("Enter_anneesManquantesAVS", next);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <BufferedText
                  id="dp-add-missing-year"
                  value=""
                  placeholder="Ex: 2010"
                  inputMode="numeric"
                  commit={(v) => {
                    const n = Number(v);
                    if (!Number.isInteger(n) || n < 1900 || n > 2100) return;
                    setField("Enter_anneesManquantesAVS", [...anneesManquantes, n]);
                  }}
                />
                <div className="text-xs text-muted-foreground self-center">Blur pour ajouter</div>
              </div>
            </div>
          ) : null}
        </Section>

        {/* IJ */}
        <Section title="Indemnités journalières / LAA" subtitle="Maladie / accident">
          <Row label="IJ maladie ?">
            <Switch checked={asBool(draft.Enter_ijMaladie)} onCheckedChange={(v) => setField("Enter_ijMaladie", v)} />
          </Row>

          {asBool(draft.Enter_ijMaladie) ? (
            <Row label="Taux IJ maladie (%)">
              <BufferedNumber
                id="dp-Enter_ijMaladieTaux"
                value={asNumber(draft.Enter_ijMaladieTaux, 80)}
                commit={(n) => setField("Enter_ijMaladieTaux", n)}
              />
            </Row>
          ) : null}

          <Row label="Taux IJ accident (%)">
            <BufferedNumber
              id="dp-Enter_ijAccidentTaux"
              value={asNumber(draft.Enter_ijAccidentTaux, 80)}
              commit={(n) => setField("Enter_ijAccidentTaux", n)}
            />
          </Row>
        </Section>

        {/* LPP */}
        <Section title="LPP" subtitle="Données du certificat LPP">
  {/* --- BLOC 1 : GESTION DU DOCUMENT & SCAN --- */}
  <div className="mb-8 pb-6 border-b">
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <Label className="text-sm font-semibold text-zinc-900">Source des données</Label>
        <p className="text-[11px] text-muted-foreground">
          Utilisez le scan pour importer automatiquement les données de votre certificat.
        </p>
      </div>
      
      {/* Zone du fichier existant (Discrète) */}
      {asString(data?.Enter_lppFilePath).trim() && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/20 w-fit group">
          <div className="h-7 w-7 rounded-md bg-white border flex items-center justify-center shadow-sm">
            <Download className="h-3 w-3 text-muted-foreground group-hover:text-blue-600 transition-colors" />
          </div>
          <div className="flex flex-col pr-1">
            <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[180px]">
              {asString(data?.Enter_lppOriginalFilename || "Certificat_LPP.pdf")}
            </span>
            <button
              type="button"
              onClick={downloadLpp}
              disabled={lppDownloadLoading}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold text-left transition-colors"
            >
              {lppDownloadLoading ? "Ouverture..." : "Consulter le document"}
            </button>
          </div>
        </div>
      )}

      {/* Feedback de scan (Progression) */}
      {scanState === "scanning" && (
        <div className="max-w-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Analyse du certificat...</span>
            <span className="tabular-nums font-medium">{Math.round(scanPct)}%</span>
          </div>
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <motion.div 
              className="h-full" 
              style={{ background: "linear-gradient(90deg, #4FD1C5 0%, #001D38 100%)" }}
              initial={{ width: 0 }}
              animate={{ width: `${scanPct}%` }}
            />
          </div>
        </div>
      )}

      {scanState === "error" && (
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-2.5 text-[11px] text-red-800 flex items-start gap-2 max-w-sm">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{scanError || "Erreur lors du scan."}</span>
        </div>
      )}

      {/* Bouton Scan / Remplacer */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={asString(data?.Enter_lppFilePath).trim() ? "outline" : "default"}
          onClick={handleClickScanLpp}
          disabled={!canScanHere || scanState === "scanning"}
          size="sm"
          className="h-9 px-4 shadow-sm"
        >
          <Scan className="h-3.5 w-3.5 mr-2" />
          {asString(data?.Enter_lppFilePath).trim() ? "Remplacer le certificat" : "Scanner mon certificat LPP"}
        </Button>
      </div>
    </div>

{/* --- NOUVEAU : ESPACE CAISSE DE PENSION --- */}
    <div className="mt-6 p-4 rounded-xl border bg-zinc-50/50 space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        Caisse de pension
      </div>
      
      <Row label="Nom de la caisse">
        <BufferedText
          id="dp-lppCaisseNom"
          value={asString(draft.Enter_lppCaisseNom)}
          placeholder="Ex: comPlan, Swiss Life..."
          highlight={highlightedFields.includes("Enter_lppCaisseNom")}
          commit={(v) => setField("Enter_lppCaisseNom", v)}
        />
      </Row>

      <Row label="Adresse">
        <BufferedText
          id="dp-lppCaisseAdresse"
          value={asString(draft.Enter_lppCaisseAdresse)}
          placeholder="Adresse du siège"
          highlight={highlightedFields.includes("Enter_lppCaisseAdresse")}
          commit={(v) => setField("Enter_lppCaisseAdresse", v)}
        />
      </Row>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Téléphone</Label>
          <BufferedText
            id="dp-lppCaisseTelephone"
            value={asString(draft.Enter_lppCaisseTelephone)}
            placeholder="0XX XXX XX XX"
            highlight={highlightedFields.includes("Enter_lppCaisseTelephone")}
            commit={(v) => setField("Enter_lppCaisseTelephone", v)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Email</Label>
          <BufferedText
            id="dp-lppCaisseEmail"
            value={asString(draft.Enter_lppCaisseEmail)}
            placeholder="contact@caisse.ch"
            highlight={highlightedFields.includes("Enter_lppCaisseEmail")}
            commit={(v) => setField("Enter_lppCaisseEmail", v)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Site internet</Label>
          <BufferedText
            id="dp-lppCaisseSiteWeb"
            value={asString(draft.Enter_lppCaisseSiteWeb)}
            placeholder="www.caisse.ch"
            highlight={highlightedFields.includes("Enter_lppCaisseSiteWeb")}
            commit={(v) => setField("Enter_lppCaisseSiteWeb", v)}
          />
        </div>
      </div>
    </div>
  </div>

  {/* --- BLOC 2 : CHAMPS DE SAISIE --- */}
    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
      Détails du certificat
    </div>

    <Row label="Date du certificat" helper="jj.mm.aaaa">
      <BufferedText
        id="dp-Enter_dateCertificatLPP"
        value={asString(draft.Enter_dateCertificatLPP)}
        placeholder="01.01.2025"
        highlight={highlightedFields.includes("Enter_dateCertificatLPP")}
        commit={(v) => setField("Enter_dateCertificatLPP", v)}
      />
    </Row>

    <Row label="Type de salaire assuré">
      <Select
        value={asString(draft.Enter_typeSalaireAssure || "general")}
        onValueChange={(v) => setField("Enter_typeSalaireAssure", v)}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {typeSalaireAssureOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>

    {asString(draft.Enter_typeSalaireAssure || "general") === "general" ? (
      <Row label="Salaire assuré LPP (CHF/an)">
        <BufferedMoney
          id="dp-Enter_salaireAssureLPP"
          amount={asNumber(draft.Enter_salaireAssureLPP, 0)}
          highlight={highlightedFields.includes("Enter_salaireAssureLPP")}
          commit={(n) => setField("Enter_salaireAssureLPP", n)}
        />
      </Row>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 sm:pl-[33.33%]">
        <div>
          <Label className="text-[11px] mb-1 block">Salaire assuré (Risque)</Label>
          <BufferedMoney
            id="dp-Enter_lppSalaireAssureRisque"
            amount={asNumber(draft.Enter_lppSalaireAssureRisque ?? draft.Enter_salaireAssureLPPRisque, 0)}
            highlight={highlightedFields.includes("Enter_lppSalaireAssureRisque")}
            commit={(n) => setField("Enter_lppSalaireAssureRisque", n)}
          />
        </div>
        <div>
          <Label className="text-[11px] mb-1 block">Salaire assuré (Épargne)</Label>
          <BufferedMoney
            id="dp-Enter_salaireAssureLPPEpargne"
            amount={asNumber(draft.Enter_salaireAssureLPPEpargne, 0)}
            highlight={highlightedFields.includes("Enter_salaireAssureLPPEpargne")}
            commit={(n) => setField("Enter_salaireAssureLPPEpargne", n)}
          />
        </div>
      </div>
    )}

    {/* Grille des prestations */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-6 text-zinc-600">
  <div className="space-y-1">
    <Label className="text-zinc-900">Rente invalidité Maladie (CHF/an)</Label>
    <BufferedMoney
      id="dp-Enter_renteInvaliditeMaladie"
      amount={asNumber(draft.Enter_renteInvaliditeMaladie ?? draft.Enter_renteInvaliditeLPP, 0)}
      highlight={highlightedFields.includes("Enter_renteInvaliditeMaladie")}
      commit={(n) => setField("Enter_renteInvaliditeMaladie", n)}
    />
  </div>
  <div className="space-y-1">
    <Label className="text-zinc-900">Rente invalidité Accident (CHF/an)</Label>
    <BufferedMoney
      id="dp-Enter_lppRenteInvaliditeAccident"
      amount={asNumber(draft.Enter_lppRenteInvaliditeAccident ?? draft.Enter_renteInvaliditeLPP, 0)}
      highlight={highlightedFields.includes("Enter_lppRenteInvaliditeAccident")}
      commit={(n) => setField("Enter_lppRenteInvaliditeAccident", n)}
    />
  </div>
  <div className="space-y-1">
    <Label className="text-zinc-900">Rente enfant (Maladie)</Label>
    <BufferedMoney
      id="dp-Enter_renteEnfantInvalideMaladie"
      amount={asNumber(draft.Enter_renteEnfantInvalideMaladie ?? draft.Enter_renteEnfantInvaliditeLPP, 0)}
      highlight={highlightedFields.includes("Enter_renteEnfantInvalideMaladie")}
      commit={(n) => setField("Enter_renteEnfantInvalideMaladie", n)}
    />
  </div>
  <div className="space-y-1">
    <Label className="text-zinc-900">Rente enfant (Accident)</Label>
    <BufferedMoney
      id="dp-Enter_renteEnfantInvalideAccident"
      amount={asNumber(draft.Enter_renteEnfantInvalideAccident ?? draft.Enter_renteEnfantInvaliditeLPP, 0)}
      highlight={highlightedFields.includes("Enter_renteEnfantInvalideAccident")}
      commit={(n) => setField("Enter_renteEnfantInvalideAccident", n)}
    />
  </div>
      <div className="space-y-1">
        <Label>Rente orphelin (CHF/an)</Label>
        <BufferedMoney
          id="dp-Enter_renteOrphelinLPP"
          amount={asNumber(draft.Enter_renteOrphelinLPP, 0)}
          highlight={highlightedFields.includes("Enter_renteOrphelinLPP")}
          commit={(n) => setField("Enter_renteOrphelinLPP", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>Rente conjoint (CHF/an)</Label>
        <BufferedMoney
          id="dp-Enter_renteConjointLPP"
          amount={asNumber(draft.Enter_renteConjointLPP, 0)}
          highlight={highlightedFields.includes("Enter_renteConjointLPP")}
          commit={(n) => setField("Enter_renteConjointLPP", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>Rente vieillesse à 65 ans (CHF/an)</Label>
        <BufferedMoney
          id="dp-Enter_rentevieillesseLPP65"
          amount={asNumber(draft.Enter_rentevieillesseLPP65, 0)}
          highlight={highlightedFields.includes("Enter_rentevieillesseLPP65")}
          commit={(n) => setField("Enter_rentevieillesseLPP65", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>Prestation capital à 65 ans (CHF)</Label>
        <BufferedMoney
          id="dp-Enter_prestationCapital65"
          amount={asNumber(draft.Enter_prestationCapital65, 0)}
          highlight={highlightedFields.includes("Enter_prestationCapital65")}
          commit={(n) => setField("Enter_prestationCapital65", n)}
        />
      </div>
    </div>

    {/* Avoirs et rachats */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-6">
      <div className="space-y-1">
        <Label>Avoir vieillesse total (CHF)</Label>
        <BufferedMoney
          id="dp-Enter_avoirVieillesseTotal"
          amount={asNumber(draft.Enter_avoirVieillesseTotal, 0)}
          highlight={highlightedFields.includes("Enter_avoirVieillesseTotal")}
          commit={(n) => setField("Enter_avoirVieillesseTotal", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>Avoir vieillesse obligatoire (CHF)</Label>
        <BufferedMoney
          id="dp-Enter_avoirVieillesseObligatoire"
          amount={asNumber(draft.Enter_avoirVieillesseObligatoire, 0)}
          highlight={highlightedFields.includes("Enter_avoirVieillesseObligatoire")}
          commit={(n) => setField("Enter_avoirVieillesseObligatoire", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>Rachat possible (CHF)</Label>
        <BufferedMoney
          id="dp-Enter_rachatPossible"
          amount={asNumber(draft.Enter_rachatPossible, 0)}
          highlight={highlightedFields.includes("Enter_rachatPossible")}
          commit={(n) => setField("Enter_rachatPossible", n)}
        />
      </div>
      <div className="space-y-1">
        <Label>EPL possible max (CHF)</Label>
        <BufferedMoney
          id="dp-Enter_lppEPLPossible"
          amount={asNumber(draft.Enter_lppEPLPossible ?? draft.Enter_eplPossibleMax, 0)}
          highlight={highlightedFields.includes("Enter_lppEPLPossible")}
          commit={(n) => setField("Enter_lppEPLPossible", n)}
        />
      </div>
      <div className="sm:col-span-2 flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2 mt-2">
        <div className="text-sm font-medium">Mise en gage</div>
        <Switch
          checked={asBool(draft.Enter_miseEnGage)}
          onCheckedChange={(v) => setField("Enter_miseEnGage", v)}
        />
      </div>
    </div>

    {/* Capitaux décès */}
    <div className="rounded-xl border border-dashed p-4 space-y-4 bg-muted/5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">Capitaux décès supplémentaires</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setField("DecesCapitaux", [
              ...decesCapitaux,
              { amount: 0, plusRente: "np", condition: "np" },
            ])
          }
        >
          + Ajouter un capital
        </Button>
      </div>

      {decesCapitaux.length === 0 ? (
        <div className="text-xs text-muted-foreground italic text-center py-4">
          Aucun capital décès spécifique n'a été extrait.
        </div>
      ) : (
        <div className="space-y-4">
          {decesCapitaux.map((it: any, idx: number) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-background p-3 rounded-lg border shadow-sm relative group">
              <div>
                <Label className="text-[11px]">Montant (CHF)</Label>
                <BufferedMoney
                  id={`dp-deces-${idx}-amount`}
                  amount={asNumber(it?.amount, 0)}
                  highlight={highlightedFields.includes("DecesCapitaux")}
                  commit={(n) => {
                    const next = decesCapitaux.slice();
                    next[idx] = { ...(next[idx] ?? {}), amount: n };
                    setField("DecesCapitaux", next);
                  }}
                />
              </div>

              <div>
                <Label className="text-[11px]">En plus d’une rente ?</Label>
                <Select
                  value={asString(it?.plusRente || "np")}
                  onValueChange={(v) => {
                    const next = decesCapitaux.slice();
                    next[idx] = { ...(next[idx] ?? {}), plusRente: v };
                    setField("DecesCapitaux", next);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oui">Oui</SelectItem>
                    <SelectItem value="non">Non</SelectItem>
                    <SelectItem value="np">Non précisé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px]">Condition</Label>
                <Select
                  value={asString(it?.condition || "np")}
                  onValueChange={(v) => {
                    const next = decesCapitaux.slice();
                    next[idx] = { ...(next[idx] ?? {}), condition: v };
                    setField("DecesCapitaux", next);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accident">Accident</SelectItem>
                    <SelectItem value="maladie">Maladie</SelectItem>
                    <SelectItem value="les_deux">Les deux</SelectItem>
                    <SelectItem value="np">Non précisé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-9"
                onClick={() => setField("DecesCapitaux", decesCapitaux.filter((_, i) => i !== idx))}
              >
                Supprimer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  </Section>

        {/* Mode avancé */}
        <div className="rounded-xl border bg-background">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Mode avancé</div>
                <div className="text-xs text-muted-foreground">
                  Réservé aux utilisateurs avancés (JSON). Une mauvaise modification peut casser vos données.
                </div>
              </div>

              <Switch checked={showAdvanced} onCheckedChange={onToggleAdvanced} />
            </div>

            {!showAdvanced && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium">Attention</div>
                  <div className="opacity-90">
                    Ne l’activez que si vous savez ce que vous faites. Sinon, utilisez les champs simples plus haut.
                  </div>
                </div>
              </div>
            )}
          </div>

          {showAdvanced ? (
            <div className="p-4 space-y-3">
              <BufferedTextarea
                id="dp-advanced-json"
                value={advancedJson}
                commit={(txt) => setAdvancedJson(txt)}
              />
              <div className="flex justify-end">
                <Button onClick={saveAdvancedJson} disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer (JSON)"}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                ⚠️ Le JSON écrase l’intégralité du document.
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky bar */}
        <div className="sticky bottom-3">
          <div className="max-w-4xl mx-auto rounded-2xl border bg-background/90 backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {isDirty ? "Modifications en attente" : "Aucune modification"}
            </div>
            <Button onClick={save} disabled={saving || !isDirty}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <AlertDialog open={confirmAdvancedOpen} onOpenChange={setConfirmAdvancedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer le mode avancé ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce mode permet de modifier les données en JSON. Une erreur peut rendre vos données incohérentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowAdvanced(true);
                setConfirmAdvancedOpen(false);
              }}
            >
              Je comprends, activer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}