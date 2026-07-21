//app/[locale]/admin/client/[uid]/prevoyance/page.tsx
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { PrevoyanceDashboardView } from "app/[locale]/dashboard/prevoyance/page";
import { ChevronLeft } from "lucide-react";

export default function AdminClientPrevoyancePage() {
  const params = useParams();
  const router = useRouter();
  const uid = params.uid as string;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barre d'outils Admin pour garder le contexte */}
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between relative z-40 shadow-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.close()} 
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mode Administration</p>
            <h1 className="text-sm font-bold">Dossier Prévoyance : {uid}</h1>
          </div>
        </div>
        <div className="px-3 py-1 bg-blue-500 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
          Édition en direct
        </div>
      </div>

      {/* On affiche EXACTEMENT la vue du client */}
      <PrevoyanceDashboardView adminUid={uid} />
    </div>
  );
}