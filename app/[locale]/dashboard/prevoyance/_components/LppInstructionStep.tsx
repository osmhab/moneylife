//app/[locale]/dashboard/prevoyance/_components/LppInstructionStep.tsx
"use client";

import React from "react";
import { FileText, Camera, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation"; 

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

interface LppInstructionStepProps {
  onBack: () => void;
  onNext: () => void;
}

export default function LppInstructionStep({ onBack, onNext }: LppInstructionStepProps) {
  const router = useRouter(); 
  
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("LppInstructionStep");

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-white px-6 pt-6 pb-8">
      
      {/* Bouton Retour */}
      <button 
        onClick={onBack} 
        className="self-start p-2 -ml-2 mb-4 text-slate-400 hover:text-black transition-colors active:scale-95"
      >
        <ArrowLeft size={24} />
      </button>

      {/* Contenu central qui prend l'espace restant (flex-1) */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-sm mx-auto">
        
        {/* Visuel central */}
        <div className="relative mt-4">
          <div className="w-28 h-28 bg-slate-50 rounded-[28px] flex items-center justify-center border border-slate-100 shadow-sm">
            <FileText size={44} className="text-blue-500" />
          </div>
          <div className="absolute -top-3 -right-3 w-10 h-10 bg-black rounded-full flex items-center justify-center border-[3px] border-white shadow-md">
            <Camera size={16} className="text-white" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">
            {t("title")}
          </h2>
          <p className="text-slate-500 font-bold text-sm leading-relaxed text-balance">
            {t("subtitle")}
          </p>
        </div>

        {/* Liste d'instructions style Revolut */}
        <div className="w-full space-y-4 text-left pt-6">
          <div className="flex items-start space-x-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-black text-blue-600 shrink-0">1</div>
            <p className="text-slate-600 text-xs font-bold leading-snug mt-0.5">{t("instruction_1")}</p>
          </div>
          <div className="flex items-start space-x-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-black text-blue-600 shrink-0">2</div>
            <p className="text-slate-600 text-xs font-bold leading-snug mt-0.5">{t("instruction_2")}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto pt-8 space-y-4 max-w-sm mx-auto w-full">
        <Button 
          onClick={onNext}
          className="w-full rounded-[20px] bg-black text-white py-7 text-lg font-black shadow-xl hover:bg-slate-800 transition-all active:scale-95 uppercase tracking-widest"
        >
          {t("btn_continue")}
        </Button>
        <button 
          onClick={() => router.push('/dashboard/prevoyance')}
          className="w-full text-slate-400 hover:text-slate-600 font-bold py-3 text-[10px] uppercase tracking-widest transition-colors active:scale-95"
        >
          {t("btn_no_document")}
        </button>
      </div>

    </div>
  );
}