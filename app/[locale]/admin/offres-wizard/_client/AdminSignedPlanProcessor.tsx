"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, ShieldCheck, Landmark, FileText, ExternalLink, CheckCircle2, Loader2, UploadCloud, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, onSnapshot, getDoc, addDoc, collection } from "firebase/firestore"; // 👈 Ajout de addDoc et collection
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import DocumentUploaderModal from "@/[locale]/dashboard/prevoyance/_components/DocumentUploaderModal"; // 👈 NOUVEL IMPORT

interface AdminSignedPlanProcessorProps {
  isOpen: boolean;
  onClose: () => void;
  plan: any;
  clientUid: string;
  onEditPlan: (freshPlan: any) => void; 
}

export default function AdminSignedPlanProcessor({ isOpen, onClose, plan, clientUid, onEditPlan }: AdminSignedPlanProcessorProps) {
  const [numeroPolice, setNumeroPolice] = useState("");
  const [loading, setLoading] = useState(false);
  const [livePlan, setLivePlan] = useState<any>(null);
  
  const [isUploaderOpen, setIsUploaderOpen] = useState(false); // 👈 NOUVEAU

  useEffect(() => {
    if (!isOpen || !plan?.id || !clientUid) return;

    setLivePlan(plan);
    setNumeroPolice(plan?.data?.numeroPolice || "");

    const unsub = onSnapshot(doc(db, "clients", clientUid, "plans", plan.id), (snap) => {
      if (snap.exists()) {
        setLivePlan({ id: snap.id, ...snap.data() });
      }
    });

    return () => unsub();
  }, [isOpen, plan, clientUid]);

  if (!livePlan) return null;

  const isBank = livePlan.type === "PILIER_3A_BANK";
  const signedDocs = livePlan.documents?.filter((d: any) => d.isSigned && !d.isFinalDoc) || [];
  const otherDocs = livePlan.documents?.filter((d: any) => !d.isSigned || d.isFinalDoc) || [];

  // ==========================================
  // 1. ACTIVATION FINALE DU CONTRAT & ENVOI D'EMAIL
  // ==========================================
  const handleActivateContract = async () => {
    if (!numeroPolice) {
      toast.error("Veuillez saisir le numéro de police / compte.");
      return;
    }

    setLoading(true);
    try {
      // 1. Récupération robuste de l'email, prénom et langue du client
      let clientEmail = "";
      let clientFirstName = "Client";
      let clientLocale = "fr"; // 👈 NOUVEAU
      
      const clientSnap = await getDoc(doc(db, "clients", clientUid, "DonneePersonnelles", "current"));
      if (clientSnap.exists()) {
        const clientData = clientSnap.data();
        clientEmail = clientData.email || clientData.Enter_email || "";
        clientFirstName = clientData.Enter_prenom || "Client";
        clientLocale = clientData.locale || clientData.Enter_langue || "fr"; // 👈 NOUVEAU
      }

      // L'email peut être absent ici : on n'empêche PLUS l'activation. L'envoi se fait
      // en best-effort plus bas (et le serveur peut retrouver l'email via Firebase Auth).

      // 2. Mise à jour de Firebase (Activation du contrat)
      // On s'assure que dateDebut est renseigné, sinon on met la date d'aujourd'hui
      const currentDate = livePlan.data?.dateDebut || livePlan.data?.startDate || new Date().toLocaleDateString('fr-CH');

      await updateDoc(doc(db, "clients", clientUid, "plans", livePlan.id), {
        status: "ACTIVE",
        "data.numeroPolice": numeroPolice,
        "data.dateDebut": currentDate, // Sécurité pour éviter un champ vide
        "metadata.activatedAt": serverTimestamp(),
      });
      
      // 3. Création de la NOTIFICATION In-App pour le client
      await addDoc(collection(db, `clients/${clientUid}/notifications`), {
        title: "Contrat activé ! 🚀",
        content: `Votre contrat ${livePlan.institutionName} est désormais actif.`,
        html: `
          <p>Bonjour ${clientFirstName},</p>
          <p>Nous avons le plaisir de vous informer que votre contrat chez <strong>${livePlan.institutionName}</strong> a été validé par la compagnie.</p>
          <p><strong>N° de police :</strong> ${numeroPolice}</p>
          <p>Vous pouvez retrouver votre police et vos documents définitifs dans votre espace.</p>
        `,
        type: "success",
        category: "SOUSCRIPTION",
        read: false,
        createdAt: serverTimestamp()
      });

      // 4. Email de confirmation — BEST-EFFORT (n'invalide jamais l'activation).
      //    On passe clientUid : si l'email est absent en base, le serveur le retrouve via Auth.
      let emailSent = false;
      try {
        const emailRes = await fetch('/api/send-contract-activated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: clientEmail,
            clientUid,
            firstName: clientFirstName,
            institutionName: livePlan.institutionName,
            numeroPolice: numeroPolice,
            locale: clientLocale
          })
        });
        emailSent = emailRes.ok;
      } catch (mailErr) {
        console.warn("Envoi de l'email d'activation échoué :", mailErr);
      }

      toast.success(emailSent
        ? "Contrat activé et email de confirmation envoyé au client !"
        : "Contrat activé. ⚠️ E-mail de confirmation non envoyé (adresse introuvable).");
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erreur lors de l'activation du contrat.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 2. AJOUT DE DOCUMENTS STRUCTURÉS
  // ==========================================
  const handleDocumentAdded = async (newDoc: any) => {
    try {
      const updatedDocs = [...(livePlan.documents || []), newDoc];
      await updateDoc(doc(db, "clients", clientUid, "plans", livePlan.id), {
        documents: updatedDocs
      });
      // Le livePlan se mettra à jour tout seul grâce au onSnapshot !
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de la sauvegarde du document dans le plan.");
    }
  };

  // ==========================================
  // 3. SUPPRESSION D'UN DOCUMENT
  // ==========================================
  const handleDeleteDoc = async (docIndex: number) => {
    if (!confirm("Voulez-vous vraiment supprimer ce document ?")) return;
    
    try {
      const updatedDocs = [...livePlan.documents];
      updatedDocs.splice(docIndex, 1);
      
      await updateDoc(doc(db, "clients", clientUid, "plans", livePlan.id), {
        documents: updatedDocs
      });
      toast.success("Document supprimé.");
    } catch (error) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  // ==========================================
  // 4. RETOUR AU CLIENT (Contre-offre)
  // ==========================================
  const handleCounterOffer = async () => {
    toast.info("Ouverture de l'éditeur de contrat...");
    onClose();     
    onEditPlan(livePlan);  
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[96vh] bg-[#F8F9FB] border-none font-sans rounded-t-[32px] outline-none flex flex-col">
        <div className="flex flex-col h-full max-w-5xl mx-auto w-full overflow-hidden">
          
          {/* HEADER */}
          <div className="px-8 py-5 flex justify-between items-start border-b border-slate-200/50 shrink-0 bg-white z-10">
            <div className="flex gap-5 items-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isBank ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                  {isBank ? <Landmark size={30} /> : <ShieldCheck size={30} />}
              </div>
              <div>
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-1">
                   <Loader2 size={12} className="animate-spin" /> En attente de validation compagnie
                 </span>
                 <DrawerTitle className="text-3xl font-black tracking-tight text-slate-900 leading-tight">
                   {livePlan.institutionName}
                 </DrawerTitle>
              </div>
            </div>
            <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-40">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* COLONNE GAUCHE : DOCUMENTS */}
              <div className="space-y-8">
                {/* 1. DOCUMENTS SIGNÉS */}
                <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Documents signés par le client</h3>
                  
                  {signedDocs.length > 0 ? (
                    <div className="space-y-3">
                      {signedDocs.map((sDoc: any, i: number) => (
                        <button 
                          key={`signed-${i}`}
                          onClick={() => window.open(sDoc.url, "_blank")}
                          className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-[20px] transition-all group"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-green-600 shadow-sm shrink-0">
                              <CheckCircle2 size={20} />
                            </div>
                            <div className="text-left truncate">
                              <p className="font-black text-green-900 text-sm truncate">{sDoc.name}</p>
                              <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mt-0.5">Vérifier la signature</p>
                            </div>
                          </div>
                          <ExternalLink size={20} className="text-green-600 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold border border-blue-200 flex items-center gap-3">
                      <AlertTriangle size={16} className="shrink-0 text-blue-500" />
                      Aucune signature électronique. Si le contrat a été conclu en direct (signature papier), déposez la police signée et les documents définitifs ci-contre, puis activez le contrat.
                    </div>
                  )}
                </div>

                {/* 2. AUTRES DOCUMENTS & UPLOAD */}
                <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Documents Définitifs</h3>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 leading-snug">Ajoutez ici la police définitive, le QR IBAN ou les CG. Le client les verra dans son coffre-fort une fois le contrat activé.</p>
                  
                  {otherDocs.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {livePlan.documents.map((doc: any, index: number) => {
                        if (doc.isSigned) return null; 
                        return (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileText size={16} className="text-slate-400 shrink-0" />
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-900 truncate hover:text-blue-600 hover:underline">
                                {doc.name}
                              </a>
                            </div>
                            <button onClick={() => handleDeleteDoc(index)} className="p-1.5 text-slate-300 hover:text-red-500 bg-white rounded-md shadow-sm border border-slate-100 ml-2 shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div 
                    onClick={() => setIsUploaderOpen(true)}
                    className="border-2 border-dashed border-slate-200 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 transition-all cursor-pointer"
                  >
                    <UploadCloud size={24} />
                    <p className="font-bold text-xs">Ajouter un document structuré</p>
                  </div>
                </div>
              </div>

              {/* COLONNE DROITE : VALIDATION & CONTRE-OFFRE */}
              <div className="space-y-8">
                
                {/* VALIDATION ADMIN */}
                <div className="bg-white rounded-[24px] p-8 shadow-sm border border-emerald-100 border-b-4 border-b-emerald-500 space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Validation finale</h3>
                    <p className="text-xs font-bold text-slate-500 mt-1 text-balance">Dès réception de la police d'assurance ou de l'ouverture du compte bancaire, inscrivez le numéro définitif ci-dessous pour activer le contrat.</p>
                  </div>

                  <div className="relative group min-w-0">
                    <div className="absolute left-5 top-3 text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none pointer-events-none transition-colors group-focus-within:text-blue-500">Numéro de Police / Compte</div>
                    <input 
                      type="text" 
                      placeholder="ex: 704.123.456" 
                      value={numeroPolice} 
                      onChange={(e) => setNumeroPolice(e.target.value)} 
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl pt-7 pb-3 px-5 font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all text-lg shadow-inner" 
                    />
                  </div>
                </div>

                {/* CONTRE-OFFRE / MODIFICATION */}
                <div className="bg-orange-50 rounded-[24px] p-6 border border-orange-200 space-y-4">
                  <div className="flex gap-3 text-orange-800">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Modification Compagnie</h3>
                      <p className="text-xs font-bold opacity-80 mt-1 leading-snug">
                        La compagnie a modifié l'offre suite à l'examen (surprime, exclusion...) ou a refusé ?
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleCounterOffer}
                    variant="outline" 
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 hover:text-orange-900 font-bold rounded-xl bg-white"
                  >
                    <RotateCcw size={16} className="mr-2" /> Retourner à l'étape "Édition"
                  </Button>
                </div>

              </div>
            </div>

          </div>

          <div className="absolute bottom-0 left-0 w-full p-8 bg-white border-t border-slate-100 shrink-0 z-10 flex justify-end">
            <Button 
              onClick={handleActivateContract} 
              disabled={loading || !numeroPolice} 
              className="w-full md:w-auto px-12 py-8 rounded-[24px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg shadow-xl uppercase tracking-tighter disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <ShieldCheck size={24} />}
              {loading ? "Activation..." : "Activer ce contrat"}
            </Button>
          </div>
        </div>
      </DrawerContent>

      {/* 👈 NOUVEAU : LA MODALE D'UPLOAD STRUCTURÉ */}
      {isUploaderOpen && (
        <DocumentUploaderModal
          isOpen={isUploaderOpen}
          onClose={() => setIsUploaderOpen(false)}
          clientUid={clientUid}
          onUploadSuccess={handleDocumentAdded}
        />
      )}
    </Drawer>
  );
}

