//app/[locale]/dashboard/prevoyance/_components/PlanDetailsView.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  X, Edit2, User, Landmark, Wallet, TrendingUp, ShieldCheck, Heart, 
  History, Coins, MapPin, Calendar, Activity, AlertTriangle, Info, Receipt, Trash2, Lock,
  FileText, ExternalLink, CheckCircle2, Loader2, MessageSquareWarning, Phone, Sparkles, Check
} from "lucide-react";
import { Plan } from "app/lib/core/plans"; // 👈 Alias
import EditAmountDrawer from "./EditAmountDrawer";
import InfoDrawer from "./InfoDrawer";
import DocumentUploaderModal from "./DocumentUploaderModal";
import EditSourceDocDrawer from "./EditSourceDocDrawer";
import { buildSourceDocTitle } from "@/lib/core/documentTypes";
import { auth, db, storage } from "@/lib/firebase/index"; // 👈 Alias
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc, getDoc, collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { parseMoneyToNumber } from "@/lib/core/format"; // 👈 Alias
import { normalizeDateMask } from "@/lib/core/dates"; // 👈 Alias
import { computeProjections3aBanque, computeProjections3aAssurance, computeDeathBenefitAssurance } from "@/lib/calculs/3epilier";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// Contexte pour l'édition Inline
const EditContext = React.createContext<any>(null);

// Imports Signature & PDF
import SignatureCanvas from 'react-signature-canvas';
import { flattenSignatureOnPdf } from "@/lib/core/signature"; // 👈 Alias
import { computeLPPProjectionRetraite } from "lib/shared/calculs/lpp"; // 👈 Alias

type ExtendedPlan = Plan & {
  status?: string;
  reviewStatus?: string; 
  documents?: any[];
  requirements?: any[];
  origin?: "creditx" | "external";
};

interface PlanDetailsViewProps {
  plan: ExtendedPlan;
  onClose: () => void;
  isOpen?: boolean;
  adminUid?: string;
}

export default function PlanDetailsView({ plan: initialPlan, onClose, isOpen, adminUid }: PlanDetailsViewProps) {
  // 👈 NOUVEAU : Traductions
  const t = useTranslations("PlanDetailsView");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<{label: string, value: any, fieldPath: string, type?: string, options?: any[]} | null>(null);
  const [clientAge, setClientAge] = useState(35);
  const [livePlan, setLivePlan] = useState<ExtendedPlan>(initialPlan);

  useEffect(() => {
    setLivePlan(initialPlan);
  }, [initialPlan]);

  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [loadingSignature, setLoadingSignature] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [loadingReject, setLoadingReject] = useState(false);

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{
    title: string;
    value: string;
    definition: string;
    fieldPath: string;
    icon: React.ReactNode;
  } | null>(null);

  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isDocEditOpen, setIsDocEditOpen] = useState(false);
  const [isExpertSalesModalOpen, setIsExpertSalesModalOpen] = useState(false);
  const [isCertifiedWarningOpen, setIsCertifiedWarningOpen] = useState(false);
  const [pendingEditConfig, setPendingEditConfig] = useState<{label: string, value: any, fieldPath: string, type?: string, options?: any[], forceDrawer?: boolean} | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 

  const targetUid = adminUid || auth.currentUser?.uid;

  // Options globales traduites via useMemo
  const OPTIONS_BOOLEAN = useMemo(() => [{ id: true, label: t("options.yes") }, { id: false, label: t("options.no") }], [t]);
  const OPTIONS_PROFIL = useMemo(() => [
    { id: "defensif", label: t("options.defensive") },
    { id: "equilibre", label: t("options.balanced") },
    { id: "growth", label: t("options.growth") },
    { id: "dynamique", label: t("options.dynamic") }
  ], [t]);
  const OPTIONS_FREQUENCE = useMemo(() => [{ id: "mois", label: t("options.monthly") }, { id: "annee", label: t("options.yearly") }], [t]);
  const OPTIONS_TYPE_CONTRAT = useMemo(() => [{ id: "3a", label: t("options.pil_3a") }, { id: "3b", label: t("options.pil_3b") }], [t]);
  const OPTIONS_DECES = useMemo(() => [{ id: "fixe", label: t("options.death_fixed") }, { id: "primes", label: t("options.death_refund") }], [t]);


  useEffect(() => {
    if (!targetUid || !initialPlan.id || initialPlan.type === "LPP_BASE" || initialPlan.type === "LPP_COMPL") return;

    const planRef = doc(db, "clients", targetUid, "plans", initialPlan.id);
    const unsubPlan = onSnapshot(planRef, (snap) => {
      if (snap.exists()) {
        setLivePlan({ id: snap.id, ...snap.data() } as ExtendedPlan);
      }
    });

    return () => unsubPlan();
  }, [targetUid, initialPlan.id, initialPlan.type]);

  const plan = livePlan;
  const d = (plan.data || {}) as any;

  useEffect(() => {
    if (!targetUid) return;
    const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
    const unsub = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.Enter_dateNaissance) {
          const parts = data.Enter_dateNaissance.split('.');
          if (parts.length === 3) {
            setClientAge(new Date().getFullYear() - parseInt(parts[2]));
          }
        }
      }
    });
    return () => unsub();
  }, [targetUid]); 

  const planType = plan.type as string; 
  const isLPP = planType === "LPP_BASE" || !planType;
  const isInsurance = planType === "PILIER_3A_POLICE" || planType === "PILIER_3B";
  const isBank = planType === "PILIER_3A_BANK" || planType === "3A_BANQUE";
  
  const isPending = !adminUid && plan.status === "PENDING_CLIENT";
  const isProcessing = plan.status === "PENDING_INSURANCE"; 
  
  const isCreditXNative = plan.origin === "creditx";
  const canEdit = !isPending && !isProcessing && (!isCreditXNative || !!adminUid);
  
  const formatCHF = (val?: any) => {
    if (val === null || val === undefined || val === "") return ""; // 👈 On retourne "" au lieu de null
    return new Intl.NumberFormat('fr-CH', { 
      style: 'currency', 
      currency: 'CHF', 
      maximumFractionDigits: 0 
    }).format(Number(val)).replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ');
  };



  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "";
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateStr;
  };

  const openInfo = (label: string, value: any, definition: string, fieldPath: string, icon: React.ReactNode) => {
    setActiveInfo({ title: label, value: value || t("labels.to_complete"), definition, fieldPath, icon });
    setIsInfoOpen(true);
  };

 const handleOpenEdit = (config: {label: string, value: any, fieldPath: string, type?: string, options?: any[], forceDrawer?: boolean}) => {
  if (plan.reviewStatus === "COMPLETED" && !adminUid) {
   setPendingEditConfig(config);
   setIsCertifiedWarningOpen(true);
  } else {
    setEditConfig(config);
    // 👈 PATCH : On accepte l'ouverture forcée du Drawer
    if (config.fieldPath.startsWith("projections_") || config.forceDrawer) setIsEditOpen(true);
  }
 };

  const triggerEditFromInfo = () => {
    if (!canEdit || !activeInfo) return;
    setIsInfoOpen(false);
    handleOpenEdit({
      label: activeInfo.title,
      value: d[activeInfo.fieldPath.replace('data.', '')] ?? "",
      fieldPath: activeInfo.fieldPath,
      forceDrawer: true // 👈 PATCH : Force le tiroir plein écran
    });
  };

const getEditAction = (label: string, value: any, fieldPath: string, type?: string, options?: any[]) => {
    if (!canEdit) return undefined;
    return { actionType: 'EDIT', label, value: value ?? "", fieldPath, type, options };
  };

  const handleAcceptClick = () => {
    if (!plan.documents || plan.documents.length === 0) {
      toast.error(t("toasts.err_sign_no_doc"));
      return;
    }
    setIsSignatureOpen(true);
  };

  const processSignature = async (base64Signature: string) => {
    if (!targetUid || !plan.id || !plan.documents) return;

    setLoadingSignature(true);
    try {
      const newSignedDocs = [];

      for (let i = 0; i < plan.documents.length; i++) {
        const originalDoc = plan.documents[i];
        if (originalDoc.isSigned) continue;

        const hasSignatureZone = (originalDoc.signatureAreas && originalDoc.signatureAreas.length > 0) || originalDoc.signatureArea;
        
        if (!hasSignatureZone) continue;

        const sigAreas = originalDoc.signatureAreas || [originalDoc.signatureArea];
        const dateAreas = originalDoc.dateAreas || (originalDoc.dateArea ? [originalDoc.dateArea] : []);
        
        const signedPdfBytes = await flattenSignatureOnPdf(originalDoc.url, base64Signature, sigAreas, dateAreas);

        const storagePath = `clients/${targetUid}/documents/plans_propositions/Signe_${i}_${Date.now()}.pdf`;
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, signedPdfBytes, { contentType: 'application/pdf' });
        const signedUrl = await getDownloadURL(fileRef);

        newSignedDocs.push({
          name: `Signé - ${originalDoc.name}`,
          url: signedUrl,
          path: storagePath,
          uploadedAt: new Date(),
          isSigned: true
        });
      }

      const updatedDocs = [...plan.documents, ...newSignedDocs];

      await updateDoc(doc(db, "clients", targetUid, "plans", plan.id), {
        status: "PENDING_INSURANCE", 
        documents: updatedDocs,
        "metadata.acceptedAt": serverTimestamp(),
      });

      toast.success(t("toasts.success_signed"));
      setIsSignatureOpen(false);
      onClose(); 
    } catch (error) {
      console.error("Erreur de signature :", error);
      toast.error(t("toasts.err_sign"));
    } finally {
      setLoadingSignature(false);
    }
  };

  const handleDocumentAdded = async (newDoc: any) => {
    if (!targetUid || !plan.id) return;
    try {
      const updatedDocs = [...(plan.documents || []), newDoc];
      await updateDoc(doc(db, "clients", targetUid, "plans", plan.id), {
        documents: updatedDocs
      });
      toast.success(t("toasts.success_doc_added"));
    } catch (error) {
      console.error("Erreur ajout document:", error);
      toast.error(t("toasts.err_doc_added"));
    }
  };

  const handleRejectSubmit = async (reason: string, details: string) => {
    if (!targetUid || !plan.id) return;
    setLoadingReject(true);
    try {
      await updateDoc(doc(db, "clients", targetUid, "plans", plan.id), {
        status: "REJECTED_CLIENT",
        "metadata.rejectedAt": serverTimestamp(),
        "metadata.rejectReason": reason,
        "metadata.rejectDetails": details
      });

      await updateDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), {
        _lastPlanUpdateTrigger: serverTimestamp()
      });

      toast.success(t("toasts.success_reject"));
      setIsRejectModalOpen(false);
      onClose();
    } catch (error) {
      toast.error(t("toasts.err_reject"));
    } finally {
      setLoadingReject(false);
    }
  };

  const handleUpdateDirect = async (fieldPath: string, value: any, label: string, oldValue: any) => {
    if (!targetUid || !plan.id) return;
    try {
      let finalValue = value;
      if (typeof finalValue === 'string' && fieldPath.match(/prime|montant|rachat|solde|salaire|rente|capital|taux|EPL|projection/i)) {
        finalValue = parseMoneyToNumber(finalValue);
      }

      let updatePayload: any = { [fieldPath]: finalValue };
      
      if (fieldPath === "data.typeCapitalDeces" && finalValue === "primes") {
          updatePayload["data.capitalDecesFixe"] = 0;
      }

      // 👈 RECALCUL AUTOMATIQUE DES PROJECTIONS
      if (fieldPath.startsWith("data.")) {
        const fieldName = fieldPath.replace("data.", "");
        const simulatedData = { ...plan.data, [fieldName]: finalValue };

        if (plan.type === "PILIER_3A_BANK") {
            updatePayload["data.capitalRetraiteProjete"] = computeProjections3aBanque(simulatedData as any, clientAge);
        } else if (plan.type === "PILIER_3A_POLICE" || plan.type === "PILIER_3B") {
            updatePayload["data.capitalRetraiteProjete"] = computeProjections3aAssurance(simulatedData as any, clientAge);
            updatePayload["data.capitalDecesCalcule"] = computeDeathBenefitAssurance(simulatedData as any);
        }
      }

      await updateDoc(doc(db, "clients", targetUid, "plans", plan.id), updatePayload);

      if (finalValue !== oldValue) {
        await addDoc(collection(db, "lpp_learnings"), {
          institutionName: plan.institutionName || "Inconnue",
          fieldKey: fieldPath,
          oldValue: oldValue ?? 0,
          newValue: finalValue ?? 0,
          label: label,
          timestamp: serverTimestamp(),
          correctedBy: auth.currentUser?.uid || "Inconnu" 
        });
      }
      
      toast.success(t("toasts.success_updated"));
      setEditConfig(null);
    } catch (e) {
      console.error(e);
      toast.error(t("toasts.err_save"));
    }
  };

  const handleDeletePlan = async (reason: string) => {
    if (!targetUid || !plan.id || !reason) return;
    setIsDeleteModalOpen(false);
    const toastId = toast.loading(t("toasts.del_loading"));
    try {
      const { deleteDoc, doc, updateDoc, serverTimestamp, addDoc, collection } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase/index");
      const docRef = doc(db, "clients", targetUid, "plans", plan.id);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        // 1) Suppression (action principale).
        await deleteDoc(docRef);
        await updateDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), {
          _lastPlanUpdateTrigger: serverTimestamp()
        });

        // 2) Journal d'audit (raison Test/Erreur) — BEST-EFFORT, ne doit jamais
        //    bloquer la suppression (sous-collection client, comme les notifications).
        try {
          await addDoc(collection(db, "clients", targetUid, "plans_deletions"), {
            planId: plan.id,
            institutionName: plan.institutionName || "",
            status: plan.status || "",
            reason,
            deletedBy: adminUid || auth.currentUser?.uid || "",
            deletedAt: serverTimestamp(),
          });
        } catch (logErr) {
          console.warn("Audit plans_deletions non écrit (règles ?) :", logErr);
        }

        toast.success(t("toasts.del_success"), { id: toastId });
        onClose();
      } else {
        toast.error(t("toasts.del_not_found"), { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error(t("toasts.del_err"), { id: toastId });
    }
  };

  return (
    <EditContext.Provider value={{ editConfig, setEditConfig, setIsEditOpen, handleUpdateDirect, handleOpenEdit, t }}>
    <>
    <div className="fixed inset-0 bg-[#F8F9FB] z-50 overflow-y-auto pb-40">
      <div className="sticky top-0 bg-[#F8F9FB]/90 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10 border-b border-slate-100">
        <button onClick={onClose} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform">
          <X size={20} />
        </button>
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
          {isPending ? t("titles.pending") : (isLPP ? t("titles.lpp") : isInsurance ? t("titles.insurance") : t("titles.bank"))}
        </h2>
        <div className="w-10" />
      </div>

      <div className="px-6 space-y-8 mt-6">
        
        {((plan.metadata as any)?.sourceFile?.includes("SCAN") || (plan.metadata as any)?.sourceFileUrl?.includes("SCAN")) && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[32px] p-6 border border-indigo-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-200/50 rounded-full blur-2xl"></div>
              
              <div className="relative z-10 flex gap-4 items-start">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm shrink-0">
                  <Sparkles size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-indigo-900 text-lg leading-tight tracking-tight">{t("ai.title")}</h3>
                  <p className="text-[13px] font-bold text-indigo-900/70 mt-1 leading-snug">
                    {t("ai.desc")}
                  </p>
                  
                  <div className="mt-5 pt-5 border-t border-indigo-200/50">
                    {plan.reviewStatus === "PENDING" ? (
                      !!adminUid ? (
                        <div className="flex flex-col gap-3">
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-xs font-bold leading-snug">
                            <AlertTriangle size={14} className="inline mr-1 -mt-0.5" />
                            {t("ai.admin_alert")}
                          </div>
                          <button 
                            onClick={async () => {
                              if (!targetUid || !plan.id) return;
                              const toastId = toast.loading(t("ai.toast_validating"));
                              try {
                                await updateDoc(doc(db, "clients", targetUid, "plans", plan.id), {
                                  reviewStatus: "COMPLETED",
                                  "metadata.reviewedAt": serverTimestamp(),
                                  "metadata.reviewedBy": adminUid
                                });

                                await addDoc(collection(db, `clients/${targetUid}/notifications`), {
                                  title: "Contrôle Expert terminé",
                                  content: `L'analyse manuelle de votre ${isLPP ? "certificat LPP" : "contrat 3ème pilier"} (${plan.institutionName || "Institution"}) a été effectuée avec succès. Vos données sont désormais certifiées exactes par nos experts.`,
                                  type: "success",
                                  category: isLPP ? "LPP" : "PREVOYANCE",
                                  actionUrl: `/dashboard/prevoyance`, 
                                  read: false,
                                  createdAt: serverTimestamp()
                                });

                                const clientSnap = await getDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"));
                                const clientData = clientSnap.exists() ? clientSnap.data() : {};

                                if (clientData.Enter_email) {
                                  await fetch("/api/send-review-completed", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      email: clientData.Enter_email,
                                      firstName: clientData.Enter_prenom || "Client",
                                      institutionName: plan.institutionName,
                                      planType: plan.type
                                    }),
                                  });
                                }

                                toast.success(t("ai.toast_success"), { id: toastId });
                              } catch (e) {
                                console.error(e);
                                toast.error(t("ai.toast_err"), { id: toastId });
                              }
                            }}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3 px-4 font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-emerald-200"
                          >
                            <CheckCircle2 size={16} /> {t("ai.btn_validate")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-3 bg-indigo-100/50 border border-indigo-200 text-indigo-700 py-4 px-4 rounded-xl">
                          <Loader2 size={16} className="animate-spin shrink-0" />
                          <div className="text-left">
                            <span className="block text-[11px] font-black uppercase tracking-widest">{t("expert.pending_title")}</span>
                            <span className="block text-[10px] font-bold opacity-70 mt-0.5">{t("expert.pending_desc")}</span>
                          </div>
                        </div>
                      )
                    ) : plan.reviewStatus === "COMPLETED" ? (
                      <div className="flex items-center justify-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 py-4 px-4 rounded-xl">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <div className="text-left">
                          <span className="block text-[11px] font-black uppercase tracking-widest">{t("expert.cert_title")}</span>
                          <span className="block text-[10px] font-bold opacity-70 mt-0.5">{t("expert.cert_desc")}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] font-black uppercase tracking-widest text-indigo-800/60 mb-3">{t("expert.sales_need")}</p>
                        <button 
                          onClick={() => setIsExpertSalesModalOpen(true)} 
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 px-4 font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-between group shadow-md shadow-indigo-200"
                        >
                          <span className="flex items-center gap-2">
                            <Check size={16} /> {t("expert.sales_btn")}
                          </span>
                          <span className="bg-indigo-800/30 px-2 py-1 rounded-md text-[10px]">{t("expert.sales_price")}</span>
                        </button>
                        <p className="text-[10px] text-indigo-800/50 font-bold mt-2 text-center leading-tight">
                          {t("expert.sales_desc")}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-[28px] p-6 flex gap-4 items-start shadow-sm animate-in fade-in">
             <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-1 shadow-inner">
                <Loader2 size={24} className="animate-spin" />
             </div>
             
             <div className="flex-1 min-w-0">
               <h3 className="font-black text-blue-900 text-lg leading-tight mb-2">{t("processing.title")}</h3>
               <p className="text-sm font-semibold text-blue-800/80 leading-relaxed">
                 {t("processing.desc")}
               </p>
               
               <div className="mt-4 flex items-start gap-3 bg-blue-100/50 border border-blue-200/60 p-4 rounded-2xl">
                 <div className="mt-0.5 text-blue-600 shrink-0">
                   <Phone size={16} />
                 </div>
                 <p className="text-xs font-bold text-blue-900 leading-snug">
                   {t("processing.phone_alert")}
                 </p>
               </div>
             </div>
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className={`w-14 h-14 ${isInsurance ? 'bg-blue-600' : isBank ? 'bg-emerald-600' : 'bg-primary'} rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0`}>
              {isInsurance ? <ShieldCheck size={28} /> : isBank ? <Coins size={28} /> : <Landmark size={28} />}
            </div>
            <div>
              {editConfig?.fieldPath === "institutionName" ? (
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-2 border border-blue-100 ring-4 ring-blue-500/10">
                  <InlineEditor 
                    type="text" 
                    currentValue={plan.institutionName} 
                    label={t("labels.institution")} 
                    onSave={(val: any) => handleUpdateDirect("institutionName", val, t("labels.institution"), plan.institutionName)} 
                    onCancel={() => setEditConfig(null)} 
                  />
                </div>
              ) : (
                <h1 
                  className={`text-2xl font-black text-slate-900 leading-tight flex items-center gap-2 group ${canEdit ? 'cursor-pointer hover:opacity-70' : ''}`}
                  onClick={() => {
                    const action = getEditAction(t("labels.institution"), plan.institutionName, "institutionName");
                    if (action) handleOpenEdit(action);
                  }}
                >
                  {plan.institutionName} {canEdit && <Edit2 size={16} className="text-slate-200 group-hover:text-blue-500 transition-colors" />}
                </h1>
              )}
              
              {isCreditXNative && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-1 bg-emerald-50 border border-emerald-100 rounded-full">
                  <ShieldCheck size={12} className="text-emerald-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{t("badges.certified")}</span>
                </div>
              )}
              <p className="text-slate-500 font-bold text-sm text-balance">
                {isPending && t("subtitles.new_prop")}
                {isProcessing && t("subtitles.processing")}
                {(!isPending && !isProcessing) && isLPP && t("subtitles.lpp_year", { year: d.Enter_anneeCertificat || "—" })}
                {(!isPending && !isProcessing) && isInsurance && t("subtitles.ins_start", { date: formatDateDisplay(d.dateDebut) || "—" })}
                {(!isPending && !isProcessing) && isBank && t("subtitles.bank_acc")}
              </p>
            </div>
          </div>
        </section>

        {isPending ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            
            <div className="bg-slate-900 text-white p-8 rounded-[32px] shadow-2xl relative overflow-hidden mt-2">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
              
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">{t("pending.prop_title")}</p>
                  <h2 className="text-3xl font-black tracking-tighter leading-none">{plan.institutionName}</h2>
                  <p className="text-sm font-bold text-slate-400 mt-2">
                    {isInsurance 
                      ? t("pending.desc_ins", { type: d.typeContrat?.toUpperCase() || '3A' })
                      : t("pending.desc_bank")}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-full ${isInsurance ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center shrink-0 border border-white/10`}>
                  {isInsurance ? <ShieldCheck size={24} /> : <Landmark size={24} />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 relative z-10">
                 <div>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{d.occurrence === 'annee' ? t("pending.prime_annual") : t("pending.prime_monthly")}</p>
                   <p className="text-3xl font-black tracking-tighter text-white">{formatCHF(d.primeTotale || d.montantRegulier)}</p>
                 </div>
                 <div>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{t("pending.start_date")}</p>
                   <p className="text-xl font-black text-white mt-1">{formatDateDisplay(d.dateDebut || d.startDate) || t("pending.start_now")}</p>
                 </div>
              </div>
            </div>

            <section className="space-y-3">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("pending.why_title")}</h3>
              <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100 p-2">
                
                {(isBank || d.primeEpargne > 0 || d.capitalRetraiteProjete > 0) && (
                  <div className="flex items-start gap-4 p-4 border-b border-slate-50">
                     <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                       <TrendingUp size={20} />
                     </div>
                     <div>
                       <p className="font-black text-slate-900">
                         {d.capitalRetraiteProjete > 0 ? t("pending.why_cap_proj", { amount: formatCHF(d.capitalRetraiteProjete) }) : t("pending.why_cap_build")}
                       </p>
                       <p className="text-[13px] font-bold text-slate-500 leading-snug mt-1 text-balance">
                         {d.isInvesti ? t("pending.why_invest_desc", { profil: d.profil || "" }) : t("pending.why_save_desc")}
                       </p>
                     </div>
                  </div>
                )}

                {isInsurance && d.hasLDP && (
                  <div className="flex items-start gap-4 p-4 border-b border-slate-50">
                     <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                       <ShieldCheck size={20} />
                     </div>
                     <div>
                       <p className="font-black text-slate-900">{t("pending.why_ldp")}</p>
                       <p className="text-[13px] font-bold text-slate-500 leading-snug mt-1 text-balance">
                         {t("pending.why_ldp_desc")}
                       </p>
                     </div>
                  </div>
                )}

                {isInsurance && d.renteInvalidite > 0 && (
                  <div className="flex items-start gap-4 p-4 border-b border-slate-50">
                     <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                       <Activity size={20} />
                     </div>
                     <div>
                       <p className="font-black text-slate-900">{t("pending.why_inv", { amount: formatCHF(d.renteInvalidite) })}</p>
                       <p className="text-[13px] font-bold text-slate-500 leading-snug mt-1 text-balance">
                         {t("pending.why_inv_desc")}
                       </p>
                     </div>
                  </div>
                )}

                {isInsurance && (d.capitalDecesFixe > 0 || d.typeCapitalDeces === 'primes') && (
                  <div className="flex items-start gap-4 p-4">
                     <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                       <Heart size={20} />
                     </div>
                     <div>
                       <p className="font-black text-slate-900">
                         {d.capitalDecesFixe > 0 ? t("pending.why_death", { amount: formatCHF(d.capitalDecesFixe) }) : t("pending.why_death_refund")}
                       </p>
                       <p className="text-[13px] font-bold text-slate-500 leading-snug mt-1 text-balance">
                         {t("pending.why_death_desc")}
                       </p>
                     </div>
                  </div>
                )}
              </div>
            </section>

            {(plan.documents && plan.documents.length > 0) && (
              <section className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("docs.title")}</h3>
                <div className="space-y-3">
                  {plan.documents.map((doc: any, i: number) => (
                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-5 bg-white rounded-[24px] shadow-sm border border-slate-100 hover:border-blue-300 transition-colors group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                          <FileText size={24} />
                        </div>
                        <div className="truncate">
                          <p className="font-black text-slate-900 text-sm truncate">{doc.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{t("docs.click_open")}</p>
                        </div>
                      </div>
                      <ExternalLink size={20} className="text-slate-300 group-hover:text-blue-500 shrink-0" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {(plan.requirements && plan.requirements.length > 0) && (
              <section className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("docs.req_title")}</h3>
                <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-orange-100 p-2">
                  <div className="p-3 bg-orange-50/50 rounded-[24px] mb-2 border border-orange-100 flex gap-3 text-orange-800">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <p className="text-[11px] font-bold leading-snug">{t("docs.req_alert")}</p>
                  </div>
                  {plan.requirements.map((req: any, idx: number) => (
                    <div key={idx} className={`p-4 flex items-center justify-between ${idx !== plan.requirements!.length - 1 ? 'border-b border-slate-50' : ''}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-400 flex items-center justify-center">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-sm">{req.title}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-tight">
                            {req.link ? t("docs.req_ext_link") : t("docs.req_call")}
                          </p>
                        </div>
                      </div>
                      {req.link ? (
                        <a href={req.link.startsWith('http') ? req.link : `https://${req.link}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-colors">
                          {t("docs.btn_open")}
                        </a>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase px-2">{t("docs.btn_eval")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="pt-8 pb-12 space-y-4">
              <button 
                onClick={handleAcceptClick}
                className="w-full py-6 bg-black hover:bg-slate-800 text-white font-black text-lg rounded-[24px] shadow-xl uppercase tracking-tighter transition-all active:scale-95 flex flex-col items-center justify-center"
              >
                {t("docs.btn_sign")}
              </button>
              
              <button 
                onClick={() => setIsRejectModalOpen(true)}
                className="w-full py-4 text-slate-400 hover:text-red-500 font-bold text-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <X size={16} /> {t("docs.btn_reject")}
              </button>
            </div>

          </div>
        ) : (
          /* ========================================================= */
          /* ================= MODE NORMAL : PLAN ACTIF ============== */
          /* ========================================================= */
          <>
            {isInsurance && (
              <>
                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.contract")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<ShieldCheck />} label={t("labels.contract_type")} value={d.typeContrat?.toUpperCase()} onClick={getEditAction(t("labels.contract_type"), d.typeContrat, "data.typeContrat", "select", OPTIONS_TYPE_CONTRAT)} mandatory />
                    <DetailRow icon={<Calendar />} label={t("labels.start_date")} value={formatDateDisplay(d.dateDebut)} onClick={getEditAction(t("labels.start_date"), d.dateDebut, "data.dateDebut")} mandatory />
                    <DetailRow icon={<Wallet />} label={t("labels.total_premium")} value={formatCHF(d.primeTotale)} sub={d.occurrence === 'mois' ? t("options.monthly") : t("options.yearly")} onClick={getEditAction(t("labels.total_premium"), d.primeTotale, "data.primeTotale")} mandatory />
                    <DetailRow icon={<History />} label={t("labels.frequency")} value={d.occurrence === 'annee' ? t("options.yearly") : t("options.monthly")} onClick={getEditAction(t("labels.frequency"), d.occurrence, "data.occurrence", "select", OPTIONS_FREQUENCE)} />
                    <DetailRow icon={<Coins />} label={t("labels.savings_part")} value={formatCHF(d.primeEpargne)} onClick={getEditAction(t("labels.savings_part"), d.primeEpargne, "data.primeEpargne")} />
                    <DetailRow icon={<TrendingUp />} label={t("labels.surrender_value")} value={formatCHF(d.valeurRachatActuelle)} onClick={getEditAction(t("labels.surrender_value"), d.valeurRachatActuelle, "data.valeurRachatActuelle")} mandatory />
                    <DetailRow icon={<Sparkles />} label={t("labels.insurer_projection")} value={d.projectionAssureur ? formatCHF(d.projectionAssureur) : null} sub={t("labels.insurer_projection_hint")} onClick={getEditAction(t("labels.insurer_projection"), d.projectionAssureur, "data.projectionAssureur")} last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.strategy")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<Activity />} label={t("labels.invested")} value={d.isInvesti ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.invested"), d.isInvesti, "data.isInvesti", "select", OPTIONS_BOOLEAN)} />
                    {d.isInvesti && <DetailRow icon={<TrendingUp />} label={t("labels.profile")} value={d.profil?.toUpperCase()} onClick={getEditAction(t("labels.profile"), d.profil, "data.profil", "select", OPTIONS_PROFIL)} />}
                    <DetailRow icon={<Lock />} label={t("labels.stopped")} value={d.isLibere ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.stopped"), d.isLibere, "data.isLibere", "select", OPTIONS_BOOLEAN)} />
                    <DetailRow icon={<ShieldCheck />} label={t("labels.pledged")} value={d.isEnGage ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.pledged"), d.isEnGage, "data.isEnGage", "select", OPTIONS_BOOLEAN)} />
                    <DetailRow icon={<Receipt />} label={t("labels.mandate")} value={d.hasMandatGestion ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.mandate"), d.hasMandatGestion, "data.hasMandatGestion", "select", OPTIONS_BOOLEAN)} last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.risks")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<Heart className="text-rose-500" />} label={t("labels.death_option")} value={d.typeCapitalDeces === 'primes' ? t("options.death_refund") : t("options.death_fixed")} onClick={getEditAction(t("labels.death_option"), d.typeCapitalDeces || 'fixe', "data.typeCapitalDeces", "select", OPTIONS_DECES)} />
                    {d.typeCapitalDeces !== 'primes' && (
                        <DetailRow icon={<Coins className="text-rose-400" />} label={t("labels.death_capital")} value={formatCHF(d.capitalDecesFixe)} onClick={getEditAction(t("labels.death_capital"), d.capitalDecesFixe, "data.capitalDecesFixe")} />
                    )}
                    <DetailRow icon={<Activity className="text-orange-500" />} label={t("labels.inv_pension")} value={formatCHF(d.renteInvalidite)} onClick={getEditAction(t("labels.inv_pension"), d.renteInvalidite, "data.renteInvalidite")} />
                    <DetailRow icon={<ShieldCheck className="text-blue-500" />} label={t("labels.ldp")} value={d.hasLDP ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.ldp"), d.hasLDP, "data.hasLDP", "select", OPTIONS_BOOLEAN)} last />
                  </div>
                </section>
              </>
            )}

            {isBank && (
              <>
                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.account")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<MapPin />} label={t("labels.account_num")} value={d.accountNumber} onClick={getEditAction(t("labels.account_num"), d.accountNumber, "data.accountNumber")} />
                    <DetailRow icon={<Calendar />} label={t("labels.open_date")} value={formatDateDisplay(d.startDate)} onClick={getEditAction(t("labels.open_date"), d.startDate, "data.startDate")} />
                    <DetailRow icon={<Wallet />} label={t("labels.current_balance")} value={formatCHF(d.soldeActuel)} onClick={getEditAction(t("labels.current_balance"), d.soldeActuel, "data.soldeActuel")} mandatory last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.deposits")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<History />} label={t("labels.regular_deposit")} value={d.isRegulier ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.regular_deposit"), d.isRegulier, "data.isRegulier", "select", OPTIONS_BOOLEAN)} last={!d.isRegulier} />
                    {d.isRegulier && (
                      <>
                        <DetailRow icon={<Coins />} label={t("labels.amount")} value={formatCHF(d.montantRegulier)} onClick={getEditAction(t("labels.amount"), d.montantRegulier, "data.montantRegulier")} />
                        <DetailRow icon={<Calendar />} label={t("labels.frequency")} value={d.occurrence === 'annee' ? t("options.yearly") : t("options.monthly")} onClick={getEditAction(t("labels.frequency"), d.occurrence, "data.occurrence", "select", OPTIONS_FREQUENCE)} last />
                      </>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.invest")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<Activity />} label={t("labels.invested_stock")} value={d.isInvesti ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.invested_stock"), d.isInvesti, "data.isInvesti", "select", OPTIONS_BOOLEAN)} />
                    {d.isInvesti && <DetailRow icon={<TrendingUp />} label={t("labels.profile_inv")} value={d.profil?.toUpperCase()} onClick={getEditAction(t("labels.profile_inv"), d.profil, "data.profil", "select", OPTIONS_PROFIL)} />}
                    <DetailRow icon={<Lock />} label={t("labels.pledged_nant")} value={d.isEnGage ? t("options.yes") : t("options.no")} onClick={getEditAction(t("labels.pledged_nant"), d.isEnGage, "data.isEnGage", "select", OPTIONS_BOOLEAN)} last />
                  </div>
                </section>
              </>
            )}

            {isLPP && (
              <>
                <section className="space-y-4">
                  <div className="bg-white rounded-[32px] p-2 shadow-sm border border-slate-50 overflow-hidden">
                    <DetailRow icon={<User />} label={t("labels.firstname")} value={d.Enter_prenom} onClick={getEditAction(t("labels.firstname"), d.Enter_prenom, "data.Enter_prenom")} mandatory />
                    <DetailRow icon={<User />} label={t("labels.lastname")} value={d.Enter_nom} onClick={getEditAction(t("labels.lastname"), d.Enter_nom, "data.Enter_nom")} mandatory />
                    <DetailRow icon={<ShieldCheck />} label={t("labels.avs_num")} value={d.Enter_noAVS} onClick={getEditAction(t("labels.avs_num"), d.Enter_noAVS, "data.Enter_noAVS")} />
                    <DetailRow icon={<Calendar />} label={t("labels.dob")} value={formatDateDisplay(d.Enter_dateNaissance)} onClick={getEditAction(t("labels.dob"), d.Enter_dateNaissance, "data.Enter_dateNaissance")} mandatory />
                    <DetailRow icon={<MapPin />} label={t("labels.fund_address")} value={d.Enter_adresseCaisse} onClick={getEditAction(t("labels.fund_address"), d.Enter_adresseCaisse, "data.Enter_adresseCaisse")} />
                    <DetailRow icon={<Landmark />} label={t("labels.employer")} value={d.Enter_employeur} onClick={getEditAction(t("labels.employer"), d.Enter_employeur, "data.Enter_employeur")} mandatory />
                    <DetailRow icon={<MapPin />} label={t("labels.employer_address")} value={d.Enter_adresseEmployeur} onClick={getEditAction(t("labels.employer_address"), d.Enter_adresseEmployeur, "data.Enter_adresseEmployeur")} last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.treatment")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<TrendingUp />} label={t("labels.occup_rate")} value={d.Enter_lppTauxActivite ? `${d.Enter_lppTauxActivite}%` : null} onClick={getEditAction(t("labels.occup_rate"), d.Enter_lppTauxActivite, "data.Enter_lppTauxActivite")} />
                    <DetailRow icon={<Wallet />} label={t("labels.annual_salary")} value={formatCHF(d.Enter_salaireAnnuel)} onClick={() => openInfo(t("labels.annual_salary"), formatCHF(d.Enter_salaireAnnuel), "Il s'agit de votre salaire brut annuel annoncé par votre employeur.", "data.Enter_salaireAnnuel", <Wallet size={32} />)} mandatory />
                    <DetailRow icon={<ShieldCheck />} label={t("labels.insured_savings")} value={formatCHF(d.Enter_salaireAssureLPP)} onClick={() => openInfo(t("labels.insured_savings"), formatCHF(d.Enter_salaireAssureLPP), "La part de votre salaire sur laquelle vous épargnez.", "data.Enter_salaireAssureLPP", <ShieldCheck size={32} />)} mandatory />
                    <DetailRow icon={<Activity />} label={t("labels.insured_risk")} value={formatCHF(d.Enter_lppSalaireAssureRisque)} onClick={getEditAction(t("labels.insured_risk"), d.Enter_lppSalaireAssureRisque, "data.Enter_lppSalaireAssureRisque")} mandatory last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.assets")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow 
                      icon={<Coins />} 
                      label={t("labels.total_assets")} 
                      value={formatCHF(d.Enter_avoirVieillesseTotal)} 
                      onClick={() => openInfo(
                        t("labels.total_assets"), 
                        formatCHF(d.Enter_avoirVieillesseTotal), 
                        "Le montant cumulé dans votre caisse de pension à ce jour, incluant vos cotisations, celles de l'employeur et les intérêts.", 
                        "data.Enter_avoirVieillesseTotal", 
                        <Coins size={32} />
                      )} 
                      mandatory 
                    />
                    <DetailRow 
                      icon={<History />} 
                      label={t("labels.vested_benefits")} 
                      value={formatCHF(d.Enter_lppAvoirObligatoire)} 
                      onClick={getEditAction(
                        t("labels.vested_benefits"), 
                        d.Enter_lppAvoirObligatoire, 
                        "data.Enter_lppAvoirObligatoire"
                      )} 
                      mandatory 
                      last 
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.projections")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <div className="p-5 border-b border-slate-50 bg-slate-50/30">
                      <div className="grid grid-cols-3 text-[10px] font-black uppercase text-slate-400 mb-2 px-2">
                        <span>{t("labels.age")}</span>
                        <span className="text-center">{t("labels.annual_rent")}</span>
                        <span className="text-right">{t("labels.capital")}</span>
                      </div>
                      
                      <div className="space-y-1">
                        {[65, 64, 63, 62, 61, 60, 59, 58].map((age) => {
                          const renteKey = age === 65 ? "Enter_rentevieillesseLPP65" : `Enter_rentevieillesseLPP${age}`;
                          const capitalKey = age === 65 ? "Enter_lppCapitalProjete65" : `Enter_prestationCapital${age}`;
                          
                          let renteVal = d[renteKey];
                          let capVal = d[capitalKey];

                          if (age === 65 && !capVal) {
                            capVal = d.capitalRetraiteGlobal || computeLPPProjectionRetraite(d, clientAge);
                          }

                          const is65Missing = age === 65 && (!renteVal || !capVal);
                          const isCalculatedByApp = age === 65 && !d[capitalKey] && capVal > 0;

                          return (
                            <div 
                              key={age}
                              className={`grid grid-cols-3 items-center p-2 rounded-xl transition-colors ${canEdit ? 'hover:bg-slate-50 cursor-pointer group' : ''} ${is65Missing ? 'bg-red-50' : ''}`}
                              onClick={() => {
                                const action = getEditAction(t("labels.proj_age", { age }), { rente: renteVal, capital: capVal }, `projections_${age}`);
                                if (action) handleOpenEdit(action);
                              }}
                            >
                              <span className="text-sm font-black text-slate-900">{age} ans</span>
                              <span className={`text-sm text-center font-bold ${!renteVal ? 'text-red-400 italic' : 'text-slate-600'}`}>
                                {formatCHF(renteVal) || "—"}
                              </span>
                              <div className="text-right">
                                <span className={`text-sm font-bold ${!capVal ? 'text-red-400 italic' : isCalculatedByApp ? 'text-blue-600 font-black' : 'text-slate-600'}`}>
                                    {formatCHF(capVal) || "—"}
                                </span>
                                {isCalculatedByApp && <p className="text-[7px] font-black text-blue-400 uppercase tracking-tighter -mt-1">{t("labels.estimated")}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.lpp_risks")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow icon={<Activity className="text-orange-500" />} label={t("labels.inv_illness")} value={formatCHF(d.Enter_renteInvaliditeMaladie)} onClick={getEditAction(t("labels.inv_illness"), d.Enter_renteInvaliditeMaladie, "data.Enter_renteInvaliditeMaladie")} mandatory />
                    <DetailRow icon={<Activity className="text-orange-300" />} label={t("labels.inv_accident")} value={formatCHF(d.Enter_lppRenteInvaliditeAccident)} onClick={getEditAction(t("labels.inv_accident"), d.Enter_lppRenteInvaliditeAccident, "data.Enter_lppRenteInvaliditeAccident")} mandatory />
                    <DetailRow icon={<User className="text-orange-500" />} label={t("labels.kid_illness")} value={formatCHF(d.Enter_renteEnfantInvalideMaladie)} onClick={getEditAction(t("labels.kid_illness"), d.Enter_renteEnfantInvalideMaladie, "data.Enter_renteEnfantInvalideMaladie")} />
                    <DetailRow icon={<User className="text-orange-300" />} label={t("labels.kid_accident")} value={formatCHF(d.Enter_renteEnfantInvalideAccident)} onClick={getEditAction(t("labels.kid_accident"), d.Enter_renteEnfantInvalideAccident, "data.Enter_renteEnfantInvalideAccident")} />
                    <DetailRow icon={<Heart className="text-rose-500" />} label={t("labels.spouse_illness")} value={formatCHF(d.Enter_renteConjointLPP)} onClick={getEditAction(t("labels.spouse_illness"), d.Enter_renteConjointLPP, "data.Enter_renteConjointLPP")} mandatory />
                    <DetailRow icon={<Heart className="text-rose-300" />} label={t("labels.spouse_accident")} value={formatCHF(d.Enter_lppRenteConjointAccident)} onClick={getEditAction(t("labels.spouse_accident"), d.Enter_lppRenteConjointAccident, "data.Enter_lppRenteConjointAccident")} mandatory />
                    <DetailRow icon={<User className="text-blue-500" />} label={t("labels.orphan_illness")} value={formatCHF(d.Enter_renteOrphelinLPP)} onClick={getEditAction(t("labels.orphan_illness"), d.Enter_renteOrphelinLPP, "data.Enter_renteOrphelinLPP")} mandatory />
                    <DetailRow icon={<User className="text-blue-300" />} label={t("labels.orphan_accident")} value={formatCHF(d.Enter_lppRenteOrphelinAccident)} onClick={getEditAction(t("labels.orphan_accident"), d.Enter_lppRenteOrphelinAccident, "data.Enter_lppRenteOrphelinAccident")} mandatory />
                    <DetailRow icon={<Coins className="text-emerald-500" />} label={t("labels.death_rent_illness")} value={formatCHF(d.Enter_CapitalPlusRenteMal)} onClick={getEditAction(t("labels.death_rent_illness"), d.Enter_CapitalPlusRenteMal, "data.Enter_CapitalPlusRenteMal")} mandatory />
                    <DetailRow icon={<Coins className="text-emerald-300" />} label={t("labels.death_rent_accident")} value={formatCHF(d.Enter_CapitalPlusRenteAcc)} onClick={getEditAction(t("labels.death_rent_accident"), d.Enter_CapitalPlusRenteAcc, "data.Enter_CapitalPlusRenteAcc")} mandatory />
                    <DetailRow icon={<Coins className="text-emerald-500" />} label={t("labels.death_only_illness")} value={formatCHF(d.Enter_CapitalAucuneRenteMal)} onClick={getEditAction(t("labels.death_only_illness"), d.Enter_CapitalAucuneRenteMal, "data.Enter_CapitalAucuneRenteMal")} mandatory />
                    <DetailRow icon={<Coins className="text-emerald-300" />} label={t("labels.death_only_accident")} value={formatCHF(d.Enter_CapitalAucuneRenteAcc)} onClick={getEditAction(t("labels.death_only_accident"), d.Enter_CapitalAucuneRenteAcc, "data.Enter_CapitalAucuneRenteAcc")} mandatory last />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.funding")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow 
                      icon={<Receipt />} 
                      label={t("labels.fund_emp_save")} 
                      value={formatCHF(d.Enter_lppCotisationEpargneEmploye)} 
                      onClick={() => openInfo(
                        t("labels.fund_emp_save"), 
                        formatCHF(d.Enter_lppCotisationEpargneEmploye), 
                        "Il s'agit de la part prélevée directement sur votre salaire pour alimenter votre capital de vieillesse.", 
                        "data.Enter_lppCotisationEpargneEmploye", 
                        <Receipt size={32} />
                      )} 
                      mandatory 
                    />
                    <DetailRow 
                      icon={<Receipt />} 
                      label={t("labels.fund_empr_save")} 
                      value={formatCHF(d.Enter_lppCotisationEpargneEmployeur)} 
                      onClick={() => openInfo(
                        t("labels.fund_empr_save"), 
                        formatCHF(d.Enter_lppCotisationEpargneEmployeur), 
                        "C'est la contribution de votre entreprise à votre prévoyance. Elle doit être au moins égale à la vôtre.", 
                        "data.Enter_lppCotisationEpargneEmployeur", 
                        <Receipt size={32} />
                      )} 
                      mandatory 
                    />
                    <DetailRow 
                      icon={<Activity />} 
                      label={t("labels.fund_emp_risk")} 
                      value={formatCHF(d.Enter_lppCotisationRisqueFraisEmploye)} 
                      onClick={() => openInfo(
                        t("labels.fund_emp_risk"), 
                        formatCHF(d.Enter_lppCotisationRisqueFraisEmploye), 
                        "Cette part finance la couverture en cas d'invalidité ou de décès, ainsi que les frais d'administration.", 
                        "data.Enter_lppCotisationRisqueFraisEmploye", 
                        <Activity size={32} />
                      )} 
                      mandatory 
                    />
                    <DetailRow 
                      icon={<Activity />} 
                      label={t("labels.fund_empr_risk")} 
                      value={formatCHF(d.Enter_lppCotisationRisqueFraisEmployeur)} 
                      onClick={() => openInfo(
                        t("labels.fund_empr_risk"), 
                        formatCHF(d.Enter_lppCotisationRisqueFraisEmployeur), 
                        "La participation de votre employeur aux frais d'assurance risque et de gestion de la caisse.", 
                        "data.Enter_lppCotisationRisqueFraisEmployeur", 
                        <Activity size={32} />
                      )} 
                      mandatory 
                      last 
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{t("sections.optimization")}</h3>
                  <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">
                    <DetailRow 
                      icon={<Coins />} 
                      label={t("labels.buyin")} 
                      value={formatCHF(d.Enter_lppRachatPossible)} 
                      onClick={() => openInfo(
                        t("labels.buyin"), 
                        formatCHF(d.Enter_lppRachatPossible), 
                        "Le rachat volontaire permet de combler des lacunes de prévoyance. Ce montant est entièrement déductible de votre impôt sur le revenu.", 
                        "data.Enter_lppRachatPossible", 
                        <Coins size={32} />
                      )} 
                      mandatory 
                    />
                    <DetailRow 
                      icon={<Wallet />} 
                      label={t("labels.epl")} 
                      value={formatCHF(d.Enter_lppEPLPossible)} 
                      onClick={() => openInfo(
                        t("labels.epl"), 
                        formatCHF(d.Enter_lppEPLPossible), 
                        "L'Encouragement à la Propriété Logement vous permet de retirer ce capital pour acheter votre résidence principale ou amortir votre hypothèque.", 
                        "data.Enter_lppEPLPossible", 
                        <Wallet size={32} />
                      )} 
                      mandatory 
                      last 
                    />
                  </div>
                </section>
              </>
            )}

            {/* ========================================================= */}
            {/* ======================= BAS DE PAGE ===================== */}
            {/* ========================================================= */}
            <section className="space-y-3 mt-8">
              <div className="flex justify-between items-center ml-2 pr-2">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t("sections.related_docs")}</h3>
                {!!adminUid && (
                  <button 
                    onClick={() => setIsUploaderOpen(true)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
                  >
                    {t("labels.btn_add_doc")}
                  </button>
                )}
              </div>
              <div className="bg-white rounded-[32px] p-4 shadow-sm border border-slate-50 space-y-2">
                {plan.documents?.map((doc: any, i: number) => (
                  <button 
                    key={i}
                    onClick={() => window.open(doc.url, "_blank")}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-[24px] transition-all group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-active:scale-90 transition-transform ${doc.isSigned ? 'text-green-500' : 'text-slate-900'}`}>
                        {doc.isSigned ? <CheckCircle2 size={24} /> : <Receipt size={24} />}
                      </div>
                      <div className="text-left">
                        <p className="text-[13px] font-black text-slate-900 truncate max-w-[180px]">{doc.name}</p>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">{doc.isSigned ? t("labels.doc_signed") : t("labels.doc_format")}</p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-colors">
                      <ExternalLink size={16} />
                    </div>
                  </button>
                ))}
                
                {(plan.metadata as any)?.sourceFileUrl && (
                  <div className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-[24px] transition-all group">
                    <button
                      onClick={() => window.open((plan.metadata as any).sourceFileUrl, "_blank")}
                      className="flex items-center space-x-4 flex-1 min-w-0 text-left"
                    >
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100 group-active:scale-90 transition-transform shrink-0">
                        <FileText size={24} />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate">
                          {(plan.metadata as any)?.sourceDocTitle || buildSourceDocTitle(plan.type, plan.institutionName)}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight truncate">
                          {(plan.metadata as any)?.sourceDocType || t("labels.doc_source")}
                        </p>
                        {Array.isArray((plan.metadata as any)?.sourceDocTags) && (plan.metadata as any).sourceDocTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(plan.metadata as any).sourceDocTags.map((tag: string) => (
                              <span key={tag} className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0 pl-2">
                      {!isProcessing && (
                        <button
                          onClick={() => setIsDocEditOpen(true)}
                          aria-label={t("labels.btn_edit_doc")}
                          className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => window.open((plan.metadata as any).sourceFileUrl, "_blank")}
                        aria-label={t("labels.btn_open_doc")}
                        className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-300 hover:text-slate-900 transition-colors"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {(!plan.documents || plan.documents.length === 0) && d.fileUrl && !(plan.metadata as any)?.sourceFileUrl && (
                  <button 
                    onClick={() => window.open(d.fileUrl, "_blank")}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-[24px] transition-all group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 shadow-sm border border-slate-100 group-active:scale-90 transition-transform">
                        <Receipt size={24} />
                      </div>
                      <div className="text-left">
                        <p className="text-[13px] font-black text-slate-900">{t("labels.doc_linked")}</p>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">{t("labels.doc_format")}</p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-colors">
                      <ExternalLink size={16} />
                    </div>
                  </button>
                )}
              </div>
            </section>

            {(!isCreditXNative || !!adminUid) && !isProcessing && ( 
              <div className="pt-4 pb-12">
                <button 
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="w-full py-5 flex items-center justify-center space-x-2 text-red-500 font-bold bg-red-50 hover:bg-red-100 rounded-[28px] active:scale-95 transition-all font-inter"
                >
                  <Trash2 size={18} />
                  <span>{t("labels.btn_delete")}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      </div> 

      {isEditOpen && editConfig && plan.id && !isPending && !isProcessing && (
        <EditAmountDrawer 
          isOpen={isEditOpen} 
          onClose={() => setIsEditOpen(false)} 
          planId={plan.id}
          fieldPath={editConfig.fieldPath}
          label={editConfig.label}
          value={editConfig.value}
          institutionName={plan.institutionName}
          adminUid={targetUid} 
          plan={plan}            // 👈 AJOUT
          clientAge={clientAge}  // 👈 AJOUT
        />
      )}

      {activeInfo && (
        <InfoDrawer 
          isOpen={isInfoOpen}
          onClose={() => setIsInfoOpen(false)}
          onEdit={canEdit ? triggerEditFromInfo : undefined}
          title={activeInfo.title}
          value={activeInfo.value}
          definition={activeInfo.definition}
          icon={activeInfo.icon}
        />
      )}

      <SignatureModal 
        isOpen={isSignatureOpen} 
        onClose={() => setIsSignatureOpen(false)} 
        onConfirm={processSignature} 
        loading={loadingSignature} 
      />

      <RejectModal 
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onConfirm={handleRejectSubmit}
        loading={loadingReject}
      />

      <ExpertSalesModal 
        isOpen={isExpertSalesModalOpen} 
        onClose={() => setIsExpertSalesModalOpen(false)} 
        plan={plan} 
        targetUid={targetUid} 
      />

      <CertifiedWarningModal 
        isOpen={isCertifiedWarningOpen} 
        onClose={() => setIsCertifiedWarningOpen(false)} 
        status={plan.reviewStatus || ""} 
        onConfirm={() => {
          setIsCertifiedWarningOpen(false);
          if (pendingEditConfig) {
            setEditConfig(pendingEditConfig);
            // 👈 PATCH : On transmet la demande de forçage après validation
            if (pendingEditConfig.fieldPath.startsWith("projections_") || pendingEditConfig.forceDrawer) {
              setIsEditOpen(true);
            }
          }
        }} 
      />

      {isUploaderOpen && targetUid && (
        <DocumentUploaderModal
          isOpen={isUploaderOpen}
          onClose={() => setIsUploaderOpen(false)}
          clientUid={targetUid}
          onUploadSuccess={handleDocumentAdded}
        />
      )}

      {isDocEditOpen && plan.id && (
        <EditSourceDocDrawer
          isOpen={isDocEditOpen}
          onClose={() => setIsDocEditOpen(false)}
          planId={plan.id}
          adminUid={adminUid}
          initialTitle={(plan.metadata as any)?.sourceDocTitle || buildSourceDocTitle(plan.type, plan.institutionName)}
          initialType={(plan.metadata as any)?.sourceDocType || ""}
          initialTags={Array.isArray((plan.metadata as any)?.sourceDocTags) ? (plan.metadata as any).sourceDocTags : []}
        />
      )}

      <DeletePlanModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeletePlan}
        status={plan.reviewStatus || ""}
      />

    </>
    </EditContext.Provider>
  );
}

// =========================================================================
// ==================== COMPOSANT MODAL DE REFUS ===========================
// =========================================================================
function RejectModal({ isOpen, onClose, onConfirm, loading }: { isOpen: boolean, onClose: () => void, onConfirm: (reason: string, details: string) => void, loading: boolean }) {
  const t = useTranslations("PlanDetailsView");
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState<string>("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">{t("modals.reject_title")}</h3>
            <p className="text-sm font-bold text-slate-500 mt-1">{t("modals.reject_subtitle")}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${reason === 'Trop cher' ? 'border-red-500 bg-red-50' : 'border-slate-100 hover:border-slate-300'}`}>
            <input type="radio" name="reject_reason" value="Trop cher" checked={reason === 'Trop cher'} onChange={(e) => setReason(e.target.value)} className="w-5 h-5 accent-red-500" />
            <span className={`font-black ${reason === 'Trop cher' ? 'text-red-900' : 'text-slate-700'}`}>{t("modals.rej_expensive")}</span>
          </label>

          <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${reason === 'Pas besoin' ? 'border-red-500 bg-red-50' : 'border-slate-100 hover:border-slate-300'}`}>
            <input type="radio" name="reject_reason" value="Pas besoin" checked={reason === 'Pas besoin'} onChange={(e) => setReason(e.target.value)} className="w-5 h-5 accent-red-500" />
            <span className={`font-black ${reason === 'Pas besoin' ? 'text-red-900' : 'text-slate-700'}`}>{t("modals.rej_no_need")}</span>
          </label>

          <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${reason === 'Autre' ? 'border-red-500 bg-red-50' : 'border-slate-100 hover:border-slate-300'}`}>
            <input type="radio" name="reject_reason" value="Autre" checked={reason === 'Autre'} onChange={(e) => setReason(e.target.value)} className="w-5 h-5 accent-red-500" />
            <span className={`font-black ${reason === 'Autre' ? 'text-red-900' : 'text-slate-700'}`}>{t("modals.rej_other")}</span>
          </label>
        </div>

        {reason === 'Autre' && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-2">
            <textarea 
              placeholder={t("modals.rej_placeholder")}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20 resize-none h-24"
            ></textarea>
          </div>
        )}

        <button
          disabled={loading || !reason || (reason === 'Autre' && !details)}
          onClick={() => onConfirm(reason, details)}
          className="w-full py-4 bg-red-500 text-white rounded-full font-black uppercase tracking-widest text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquareWarning size={18} />}
          {loading ? t("modals.rej_btn_loading") : t("modals.rej_btn")}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// ==================== COMPOSANT MODAL DE SIGNATURE =======================
// =========================================================================
function SignatureModal({ isOpen, onClose, onConfirm, loading }: { isOpen: boolean, onClose: () => void, onConfirm: (b64: string) => void, loading: boolean }) {
  const t = useTranslations("PlanDetailsView");
  const sigCanvas = useRef<any>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[32px] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">{t("modals.sign_title")}</h3>
          <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 flex gap-3 text-blue-800 mb-6">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold leading-snug">{t("modals.sign_info")}</p>
        </div>

        <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 overflow-hidden mb-6 relative">
          <SignatureCanvas
            ref={sigCanvas}
            penColor="black"
            canvasProps={{ className: "w-full h-48 cursor-crosshair touch-none" }}
          />
        </div>

        <div className="flex justify-between items-center gap-4">
          <button onClick={() => sigCanvas.current?.clear()} className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
            {t("modals.sign_clear")}
          </button>
          <button
            disabled={loading}
            onClick={() => {
              if (sigCanvas.current?.isEmpty()) {
                toast.error(t("toasts.err_sign_no_doc")); // Réutilisation du toast générique d'erreur au cas où, ou un toast spécifique
                return;
              }
              onConfirm(sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png'));
            }}
            className="px-6 py-4 bg-black text-white rounded-full font-black uppercase tracking-widest text-sm hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {loading ? t("modals.sign_btn_loading") : t("modals.sign_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ========================= HELPER : DETAIL ROW ===========================
// =========================================================================
function DetailRow({ icon, label, value, sub, onClick, mandatory, last = false }: { icon: any, label: string, value: string | null, sub?: string, onClick?: any, mandatory?: boolean, last?: boolean }) {
  const context = React.useContext(EditContext);
  const t = context?.t; // Récupère `t` du contexte
  
  const isMissing = mandatory && (!value || value === "—");
  const isEditObj = onClick && typeof onClick === 'object' && onClick.actionType === 'EDIT';
  const fieldPath = isEditObj ? onClick.fieldPath : null;
  const isEditing = fieldPath && context?.editConfig?.fieldPath === fieldPath && !fieldPath.startsWith("projections_");

  if (isEditing) {
    let type = onClick.type;
    if (!type) {
      const isDate = fieldPath.toLowerCase().includes("date") || label.toLowerCase().includes("date");
      const isNumber = !isDate && (fieldPath.toLowerCase().includes("taux") || label.toLowerCase().includes("année") || label.toLowerCase().includes("age"));
      type = isDate ? "date" : isNumber ? "number" : "text";
    }

    return (
      <InlineEditor 
        type={type} 
        options={onClick.options}
        currentValue={onClick.value} 
        label={label} 
        onSave={(val: any) => context.handleUpdateDirect(fieldPath, val, label, onClick.value)} 
        onCancel={() => context.setEditConfig(null)} 
      />
    );
  }

  const handleClick = () => {
    if (typeof onClick === 'function') onClick();
    else if (isEditObj && context) {
      if (fieldPath.startsWith("projections_")) {
         context.handleOpenEdit(onClick); 
      } else {
         context.setEditConfig(onClick); 
      }
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`flex items-center justify-between p-5 transition-colors 
        ${onClick ? 'active:bg-slate-50 cursor-pointer' : ''} 
        ${!last ? 'border-b border-slate-50' : ''} 
        ${isMissing ? 'bg-red-50/50' : ''}`}
    >
      <div className="flex items-center space-x-4 overflow-hidden">
        <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${isMissing ? 'bg-red-100 text-red-500' : 'bg-slate-50 text-slate-400'}`}>
          {React.cloneElement(icon, { size: 18 })}
        </div>
        <div className="text-left overflow-hidden pr-2">
          <p className={`text-[11px] font-bold uppercase tracking-tight leading-none mb-1 ${isMissing ? 'text-red-500' : 'text-slate-400'}`}>
            {label} {mandatory && "*"}
          </p>
          <p className={`text-[15px] font-black leading-tight truncate ${isMissing ? 'text-red-900 italic' : 'text-slate-900'}`}>
            {value || t?.("labels.to_complete") || "À compléter"}
          </p>
          {sub && <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-none">{sub}</p>}
        </div>
      </div>
      {onClick && <Edit2 size={14} className={`shrink-0 ${isMissing ? "text-red-400" : "text-slate-200"}`} />}
    </div>
  );
}

// ----------------------------------------------------
// COMPOSANT INLINE (Auto-scroll Clavier Mobile)
// ----------------------------------------------------
function InlineEditor({ type, currentValue, options, label, onSave, onCancel }: any) {
  const context = React.useContext(EditContext);
  const t = context?.t; // Récupère `t` du contexte
  
  const [val, setVal] = useState(currentValue !== undefined && currentValue !== null ? currentValue : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type !== 'select') {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;
    if (type === "date" && text.includes("-")) {
      const parts = text.split("-");
      if (parts.length === 3) text = `${parts[2]}.${parts[1]}.${parts[0]}`;
    } else if (type === "date" && typeof normalizeDateMask === "function") {
      text = normalizeDateMask(text);
    }
    setVal(text);
  };

  let displayVal = val;
  if (type === "date" && typeof val === "string" && val.includes(".")) {
    const parts = val.split(".");
    if (parts.length === 3) displayVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return (
    <div className="p-4 bg-slate-50/50 border-b border-slate-50 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-bold uppercase text-[#1a4f8a] leading-none">{label}</span>
      </div>
      
      {type === 'select' && options ? (
        <div className="flex flex-col gap-2 mt-2">
          {options.map((opt: any) => (
            <button
              key={String(opt.id)}
              onClick={(e) => { e.stopPropagation(); onSave(opt.id); }}
              className={`py-3 px-4 rounded-xl text-sm font-bold border text-left transition-all ${
                String(currentValue) === String(opt.id)
                  ? 'bg-[#1a4f8a] text-white border-[#1a4f8a]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#1a4f8a]'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex justify-end mt-1">
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2">{t?.("labels.cancel") || "Annuler"}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
            value={displayVal}
            onChange={handleChange}
            placeholder={type === 'date' ? 'JJ.MM.AAAA' : ''}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1a4f8a]"
          />
          <div className="flex justify-end gap-2">
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2 transition-colors hover:text-slate-600">{t?.("labels.cancel") || "Annuler"}</button>
            <button onClick={(e) => { e.stopPropagation(); onSave(val); }} className="text-[11px] font-black uppercase bg-[#1a4f8a] text-white px-4 py-2 rounded-lg transition-transform active:scale-95 shadow-sm shadow-blue-900/20">{t?.("labels.save") || "Enregistrer"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ==================== COMPOSANT MODAL DE VENTE EXPERT ====================
// =========================================================================
function ExpertSalesModal({ isOpen, onClose, plan, targetUid }: { isOpen: boolean, onClose: () => void, plan: ExtendedPlan, targetUid: string | undefined }) {
  const t = useTranslations("PlanDetailsView");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (!targetUid || !plan.id) return;
    setLoading(true);
    const toastId = toast.loading(t("toasts.exp_loading"));
    
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Non connecté");
      
      const idToken = await user.getIdToken();
      const response = await fetch("/api/stripe/checkout-lpp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ planId: plan.id, institutionName: plan.institutionName }),
      });

      const data = await response.json();
      
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error || "Erreur inconnue");
    } catch (error) {
      console.error("Erreur paiement:", error);
      toast.error(t("toasts.exp_err_start"), { id: toastId });
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500">
        
        <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-black p-8 pb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[80px] opacity-30 -translate-y-1/2 translate-x-1/2"></div>
          
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors z-10 backdrop-blur-md">
            <X size={16} />
          </button>

          <div className="relative z-10 flex flex-col items-center text-center mt-2">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-blue-500/30 mb-5 border border-white/20">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight mb-2">{t("modals.exp_title")}</h2>
            <p className="text-indigo-200 text-sm font-bold max-w-[280px] leading-relaxed">
              {t("modals.exp_desc")}
            </p>
          </div>
        </div>

        <div className="px-8 pt-8 pb-6 bg-white -mt-6 rounded-t-[40px] relative z-20 space-y-6">
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">{t("modals.exp_feat1_title")}</h4>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  {t("modals.exp_feat1_desc")}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">{t("modals.exp_feat2_title")}</h4>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  {t("modals.exp_feat2_desc")}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Phone size={20} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">{t("modals.exp_feat3_title")}</h4>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  {t("modals.exp_feat3_desc")}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button 
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-5 bg-black hover:bg-slate-800 text-white rounded-full font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-slate-900/20"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> {t("modals.exp_btn_loading")}</>
              ) : (
                <>{t("modals.exp_btn")} <Lock size={16} className="opacity-50 ml-1" /></>
              )}
            </button>
            
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Lock size={12} /> {t("modals.exp_secure")}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ================== COMPOSANT MODAL AVERTISSEMENT CERTIFIÉ ===============
// =========================================================================
function CertifiedWarningModal({ isOpen, onClose, onConfirm, status }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, status: string }) {
  const t = useTranslations("PlanDetailsView");
  
  if (!isOpen) return null;

  const isPending = status === "PENDING";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="bg-white w-full max-w-md rounded-[32px] px-8 py-10 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 relative overflow-hidden">
        
        <div className={`absolute top-0 left-0 right-0 h-40 ${isPending ? 'bg-indigo-50/50 border-indigo-100' : 'bg-emerald-50/50 border-emerald-100'} border-b`}></div>
        
        <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 bg-white/60 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-500 hover:bg-white transition-colors z-20 shadow-sm">
          <X size={18} />
        </button>

        <div className="relative z-10 flex flex-col items-center text-center mt-6 mb-10">
          <div className={`w-20 h-20 bg-white rounded-[24px] flex items-center justify-center ${isPending ? 'text-indigo-500 shadow-indigo-500/20 border-indigo-100' : 'text-emerald-500 shadow-emerald-500/20 border-emerald-100'} shadow-2xl mb-6 border`}>
            {isPending ? <Loader2 size={36} className="animate-spin" /> : <ShieldCheck size={36} />}
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-3">
            {isPending ? t("modals.cert_pend_title") : t("modals.cert_done_title")}
          </h3>
          
          <p className="text-[15px] font-bold text-slate-500 leading-relaxed px-2">
            {isPending 
              ? <>{t("modals.cert_pend_desc").split(' ')[0]} {t("modals.cert_pend_desc").split(' ')[1]} <span className="text-indigo-600">{t("modals.cert_pend_desc").split(' ').slice(2, 6).join(' ')}</span> {t("modals.cert_pend_desc").split(' ').slice(6).join(' ')}</>
              : <>{t("modals.cert_done_desc").split(' ')[0]} {t("modals.cert_done_desc").split(' ')[1]} {t("modals.cert_done_desc").split(' ')[2]} {t("modals.cert_done_desc").split(' ')[3]} <span className="text-emerald-600">{t("modals.cert_done_desc").split(' ').slice(4).join(' ')}</span></>
            }
          </p>
        </div>

        <div className="relative z-10 bg-amber-50 border border-amber-200 rounded-3xl p-6 mb-10 shadow-sm">
          <div className="flex items-start gap-4">
            <AlertTriangle size={24} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[14px] font-bold text-amber-800 leading-relaxed">
              {isPending 
                ? t("modals.cert_pend_warn")
                : t("modals.cert_done_warn")
              }
            </p>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <button
            onClick={onClose}
            className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20"
          >
            {isPending ? t("modals.cert_btn_wait") : t("modals.cert_btn_keep")}
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-4 text-slate-400 hover:text-slate-600 font-bold text-[13px] uppercase tracking-widest transition-colors"
          >
            {t("modals.cert_btn_edit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ================== COMPOSANT MODAL SUPPRESSION PLAN =====================
// =========================================================================
function DeletePlanModal({ isOpen, onClose, onConfirm, status }: { isOpen: boolean, onClose: () => void, onConfirm: (reason: string) => void, status: string }) {
  const t = useTranslations("PlanDetailsView");
  const [reason, setReason] = useState("");
  useEffect(() => { if (!isOpen) setReason(""); }, [isOpen]);

  if (!isOpen) return null;

  const isCertifiedOrPending = status === "COMPLETED" || status === "PENDING";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="bg-white w-full max-w-md rounded-[32px] px-8 py-10 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 relative overflow-hidden">
        
        <div className="absolute top-0 left-0 right-0 h-40 bg-red-50/50 border-red-100 border-b"></div>
        
        <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 bg-white/60 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-500 hover:bg-white transition-colors z-20 shadow-sm">
          <X size={18} />
        </button>

        <div className="relative z-10 flex flex-col items-center text-center mt-6 mb-8">
          <div className="w-20 h-20 bg-white rounded-[24px] flex items-center justify-center text-red-500 shadow-red-500/20 border-red-100 shadow-2xl mb-6 border">
            <Trash2 size={36} />
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-3">
            {t("modals.del_title")}
          </h3>
          
          <p className="text-[15px] font-bold text-slate-500 leading-relaxed px-2">
            {t("modals.del_desc")}
          </p>
        </div>

        {isCertifiedOrPending && (
          <div className="relative z-10 bg-red-50 border border-red-200 rounded-3xl p-6 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <AlertTriangle size={24} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[14px] font-bold text-red-800 leading-relaxed">
                <strong className="block mb-1">{t("modals.del_warn_title")}</strong>
                {t("modals.del_warn_desc").split(' ').slice(0, 15).join(' ')} <strong className="text-red-900">{t("modals.del_warn_desc").split(' ').slice(15).join(' ')}</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="relative z-10 mb-6">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">Raison de la suppression</p>
          <div className="flex gap-3">
            {[{ id: "test", label: "Test" }, { id: "erreur", label: "Erreur" }].map((o) => (
              <button
                key={o.id}
                onClick={() => setReason(o.id)}
                className={`flex-1 py-3 rounded-2xl font-black text-sm border transition-all ${reason === o.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason}
            className={`w-full py-5 rounded-full font-black uppercase tracking-widest text-[13px] transition-all active:scale-95 ${reason ? "bg-red-500 text-white hover:bg-red-600 shadow-xl shadow-red-500/20" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
          >
            {t("modals.del_btn_confirm")}
          </button>
          <button
            onClick={onClose}
            className="w-full py-4 text-slate-400 hover:text-slate-600 font-bold text-[13px] uppercase tracking-widest transition-colors"
          >
            {t("modals.del_btn_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}