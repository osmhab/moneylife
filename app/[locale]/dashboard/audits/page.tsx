// app/[locale]/dashboard/audits/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Calendar, 
  FileText, 
  Target, 
  ChevronRight, 
  Loader2, 
  ClipboardList,
  CheckCircle2,
  X,
  UserCheck
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function AuditsHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  // Récupération de l'historique de la base de données
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const sessionsRef = collection(db, "clients", user.uid, "conseils_sessions");
          const q = query(sessionsRef, orderBy("createdAt", "desc"));
          const querySnapshot = await getDocs(q);
          
          const fetchedSessions = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          setSessions(fetchedSessions);
        } catch (error) {
          console.error("Erreur lors de la récupération des sessions :", error);
        } finally {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600 mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Chargement de l'historique...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      
      {/* HEADER DE LA PAGE */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-bold text-sm"
          >
            <ArrowLeft size={18} />
            Retour
          </button>
          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <ClipboardList size={16} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        
        {/* TITRE */}
        <div className="mb-12">
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Historique d'Expertise</h1>
          <p className="text-slate-500 font-medium mt-2 leading-relaxed max-w-lg">
            Retrouvez ici la traçabilité complète de vos entretiens, les notes de votre conseiller et les objectifs fixés lors de chaque session.
          </p>
        </div>

        {/* TIMELINE DES SESSIONS */}
        {sessions.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-black text-slate-900">Aucun historique disponible</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 max-w-sm">
              Votre conseiller n'a pas encore clôturé de rapport d'expertise vous concernant.
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-blue-100 ml-4 md:ml-6 space-y-8 pb-8">
            {sessions.map((session, index) => {
              // Extraction des dates
              const dateSession = session.dateSession || (session.createdAt ? new Date(session.createdAt.toMillis()).toLocaleDateString('fr-CH') : "Date inconnue");
              const nextRdvDate = session.nextRdvPlanifie?.date ? new Date(session.nextRdvPlanifie.date).toLocaleDateString('fr-CH') : null;

              return (
                <div key={session.id} className="relative pl-8 md:pl-12 group">
                  {/* Puce Timeline */}
                  <div className="absolute -left-[11px] top-1 w-5 h-5 rounded-full bg-blue-100 border-4 border-slate-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:scale-125 transition-all duration-300">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full group-hover:bg-white transition-colors" />
                  </div>

                  {/* Date formatée sur le côté ou au dessus */}
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2">
                    {dateSession}
                  </span>

                  {/* Carte interactive */}
                  <div 
                    onClick={() => setSelectedSession(session)}
                    className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-6"
                  >
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <h4 className="text-lg font-black text-slate-900 truncate">Dossier clôturé</h4>
                      </div>
                      
                      {session.nextRdvPlanifie?.objectf && (
                        <p className="text-sm font-medium text-slate-600 flex items-center gap-2">
                          <Target size={14} className="text-slate-400" />
                          <span className="truncate">Objectif : {session.nextRdvPlanifie.objectf}</span>
                        </p>
                      )}

                      {/* Snippet des notes s'il y en a */}
                      {session.quickNotesSnapshot && (
                        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 font-medium italic line-clamp-2 border border-slate-100">
                          "{session.quickNotesSnapshot}"
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex sm:flex-col items-center justify-between gap-4">
                      {nextRdvDate && (
                        <div className="text-right">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Prochain point</span>
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
                            {nextRdvDate}
                          </span>
                        </div>
                      )}
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALE DE DÉTAIL DU RAPPORT (GLASSMORPHISM) */}
      <AnimatePresence>
        {selectedSession && (
          <>
            {/* Backdrop Flou */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSession(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />

            {/* Fenêtre Modale centrée */}
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-20 bottom-10 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl bg-white rounded-[40px] shadow-2xl z-[110] flex flex-col overflow-hidden border border-slate-100"
            >
              
              {/* Header Modale */}
              <div className="bg-slate-900 px-8 py-6 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                    <FileText size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Rapport d'Expertise</h3>
                    <p className="text-xs font-medium text-slate-400">
                      Enregistré le {selectedSession.dateSession || new Date(selectedSession.createdAt.toMillis()).toLocaleDateString('fr-CH')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-slate-300 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Contenu Scrollable */}
              <div className="p-8 overflow-y-auto flex-1 space-y-8 bg-slate-50/50">
                
                {/* 1. Prochaine étape fixée */}
                {selectedSession.nextRdvPlanifie?.date && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="w-14 h-14 bg-blue-600 rounded-2xl text-white flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Planification</h4>
                      <p className="text-lg font-black text-slate-900 leading-tight">
                        Rendez-vous fixé le {new Date(selectedSession.nextRdvPlanifie.date).toLocaleDateString('fr-CH')}
                      </p>
                      <p className="text-sm font-medium text-slate-500 mt-1">
                        Objectif : {selectedSession.nextRdvPlanifie.objectf}
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. Notes du conseiller */}
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">
                    <UserCheck size={14} /> Observations du Conseiller
                  </h4>
                  {selectedSession.quickNotesSnapshot ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {selectedSession.quickNotesSnapshot}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Aucune note additionnelle n'a été ajoutée à ce rapport.</p>
                  )}
                </div>

                {/* 3. Recommandation (Si un lien a été généré lors de la session) */}
                {selectedSession.referralCode && (
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">
                      <Target size={14} /> Programme Privilège
                    </h4>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-slate-900">Code de recommandation généré</p>
                        <p className="text-xs text-slate-500 mt-0.5">Valide pour parrainer votre entourage</p>
                      </div>
                      <span className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-black text-slate-800">
                        {selectedSession.referralCode}
                      </span>
                    </div>
                  </div>
                )}

              </div>
              
              {/* Footer Modale */}
              <div className="bg-white px-8 py-5 border-t border-slate-100 flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="px-6 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Fermer
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}