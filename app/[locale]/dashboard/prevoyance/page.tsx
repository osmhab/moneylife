//app/[locale]/dashboard/prevoyance/page.tsx
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Landmark, Trash2, TrendingUp, Wallet, Coins, AlertTriangle, Search, BarChart2, ShieldCheck, HeartPulse, Lock, ChevronRight, Loader2, UserPlus, FileText, Building2, User, Globe, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Firebase Client
import { storage, auth, db } from "@/lib/firebase/index";
import { buildSourceDocTitle } from "@/lib/core/documentTypes";
import { ref, uploadBytes } from "firebase/storage";
import { doc, onSnapshot, collection, addDoc, query, orderBy, deleteDoc, setDoc, where } from "firebase/firestore";
import { jsPDF } from "jspdf";

// 👈 NOUVEAU : Import des traductions
import { useTranslations, useLocale } from "next-intl";

// Imports composants
import { Plan } from "@/lib/core/plans"; 
import PlanSelectorModal from "app/components/plans/PlanSelectorModal";
import LppInstructionStep from "./_components/LppInstructionStep";
import UploadSourceDrawer from "./_components/UploadSourceDrawer";
import ScanningStep from "./_components/ScanningStep";
import PlanDetailsView from "./_components/PlanDetailsView";
import DocumentCropper from "./_components/DocumentCropper";
import ProfileDrawer from "./_components/ProfileDrawer";
import PersonalDataView from "./_components/PersonalDataView";
import { computeProjections3aBanque, computeProjections3aAssurance, computeDeathBenefitAssurance } from "@/lib/calculs/3epilier";
import { computeLPPProjectionRetraite } from "lib/shared/calculs/lpp";
import FortuneAnalysisDrawer from "./_components/FortuneAnalysisDrawer";
import SubscriptionWizardDrawer from "./_components/SubscriptionWizardDrawer";

import SituationPrevoyancePage from "./_components/SituationPrevoyancePage";
import { usePrevoyanceAnalysis } from "@/lib/hooks/usePrevoyanceAnalysis";
import { X, Image as ImageIcon } from "lucide-react"; 

type Step = "LIST" | "INSTRUCTIONS" | "STAGING" | "SCAN";

// 👈 NOUVEAU : La page devient un composant réutilisable (pour le client ET pour l'admin)
export function PrevoyanceDashboardView({ adminUid }: { adminUid?: string }) {
  const t = useTranslations("PrevoyancePage");
  const locale = useLocale();

  // La règle d'or de l'Impersonation :
  const targetUid = adminUid || auth.currentUser?.uid;
  // Si on est l'admin, les boutons "Plus" doivent rediriger vers les dossiers admin !
  const basePath = adminUid ? `/admin/client/${adminUid}/prevoyance` : '/dashboard/prevoyance';

  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [analysisInitialSlide, setAnalysisInitialSlide] = useState<string>("overview"); 
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [currentAnalysisData, setCurrentAnalysisData] = useState<any>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [userName, setUserName] = useState("Utilisateur");
  const [clientAge, setClientAge] = useState(35);
  const [clientInfo, setClientInfo] = useState<any>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  const [currentStep, setCurrentStep] = useState<Step>("LIST");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPersonalDataOpen, setIsPersonalDataOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null); // 👈 NOUVEAU
  
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileToCrop, setFileToCrop] = useState<File | null>(null); // 👈 NOUVEAU
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  // 👈 NOUVELLE FONCTION : Intercepte la photo HD
  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileToCrop(e.target.files[0]); // Envoie au recadreur
    }
    e.target.value = ''; // Reset
  };

  
  
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const scrollToSlide = (index: number) => {
    if (scrollRef.current) {
      isProgrammaticScroll.current = true; 
      setActiveIndex(index); 
      
      const width = scrollRef.current.offsetWidth;
      scrollRef.current.scrollTo({ left: width * index, behavior: 'smooth' });

      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 600);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lowerQuery = searchQuery.toLowerCase();
    
    let allDocs: any[] = [];
    plans.forEach((plan: any) => { 
       if (plan.documents) {
         plan.documents.forEach((d:any) => allDocs.push({ name: d.name, url: d.url, planName: plan.institutionName }));
       }
       if (plan.metadata?.sourceFileUrl) {
         allDocs.push({ name: t("search_orig_doc"), url: plan.metadata.sourceFileUrl, planName: plan.institutionName });
       }
       if (plan.data?.fileUrl && (!plan.documents || plan.documents.length === 0) && !plan.metadata?.sourceFileUrl) {
         allDocs.push({ name: plan.data?.fileName || t("search_imported_doc"), url: plan.data.fileUrl, planName: plan.institutionName });
       }
    });
    
    return allDocs.filter(d => d.name.toLowerCase().includes(lowerQuery) || d.planName?.toLowerCase().includes(lowerQuery)).slice(0, 4);
  }, [searchQuery, plans, t]);

  const { analysis } = usePrevoyanceAnalysis(targetUid, plans, clientAge);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isProgrammaticScroll.current) return; 
    
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const index = Math.round(scrollLeft / width);
    if (index !== activeIndex) setActiveIndex(index);
  };

  useEffect(() => {
    // 👈 MAJ : On écoute le dossier cible (targetUid)
    if (!targetUid) { setLoading(false); return; }

    const q = query(collection(db, "clients", targetUid, "plans"), orderBy("metadata.createdAt", "desc"));
    const unsubPlans = onSnapshot(q, (snapshot) => {
      const plansList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Plan[];
      setPlans(plansList);
      setLoading(false);

      const autoOpenId = sessionStorage.getItem("autoOpenPlanId");
      if (autoOpenId && plansList.some(p => p.id === autoOpenId)) {
        setSelectedPlanId(autoOpenId);
        sessionStorage.removeItem("autoOpenPlanId"); 
      }
    });

    // Écoute des données métier
    const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
    const unsubProfile = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setClientInfo(d); 
        setUserName(d.Enter_prenom || "Utilisateur");
        if (d.Enter_dateNaissance) {
            const parts = d.Enter_dateNaissance.split('.');
            if (parts.length === 3) setClientAge(new Date().getFullYear() - parseInt(parts[2]));
        }
      }
    });

    // 👈 NOUVEAU : Écoute du document racine pour la photo de profil (Temps Réel)
    const rootClientRef = doc(db, "clients", targetUid);
    const unsubRoot = onSnapshot(rootClientRef, (snap) => {
      if (snap.exists() && snap.data().photoURL) {
        setPhotoURL(snap.data().photoURL);
      }
    });

    const qNotifs = query(collection(db, "clients", targetUid, "notifications"), where("read", "==", false));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      setHasUnreadNotifs(!snap.empty);
    });

    return () => { unsubPlans(); unsubProfile(); unsubRoot(); unsubNotifs(); };
  }, [targetUid]);

  // NOUVEAU : Auto-scroll vers l'onglet privé si spécifié dans l'URL
  useEffect(() => {
    if (!loading && scrollRef.current) {
      // On utilise tabParam (réactif) au lieu de window.location.search
      if (tabParam === "prive") {
        setTimeout(() => {
          scrollToSlide(1);
        }, 300);
      }
    }
  }, [loading, tabParam]); // 👈 Le secret est ici : on écoute tabParam !

  const handlePlanTypeSelection = (planId: string) => {
    setIsSelectorOpen(false);
    if (planId === "LPP_BASE") { setCurrentStep("INSTRUCTIONS"); return; } 
    // 👈 MAJ : Utilisation de basePath pour que le routeur sache si c'est l'Admin ou le Client qui clique
    if (planId === "PILIER_3A_POLICE") { router.push(`${basePath}/add-insurance`); return; }
    if (planId === "3A_BANQUE" || planId === "PILIER_3A_BANK") { router.push(`${basePath}/add-bank`); return; }
    
    if (planId === "NEW_3A_OFFER") {
      sessionStorage.setItem("clientAnalysis", JSON.stringify(analysis));
      router.push(`${basePath}/new-3a`); 
      return;
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setPendingFiles(prev => [...prev, ...files]);
    setIsSourceOpen(false);
    setCurrentStep("STAGING"); 
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 👈 NOUVELLE FONCTION : Générateur de PDF
  // 🌟 VERSION ULTRA-ROBUSTE : Conserve la résolution 4K native pour l'OCR de Gemini
  const createPdfFromImages = async (imageFiles: File[]): Promise<File> => {
    return new Promise((resolve, reject) => {
      let pdf: jsPDF | null = null;
      let loadedImages = 0;

      imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(event) {
          const img = new Image();
          img.onload = function() {
            // On utilise la dimension RÉELLE en pixels de la photo comme taille de page
            const widthInPixels = img.width;
            const heightInPixels = img.height;

            if (index === 0) {
              // On initialise le PDF avec les dimensions exactes de la première image
              pdf = new jsPDF({
                orientation: widthInPixels > heightInPixels ? "landscape" : "portrait",
                unit: "px",
                format: [widthInPixels, heightInPixels]
              });
            } else if (pdf) {
              // Pour les pages suivantes, on ajoute une page sur-mesure pour chaque image
              pdf.addPage([widthInPixels, heightInPixels], widthInPixels > heightInPixels ? "l" : "p");
            }

            if (pdf) {
              // Injection sans aucune déformation ni perte de qualité (Compression NONE)
              pdf.addImage(
                img.src, 
                'JPEG', 
                0, 
                0, 
                widthInPixels, 
                heightInPixels, 
                index.toString(), 
                'NONE' // 👈 Changement clé : On désactive la compression 'FAST' qui pixellisait
              );
            }
            
            loadedImages++;
            if (loadedImages === imageFiles.length && pdf) {
              const pdfBlob = pdf.output("blob");
              resolve(new File([pdfBlob], "Certificat_LPP_Scanne.pdf", { type: "application/pdf" }));
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
    const user = auth.currentUser; 
    if (pendingFiles.length === 0 || !user || !targetUid) return;
    
    setCurrentStep("SCAN");
    
    try {
      let finalFileToUpload: File;
      let sourceFileType = "LPP_SCAN_MULTI";

      // 🌟 CORRECTION CRITIQUE : Routage intelligent selon le type de document
      if (pendingFiles.length === 1 && pendingFiles[0].type === "application/pdf") {
        // Cas A : C'est un vrai fichier PDF natif déjà prêt -> On l'utilise tel quel
        finalFileToUpload = pendingFiles[0];
        sourceFileType = "LPP_PDF_NATIVE";
      } else {
        // Cas B : Ce sont des photos/images -> On les fusionne en PDF HD sans perte de pixels
        finalFileToUpload = await createPdfFromImages(pendingFiles);
      }
      
      // 2. On upload le fichier final sur Firebase Storage
      const safeName = sourceFileType === "LPP_PDF_NATIVE" ? pendingFiles[0].name : "Certificat_LPP_Scanne.pdf";
      const filePath = `clients/${targetUid}/lpp_raw/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, finalFileToUpload);

      // On crée le tableau de chemins pour notre API Gemini réécrite
      const uploadedFilePaths = [filePath];

      const idToken = await user.getIdToken();
      
      // 3. Appel de notre route d'API Gemini structurée
      const response = await fetch("/api/lpp/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ 
          filePath: uploadedFilePaths[0], 
          allPaths: uploadedFilePaths 
        }),
      });
      
      const resData = await response.json();
      if (!response.ok || !resData.jobId) { 
        toast.error(t("toast_scan_err")); 
        setPendingFiles([]); 
        setCurrentStep("LIST"); 
        return; 
      }

      setActiveJobId(resData.jobId);
      
      // 4. Écoute en temps réel de l'état du Job d'extraction
      const jobDocRef = doc(db, "clients", targetUid, "lpp_jobs", resData.jobId);
      const unsubscribeJob = onSnapshot(jobDocRef, async (snap) => {
        const data = snap.data();
        if (data?.status === "DONE_FAST") {
            unsubscribeJob();
            const plansRef = collection(db, "clients", targetUid, "plans");
            const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");

            const projectionLPP = computeLPPProjectionRetraite(data.clientMappedData, clientAge);

            // On récupère l'URL publique de téléchargement pour l'ajouter aux métadonnées
            import("firebase/storage").then(async ({ getDownloadURL }) => {
              const downloadUrl = await getDownloadURL(storageRef);

              const newPlanDoc = await addDoc(plansRef, {
                type: "LPP_BASE",
                institutionName: data.institutionName || "Caisse de pension",
                data: {
                  ...data.clientMappedData,
                  capitalRetraiteGlobal: projectionLPP 
                },
                metadata: {
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  isManualEntry: false,
                  sourceFile: sourceFileType, // "LPP_PDF_NATIVE" ou "LPP_SCAN_MULTI"
                  sourceFileUrl: downloadUrl, // Lien d'accès au document d'origine pour le client et le CRM
                  // Classification IA du document scanné (affichée/éditable dans le coffre)
                  sourceDocType: data.documentType || "Certificat LPP",
                  sourceDocTags: Array.isArray(data.suggestedTags) ? data.suggestedTags : [],
                  sourceDocKeywords: Array.isArray(data.keywords) ? data.keywords : [],
                  sourceDocTitle: buildSourceDocTitle("LPP_BASE", data.institutionName),
                }
              });

              await setDoc(profileRef, { 
                Enter_lppScanDone: true, 
                Enter_lppScanDate: new Date(),
                lastLppPlanId: newPlanDoc.id,
                Enter_prenom: data.clientMappedData.Enter_prenom || "Utilisateur",
                Enter_nom: data.clientMappedData.Enter_nom || ""
              }, { merge: true });

              setSelectedPlanId(newPlanDoc.id);
              setPendingFiles([]); 
              setCurrentStep("LIST");
              toast.success(t("toast_lpp_success"));
            });
          }
      });
    } catch (error) { 
        console.error(error); 
        setPendingFiles([]);
        setCurrentStep("LIST");
        toast.error(t("toast_scan_tech_err"));
    }
  };

  const handleDeletePlan = async (e: React.MouseEvent, planId: string) => {
    e.stopPropagation();
    if (!targetUid || !confirm(t("confirm_del_plan"))) return;
    
    try {
      await deleteDoc(doc(db, "clients", targetUid, "plans", planId));
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), {
        _lastPlanUpdateTrigger: serverTimestamp()
      });
      toast.success(t("toast_del_success"));
    } catch (error) {
      console.error(error);
      toast.error(t("toast_del_err"));
    }
  };

  const isProfileComplete = () => {
    if (!clientInfo) return false;
    const isSexeMissing = clientInfo.Enter_sexe === undefined || clientInfo.Enter_sexe === null || clientInfo.Enter_sexe === "";
    const isEtatCivilMissing = clientInfo.Enter_etatCivil === undefined || clientInfo.Enter_etatCivil === null || clientInfo.Enter_etatCivil === "";
    
    return !!(
      clientInfo.Enter_prenom && 
      clientInfo.Enter_nom && 
      clientInfo.Enter_dateNaissance && 
      clientInfo.Enter_salaireAnnuel && 
      !isSexeMissing && 
      !isEtatCivilMissing
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black text-white font-black uppercase tracking-tighter">{t("loading")}</div>;

  const profileComplete = isProfileComplete();

  const lppPlans = plans.filter(p => p.type === "LPP_BASE");
  const privatePlans = plans.filter(p => p.type !== "LPP_BASE");

  const headerGradients = [
    "bg-[#0a2342]/20",
    "bg-[#3d0a32]/20", 
    "bg-[#031d16]/20",
    "bg-[#111827]/30"
  ];

  const handleOpenAnalysis = (targetSection: string = "overview") => {
    setAnalysisInitialSlide(targetSection);
    setIsAnalysisOpen(true);
  };

  const handleSubscribe = (analysisData: any) => {
    setCurrentAnalysisData(analysisData);
    setIsAnalysisOpen(false);
    setTimeout(() => {
      setIsWizardOpen(true);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelection} accept="image/*,application/pdf" />

      {currentStep === "LIST" && (
        <div className="h-screen flex flex-col">
          
          <div className={`px-6 pt-12 pb-4 flex items-center space-x-4 sticky top-0 z-50 transition-colors duration-500 ${profileComplete ? headerGradients[activeIndex] : 'bg-[#111827]/30'} backdrop-blur-xl border-b border-white/5`}>
            <div onClick={() => setIsProfileOpen(true)} className="relative shrink-0 cursor-pointer active:scale-90 transition-transform">
              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white/80 overflow-hidden shadow-sm">
                <img 
                  src={photoURL || `https://api.dicebear.com/7.x/rings/svg?seed=${targetUid || userName}&radius=25`} 
                  alt="User" 
                  className="w-full h-full object-cover"
                />
              </div>
              {hasUnreadNotifs && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 border-2 border-slate-900 rounded-full shadow-md z-10 animate-pulse" />
              )}
            </div>
            
            {profileComplete ? (
              <>
                <div className="flex-1 relative">
                  <Search 
                    size={16} 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 cursor-pointer hover:text-white transition-colors" 
                    onClick={() => {
                      if (searchQuery.trim().length > 0) {
                        router.push(`/dashboard/documents?search=${encodeURIComponent(searchQuery)}`);
                      }
                    }}
                  />
                  <input 
                    type="text"
                    placeholder={t("ph_search")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim().length > 0) {
                        router.push(`/dashboard/documents?search=${encodeURIComponent(searchQuery)}`);
                      }
                    }}
                    className="w-full bg-white/10 backdrop-blur-md text-white rounded-full py-2.5 pl-10 pr-4 text-sm font-bold shadow-inner outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-white/30 border border-white/10"
                  />
                  
                  {searchQuery.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-3 bg-[#111827]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                      {searchResults.length > 0 ? (
                        <div className="p-2">
                          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40">{t("search_docs_pdf")}</div>
                          {searchResults.map((doc, idx) => (
                            <a 
                              key={idx} 
                              href={`/api/document?url=${encodeURIComponent(doc.url)}&name=${encodeURIComponent(doc.name)}`}
                              target="_blank"
                              className="flex items-center gap-3 px-3 py-3 hover:bg-white/5 rounded-2xl transition-colors group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                                <FileText size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate">{doc.name}</p>
                                <p className="text-[10px] font-bold text-white/50 truncate uppercase tracking-widest">{doc.planName}</p>
                              </div>
                              <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 shrink-0" />
                            </a>
                          ))}
                        </div>
                      ) : (
                         <div className="p-6 text-center text-white/50 text-xs font-bold">{t("search_no_results", { query: searchQuery })}</div>
                      )}
                      
                      <button 
                        onClick={() => router.push(`/dashboard/documents?search=${encodeURIComponent(searchQuery)}`)}
                        className="w-full p-4 bg-white/5 hover:bg-white/10 text-xs font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border-t border-white/5"
                      >
                        {t("search_see_all")} <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => handleOpenAnalysis("overview")}
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-md border border-white/10 active:scale-90 transition-transform shrink-0"
                >
                  <BarChart2 size={20} />
                </button>
              </>
            ) : (
              <div className="flex-1 text-center">
                <span className="text-white/50 text-xs font-black uppercase tracking-widest">{t("personal_space")}</span>
              </div>
            )}
          </div>

          {profileComplete && (
            <div className={`px-4 sm:px-6 pb-6 pt-4 sticky top-[72px] z-40 transition-colors duration-500 ${headerGradients[activeIndex]} backdrop-blur-xl border-b border-white/5`}>
              <div className="flex bg-white/5 backdrop-blur-md p-1 rounded-full border border-white/10">
                <button 
                  onClick={() => scrollToSlide(0)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeIndex === 0 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  <Building2 size={14} /> {t("tab_lpp")}
                </button>
                <button 
                  onClick={() => scrollToSlide(1)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeIndex === 1 ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  <User size={14} /> {t("tab_private")}
                </button>
                <button 
                  onClick={() => scrollToSlide(2)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeIndex === 2 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  <Globe size={14} /> {t("tab_global")}
                </button>
                <button 
                  onClick={() => scrollToSlide(3)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeIndex === 3 ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  <Activity size={14} /> {t("tab_analysis")}
                </button>
              </div>
            </div>
          )}

          {!profileComplete ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 animate-in fade-in slide-in-from-bottom-8 duration-700 bg-gradient-to-b from-[#111827] to-black">
              <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mb-8 relative border border-blue-500/20">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping opacity-50"></div>
                <UserPlus size={40} className="text-blue-400" />
              </div>
              
              <h2 className="text-3xl font-black text-white tracking-tight mb-4 text-center text-balance">{t("welcome_title")}</h2>
              <p className="text-slate-400 text-sm font-bold text-center mb-10 max-w-sm leading-relaxed text-balance">
                {t("welcome_desc")}
              </p>

              <Button 
                onClick={() => setIsPersonalDataOpen(true)}
                className="w-full max-w-sm py-8 bg-white text-black hover:bg-slate-100 rounded-[24px] font-black text-lg uppercase tracking-widest shadow-[0_20px_50px_rgba(255,255,255,0.1)] transition-all active:scale-95"
              >
                {t("btn_complete_profile")}
              </Button>
            </div>
          ) : (
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-x-auto snap-x snap-mandatory flex scrollbar-hide bg-black"
            >
              <CategoryPage 
                t={t} locale={locale}
                title={t("cat_lpp_title")}
                amountLabel={t("cat_lpp_lbl")}
                plans={lppPlans}
                clientAge={clientAge}
                gradient="from-black via-[#1a4f8a] to-[#1a4f8a]"
                onAdd={() => setIsSelectorOpen(true)}
                onSelectPlan={(id: string) => setSelectedPlanId(id)}
                onDeletePlan={handleDeletePlan}
                searchQuery={searchQuery}
                activeIndex={activeIndex}
              />

              <CategoryPage 
                t={t} locale={locale}
                title={t("cat_private_title")}
                amountLabel={t("cat_private_lbl")}
                plans={privatePlans}
                clientAge={clientAge}
                gradient="from-black via-[#6b0f55] to-[#C7129E]" 
                onAdd={() => setIsSelectorOpen(true)}
                onSelectPlan={(id: string) => setSelectedPlanId(id)}
                onDeletePlan={handleDeletePlan}
                searchQuery={searchQuery}
                activeIndex={activeIndex}
              />

              <CategoryPage 
                t={t} locale={locale}
                title={t("cat_global_title")}
                amountLabel={t("cat_global_lbl")}
                plans={plans}
                clientAge={clientAge}
                gradient="from-black via-[#043d2c] to-[#043d2c]"
                onAdd={() => setIsSelectorOpen(true)}
                onSelectPlan={(id: string) => setSelectedPlanId(id)}
                onDeletePlan={handleDeletePlan}
                searchQuery={searchQuery}
                activeIndex={activeIndex}
              />

              <SituationPrevoyancePage 
                gradient="from-black via-[#111827] to-[#111827]"
                analysis={analysis}
                activeIndex={activeIndex}
                onOpenSection={(sectionId) => handleOpenAnalysis(sectionId)} 
                onImprove={() => {
                  sessionStorage.setItem("clientAnalysis", JSON.stringify(analysis));
                  router.push("/dashboard/prevoyance/new-3a");
                }}
                onAdd={() => {
                  sessionStorage.setItem("clientAnalysis", JSON.stringify(analysis));
                  router.push("/dashboard/prevoyance/new-3a");
                }}
              />
            </div>
          )}
        </div>
      )}

      {currentStep === "INSTRUCTIONS" && <LppInstructionStep onBack={() => setCurrentStep("LIST")} onNext={() => setIsSourceOpen(true)} />}
      
      {currentStep === "STAGING" && (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB] px-6 pt-12 pb-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Documents prêts ({pendingFiles.length})</h2>
            <button onClick={() => { setPendingFiles([]); setCurrentStep("LIST"); }} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-500 shadow-sm"><X size={20}/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pb-8">
            {pendingFiles.map((file, index) => (
              <div key={index} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon size={24} />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-900 text-sm truncate">Page {index + 1}</p>
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
              onClick={() => setIsSourceOpen(true)}
              className="w-full py-6 mt-4 border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-blue-500 transition-colors active:scale-95"
            >
              <Plus size={24} />
              <span className="font-black text-sm">Ajouter une autre page</span>
            </button>
          </div>

          <div className="pt-4 space-y-3">
            <Button 
              onClick={handleProcessScan}
              disabled={pendingFiles.length === 0}
              className="w-full h-16 rounded-[24px] bg-black text-white font-black text-lg shadow-xl uppercase tracking-tighter transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Terminer et analyser <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      )}

      {currentStep === "SCAN" && (
        <ScanningStep 
          jobId={activeJobId || undefined} 
          targetUid={adminUid || auth.currentUser?.uid} 
        />
      )}
      
      {selectedPlanId && plans.find(p => p.id === selectedPlanId) && (
        <PlanDetailsView 
          plan={plans.find(p => p.id === selectedPlanId)!} 
          onClose={() => setSelectedPlanId(null)} 
          adminUid={adminUid} // 👈 LA PIÈCE MANQUANTE EST ICI !
        />
      )}

      <PlanSelectorModal isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} onSelect={handlePlanTypeSelection} />
      
      {/* 👈 L'INPUT CACHÉ POUR LA CAMÉRA NATIVE HD */}
      <input type="file" accept="image/*" capture="environment" className="hidden" ref={scannerInputRef} onChange={handleNativeCameraCapture} />
      
      {/* 👈 ROUTAGE INTELLIGENT DU TIROIR */}
      <UploadSourceDrawer 
        isOpen={isSourceOpen} 
        onClose={() => setIsSourceOpen(false)} 
        onSourceSelect={(source) => {
          setIsSourceOpen(false);
          if (source === "camera") {
            scannerInputRef.current?.click(); // Ouvre la caméra native !
          } else {
            fileInputRef.current?.click(); // Ouvre la galerie/fichiers
          }
        }} 
      />
      <ProfileDrawer
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onOpenDetails={() => {
          setIsProfileOpen(false);
          setIsPersonalDataOpen(true);
        }}
        userName={userName}
        targetUid={adminUid} // 👈 CORRECTION ICI : On ne passe la variable que si c'est vraiment un Admin
      />
      {/* 👈 MAJ : Ajout du adminUid juste ici ! */}
      <PersonalDataView isOpen={isPersonalDataOpen} onClose={() => setIsPersonalDataOpen(false)} adminUid={adminUid} />
      
      <FortuneAnalysisDrawer 
        isOpen={isAnalysisOpen} 
        onClose={() => setIsAnalysisOpen(false)} 
        plans={plans}
        clientInfo={clientInfo}
        onSubscribe={handleSubscribe}
        clientAge={clientAge}
        onOpenProfile={() => { setIsAnalysisOpen(false); setIsPersonalDataOpen(true); }}
        initialSlide={analysisInitialSlide}
        adminUid={targetUid} 
      />
      
      <SubscriptionWizardDrawer 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        analysisData={currentAnalysisData}
        adminUid={adminUid}
      />

      {/* 👈 L'ÉTAPE DE RECADRAGE MANUEL POUR LPP */}
      {fileToCrop && (
        <DocumentCropper
          file={fileToCrop}
          onCancel={() => setFileToCrop(null)}
          onComplete={(croppedFile) => {
            setPendingFiles(prev => [...prev, croppedFile]); // Ajoute la page recadrée
            setFileToCrop(null);
            setCurrentStep("STAGING"); // Passe à l'étape suivante
          }}
        />
      )}

    </div>
  );
}

function CategoryPage({ t, locale, amountLabel, plans, clientAge, gradient, onAdd, onSelectPlan, onDeletePlan, searchQuery, activeIndex }: any) {
  
  const filteredPlans = plans.filter((p: any) => 
    p.institutionName?.toLowerCase().includes(searchQuery.toLowerCase()) &&
    p.status !== "REJECTED_CLIENT"
  );

  const pendingPlans = filteredPlans.filter((p: any) => p.status === "PENDING_CLIENT" || p.status === "PENDING_INSURANCE");
  const activePlans = filteredPlans.filter((p: any) => p.status !== "PENDING_CLIENT" && p.status !== "PENDING_INSURANCE");

  const totals = activePlans.reduce((acc: any, p: any) => {
    const d = p.data || {};
    const isLPP = p.type === "LPP_BASE";
    const isBank = p.type === "PILIER_3A_BANK" || p.type === "3A_BANQUE";
    
    if (isLPP) {
      acc.current += Number(d.Enter_avoirVieillesseTotal) || 0;
      acc.capital65 += Number(d.capitalRetraiteGlobal) || Number(d.Enter_lppCapitalProjete65) || 0;
      acc.rente65 += Number(d.Enter_rentevieillesseLPP65) || 0;
      acc.epl += Number(d.Enter_lppEPLPossible) || 0;
      acc.rachat += Number(d.Enter_lppRachatPossible) || 0;
      acc.invalidite += Number(d.Enter_renteInvaliditeMaladie) || 0;
      acc.deces += Number(d.Enter_CapitalPlusRenteMal) || 0;
    } else {
      acc.current += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      acc.capital65 += isBank ? computeProjections3aBanque(d, clientAge) : computeProjections3aAssurance(d, clientAge);
      acc.epl += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      acc.invalidite += Number(d.renteInvalidite) || 0;
      if (isBank) {
        acc.deces += Number(d.soldeActuel) || 0;
      } else {
        acc.deces += computeDeathBenefitAssurance(d);
      }
    }

    return acc;
  }, { capital65: 0, rente65: 0, epl: 0, rachat: 0, invalidite: 0, deces: 0, current: 0 });

  const formatCHF = (val: number) => {
    const localeString = locale === 'de' ? 'de-CH' : 'fr-CH';
    return new Intl.NumberFormat(localeString, { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 })
    .format(val).replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ').replace('CHF', 'CHF ');
  };

  return (
    <div className={`h-full w-screen snap-center flex-shrink-0 flex flex-col bg-gradient-to-b ${gradient} overflow-y-auto pb-24`}>
      
      <div className="px-6 pt-8 pb-12 text-center animate-in fade-in duration-700">
        <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest mb-1">{amountLabel}</p>
        <h1 className="text-4xl font-black text-white tracking-tighter mb-8 drop-shadow-xl">{formatCHF(totals.current)}</h1>
        
        <div className="flex flex-col items-center gap-6">
          <Button onClick={onAdd} className="w-16 h-16 rounded-full bg-white text-black p-0 flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-all hover:bg-slate-100">
            <Plus size={28} className="stroke-[3px]" />
          </Button>
        </div>
      </div>

      <div className="px-6 space-y-6 flex-1">
        
        {pendingPlans.length > 0 && (
          <div className="mb-8 space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t("pending_docs_lbl", { count: pendingPlans.length })}</p>
            </div>
            {pendingPlans.map((p: any) => {
              const isProcessing = p.status === "PENDING_INSURANCE";
              return (
              <div key={p.id} className="relative animate-in fade-in slide-in-from-top-4 duration-500">
                <div className={`absolute -inset-0.5 bg-gradient-to-r ${isProcessing ? 'from-blue-400 to-cyan-300' : 'from-orange-400 to-amber-300'} rounded-[34px] blur opacity-30 animate-pulse`}></div>
                <Card 
                  onClick={() => onSelectPlan(p.id)} 
                  className={`relative p-6 border ${isProcessing ? 'border-blue-200' : 'border-orange-200'} shadow-xl rounded-[32px] bg-white flex items-center space-x-4 active:scale-95 transition-all cursor-pointer overflow-hidden`}
                >
                  <div className={`w-14 h-14 ${p.type === "PILIER_3A_BANK" ? (isProcessing ? 'bg-blue-100 text-blue-500' : 'bg-orange-100 text-orange-500') : (isProcessing ? 'bg-cyan-100 text-cyan-500' : 'bg-amber-100 text-amber-500')} rounded-2xl flex items-center justify-center shrink-0`}>
                    {p.type === "PILIER_3A_BANK" ? <Landmark size={28} /> : <ShieldCheck size={28} />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-slate-900 text-lg leading-tight truncate">{p.institutionName}</h4>
                    <div className="flex flex-col gap-1 mt-1">
                      <span className={`${isProcessing ? 'text-blue-600' : 'text-orange-600'} text-[10px] font-black uppercase tracking-widest flex items-center gap-1`}>
                        {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />} 
                        {isProcessing ? t("status_processing") : t("status_action_req")}
                      </span>
                      <span className="text-slate-400 text-[10px] font-bold">{t("lbl_premium_monthly", { amount: formatCHF(p.data?.primeTotale || p.data?.montantRegulier || 0) })}</span>
                    </div>
                  </div>
                  <ChevronRight size={24} className={isProcessing ? "text-blue-300" : "text-orange-300"} />
                </Card>
              </div>
            )})}
          </div>
        )}

        {activePlans.length === 0 && pendingPlans.length === 0 ? (
          <div className="py-16 text-center bg-white/5 backdrop-blur-sm rounded-[40px] border border-white/10 border-dashed flex flex-col items-center justify-center">
             <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-4 text-white/20"><Landmark size={24} /></div>
             <p className="text-white/20 font-black uppercase text-[9px] tracking-widest">{t("empty_waiting_docs")}</p>
          </div>
        ) : (
          activePlans.map((p: any) => {
            const d = p.data || {};
            const isNanti = d.isEnGage === true;
            const isReviewPending = p.reviewStatus === "PENDING";
            const isReviewCompleted = p.reviewStatus === "COMPLETED";

            return (
              <div key={p.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card onClick={() => onSelectPlan(p.id)} className={`p-6 border ${isReviewPending ? 'border-indigo-300 shadow-indigo-100/50' : 'border-white/10'} shadow-2xl rounded-[32px] bg-white/95 backdrop-blur-md flex items-center space-x-4 active:scale-95 transition-all cursor-pointer group`}>
                  <div className={`w-14 h-14 ${p.type === "LPP_BASE" ? 'bg-slate-900' : p.type === "PILIER_3A_POLICE" ? 'bg-indigo-600' : 'bg-emerald-600'} rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0`}>
                    {p.type === "LPP_BASE" ? <Landmark size={28} /> : p.type === "PILIER_3A_BANK" ? <Coins size={28} /> : <ShieldCheck size={28} />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-slate-900 text-lg leading-tight truncate">{p.institutionName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">{p.type === "LPP_BASE" ? t("badge_pro") : t("badge_private")}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                      
                      {isNanti ? (
                        <span className="flex items-center gap-1 text-orange-600 text-[9px] font-black uppercase tracking-widest">
                          <Lock size={10} className="stroke-[3px]" /> {t("badge_pledged")}
                        </span>
                      ) : isReviewPending ? (
                        <span className="flex items-center gap-1 text-indigo-600 text-[9px] font-black uppercase tracking-widest">
                          <Loader2 size={10} className="animate-spin" /> {t("badge_review_pending")}
                        </span>
                      ) : isReviewCompleted ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-[9px] font-black uppercase tracking-widest">
                          <ShieldCheck size={10} className="stroke-[3px]" /> {t("badge_certified")}
                        </span>
                      ) : (
                        <span className="text-emerald-500 text-[9px] font-black uppercase tracking-widest">{t("badge_active")}</span>
                      )}

                    </div>
                  </div>
                  {p.status !== "ACTIVE" && (
                    <button onClick={(e) => onDeletePlan(e, p.id)} className="p-2 text-slate-200 hover:text-red-500 transition-colors">
                      <Trash2 size={18}/>
                    </button>
                  )}
                </Card>
              </div>
            );
          })
        )}

        <div className="bg-white/95 backdrop-blur-md rounded-[35px] p-2 shadow-2xl mb-12 border border-white/20 mt-8">
          <div className="px-5 py-4 border-b border-slate-100/50">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {activeIndex === 2 ? t("totals_global_wealth") : t("totals_proj_prot")}
             </p>
          </div>
          <MiniRow label={t("tot_proj_cap_65")} value={formatCHF(totals.capital65)} icon={<TrendingUp size={16} />} iconBg="bg-blue-50 text-blue-500" />
          {totals.rente65 > 0 && <MiniRow label={t("tot_rent_lpp_65")} value={formatCHF(totals.rente65)} icon={<BarChart2 size={16} />} iconBg="bg-indigo-50 text-indigo-500" />}
          {totals.epl > 0 && <MiniRow label={t("tot_withdraw_immo")} value={formatCHF(totals.epl)} icon={<Wallet size={16} />} iconBg="bg-orange-50 text-orange-500" />}
          {totals.rachat > 0 && <MiniRow label={t("tot_buyin_lpp")} value={formatCHF(totals.rachat)} icon={<Coins size={16} />} iconBg="bg-emerald-50 text-emerald-500" />}
          <MiniRow label={t("tot_rent_inv_pa")} value={formatCHF(totals.invalidite)} icon={<AlertTriangle size={16} />} iconBg="bg-amber-50 text-amber-500" />
          <MiniRow label={t("tot_death_cap")} value={formatCHF(totals.deces)} icon={<HeartPulse size={16} />} iconBg="bg-rose-50 text-rose-500" last />
        </div>
      </div>
    </div>
  );
}

function MiniRow({ label, value, icon, iconBg, last = false }: any) {
  return (
    <div className={`p-5 flex items-center justify-between ${!last ? 'border-b border-slate-100/50' : ''}`}>
      <div className="flex items-center space-x-4">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shadow-sm`}>{icon}</div>
        <span className="text-[12px] font-bold text-slate-500">{label}</span>
      </div>
      <span className="text-[16px] font-bold text-slate-900 tracking-tight">{value}</span>
    </div>
  );
}

// 👈 NOUVEAU : Le composant Page officiel appelé par Next.js pour l'espace Client
export default function PrevoyancePage() {
  return <PrevoyanceDashboardView />;
}