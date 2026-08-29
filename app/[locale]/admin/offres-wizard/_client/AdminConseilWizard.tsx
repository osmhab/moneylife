//app/admin/offres-wizard/_client/AdminConseilWizard.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Save, Sparkles, Target, FileText, CheckCircle2, ShieldAlert, Cloud, CloudOff } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface AdminConseilWizardProps {
  isOpen: boolean;
  onClose: () => void;
  client: any;
}

type WizardStep = "OBJECTIFS" | "ANALYSIS" | "NOTES" | "CLOSE";

export default function AdminConseilWizard({ isOpen, onClose, client }: AdminConseilWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("OBJECTIFS");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Priorités cochées en direct avec le client
  const [priorities, setPriorities] = useState({
    impots: false,
    retraite: false,
    famille: false,
    immobilier: false,
  });

  // État de l'auto-sauvegarde du brouillon ("idle" | "saving" | "saved" | "error").
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false); // évite de ré-écrire le brouillon pendant la restauration

  const uid: string | undefined = client?.uid;
  const lsKey = uid ? `conseil_draft_${uid}` : "";

  // ── Restauration du brouillon à l'ouverture (localStorage puis Firestore) ──
  useEffect(() => {
    if (!isOpen || !uid) return;
    loadedRef.current = false;
    let cancelled = false;

    const hasContent = (n: string, p: Record<string, boolean> | undefined) =>
      !!(n?.trim()) || Object.values(p || {}).some(Boolean);

    (async () => {
      let restored = false;
      // 1) localStorage : filet instantané, disponible même hors-ligne.
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw && !cancelled) {
          const d = JSON.parse(raw);
          setNotes(d.notes || "");
          setPriorities((p) => ({ ...p, ...(d.priorities || {}) }));
          restored = restored || hasContent(d.notes, d.priorities);
        }
      } catch { /* ignore */ }
      // 2) Firestore : source de vérité (multi-appareil / après vidage du cache).
      try {
        const snap = await getDoc(doc(db, "clients", uid, "conseils_drafts", "current"));
        if (snap.exists() && !cancelled) {
          const d = snap.data() as any;
          setNotes(d.notes || "");
          setPriorities((p) => ({ ...p, ...(d.priorities || {}) }));
          restored = restored || hasContent(d.notes, d.priorities);
        }
      } catch { /* ignore */ }
      if (!cancelled) {
        loadedRef.current = true;
        if (restored) toast.info("Brouillon d'entretien restauré.");
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, uid, lsKey]);

  // ── Auto-sauvegarde du brouillon à chaque changement (localStorage immédiat + Firestore debouncé) ──
  useEffect(() => {
    if (!isOpen || !uid || !loadedRef.current) return;
    const hasContent = notes.trim().length > 0 || Object.values(priorities).some(Boolean);
    if (!hasContent) return;

    // Filet synchrone : écrit avant même l'appel réseau (survit à un crash/fermeture immédiate).
    try { localStorage.setItem(lsKey, JSON.stringify({ notes, priorities, ts: Date.now() })); } catch { /* quota */ }

    setDraftState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "clients", uid, "conseils_drafts", "current"),
          {
            notes,
            priorities,
            status: "DRAFT",
            clientName: `${client?.firstName || ""} ${client?.lastName || ""}`.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setDraftState("saved");
      } catch (e) {
        console.error("Auto-sauvegarde brouillon échouée :", e);
        setDraftState("error"); // le brouillon localStorage reste, lui, intact
      }
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [notes, priorities, isOpen, uid, lsKey, client?.firstName, client?.lastName]);

  if (!isOpen || !client) return null;

  const handleSaveSession = async () => {
    setIsSaving(true);
    const toastId = toast.loading("Sauvegarde de la session de conseil...");

    try {
      // Sauvegarde dans la sous-collection du client sur Firestore
      await addDoc(collection(db, "clients", client.uid, "conseils_sessions"), {
        createdAt: serverTimestamp(),
        status: "COMPLETED",
        priorities,
        notesRaw: notes,
        advisorNotes: `Session physique effectuée avec ${client.firstName} ${client.lastName}`,
      });

      // Session figée : on nettoie le brouillon (Firestore + localStorage) pour ne pas le restaurer ensuite.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      await deleteDoc(doc(db, "clients", client.uid, "conseils_drafts", "current")).catch(() => {});
      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }

      toast.success("Conseil clôturé et synchronisé sur le profil client !", { id: toastId });
      onClose();
      setCurrentStep("OBJECTIFS");
      setNotes("");
      setPriorities({ impots: false, retraite: false, famille: false, immobilier: false });
      setDraftState("idle");
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de la sauvegarde de la session.", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0D1117] border border-white/10 rounded-[32px] w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative text-white font-sans">
        
        {/* HEADER */}
        <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
              <Target size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Rendez-vous physique</span>
              <h2 className="text-xl font-black tracking-tighter text-white mt-0.5">
                Conseil en direct : {client.firstName} {client.lastName}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {draftState !== "idle" && (
              <span
                className={`hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                  draftState === "error"
                    ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
                    : draftState === "saving"
                      ? "text-slate-300 border-white/10 bg-white/5"
                      : "text-emerald-300 border-emerald-500/20 bg-emerald-500/10"
                }`}
                title="Vos notes sont sauvegardées automatiquement en brouillon."
              >
                {draftState === "error" ? <CloudOff size={12} /> : <Cloud size={12} />}
                {draftState === "saving" ? "Enregistrement…" : draftState === "error" ? "Hors-ligne (brouillon local)" : "Brouillon enregistré"}
              </span>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-full transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* CONTENU CENTRAL ÉVOLUTIF */}
        <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-[#0D1117] to-black">
          
          {/* ÉTAPE 1 : OBJECTIFS */}
          {currentStep === "OBJECTIFS" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h3 className="text-2xl font-black tracking-tight">1. Objectifs &amp; Priorités du client</h3>
                <p className="text-sm text-slate-400 font-medium">Cochez avec le client les leviers qu'il souhaite optimiser aujourd'hui.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {[
                  { id: "impots", title: "Réduction fiscale", desc: "Maximiser les déductions d'impôts immédiates (3a/LPP)", icon: "💰" },
                  { id: "retraite", title: "Lacunes de retraite", desc: "Combler le manque à gagner du 1er et 2e pilier à 65 ans", icon: "📈" },
                  { id: "famille", title: "Protection de la famille", desc: "Couvrir les proches avec un capital décès ou rente d'invalidité", icon: "❤️" },
                  { id: "immobilier", title: "Amortissement / Immobilier", desc: "Utiliser la prévoyance pour un achat immobilier (EPL)", icon: "🏠" },
                ].map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => setPriorities(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof priorities] }))}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${priorities[item.id as keyof typeof priorities] ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/5' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                  >
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div>
                      <p className="font-black text-base">{item.title}</p>
                      <p className="text-xs text-slate-400 mt-1 font-medium leading-normal">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ÉTAPE 2 : ANALYSE FLASH */}
          {currentStep === "ANALYSIS" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h3 className="text-2xl font-black tracking-tight">2. Analyse Flash de situation</h3>
                <p className="text-sm text-slate-400 font-medium">Présentation des indicateurs extraits au client.</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-amber-400">
                  <ShieldAlert size={20} />
                  <p className="text-sm font-black uppercase tracking-wider">Aperçu des indicateurs CRM</p>
                </div>
                <p className="text-sm font-medium text-slate-300 leading-relaxed">
                  Le client possède des dossiers de prévoyance enregistrés dans le système. Profitez de ce moment pour valider l'exactitude de ses coordonnées et de ses couvertures actuelles directement sur votre écran secondaire.
                </p>
              </div>
            </div>
          )}

          {/* ÉTAPE 3 : PRISE DE NOTES */}
          {currentStep === "NOTES" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h3 className="text-2xl font-black tracking-tight">3. Notes d'entretien en direct</h3>
                <p className="text-sm text-slate-400 font-medium">Saisissez vos remarques, la situation globale ou les demandes spécifiques du client.</p>
              </div>
              <div className="relative">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tapez ici votre résumé (ex: Le client souhaite transférer son 3e pilier bancaire actuel chez AXA pour garantir une libération des primes, budget max 300 CHF/mois...)"
                  className="w-full h-48 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/20 resize-none leading-relaxed text-white"
                />
                <div className="absolute bottom-4 right-4 text-[10px] font-mono text-white/30 flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                  <FileText size={12} /> {notes.length} caractères
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 4 : CLÔTURE */}
          {currentStep === "CLOSE" && (
            <div className="space-y-6 text-center py-8 max-w-md mx-auto animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight">Prêt à clôturer le conseil ?</h3>
                <p className="text-sm text-slate-400 font-bold leading-relaxed">
                  En terminant la session, le compte-rendu sera figé et lié au dossier 360° du client. Une notification de synthèse sera générée de façon sécurisée.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* PIED DE PAGE ET NAVIGATION STABLE */}
        <div className="px-8 py-5 border-t border-white/10 bg-white/5 shrink-0 flex justify-between items-center">
          <div>
            {currentStep !== "OBJECTIFS" && (
              <Button 
                onClick={() => {
                  if (currentStep === "ANALYSIS") setCurrentStep("OBJECTIFS");
                  else if (currentStep === "NOTES") setCurrentStep("ANALYSIS");
                  else if (currentStep === "CLOSE") setCurrentStep("NOTES");
                }}
                className="bg-transparent border border-white/10 hover:bg-white/5 rounded-xl font-bold text-xs uppercase tracking-wider"
              >
                <ChevronLeft size={16} className="mr-1" /> Retour
              </Button>
            )}
          </div>

          <div>
            {currentStep !== "CLOSE" ? (
              <Button 
                onClick={() => {
                  if (currentStep === "OBJECTIFS") setCurrentStep("ANALYSIS");
                  else if (currentStep === "ANALYSIS") setCurrentStep("NOTES");
                  else if (currentStep === "NOTES") setCurrentStep("CLOSE");
                }}
                className="bg-white text-black hover:bg-slate-200 rounded-xl font-black text-xs uppercase tracking-wider gap-1"
              >
                Suivant <ChevronRight size={16} />
              </Button>
            ) : (
              <Button 
                onClick={handleSaveSession}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider gap-1.5 shadow-lg shadow-blue-600/20"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                Clôturer le rendez-vous
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Loader2({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`animate-spin ${className}`}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  );
}