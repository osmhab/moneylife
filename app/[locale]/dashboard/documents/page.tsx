//app/[locale]/dashboard/documents/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/index"; // Alias mis à jour
import { onAuthStateChanged } from "firebase/auth";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppOnlyScreen } from "@/app-components/AppOnly";

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

      {/* Coffre-fort disponible UNIQUEMENT sur l'app → écran de redirection. */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <AppOnlyScreen feature="vault" />
      </div>
    </div>
  );
}