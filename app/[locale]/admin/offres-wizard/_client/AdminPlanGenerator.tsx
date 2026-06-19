//app/admin/offres-wizard/_client/AdminPlanGenerator.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { db, storage } from "app/lib/firebase/index"; 
import { collection, addDoc, doc, updateDoc, serverTimestamp, getDoc, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { X, Landmark, ShieldCheck, Link as LinkIcon, AlertCircle, FileText, UploadCloud, Loader2, Trash2, CheckCircle2, CalendarDays, Percent, User, UserCheck, MapPin, CheckSquare, MessageSquareWarning, XCircle, Sparkles } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { compareInsuranceWithOffer, ComparatifOffreReelle } from "app/lib/calculs/3epilier";
import ComparatifDashboard from "app/[locale]/dashboard/prevoyance/_components/ComparatifDashboard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import SignaturePositioner, { SignatureArea } from "./SignaturePositioner";


// --- MOTEUR ACTUARIEL ---
function calculatePredictedRate(model: any, age: number, isSmoker: boolean, isFemale: boolean, floor: number = 1.0) {
  if (!model || !Array.isArray(model.beta) || model.beta.length < 4) return Math.exp(model?.fallbackLogMean || -5);
  const logRate = model.beta[0] * 1 + model.beta[1] * age + model.beta[2] * (isSmoker ? 1 : 0) + model.beta[3] * (isFemale ? 1 : 0);
  let rate = Math.exp(logRate);
  if (isSmoker && floor > 1.0) {
    const rateNonSmoker = Math.exp(model.beta[0] * 1 + model.beta[1] * age + model.beta[2] * 0 + model.beta[3] * (isFemale ? 1 : 0));
    rate = Math.max(rate, rateNonSmoker * floor);
  }
  return rate;
}

// --- HELPERS UI ---
const fmt = new Intl.NumberFormat('fr-CH');

function InputGroup({ label, placeholder, value, onChange, type = "text", icon }: any) {
  return (
    <div className="relative group min-w-0">
      <div className="absolute left-5 top-3 text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none pointer-events-none transition-colors group-focus-within:text-blue-500">{label}</div>
      {icon && <div className="absolute left-5 top-[30px] text-slate-400">{icon}</div>}
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`w-full bg-slate-50/50 border border-slate-100 rounded-2xl pt-7 pb-3 pr-5 font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${icon ? 'pl-12' : 'pl-5'}`} />
    </div>
  );
}

function SegmentedToggle({ value, onChange, small = false, options = [{ label: 'OUI', value: true }, { label: 'NON', value: false }] }: any) {
    return (
      <div className={`flex bg-slate-100 rounded-full p-1 ${small ? 'w-32' : 'w-full'}`}>
        {options.map((opt: any) => (
            <button key={String(opt.value)} type="button" onClick={() => onChange(opt.value)} className={`flex-1 py-2 text-[10px] font-black rounded-full transition-all ${value === opt.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{opt.label}</button>
        ))}
      </div>
    );
}

interface AdminPlanGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  clientUid: string;
  requestId: string;
  editingPlan?: any; 
}

export default function AdminPlanGenerator({ isOpen, onClose, clientUid, requestId, editingPlan }: AdminPlanGeneratorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  
  const [clientInfo, setClientInfo] = useState<any>(null);

  const [planType, setPlanType] = useState<"assurance" | "banque">("assurance");
  const [contractType, setContractType] = useState<"3a" | "3b">("3a");
  const [institution, setInstitution] = useState("");
  
  const [primeTotale, setPrimeTotale] = useState("");
  const [occurrence, setOccurrence] = useState<"mois" | "annee">("mois");
  const [dateDebut, setDateDebut] = useState("");
  const [isEnGage, setIsEnGage] = useState(false);
  const [isInvesti, setIsInvesti] = useState(false);
  const [profil, setProfil] = useState("equilibre");

  const [primeEpargne, setPrimeEpargne] = useState("");
  const [capitalRetraiteProjete, setCapitalRetraiteProjete] = useState(""); 
  const [valeurRachatActuelle, setValeurRachatActuelle] = useState("");
  const [isLibere, setIsLibere] = useState(false);
  const [hasLDP, setHasLDP] = useState(true);
  const [renteInv, setRenteInv] = useState("");
  const [typeCapitalDeces, setTypeCapitalDeces] = useState<"fixe" | "primes">("fixe");
  const [capitalDecesFixe, setCapitalDecesFixe] = useState("");
  const [hasMandatGestion, setHasMandatGestion] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [soldeActuel, setSoldeActuel] = useState("");
  const [isRegulier, setIsRegulier] = useState(true);

  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [isPositionerOpen, setIsPositionerOpen] = useState(false);
  const [pdfToPosition, setPdfToPosition] = useState<string | null>(null);
  const [activeDocIndex, setActiveDocIndex] = useState<number | null>(null);

  const [reqHealth, setReqHealth] = useState(false);
  const [healthLink, setHealthLink] = useState("");
  const [reqRisk, setReqRisk] = useState(false);
  const [riskLink, setRiskLink] = useState("");

  // NOUVEAUX ÉTATS POUR LE COMPARATEUR IA
  const [scannedContract, setScannedContract] = useState<any>(null);
  const [allScannedContracts, setAllScannedContracts] = useState<any[]>([]); // 👈 Liste de tous les contrats externes
  const [comparatifData, setComparatifData] = useState<ComparatifOffreReelle | null>(null);

  // 👈 NOUVEAUX ÉTATS POUR LA DÉCISION DE LA COMPAGNIE
  const [decisionMode, setDecisionMode] = useState<"accept" | "modify" | "reject">("accept");
  const [decisionExplanation, setDecisionExplanation] = useState("");

  useEffect(() => {
    if (!isOpen || !clientUid) return;

    const fetchClientInfo = async () => {
      try {
        const snap = await getDoc(doc(db, `clients/${clientUid}/DonneePersonnelles/current`));
        if (snap.exists()) setClientInfo(snap.data());
      } catch (err) { console.error("Erreur client info:", err); }
    };
    fetchClientInfo();

    const fetchScannedContract = async () => {
      try {
        const q = query(collection(db, `clients/${clientUid}/plans`), where("origin", "==", "external"));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => 
            (b.metadata?.createdAt?.seconds || 0) - (a.metadata?.createdAt?.seconds || 0)
          );
          setAllScannedContracts(sorted); // 👈 On stocke tout
          setScannedContract(sorted[0]); // Par défaut, on sélectionne le plus récent
        } else {
          setAllScannedContracts([]);
          setScannedContract(null);
        }
      } catch (err) { console.error("Erreur scan:", err); }
    };
    fetchScannedContract();

    if (editingPlan) {
      setPlanType(editingPlan.type === "PILIER_3A_BANK" ? "banque" : "assurance");
      setContractType(editingPlan.data?.typeContrat === "3b" ? "3b" : "3a");
      setInstitution(editingPlan.institutionName || "");
      
      const d = editingPlan.data || {};
      setPrimeTotale(d.primeTotale?.toString() || d.montantRegulier?.toString() || "");
      setOccurrence(d.occurrence || "mois");
      setIsEnGage(d.isEnGage || false);
      setIsInvesti(d.isInvesti || false);
      setProfil(d.profil || "equilibre");
      setDocuments(editingPlan.documents || []);

      // 👈 MAJ : On récupère la valeur, qu'elle soit sur l'ancienne clé ou la nouvelle !
      setCapitalRetraiteProjete(d.capitalRetraiteProjete?.toString() || d.capitalRetraiteGlobal?.toString() || "");

      if (editingPlan.type === "PILIER_3A_BANK") {
        setStartDate(d.startDate || "");
        setSoldeActuel(d.soldeActuel?.toString() || "");
        setIsRegulier(d.isRegulier ?? true);
      } else {
        setDateDebut(d.dateDebut || "");
        setPrimeEpargne(d.primeEpargne?.toString() || "");
        setValeurRachatActuelle(d.valeurRachatActuelle?.toString() || "");
        setIsLibere(d.isLibere || false);
        setHasLDP(d.hasLDP ?? true);
        setRenteInv(d.renteInvalidite?.toString() || "");
        setTypeCapitalDeces(d.typeCapitalDeces || "fixe");
        setCapitalDecesFixe(d.capitalDecesFixe?.toString() || "");
        setHasMandatGestion(d.hasMandatGestion || false);
      }

      const reqs = editingPlan.requirements || [];
      const hReq = reqs.find((r: any) => r.id === "health_questionnaire");
      if (hReq) { setReqHealth(true); setHealthLink(hReq.link || ""); } else { setReqHealth(false); }
      const rReq = reqs.find((r: any) => r.id === "risk_profile");
      if (rReq) { setReqRisk(true); setRiskLink(rReq.link || ""); } else { setReqRisk(false); }
      
      // Réinitialiser la décision
      setDecisionMode("accept");
      setDecisionExplanation("");

    } else {
      setInstitution(""); setPrimeTotale(""); setPrimeEpargne(""); setCapitalRetraiteProjete(""); setDocuments([]);
      setDecisionMode("accept"); setDecisionExplanation("");
    }
  }, [isOpen, clientUid, editingPlan]);

  // FONCTION : AUTO-GÉNÉRATION RELIÉE AU MOTEUR ACTUARIEL (LEARNER-3A)
  const handleAutoGenerateOffer = async () => {
    if (!scannedContract || !scannedContract.data) return;
    const oldData = scannedContract.data;
    const toastId = toast.loading("Analyse algorithmique en cours...");

    try {
      // 1. Définition du profil client (Âge, Sexe, Fumeur)
      let age = 35;
      let isFemale = false;
      let isSmoker = false; 
      
      if (clientInfo) {
         if (clientInfo.Enter_dateNaissance) {
           const parts = clientInfo.Enter_dateNaissance.split('.');
           const birthYear = parts.length === 3 ? parseInt(parts[2]) : new Date(clientInfo.Enter_dateNaissance).getFullYear();
           if (!isNaN(birthYear)) age = new Date().getFullYear() - birthYear;
         }
         if (clientInfo.Enter_sexe === "1" || clientInfo.Enter_civilite?.toLowerCase().includes("madame")) isFemale = true;
         if (clientInfo.Enter_fumeur) isSmoker = true;
      }

      // 2. Interrogation du cerveau algorithmique (learner_models_3a)
      const q = query(collection(db, "learner_models_3a"));
      const snap = await getDocs(q);
      const benchmarks = snap.docs.map(d => d.data());
      const bestModel = benchmarks.length > 0 ? benchmarks[0] : null;

      // 3. Calcul exact des primes de risque (Comme dans Resultat3aPage)
      const targetPremium = Number(oldData.primeTotale) || 0;
      const targetDeces = Number(oldData.capitalDecesFixe) || 0;
      const targetInv = Number(oldData.renteInvalidite) || 0;

      let decCost = 0, incCost = 0, payRate = 0;

      if (bestModel) {
          const deathRate = calculatePredictedRate(bestModel.deathUnit, age, isSmoker, isFemale, bestModel.smokerFloors?.death);
          const disRate = calculatePredictedRate(bestModel.disabilityUnit, age, isSmoker, isFemale, bestModel.smokerFloors?.disability);
          payRate = calculatePredictedRate(bestModel.waiverRate, age, isSmoker, isFemale, bestModel.smokerFloors?.waiver);

          decCost = (targetDeces * deathRate) / 12;
          incCost = (targetInv * 12 * disRate) / 12;
      } else {
          decCost = targetDeces * 0.00015;
          incCost = targetInv * 0.015;
      }

      const occ = oldData.occurrence || "mois";
      const isLDP = oldData.hasLDP || oldData.isLibere || false;
      const annualRiskCost = occ === "mois" ? (decCost + incCost) : (decCost + incCost) * 12;
      
      // 4. Déduction mathématique de la prime d'épargne (On s'aligne sur le budget total)
      let estimatedSavingsPremium = targetPremium - annualRiskCost;
      if (isLDP && payRate > 0) {
          estimatedSavingsPremium = (targetPremium / (1 + payRate)) - annualRiskCost;
      }
      estimatedSavingsPremium = Math.max(0, estimatedSavingsPremium);

      // 5. Projection Financière CreditX (Primes futures + Transfert du rachat)
      const n = Math.max(0, 65 - age);
      const r = 0.05; // Rendement "growth" par défaut pour l'arbitrage
      const annualSavings = occ === "mois" ? estimatedSavingsPremium * 12 : estimatedSavingsPremium;
      
      const initialCapital = Number(oldData.valeurRachatActuelle) || 0;
      const capExistantProj = initialCapital * Math.pow(1 + r, n);
      const epargneFutureProj = r <= 0 ? annualSavings * n : annualSavings * ((Math.pow(1 + r, n) - 1) / r);
      const projected = capExistantProj + epargneFutureProj;

      // 6. Remplissage automatique
      setPlanType("assurance");
      setContractType(oldData.typeContrat === "3b" ? "3b" : "3a");
      
      // LE POINT CLÉ : C'est le modèle qui décide de l'institution !
      setInstitution(bestModel?.provider || "Offre Sur Mesure");
      
      setPrimeTotale(targetPremium.toString());
      setPrimeEpargne(Math.round(estimatedSavingsPremium).toString());
      setOccurrence(occ);
      setIsInvesti(true);
      setProfil("growth");
      setHasLDP(isLDP);
      setRenteInv(targetInv.toString());
      setTypeCapitalDeces(oldData.typeCapitalDeces || "fixe");
      setCapitalDecesFixe(targetDeces.toString());
      setCapitalRetraiteProjete(Math.round(projected).toString());
      
      toast.success("L'algorithme a trouvé la meilleure offre !", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du calcul actuariel.", { id: toastId });
    }
  };

  // FONCTION : CALCUL DU COMPARATIF EN DIRECT
  useEffect(() => {
    if (!scannedContract || !scannedContract.data || planType !== "assurance") {
      setComparatifData(null);
      return;
    }
    try {
      let age = 35;
      if (clientInfo?.Enter_dateNaissance) {
         const parts = clientInfo.Enter_dateNaissance.split('.');
         const birthYear = parts.length === 3 ? parseInt(parts[2]) : new Date(clientInfo.Enter_dateNaissance).getFullYear();
         if (!isNaN(birthYear)) age = new Date().getFullYear() - birthYear;
      }
      const rendementMap: Record<string, number> = { defensif: 0.02, equilibre: 0.035, growth: 0.05, dynamique: 0.065 };
      const rendementAttendu = isInvesti ? (rendementMap[profil] || 0.035) : 0.005;

      const newOfferData = {
        primeTotaleAnnuelle: occurrence === "mois" ? Number(primeTotale) * 12 : Number(primeTotale),
        capitalRetraiteProjete: Number(capitalRetraiteProjete),
        capitalDeces: typeCapitalDeces === "fixe" ? Number(capitalDecesFixe) : 0,
        renteInvalidite: Number(renteInv),
        hasLiberation: hasLDP,
        rendementAttendu
      };

      const resultat = compareInsuranceWithOffer(scannedContract.data, newOfferData, age);
      setComparatifData(resultat);
    } catch (err) {
      console.error("Erreur calcul arbitrage:", err);
      setComparatifData(null);
    }
  }, [scannedContract, primeTotale, occurrence, capitalRetraiteProjete, capitalDecesFixe, typeCapitalDeces, renteInv, hasLDP, isInvesti, profil, clientInfo, planType]);

  const handleFileUpload = async (file: File) => {
    if (!file || !clientUid) return;
    setUploading(true);
    const toastId = toast.loading(`Envoi de ${file.name}...`);
    
    const storagePath = `clients/${clientUid}/documents/plans_propositions/${Date.now()}_${file.name}`;
    const fileRef = ref(storage, storagePath);

    try {
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', null, 
            (error) => reject(error), 
            () => resolve(true)
        );
      });

      const downloadURL = await getDownloadURL(fileRef);

      // Mots-clés du contenu via l'IA (best-effort) pour la recherche dans le coffre.
      let keywords: string[] = [];
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/documents/classify", { method: "POST", body: fd });
        const json = await res.json();
        if (res.ok && Array.isArray(json?.data?.keywords)) keywords = json.data.keywords;
      } catch {
        /* recherche par contenu indisponible : on n'empêche pas l'ajout */
      }

      setDocuments(prev => [...prev, { name: file.name, url: downloadURL, path: storagePath, uploadedAt: new Date(), keywords }]);
      toast.success("Fichier ajouté !", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Échec de l'envoi", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const openSignaturePositioner = (url: string, index: number) => {
    setPdfToPosition(url);
    setActiveDocIndex(index);
    setIsPositionerOpen(true);
  };

  const handleSaveSignatureArea = (signatureAreas: SignatureArea[], dateAreas: SignatureArea[]) => {
    if (activeDocIndex !== null) {
      setDocuments(prev => {
        const newDocs = [...prev];
        newDocs[activeDocIndex] = { ...newDocs[activeDocIndex], signatureAreas, dateAreas };
        return newDocs;
      });
      toast.success(`${signatureAreas.length} signature(s) paramétrée(s) !`);
    }
    setIsPositionerOpen(false);
    setPdfToPosition(null);
    setActiveDocIndex(null);
  };

  const handleSavePlan = async () => {
    if (!institution) return toast.error("Institution requise");
    if (!primeTotale && !isLibere) return toast.error("Prime requise");
    
    // Validation explication requise
    if (editingPlan && decisionMode !== "accept" && !decisionExplanation.trim()) {
        return toast.error("Veuillez fournir une explication pour le client.");
    }

    setLoading(true);
    try {
      const requirements = [];
      if (reqHealth) requirements.push({ id: "health_questionnaire", title: "Questionnaire de santé", status: "PENDING", link: healthLink || null, type: "EXTERNAL_LINK" });
      if (reqRisk) requirements.push({ id: "risk_profile", title: "Profil d'investisseur", status: "PENDING", link: riskLink || null, type: "EXTERNAL_LINK" });

      const commonData = { 
        occurrence, 
        isInvesti, 
        profil, 
        isEnGage,
        typeContrat: planType === "banque" ? "3a" : contractType 
      };
      
      const specificData = planType === "banque" ? {
        startDate: startDate || dateDebut, // 👈 On prend l'une ou l'autre pour être sûr
        soldeActuel: Number(soldeActuel),
        isRegulier,
        montantRegulier: Number(primeTotale),
        capitalRetraiteProjete: Number(capitalRetraiteProjete),
      } : {
        dateDebut: dateDebut || startDate, // 👈 On prend l'une ou l'autre
        primeTotale: Number(primeTotale),
        primeEpargne: Number(primeEpargne),
        capitalRetraiteProjete: Number(capitalRetraiteProjete), 
        valeurRachatActuelle: Number(valeurRachatActuelle),
        isLibere,
        hasLDP,
        renteInvalidite: Number(renteInv),
        typeCapitalDeces,
        capitalDecesFixe: Number(capitalDecesFixe),
        hasMandatGestion,
      };

      const planData: any = {
        institutionName: institution,
        type: planType === "banque" ? "PILIER_3A_BANK" : (contractType === "3b" ? "PILIER_3B" : "PILIER_3A_POLICE"),
        origin: "creditx", // 👈 NOUVEAU : Identifie que c'est un contrat certifié/créé par ton équipe
        requirements,
        documents,
        data: { ...commonData, ...specificData },
        metadata: {
          updatedAt: serverTimestamp(),
          adminOp: true,
          ...(editingPlan?.metadata?.createdAt ? { createdAt: editingPlan.metadata.createdAt } : {})
        }
      };

      if (editingPlan) {
        // 👈 LOGIQUE DE TRAITEMENT DE LA DÉCISION
        if (decisionMode === "modify") {
            planData.status = "PENDING_CLIENT"; // Retour au client
            planData.metadata.companyModification = decisionExplanation; // Historique
            
            // Notification In-App
            await addDoc(collection(db, `clients/${clientUid}/notifications`), {
                title: "Mise à jour de votre offre",
                content: `La compagnie ${institution} a apporté une modification à votre dossier.`,
                html: `
                  <p>Bonjour,</p>
                  <p>Suite à l'étude de votre dossier, la compagnie <strong>${institution}</strong> a émis une nouvelle proposition.</p>
                  <div style="background:#ffffff; padding:20px; border-radius:12px; margin:20px 0; border:1px solid #e2e8f0;">
                    <p style="margin:0 0 10px 0; font-size:12px; font-weight:bold; color:#4A4A4A; text-transform:uppercase; letter-spacing:0.05em;">Message de votre conseiller :</p>
                    <p style="margin:0; font-size:14px; color:#1A1A1A; font-style:italic;">"${decisionExplanation}"</p>
                  </div>
                  <p>Veuillez consulter votre espace pour examiner les changements et valider cette nouvelle offre.</p>
                `,
                type: "success",
                category: "COMPAGNIE",
                read: false,
                createdAt: serverTimestamp()
             });
  
             // Email SendGrid
             fetch('/api/send-offer-modified', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: clientInfo?.Enter_email || "Email inconnu", 
                  firstName: clientInfo?.Enter_prenom || "Client",
                  institutionName: institution,
                  newPrice: Number(primeTotale),
                  explanation: decisionExplanation,
                  locale: clientInfo?.locale || clientInfo?.Enter_langue || "fr" // 👈 NOUVEAU : On ajoute la langue ici
                })
             }).catch(console.error);

        } else if (decisionMode === "reject") {
            planData.status = "REJECTED_INSURANCE"; // Verrouillage
            planData.metadata.rejectReason = "Refus Compagnie";
            planData.metadata.rejectDetails = decisionExplanation;

             // Notification In-App
             await addDoc(collection(db, `clients/${clientUid}/notifications`), {
                title: "Dossier refusé par la compagnie",
                content: `La compagnie ${institution} a refusé votre dossier.`,
                html: `
                  <p>Bonjour,</p>
                  <p>Nous avons le regret de vous informer que la compagnie <strong>${institution}</strong> a refusé votre dossier de souscription.</p>
                  <div style="background:#fff1f2; padding:20px; border-radius:12px; margin:20px 0; border:1px solid #fecdd3;">
                    <p style="margin:0 0 10px 0; font-size:12px; font-weight:bold; color:#9f1239; text-transform:uppercase; letter-spacing:0.05em;">Raison évoquée :</p>
                    <p style="margin:0; font-size:14px; color:#881337;">"${decisionExplanation}"</p>
                  </div>
                  <p>Votre conseiller va vous contacter rapidement pour vous proposer des solutions alternatives.</p>
                `,
                type: "error", // Affichera un point rouge et non vert
                category: "COMPAGNIE",
                read: false,
                createdAt: serverTimestamp()
             });

             // Tu pourras créer une route `/api/send-offer-rejected` plus tard si besoin
        } else {
             // Acceptation standard (ACTIVE)
             planData.status = "ACTIVE"; 
        }

        await updateDoc(doc(db, `clients/${clientUid}/plans`, editingPlan.id), planData);
        toast.success("Contrat mis à jour !");
        
      } else {
        // Mode Création standard
        planData.status = "PENDING_CLIENT";
        planData.linkedRequestId = requestId;
        planData.metadata.createdAt = serverTimestamp(); 
        
        await addDoc(collection(db, `clients/${clientUid}/plans`), planData);
        toast.success("Contrat ajouté au dossier !");
      }

      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Erreur d'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[96vh] bg-[#F8F9FB] border-none font-sans rounded-t-[32px] outline-none flex flex-col">
        {isOpen && (
          <div className="flex flex-col h-full max-w-6xl mx-auto w-full overflow-hidden">
            
            <div className="px-8 py-5 flex justify-between items-start border-b border-slate-200/50 shrink-0 bg-white z-10">
              <div className="flex gap-5 items-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${planType === 'assurance' ? 'bg-black text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {planType === 'assurance' ? <ShieldCheck size={30} /> : <Landmark size={30} />}
                </div>
                <div>
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">{editingPlan ? "Édition du contrat" : "Nouveau contrat"}</span>
                   <DrawerTitle className="text-3xl font-black tracking-tight text-slate-900 leading-tight">
                     {institution || "Sans Nom"}
                   </DrawerTitle>
                   {clientInfo && (
                     <div className="flex gap-4 items-center mt-2 text-slate-500 text-xs font-medium">
                        <span className="flex gap-1.5 items-center"><User size={14}/> {clientInfo.Enter_civilite} • {clientInfo.Enter_dateNaissance}</span>
                        <span className="flex gap-1.5 items-center"><MapPin size={14}/> {clientInfo.Enter_adresse}, {clientInfo.Enter_npa} {clientInfo.Enter_localite}</span>
                     </div>
                   )}
                </div>
              </div>
              <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
              
              {/* LA BANNIÈRE D'AUTO-GÉNÉRATION AVEC SÉLECTEUR DE CONTRAT CIBLE */}
              {scannedContract && !editingPlan && (
                <div className="bg-gradient-to-r from-[#816DEC]/10 to-blue-500/10 border border-[#816DEC]/30 p-6 rounded-[24px] flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-[#816DEC] shadow-sm shrink-0">
                      <Sparkles size={24} />
                    </div>
                    <div className="flex-1 w-full max-w-md">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-slate-900 text-lg">Optimiser le contrat :</h3>
                        
                        {allScannedContracts.length > 1 ? (
                          <select 
                            value={scannedContract.id}
                            onChange={(e) => {
                              const selected = allScannedContracts.find(c => c.id === e.target.value);
                              if (selected) setScannedContract(selected);
                            }}
                            className="bg-white border border-[#816DEC]/30 text-[#816DEC] font-black text-sm rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-[#816DEC]/50 cursor-pointer flex-1"
                          >
                            {allScannedContracts.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.institutionName || "Sans nom"} ({fmt.format(c.data?.primeTotale || c.data?.montantRegulier || 0)} CHF/an)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-black text-[#816DEC] text-lg bg-white px-3 py-0.5 rounded-lg border border-[#816DEC]/20 shadow-sm">
                            {scannedContract.institutionName || "Sans nom"}
                          </span>
                        )}

                      </div>
                      <p className="text-xs font-bold text-slate-500 leading-snug">
                        L'algorithme va calculer la meilleure couverture et choisir le prestataire le plus performant pour battre ce contrat.
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleAutoGenerateOffer}
                    className="shrink-0 bg-[#816DEC] hover:bg-[#6c58e0] text-white font-black uppercase tracking-widest rounded-full px-6 py-6 shadow-lg shadow-[#816DEC]/30 transition-all active:scale-95 flex gap-2"
                  >
                    <Sparkles size={18} /> Lancer l'algorithme
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 bg-white rounded-[24px] p-6 shadow-sm border border-slate-100">
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Type de prévoyance</p>
                    <div className={`flex bg-slate-100 rounded-full p-1.5 w-full ${editingPlan ? 'opacity-50 pointer-events-none' : ''}`}>
                      <button onClick={() => setPlanType("assurance")} className={`flex-1 py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${planType === "assurance" ? 'bg-black shadow-md text-white' : 'text-slate-400'}`}><ShieldCheck size={16} /> Assurance Vie</button>
                      <button onClick={() => setPlanType("banque")} className={`flex-1 py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${planType === "banque" ? 'bg-black shadow-md text-white' : 'text-slate-400'}`}><Landmark size={16} /> Compte Bancaire</button>
                    </div>
                </div>
                
                {planType === "assurance" ? (
                    <div className="space-y-4animate-in fade-in">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Catégorie</p>
                        <div className={`flex bg-slate-100 rounded-full p-1.5 w-full ${editingPlan ? 'opacity-50 pointer-events-none' : ''}`}>
                            <button onClick={() => setContractType("3a")} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${contractType === "3a" ? 'bg-blue-600 shadow-md text-white' : 'text-slate-400'}`}>Pilier 3a (Lié)</button>
                            <button onClick={() => setContractType("3b")} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${contractType === "3b" ? 'bg-blue-600 shadow-md text-white' : 'text-slate-400'}`}>Pilier 3b (Libre)</button>
                        </div>
                    </div>
                ) : (
                     <div className="flex items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-100 text-slate-400 text-xs font-bold uppercase">
                        Pilier 3a Bancaire uniquement
                     </div>
                )}
              </div>

              {/* 👈 LE BLOC DE DÉCISION (VISIBLE UNIQUEMENT EN MODE ÉDITION D'UN PLAN SIGNÉ) */}
              {editingPlan && (
                <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 space-y-4">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Décision de la Compagnie</h3>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <button 
                        onClick={() => setDecisionMode("accept")}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${decisionMode === 'accept' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 hover:border-emerald-200 text-slate-500'}`}
                    >
                        <CheckSquare size={20} />
                        <span className="text-xs font-black">Accepté (Actif)</span>
                    </button>
                    <button 
                        onClick={() => setDecisionMode("modify")}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${decisionMode === 'modify' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 hover:border-orange-200 text-slate-500'}`}
                    >
                        <MessageSquareWarning size={20} />
                        <span className="text-xs font-black">Modification</span>
                    </button>
                    <button 
                        onClick={() => setDecisionMode("reject")}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${decisionMode === 'reject' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 hover:border-red-200 text-slate-500'}`}
                    >
                        <XCircle size={20} />
                        <span className="text-xs font-black">Refus Total</span>
                    </button>
                  </div>

                  {decisionMode !== "accept" && (
                    <div className="pt-4 animate-in fade-in slide-in-from-top-2">
                        <textarea 
                            value={decisionExplanation}
                            onChange={(e) => setDecisionExplanation(e.target.value)}
                            placeholder={decisionMode === "modify" ? "Expliquez au client ce qui a changé (ex: Exclusion colonne vertébrale, surprime...)" : "Raison du refus de la compagnie..."}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium outline-none focus:border-blue-500 min-h-[100px] resize-none"
                        />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Informations Générales</h3>
                  <InputGroup label={planType === 'assurance' ? "Compagnie d'assurance" : "Nom de la banque"} placeholder="ex: SwissLife, VIAC..." value={institution} onChange={setInstitution} />
                  
                  {planType === 'assurance' && (
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-[11px] font-black text-slate-400 uppercase">Contrat libéré / inactif</span>
                      <SegmentedToggle small value={isLibere} onChange={(v: boolean) => setIsLibere(v)} />
                    </div>
                  )}

                  <InputGroup label="Date de début" type="date" value={planType === 'assurance' ? dateDebut : startDate} onChange={planType === 'assurance' ? setDateDebut : setStartDate} icon={<CalendarDays size={18}/>} />
                  
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-[11px] font-black text-slate-400 uppercase">Mise en gage (Nantissement)</span>
                      <SegmentedToggle small value={isEnGage} onChange={(v: boolean) => setIsEnGage(v)} />
                  </div>
                </div>

                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Épargne & Versements</h3>
                  
                  {planType === 'banque' && (
                      <>
                        <InputGroup label="Solde actuel (CHF)" placeholder="0.00" type="number" value={soldeActuel} onChange={setSoldeActuel} />
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-[11px] font-black text-slate-400 uppercase">Versements réguliers ?</span>
                          <SegmentedToggle small value={isRegulier} onChange={(v: boolean) => setIsRegulier(v)} />
                        </div>
                      </>
                  )}

                  {(!isLibere && (planType === 'assurance' || isRegulier)) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in">
                      <div className="md:col-span-2">
                        <InputGroup label={planType === 'assurance' ? "Prime Totale" : "Montant Versement"} placeholder="0.00" type="number" value={primeTotale} onChange={setPrimeTotale} />
                      </div>
                      <div className="bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center justify-center">
                          <select className="font-black text-slate-900 outline-none bg-transparent" value={occurrence} onChange={(e) => setOccurrence(e.target.value as any)}>
                            <option value="mois">/ mois</option>
                            <option value="annee">/ an</option>
                          </select>
                      </div>
                    </div>
                  )}

                  {planType === 'assurance' && (
                    <div className="grid grid-cols-1 gap-4">
                        <div className="grid grid-cols-2 gap-4">
                           <InputGroup label="Part Épargne (CHF)" placeholder="0.00" type="number" value={primeEpargne} onChange={setPrimeEpargne} />
                           <InputGroup label="Capital Retraite Projeté" placeholder="0.00" type="number" value={capitalRetraiteProjete} onChange={setCapitalRetraiteProjete} />
                        </div>
                        <InputGroup label="Valeur Rachat Actuelle (CHF)" placeholder="Dernier relevé" type="number" value={valeurRachatActuelle} onChange={setValeurRachatActuelle} />
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Profil d'investissement</h3>
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <span className="text-[11px] font-black text-slate-400 uppercase">Épargne investie en bourse ?</span>
                        <SegmentedToggle small value={isInvesti} onChange={(v: boolean) => setIsInvesti(v)} />
                    </div>
                    {isInvesti && (
                        <div className="bg-white rounded-2xl p-4 border border-emerald-100 flex justify-between items-center shadow-inner">
                            <span className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">Profil de risque</span>
                            <select className="font-black text-emerald-600 outline-none bg-transparent" value={profil} onChange={(e) => setProfil(e.target.value)}>
                                <option value="defensif">Défensif</option>
                                <option value="equilibre">Équilibré</option>
                                <option value="growth">Croissance</option>
                                <option value="dynamique">Dynamique</option>
                            </select>
                        </div>
                    )}
                </div>

                {planType === 'assurance' && (
                    <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6 animate-in fade-in">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Garanties Risques</h3>
                        
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-[11px] font-black text-slate-400 uppercase">Libération des primes (LDP)</span>
                          <SegmentedToggle small value={hasLDP} onChange={(v: boolean) => setHasLDP(v)} />
                        </div>
                        
                        <InputGroup label="Rente Invalidité annuelle (CHF)" placeholder="0.00" type="number" value={renteInv} onChange={setRenteInv} />
                        
                        <div className="p-5 border border-slate-100 rounded-2xl space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-black text-slate-400 uppercase">Option Capital Décès</span>
                                <select className="font-black text-slate-900 outline-none bg-transparent" value={typeCapitalDeces} onChange={(e) => setTypeCapitalDeces(e.target.value as any)}>
                                    <option value="fixe">Montant Fixe</option>
                                    <option value="primes">Restitution Primes</option>
                                </select>
                            </div>
                            {typeCapitalDeces === 'fixe' && <InputGroup label="Montant Capital Décès (CHF)" placeholder="0.00" type="number" value={capitalDecesFixe} onChange={setCapitalDecesFixe} />}
                        </div>
                    </div>
                )}
              </div>

              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Checklist Onboarding (Tâches Client)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-slate-900 text-sm">Questionnaire de santé</p>
                        <Switch checked={reqHealth} onCheckedChange={setReqHealth} className="data-[state=checked]:bg-black" />
                      </div>
                      {reqHealth && <input type="text" placeholder="Coller le lien SwissLife/AXA ici..." value={healthLink} onChange={(e) => setHealthLink(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs" />}
                    </div>
                    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-slate-900 text-sm">Profil d'investisseur</p>
                        <Switch checked={reqRisk} onCheckedChange={setReqRisk} className="data-[state=checked]:bg-black" />
                      </div>
                      {reqRisk && <input type="text" placeholder="Coller le lien ici..." value={riskLink} onChange={(e) => setRiskLink(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs" />}
                    </div>
                </div>
              </div>

              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-slate-100 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Pièces Jointes & Signatures</h3>
                
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-4 border-dashed border-slate-100 rounded-[24px] py-12 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-500 transition-all cursor-pointer"
                >
                    {uploading ? <Loader2 className="animate-spin" size={32} /> : <UploadCloud size={32} />}
                    <p className="font-bold text-sm">{uploading ? "Envoi en cours..." : "Cliquez ou glissez un fichier PDF"}</p>
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} className="hidden" accept="application/pdf" />
                </div>

                {documents.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-slate-50">
                        {documents.map((doc, index) => (
                            <div key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <FileText size={20} className="text-blue-500 shrink-0" />
                                    <div className="flex flex-col">
                                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-900 truncate hover:text-blue-600 hover:underline">
                                          {doc.name}
                                      </a>
                                      {doc.signatureAreas?.length > 0 ? (
                                        <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-0.5"><CheckCircle2 size={12}/> {doc.signatureAreas.length} signature(s) / {doc.dateAreas?.length || 0} date(s)</span>
                                      ) : (
                                        <span className="text-[10px] text-orange-400 font-bold mt-0.5">Aucune zone configurée</span>
                                      )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <button 
                                    onClick={() => openSignaturePositioner(doc.url, index)} 
                                    className={`text-xs font-bold px-4 py-2 rounded-full transition-colors flex-1 sm:flex-none ${doc.signatureArea ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-black'}`}
                                  >
                                    {doc.signatureArea ? "Modifier zone" : "Placer signature"}
                                  </button>
                                  <button onClick={() => setDocuments(prev => prev.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 transition-colors p-2 bg-white rounded-full border border-slate-200">
                                      <Trash2 size={16} />
                                  </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
              </div>

              {planType === 'assurance' && (
                <div className={`p-6 rounded-[32px] border-2 transition-all ${hasMandatGestion ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white'}`}>
                    <div className="flex justify-between items-center">
                        <p className="font-black text-sm text-blue-900">Activer le Mandat CreditX (Suivi automatisé)</p>
                        <Switch checked={hasMandatGestion} onCheckedChange={setHasMandatGestion} className="data-[state=checked]:bg-blue-600" />
                    </div>
                </div>
              )}

              {/* LE TABLEAU DE BORD D'ARBITRAGE */}
              {comparatifData && (
                 <div className="pt-6 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 px-4">Analyse de l'Arbitrage (En temps réel)</h3>
                    <ComparatifDashboard 
                      data={comparatifData} 
                      onAcceptTransfer={undefined} 
                      onReject={undefined} 
                    />
                 </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 w-full p-8 bg-white border-t border-slate-100 shrink-0 z-10">
              <Button onClick={handleSavePlan} disabled={loading || uploading} className={`w-full py-8 rounded-[24px] font-black text-lg shadow-xl uppercase tracking-tighter disabled:opacity-50 ${decisionMode === 'reject' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-black hover:bg-slate-800 text-white'}`}>
                {loading ? "Enregistrement..." : (editingPlan ? (decisionMode === 'accept' ? "Activer le contrat définitif" : decisionMode === 'modify' ? "Envoyer modification au client" : "Refuser le dossier") : "Ajouter ce contrat au dossier")}
              </Button>
            </div>
          </div>
        )}

        {isPositionerOpen && pdfToPosition && (
          <SignaturePositioner
            pdfUrl={pdfToPosition}
            onSave={handleSaveSignatureArea}
            onCancel={() => {
              setIsPositionerOpen(false);
              setPdfToPosition(null);
              setActiveDocIndex(null);
            }}
          />
        )}

      </DrawerContent>
    </Drawer>
  );
}