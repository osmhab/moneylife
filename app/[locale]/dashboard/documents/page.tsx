//app/[locale]/dashboard/documents/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/index"; // Alias mis à jour
import { onAuthStateChanged } from "firebase/auth";
import ClientDocumentsView from "./_components/ClientDocumentsView";
import { FolderLock, ChevronLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation"; 

// 👈 NOUVEAU : Import pour la traduction
import { useTranslations } from "next-intl";

export default function ClientDocumentsPage() {
  const router = useRouter(); 
  const [uid, setUid] = useState<string | null>(null);

  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("DocumentsPage");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUid(user.uid);
    });
    return () => unsub();
  }, []);

  if (!uid) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-32">
      
      {/* HEADER STICKY : Reste en haut au scroll */}
      <div className="bg-[#F8F9FB]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-30 border-b border-slate-100">
        <button 
          onClick={() => router.push('/dashboard/prevoyance')} 
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-500 shadow-sm hover:bg-slate-50 active:scale-95 transition-all border border-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-1.5 text-emerald-600">
          <ShieldCheck size={14} />
          <h2 className="text-[10px] font-black uppercase tracking-widest">
            {t("secure_space")}
          </h2>
        </div>
        <div className="w-10" /> {/* Spacer pour centrer le titre */}
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-6 space-y-8">
        
        {/* HERO CARD : Un en-tête premium et rassurant */}
        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-slate-100 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
           {/* Effet lumineux en arrière-plan de la carte */}
           <div className="absolute -right-10 -top-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

           <div className="relative z-10 flex flex-col sm:flex-row items-start gap-5">
             <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
               <FolderLock size={28} />
             </div>
             <div>
               <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-tight">
                 {t("title")}
               </h1>
               <p className="text-sm font-bold text-slate-500 mt-2 leading-relaxed max-w-xl text-balance">
                 {t("description")}
               </p>
             </div>
           </div>
        </div>

        {/* LA VUE DES DOCUMENTS : Elle s'intègre parfaitement sous cette carte */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <ClientDocumentsView clientUid={uid} />
        </div>

      </div>
    </div>
  );
}