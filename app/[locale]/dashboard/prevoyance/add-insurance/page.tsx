//app/[locale]/dashboard/prevoyance/add-insurance/page.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ShieldCheck, TrendingUp, Scan, X, Image as ImageIcon, Trash2, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth, db, storage } from "@/lib/firebase/index"; // 👈 Alias mis à jour
import { collection, addDoc, doc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; 
import { toast } from "sonner";
import { jsPDF } from "jspdf";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

import DocumentCropper from "../_components/DocumentCropper";
import UploadSourceDrawer from "../_components/UploadSourceDrawer";


// Import de la logique de calcul
import { computeProjections3aAssurance, computeDeathBenefitAssurance } from "@/lib/calculs/3epilier"; // 👈 Alias mis à jour
import { buildSourceDocTitle } from "@/lib/core/documentTypes";

export function AddInsurancePlanView({ onClose, adminUid }: { onClose: () => void, adminUid?: string }) {
  // 👈 NOUVEAU : Initialisation des traductions
  const t = useTranslations("AddInsurancePlanPage");
  const targetUid = adminUid || auth.currentUser?.uid;

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null); // 👈 NOUVEAU
  
  const [currentStep, setCurrentStep] = useState<"FORM" | "STAGING">("FORM");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [fileToCrop, setFileToCrop] = useState<File | null>(null);
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  // 👈 NOUVEAU : Fonction dédiée à la caméra native
  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileToCrop(e.target.files[0]); // On envoie la photo HD au recadreur
    }
    e.target.value = ''; // Reset
  };
  
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRisks, setShowRisks] = useState(false);
  const [showInvest, setShowInvest] = useState(false);
  const [clientAge, setClientAge] = useState(35);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  // Classification IA du document scanné (type + tags), persistée à la sauvegarde.
  const [scanDocType, setScanDocType] = useState<string | null>(null);
  const [scanDocTags, setScanDocTags] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    typeContrat: "3a" as "3a" | "3b", 
    compagnie: "",
    dateDebut: "", 
    primeTotale: 0,
    primeEpargne: 0,
    occurrence: "mois" as "mois" | "annee",
    valeurRachatActuelle: 0,
    projectionAssureur: 0,
    isInvesti: false,
    profil: "equilibre" as "defensif" | "equilibre" | "growth" | "dynamique",
    isLibere: false, 
    isEnGage: false, 
    hasLDP: true,
    renteInvalidite: 0,
    typeCapitalDeces: "fixe", 
    capitalDecesFixe: 0
  });

  // RÉCUPÉRATION DE L'ÂGE RÉEL DU CLIENT
  useEffect(() => {
    if (!targetUid) return;

    const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
    const unsub = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.Enter_dateNaissance) {
          const parts = d.Enter_dateNaissance.split('.');
          const birthYear = parts.length === 3 ? parseInt(parts[2]) : new Date(d.Enter_dateNaissance).getFullYear();
          if (!isNaN(birthYear)) {
            setClientAge(new Date().getFullYear() - birthYear);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setPendingFiles(prev => [...prev, ...files]);
    setCurrentStep("STAGING"); 
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 👈 NOUVELLE FONCTION : Générateur de PDF
  const createPdfFromImages = async (imageFiles: File[]): Promise<File> => {
    return new Promise((resolve, reject) => {
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      let loadedImages = 0;

      imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(event) {
          const img = new Image();
          img.onload = function() {
            // Calcul du ratio pour l'A4
            const ratio = Math.min(pdfWidth / img.width, pdfHeight / img.height);
            const imgX = (pdfWidth - img.width * ratio) / 2;
            const imgY = 0;

            if (index > 0) pdf.addPage();
            // 👈 On injecte le fichier brut (img.src) avec l'option 'FAST' pour interdire la re-compression
            pdf.addImage(img.src, 'JPEG', imgX, imgY, img.width * ratio, img.height * ratio, index.toString(), 'FAST');
            
            loadedImages++;
            if (loadedImages === imageFiles.length) {
              const pdfBlob = pdf.output("blob");
              resolve(new File([pdfBlob], "Police_Assurance_Scanne.pdf", { type: "application/pdf" }));
            }
          };
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });
  };

  const handleProcessScan = async () => {
    if (pendingFiles.length === 0) return;
    
    setCurrentStep("FORM");
    setIsScanning(true);
    const toastId = toast.loading(t("toast_loading_scan"));

    try {
      const user = auth.currentUser;
      let fileUrl = null;
      
      // 👈 AIGUILLAGE : Est-ce déjà un PDF ou des photos ?
      const isAlreadyPdf = pendingFiles[0].type === "application/pdf";
      let fileToUploadToFirebase: File;

      if (isAlreadyPdf) {
        fileToUploadToFirebase = pendingFiles[0]; // C'est déjà un PDF, on n'y touche pas !
      } else {
        fileToUploadToFirebase = await createPdfFromImages(pendingFiles); // Ce sont des photos, on les assemble
      }
      
      // 1. On upload le document final sur Firebase Storage
      if (targetUid) {
        const safeName = isAlreadyPdf ? pendingFiles[0].name.replace(/[^a-zA-Z0-9.]/g, '_') : "Police_Assurance_Scanne.pdf";
        const storageRef = ref(storage, `clients/${targetUid}/insurance_raw/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, fileToUploadToFirebase);
        fileUrl = await getDownloadURL(storageRef);
        setUploadedFileUrl(fileUrl); 
      }

      // 2. On prépare le FormData pour l'IA
      const formDataUpload = new FormData();
      if (isAlreadyPdf) {
        // Si c'est un PDF, on l'envoie tel quel
        formDataUpload.append("file", pendingFiles[0]);
        formDataUpload.append("files", pendingFiles[0]);
      } else {
        // Si ce sont des photos, on envoie les images brutes
        pendingFiles.forEach(file => formDataUpload.append("files", file));
        formDataUpload.append("file", pendingFiles[0]); 
      }

      const response = await fetch("/api/insurance/parse", {
        method: "POST",
        body: formDataUpload, 
      });

      const result = await response.json();

      if (response.ok && result.data) {
        const scannedData = Array.isArray(result.data) ? result.data[0] : result.data;
        
        const capDeces = Number(scannedData.capitalDecesFixe) || 0;
        const inferredTypeCapital = capDeces === 0 ? "primes" : "fixe";

        setFormData((prev) => ({
          ...prev,
          compagnie: scannedData.compagnie || prev.compagnie,
          dateDebut: scannedData.dateDebut || prev.dateDebut,
          typeContrat: scannedData.typeContrat || prev.typeContrat,
          primeTotale: Number(scannedData.primeTotale) || prev.primeTotale,
          primeEpargne: Number(scannedData.primeEpargne) || prev.primeEpargne,
          occurrence: scannedData.occurrence || prev.occurrence,
          valeurRachatActuelle: Number(scannedData.valeurRachatActuelle) || prev.valeurRachatActuelle,
          projectionAssureur: Number(scannedData.projectionAssureur) || prev.projectionAssureur,
          typeCapitalDeces: inferredTypeCapital,
          capitalDecesFixe: capDeces,
          renteInvalidite: Number(scannedData.renteInvalidite) || prev.renteInvalidite,
          hasLDP: scannedData.hasLDP ?? prev.hasLDP,
          isInvesti: scannedData.isInvesti ?? prev.isInvesti,
          profil: scannedData.profil || prev.profil,
        }));
        
        if (scannedData.renteInvalidite > 0 || capDeces > 0 || inferredTypeCapital === "primes") setShowRisks(true);
        if (scannedData.isInvesti) setShowInvest(true);

        // Classification du document (type + tags), conservée pour la sauvegarde.
        const dType = typeof scannedData.documentType === "string" ? scannedData.documentType.trim() : "";
        setScanDocType(dType || "Police 3e pilier");
        setScanDocTags(
          Array.isArray(scannedData.suggestedTags)
            ? scannedData.suggestedTags.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 3)
            : []
        );

        toast.success(t("toast_scan_success"), { id: toastId });
      } else {
        toast.error(t("toast_scan_err_read"), { id: toastId });
      }
    } catch (error) {
      toast.error(t("toast_scan_err_global"), { id: toastId });
    } finally {
      setIsScanning(false);
      setPendingFiles([]); // On vide la liste d'attente
    }
  };

  const handleSave = async () => {
    if (!formData.compagnie) return toast.error(t("toast_comp_req"));
    if (!formData.isLibere && formData.primeEpargne > formData.primeTotale) {
        return toast.error(t("toast_prime_err"));
    }
    
    setLoading(true);
    if (!targetUid) return;

    try {
      const projectionRetraite = computeProjections3aAssurance(formData as any, clientAge);
      const protectionDeces = computeDeathBenefitAssurance(formData as any);

      const newPlanRef = await addDoc(collection(db, "clients", targetUid, "plans"), {
        type: formData.typeContrat === "3a" ? "PILIER_3A_POLICE" : "PILIER_3B",
        institutionName: formData.compagnie,
        origin: "external",
        data: {
            ...formData,
            capitalRetraiteProjete: projectionRetraite,
            capitalDecesCalcule: protectionDeces,
            projectionCalculatedAt: new Date().toISOString()
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          isManualEntry: !uploadedFileUrl,
          sourceFile: uploadedFileUrl ? "INSURANCE_SCAN" : null,
          sourceFileUrl: uploadedFileUrl,
          // Classification IA du document scanné (affichée/éditable dans le coffre)
          ...(uploadedFileUrl ? {
            sourceDocType: scanDocType || "Police 3e pilier",
            sourceDocTags: scanDocTags,
            sourceDocTitle: buildSourceDocTitle(
              formData.typeContrat === "3a" ? "PILIER_3A_POLICE" : "PILIER_3B",
              formData.compagnie
            ),
          } : {}),
        }
      });
      
      sessionStorage.setItem("autoOpenPlanId", newPlanRef.id);
      toast.success(t("toast_save_success"));
      onClose(); // 👈 On ferme la vue au lieu de rediriger
    } catch (err) {
      toast.error(t("toast_save_err"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-32">
      
      {/* 👈 INPUTS CACHÉS DÉPLACÉS ICI POUR RESTER TOUJOURS ACTIFS */}
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelection} accept="application/pdf,image/*" />
      <input type="file" accept="image/*" capture="environment" className="hidden" ref={scannerInputRef} onChange={handleNativeCameraCapture} />

      {/* ZONE D'ATTENTE (STAGING) */}
      {currentStep === "STAGING" && (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB] px-6 pt-12 pb-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t("staging_title", { count: pendingFiles.length })}</h2>
            <button onClick={() => { setPendingFiles([]); setCurrentStep("FORM"); }} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-500 shadow-sm"><X size={20}/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pb-8">
            {pendingFiles.map((file, index) => (
              <div key={index} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon size={24} />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-900 text-sm truncate">{t("staging_page", { num: index + 1 })}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{Math.round(file.size / 1024)} KB</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== index))}
                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
            
            <button 
              onClick={() => setIsSourceOpen(true)} // 👈 Ouvre le tiroir de sources ici aussi !
              className="w-full py-6 mt-4 border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-blue-500 transition-colors active:scale-95"
            >
              <Plus size={24} />
              <span className="font-black text-sm">{t("btn_add_page")}</span>
            </button>
          </div>

          <div className="pt-4 space-y-3">
            <Button 
              onClick={handleProcessScan}
              disabled={pendingFiles.length === 0}
              className="w-full h-16 rounded-[24px] bg-black text-white font-black text-lg shadow-xl uppercase tracking-tighter transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {t("btn_finish_scan")} <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      )}

      {/* VUE FORMULAIRE (Classique) */}
      {currentStep === "FORM" && (
        <>
          <div className="bg-white px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-30 border-b border-slate-100">
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
              <ChevronLeft size={24} />
            </button>
            <h1 className="font-black text-lg">{t("form_title")}</h1>
            <div className="w-10" />
          </div>

          <div className="p-6 max-w-md mx-auto space-y-6">
            <div className="flex bg-slate-200/50 rounded-full p-1.5">
                <button onClick={() => setFormData({...formData, typeContrat: "3a"})} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${formData.typeContrat === "3a" ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{t("opt_3a")}</button>
                <button onClick={() => setFormData({...formData, typeContrat: "3b"})} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${formData.typeContrat === "3b" ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{t("opt_3b")}</button>
            </div>

            <div className="bg-white p-5 rounded-[32px] border border-slate-100 space-y-4 shadow-sm">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{t("lbl_liberated")}</span>
                    <SegmentedToggle small value={formData.isLibere} onChange={(v: boolean) => setFormData({...formData, isLibere: v})} labelYes={t("btn_yes")} labelNo={t("btn_no")} />
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{t("lbl_pledged")}</span>
                    <SegmentedToggle small value={formData.isEnGage} onChange={(v: boolean) => setFormData({...formData, isEnGage: v})} labelYes={t("btn_yes")} labelNo={t("btn_no")} />
                </div>
            </div>

            <div className="px-2">
                <button 
                    onClick={() => setIsSourceOpen(true)} // 👈 Ouvre le choix des sources !
                    disabled={isScanning}
                    className="w-full py-6 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] text-white shadow-xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isScanning ? (
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="font-black text-sm uppercase tracking-widest">{t("btn_scan_loading")}</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <Scan size={24} />
                                <span className="font-black text-sm uppercase tracking-widest">{t("btn_scan")}</span>
                            </div>
                            <p className="text-[10px] text-white/60 font-bold uppercase tracking-tighter">{t("scan_desc")}</p>
                        </>
                    )}
                </button>
            </div>

            <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">{t("sec_general")}</h3>
                <InputGroup label={t("lbl_company")} placeholder={t("ph_company")} value={formData.compagnie} onChange={(v: string) => setFormData({...formData, compagnie: v})} />

                <InputGroup 
                    label={t("lbl_start_date")} 
                    type="date" 
                    value={formData.dateDebut} 
                    onChange={(v: string) => setFormData({...formData, dateDebut: v})} 
                />
                            
                {!formData.isLibere && (
                  <>
                    <div className="bg-white rounded-[24px] p-4 border border-slate-100 flex justify-between items-center shadow-sm">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{t("lbl_frequency")}</span>
                       <select className="bg-transparent font-black text-slate-900 outline-none" value={formData.occurrence} onChange={(e) => setFormData({...formData, occurrence: e.target.value as any})}>
                         <option value="mois">{t("opt_monthly")}</option>
                         <option value="annee">{t("opt_yearly")}</option>
                       </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                        <InputGroup label={t("lbl_total_prime")} type="number" placeholder="0.00" value={formData.primeTotale.toString()} onChange={(v: string) => setFormData({...formData, primeTotale: Number(v)})} />
                        <InputGroup label={t("lbl_saving_prime")} type="number" placeholder="0.00" value={formData.primeEpargne.toString()} onChange={(v: string) => setFormData({...formData, primeEpargne: Number(v)})} />
                    </div>
                  </>
                )}

                <InputGroup label={t("lbl_surrender_val")} type="number" placeholder={t("ph_surrender_val")} value={formData.valeurRachatActuelle.toString()} onChange={(v: string) => setFormData({...formData, valeurRachatActuelle: Number(v)})} />

                <div className="space-y-1.5">
                    <InputGroup
                        label={t("lbl_insurer_projection")}
                        type="number"
                        placeholder={t("ph_insurer_projection")}
                        value={formData.projectionAssureur ? formData.projectionAssureur.toString() : ""}
                        onChange={(v: string) => setFormData({...formData, projectionAssureur: Number(v)})}
                    />
                    <p className="text-[10px] font-bold text-slate-400 leading-snug px-6">{t("hint_insurer_projection")}</p>
                </div>
            </div>

            <div className="pt-2">
                <button onClick={() => setShowInvest(!showInvest)} className="w-full py-4 bg-white border border-slate-100 rounded-[24px] text-xs font-black uppercase tracking-widest text-slate-500 flex items-center justify-center gap-2">
                    <TrendingUp size={14} /> {showInvest ? t("btn_hide_invest") : t("btn_show_invest")}
                </button>
                {showInvest && (
                    <div className="space-y-4 mt-4 animate-in slide-in-from-top-4 duration-300 bg-emerald-50/30 p-5 rounded-[32px] border border-emerald-100">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t("lbl_invested")}</span>
                            <SegmentedToggle small value={formData.isInvesti} onChange={(v: boolean) => setFormData({...formData, isInvesti: v})} labelYes={t("btn_yes")} labelNo={t("btn_no")} />
                        </div>
                        {formData.isInvesti && (
                            <div className="bg-white rounded-2xl p-4 flex justify-between items-center border border-emerald-100">
                                <span className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">{t("lbl_risk_profile")}</span>
                                <select className="bg-transparent font-black text-emerald-600 outline-none" value={formData.profil} onChange={(e) => setFormData({...formData, profil: e.target.value as any})}>
                                    <option value="defensif">{t("opt_defensive")}</option>
                                    <option value="equilibre">{t("opt_balanced")}</option>
                                    <option value="growth">{t("opt_growth")}</option>
                                    <option value="dynamique">{t("opt_dynamic")}</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!formData.isLibere && (
                <div className="pt-2">
                    <button onClick={() => setShowRisks(!showRisks)} className="w-full py-4 bg-white border border-slate-100 rounded-[24px] text-xs font-black uppercase tracking-widest text-slate-500 flex items-center justify-center gap-2">
                        <ShieldCheck size={14} /> {showRisks ? t("btn_hide_risks") : t("btn_show_risks")}
                    </button>

                    {showRisks && (
                        <div className="space-y-4 mt-4 animate-in slide-in-from-top-4 duration-300">
                            <div className="p-5 bg-white rounded-[24px] border border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{t("lbl_ldp")}</span>
                                    <SegmentedToggle small value={formData.hasLDP} onChange={(v: boolean) => setFormData({...formData, hasLDP: v})} labelYes={t("btn_yes")} labelNo={t("btn_no")} />
                                </div>
                            </div>
                            <InputGroup label={t("lbl_inv_rent")} type="number" placeholder="0.00" value={formData.renteInvalidite.toString()} onChange={(v: string) => setFormData({...formData, renteInvalidite: Number(v)})} />
                            
                            <div className="bg-white rounded-[24px] p-5 border border-slate-100 space-y-4 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t("lbl_death_opt")}</span>
                                    <select 
                                        className="bg-transparent font-black text-slate-900 outline-none text-right" 
                                        value={formData.typeCapitalDeces} 
                                        onChange={(e) => setFormData({
                                            ...formData, 
                                            typeCapitalDeces: e.target.value,
                                            capitalDecesFixe: e.target.value === 'primes' ? 0 : formData.capitalDecesFixe
                                        })}
                                    >
                                        <option value="fixe">{t("opt_death_fixed")}</option>
                                        <option value="primes">{t("opt_death_refund")}</option>
                                    </select>
                                </div>
                                {formData.typeCapitalDeces === "fixe" && (
                                    <InputGroup label={t("lbl_death_cap")} type="number" placeholder="0.00" value={formData.capitalDecesFixe.toString()} onChange={(v: string) => setFormData({...formData, capitalDecesFixe: Number(v)})} />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Button onClick={handleSave} disabled={loading} className="w-full h-18 rounded-[24px] bg-[#1a4f8a] text-white font-black text-xl shadow-xl mt-8 py-8">
                {loading ? t("btn_saving") : t("btn_save")}
            </Button>
          </div>
        </>
      )}

      {/* 👈 L'ÉTAPE DE RECADRAGE MANUEL */}
      {fileToCrop && (
        <DocumentCropper
          file={fileToCrop}
          onCancel={() => setFileToCrop(null)}
          onComplete={(croppedFile) => {
            setPendingFiles(prev => [...prev, croppedFile]); // 👈 On ajoute le document recadré
            setFileToCrop(null);
            setCurrentStep("STAGING"); 
          }}
        />
      )}

      {/* 👈 LE TIROIR DE CHOIX DE SOURCE */}
      <UploadSourceDrawer 
        isOpen={isSourceOpen} 
        onClose={() => setIsSourceOpen(false)} 
        onSourceSelect={(source) => {
          setIsSourceOpen(false);
          if (source === "camera") {
            scannerInputRef.current?.click(); // Vraie caméra HD
          } else {
            fileInputRef.current?.click(); // Explorateur de fichiers pour les PDF / Galerie
          }
        }} 
      />
    </div>
  );
}

function InputGroup({ label, placeholder, value, onChange, type = "text" }: any) {
    let displayVal = value || "";
    if (type === "date" && displayVal.includes(".")) {
      const parts = displayVal.split(".");
      if (parts.length === 3) displayVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const handleChange = (e: any) => {
      let val = e.target.value;
      if (type === "date" && val.includes("-")) {
        const parts = val.split("-");
        if (parts.length === 3) val = `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      onChange(val);
    };

    return (
      <div className="relative group">
        <div className="absolute left-6 top-3 text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none pointer-events-none group-focus-within:text-blue-500 transition-colors z-10">
          {label}
        </div>
        <input 
          type={type}
          placeholder={placeholder}
          value={displayVal}
          onChange={handleChange}
          className="w-full bg-white border border-slate-100 rounded-[24px] pt-8 pb-4 px-6 font-black text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm relative"
        />
      </div>
    );
}

function SegmentedToggle({ value, onChange, small = false, labelYes, labelNo }: any) {
    return (
      <div className={`flex bg-slate-100 rounded-full p-1 ${small ? 'w-32' : 'w-full'}`}>
        <button type="button" onClick={() => onChange(true)} className={`flex-1 py-2 text-[10px] font-black rounded-full transition-all ${value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{labelYes}</button>
        <button type="button" onClick={() => onChange(false)} className={`flex-1 py-2 text-[10px] font-black rounded-full transition-all ${!value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{labelNo}</button>
      </div>
    );
}

// 👈 NOUVEAU : On exporte la page pour l'espace client
export default function AddInsurancePlanPage() {
  const router = useRouter();
  return <AddInsurancePlanView onClose={() => router.back()} />;
}