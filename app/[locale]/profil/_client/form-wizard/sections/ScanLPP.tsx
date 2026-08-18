"use client";

import React, { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";
import { motion, AnimatePresence } from "framer-motion";
import { AppOnlyModal } from "@/app-components/AppOnly";
import { Download, Scan, AlertTriangle, FileCheck, X, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, onSnapshot } from "firebase/firestore";

type FormType = MinimalForm & {
  Enter_dateCertificatLPP?: string;
  Enter_typeSalaireAssure?: "general" | "split";
  Enter_salaireAnnuel?: number;
  Enter_salaireAssureLPP?: number;
  Enter_salaireAssureLPPRisque?: number;
  Enter_salaireAssureLPPEpargne?: number;
  Enter_rentevieillesseLPP65?: number;
  Enter_renteInvaliditeLPP?: number;
  Enter_renteEnfantInvaliditeLPP?: number;
  Enter_renteOrphelinLPP?: number;
  Enter_renteConjointLPP?: number;
  Enter_avoirVieillesseObligatoire?: number;
  Enter_avoirVieillesseTotal?: number;
  Enter_prestationCapital65?: number;
  Enter_rachatPossible?: number;
  Enter_eplPossibleMax?: number;
  Enter_miseEnGage?: boolean;
  Enter_lppCaisseNom?: string;
  Enter_lppCaisseAdresse?: string;
  Enter_lppCaisseTelephone?: string;
  Enter_lppCaisseEmail?: string;
  Enter_lppCaisseSiteWeb?: string;
  Enter_lppFilePath?: string;
  Enter_lppOriginalFilename?: string;
  DecesCapitaux?: {
    amount: number;
    plusRente: "oui" | "non" | "np";
    condition: "accident" | "maladie" | "les_deux" | "np";
  }[];
  Enter_lppScanMode?: "manual" | "scan";
  Enter_lppScanDone?: boolean;
};

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2),
    mm = d.slice(2, 4),
    yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

function applyLppAiToForm(form: UseFormReturn<FormType>, ai: any) {
  const { setValue } = form;
  if (ai.caisseNom) setValue("Enter_lppCaisseNom", ai.caisseNom, { shouldDirty: true });
  if (ai.caisseAdresse) setValue("Enter_lppCaisseAdresse", ai.caisseAdresse, { shouldDirty: true });
  if (ai.caisseTelephone) setValue("Enter_lppCaisseTelephone", ai.caisseTelephone, { shouldDirty: true });
  if (ai.caisseEmail) setValue("Enter_lppCaisseEmail", ai.caisseEmail, { shouldDirty: true });
  if (ai.caisseSiteWeb) setValue("Enter_lppCaisseSiteWeb", ai.caisseSiteWeb, { shouldDirty: true });

  if (ai.dateCertificat) {
    setValue("Enter_dateCertificatLPP", normalizeDateMask(ai.dateCertificat), { shouldDirty: true, shouldValidate: true });
  }
  if (typeof ai.salaireDeterminant === "number") {
    setValue("Enter_salaireAnnuel", ai.salaireDeterminant, { shouldDirty: true, shouldValidate: true });
  }

  const hasRisque = typeof ai.salaireAssureRisque === "number";
  const hasEpargne = typeof ai.salaireAssureEpargne === "number";
  if (hasRisque || hasEpargne) {
    if (hasRisque && hasEpargne && ai.salaireAssureRisque !== ai.salaireAssureEpargne) {
      setValue("Enter_typeSalaireAssure", "split", { shouldDirty: true });
      setValue("Enter_salaireAssureLPPRisque", ai.salaireAssureRisque, { shouldDirty: true });
      setValue("Enter_salaireAssureLPPEpargne", ai.salaireAssureEpargne, { shouldDirty: true });
    } else {
      setValue("Enter_typeSalaireAssure", "general", { shouldDirty: true });
      setValue("Enter_salaireAssureLPP", ai.salaireAssureEpargne ?? ai.salaireAssureRisque, { shouldDirty: true });
    }
  }

  if (typeof ai.renteInvaliditeAnnuelle === "number") setValue("Enter_renteInvaliditeLPP", ai.renteInvaliditeAnnuelle, { shouldDirty: true });
  if (typeof ai.renteEnfantInvaliditeAnnuelle === "number") setValue("Enter_renteEnfantInvaliditeLPP", ai.renteEnfantInvaliditeAnnuelle, { shouldDirty: true });
  if (typeof ai.renteOrphelinAnnuelle === "number") setValue("Enter_renteOrphelinLPP", ai.renteOrphelinAnnuelle, { shouldDirty: true });
  if (typeof ai.renteConjointAnnuelle === "number") setValue("Enter_renteConjointLPP", ai.renteConjointAnnuelle, { shouldDirty: true });
  if (typeof ai.renteRetraite65Annuelle === "number") setValue("Enter_rentevieillesseLPP65", ai.renteRetraite65Annuelle, { shouldDirty: true });
  if (typeof ai.capitalRetraite65 === "number") setValue("Enter_prestationCapital65", ai.capitalRetraite65, { shouldDirty: true });

  if (typeof ai.avoirVieillesse === "number") setValue("Enter_avoirVieillesseTotal", ai.avoirVieillesse, { shouldDirty: true });
  if (typeof ai.avoirVieillesseSelonLpp === "number") setValue("Enter_avoirVieillesseObligatoire", ai.avoirVieillesseSelonLpp, { shouldDirty: true });
  if (typeof ai.rachatPossible === "number") setValue("Enter_rachatPossible", ai.rachatPossible, { shouldDirty: true });
  if (typeof ai.eplDisponible === "number") setValue("Enter_eplPossibleMax", ai.eplDisponible, { shouldDirty: true });
  if (typeof ai.miseEnGage === "boolean") setValue("Enter_miseEnGage", ai.miseEnGage, { shouldDirty: true });

  if (typeof ai.capitalDeces === "number" && ai.capitalDeces > 0) {
    let plusRenteValue: "oui" | "non" | "np" = "np";
    if (ai.capitalDecesPlusRente === "oui") plusRenteValue = "oui";
    if (ai.capitalDecesPlusRente === "non") plusRenteValue = "non";
    setValue("DecesCapitaux", [{ amount: ai.capitalDeces, plusRente: plusRenteValue, condition: "np" }], { shouldDirty: true });
  }
}

const ConfettiExplosion = () => {
  const particles = Array.from({ length: 40 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((_, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: (Math.random() - 0.5) * 500,
            y: (Math.random() - 0.5) * 500 - 100,
            opacity: 0,
            scale: 0,
          }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{
            backgroundColor: i % 3 === 0 ? "#4FD1C5" : i % 3 === 1 ? "#001D38" : "#F0AB00",
          }}
        />
      ))}
    </div>
  );
};

export default function ScanLPPSection({
  form,
  onNext,
}: {
  form: UseFormReturn<FormType>;
  onNext?: () => void;
}) {
  const [localScanning, setLocalScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // File d'attente pour le multi-pages
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Scan/upload d'un document = RÉSERVÉ À L'APP → au lieu d'ouvrir le sélecteur.
  const [showAppOnly, setShowAppOnly] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches ?? false);
  
  const scanDone = form.watch("Enter_lppScanDone");
  const currentFilePath = form.watch("Enter_lppFilePath");
  const currentFileName = form.watch("Enter_lppOriginalFilename");

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownload = async () => {
    if (!currentFilePath) return;
    try {
      setIsDownloading(true);
      const url = await getDownloadURL(ref(storage, currentFilePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Download error", e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleChooseManual = () => {
    form.setValue("Enter_lppScanMode", "manual", { shouldDirty: true });
    form.setValue("Enter_lppScanDone", false, { shouldDirty: true });
    onNext?.();
  };

  const startAnalysis = async () => {
    if (pendingFiles.length === 0) return;
    const u = auth.currentUser;
    if (!u) return;

    try {
      setLocalScanning(true);
      setErrorMsg(null);
      setScanPct(10);
      setShowConfetti(false);

      const filePaths: string[] = [];
      
      // Upload de chaque page
      for (const f of pendingFiles) {
        const storagePath = `clients/${u.uid}/lpp_raw/${crypto.randomUUID()}.${f.name.split('.').pop()}`;
        await uploadBytes(ref(storage, storagePath), f);
        filePaths.push(storagePath);
      }
      
      setScanPct(40);

      const jwt = await u.getIdToken(true);
      const res = await fetch(`/api/lpp/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        // On envoie le premier path pour la compatibilité, et le tableau pour la future API multi-images
        body: JSON.stringify({ filePath: filePaths[0], allPaths: filePaths }), 
      });

      const { jobId } = await res.json();
      setScanPct(60);

      const unsub = onSnapshot(doc(db, "clients", u.uid, "lpp_jobs", jobId), (snap) => {
        const job = snap.data();
        if (job?.status === "DONE_FAST") {
          unsub();
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          
          applyLppAiToForm(form, job.parsedFast);
          
          form.setValue("Enter_lppScanDone", true, { shouldDirty: true });
          form.setValue("Enter_lppFilePath", filePaths[0], { shouldDirty: true });
          form.setValue("Enter_lppOriginalFilename", `${pendingFiles.length} page(s) scannée(s)`, { shouldDirty: true });
          
          setScanPct(100);
          setLocalScanning(false);
          setShowConfetti(true);
          setPendingFiles([]); 
        } else if (job?.status === "ERROR") {
          unsub();
          setLocalScanning(false);
          setErrorMsg(job.error || "L'IA n'a pas pu traiter ces documents.");
        }
      });
    } catch (e: any) {
      setLocalScanning(false);
      setErrorMsg("Erreur lors du traitement. Vérifiez votre connexion.");
    }
  };

  return (
    <div className="space-y-6 relative">
      <AppOnlyModal open={showAppOnly} onOpenChange={setShowAppOnly} feature="scan" />
      {showConfetti && <ConfettiExplosion />}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        capture={isMobile ? "environment" : undefined}
        multiple
        className="sr-only"
        onChange={addFiles}
      />

      {/* PRÉVISUALISATION DES PAGES CAPTURÉES */}
      <AnimatePresence>
        {pendingFiles.length > 0 && !localScanning && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-4 bg-muted/20 rounded-2xl border-2 border-dashed border-muted/50"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                Pages à analyser ({pendingFiles.length})
              </span>
              <button onClick={() => setPendingFiles([])} className="text-[10px] text-red-500 font-bold uppercase">
                Tout effacer
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {pendingFiles.map((f, i) => (
                <div key={i} className="relative aspect-[3/4] bg-white rounded-lg overflow-hidden border shadow-sm group">
                  <img 
                    src={URL.createObjectURL(f)} 
                    alt="preview" 
                    className="object-cover w-full h-full"
                  />
                  <button 
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 backdrop-blur-sm"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => setShowAppOnly(true)}
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-white/50 hover:bg-white transition-colors aspect-[3/4]"
              >
                <Plus size={20} className="text-muted-foreground" />
                <span className="text-[10px] font-bold text-muted-foreground mt-1">Page {pendingFiles.length + 1}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHARGEMENT */}
      {localScanning && (
        <div className="space-y-3 p-4 rounded-xl border bg-muted/10">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
            <span className="animate-pulse font-bold">Analyse MoneyLife en cours...</span>
            <span className="tabular-nums font-bold">{Math.round(scanPct)}%</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden shadow-inner">
            <motion.div 
              className="h-full bg-gradient-to-r from-[#4FD1C5] to-[#001D38]"
              animate={{ width: `${scanPct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* SUCCÈS */}
      {scanDone && !localScanning && pendingFiles.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex gap-3 items-start">
            <FileCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Analyse terminée ! ✅</p>
              <p className="text-xs text-emerald-800/80 leading-relaxed">
                Les données ont été extraites. Vous pouvez passer à l'étape suivante.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white shadow-sm w-fit group">
            <Download className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col pr-2">
              <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[150px]">
                {currentFileName}
              </span>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold text-left underline underline-offset-2"
              >
                {isDownloading ? "Ouverture..." : "Consulter le scan"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-800 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* ACTIONS PRINCIPALES */}
      <div className="space-y-3">
        {!localScanning && (
          <Button
            type="button"
            variant={pendingFiles.length > 0 ? "default" : "outline"}
            onClick={pendingFiles.length > 0 ? startAnalysis : () => setShowAppOnly(true)}
            className={`w-full rounded-xl h-12 font-bold shadow-sm transition-all active:scale-[0.98] ${pendingFiles.length > 0 ? "bg-[#001D38] hover:bg-[#001D38]/90" : ""}`}
          >
            <Scan className="h-4 w-4 mr-2" />
            {pendingFiles.length > 0 
              ? `Lancer l'analyse (${pendingFiles.length} page${pendingFiles.length > 1 ? 's' : ''})` 
              : scanDone ? "Scanner un autre document" : "Prendre une photo / Scan"}
          </Button>
        )}

        {!scanDone && !localScanning && pendingFiles.length === 0 && (
          <button
            type="button"
            onClick={handleChooseManual}
            className="w-full text-center text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors pt-1"
          >
            Saisir les informations manuellement
          </button>
        )}
      </div>
    </div>
  );
}