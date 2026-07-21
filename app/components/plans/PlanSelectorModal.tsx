//app/components/plans/PlanSelectorModal.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Landmark, ShieldCheck, Wallet, Sparkles, FolderOpen, ArrowLeft } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// 1. Définition de l'interface des Props
interface PlanSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (planId: string) => void;
}

// 2. Application de l'interface au composant
export default function PlanSelectorModal({ 
  isOpen, 
  onClose, 
  onSelect 
}: PlanSelectorModalProps) {
  
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("PlanSelectorModal");

  // 👈 MAJ : Le tableau d'options est déplacé ici pour accéder à la traduction via t()
  const planOptions = useMemo(() => [
    {
      id: "LPP_BASE",
      title: t("opt_lpp_title"),
      subtitle: t("opt_lpp_sub"),
      icon: <Landmark size={20} />,
    },
    {
      id: "3A_BANQUE",
      title: t("opt_bank_title"),
      subtitle: t("opt_bank_sub"),
      icon: <Wallet size={20} />,
    },
    {
      id: "PILIER_3A_POLICE",
      title: t("opt_ins_title"),
      subtitle: t("opt_ins_sub"),
      icon: <ShieldCheck size={20} />,
    },
  ], [t]);
  
  // État pour gérer la vue actuelle
  const [view, setView] = useState<"choice" | "existing">("choice");

  // Réinitialiser la vue quand on ferme le drawer
  useEffect(() => {
    if (!isOpen) {
      // On attend la fin de l'animation de fermeture pour remettre à zéro
      const timer = setTimeout(() => setView("choice"), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Ajout de pt-8 pour compenser le retrait de la barre manuelle */}
      <DrawerContent className="bg-white border-none rounded-t-[40px] px-4 pt-8 pb-12 outline-none">
        
        {view === "choice" ? (
          /* ========================================================= */
          /* VUE 1 : LE CHOIX PRINCIPAL                                */
          /* ========================================================= */
          <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <DrawerHeader className="text-center p-0 mb-8">
              <DrawerTitle className="text-[28px] font-bold text-slate-900">
                {t("title_add_plan")}
              </DrawerTitle>
              <p className="text-slate-500 font-medium mt-2">
                {t("subtitle_what_to_do")}
              </p>
            </DrawerHeader>

            <div className="space-y-4">
              {/* Option 1 : Créer du neuf (Mise en avant avec ton violet) */}
              <button
                onClick={() => onSelect("NEW_3A_OFFER")}
                className="w-full flex items-center p-5 bg-gradient-to-r from-[#816DEC]/10 to-[#816DEC]/5 border border-[#816DEC]/20 hover:border-[#816DEC]/40 rounded-[28px] transition-all active:scale-[0.98] group outline-none"
              >
                <div className="w-14 h-14 bg-[#816DEC] rounded-full flex items-center justify-center text-white shadow-md shrink-0">
                  <Sparkles size={24} />
                </div>
                <div className="ml-4 text-left">
                  <p className="font-black text-[#816DEC] leading-tight text-[18px]">
                    {t("btn_create_new_title")}
                  </p>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    {t("btn_create_new_sub")}
                  </p>
                </div>
              </button>

              {/* Option 2 : Ajouter de l'existant */}
              <button
                onClick={() => setView("existing")}
                className="w-full flex items-center p-5 bg-[#F8F9FB] border border-transparent hover:border-slate-200 rounded-[28px] transition-all active:scale-[0.98] group outline-none"
              >
                <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center text-white shadow-sm shrink-0">
                  <FolderOpen size={24} />
                </div>
                <div className="ml-4 text-left">
                  <p className="font-black text-slate-900 leading-tight text-[18px]">
                    {t("btn_existing_title")}
                  </p>
                  <p className="text-sm text-slate-400 font-medium mt-1">
                    {t("btn_existing_sub")}
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* VUE 2 : LA LISTE DES CONTRATS EXISTANTS                   */
          /* ========================================================= */
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <DrawerHeader className="relative text-center p-0 mb-8">
              {/* Bouton retour */}
              <button 
                onClick={() => setView("choice")}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-600 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              
              <DrawerTitle className="text-[28px] font-bold text-slate-900">
                {t("title_existing")}
              </DrawerTitle>
              <p className="text-slate-500 font-medium mt-2">
                {t("subtitle_choose_type")}
              </p>
            </DrawerHeader>

            <div className="bg-[#F8F9FB] rounded-[32px] p-2 space-y-1">
              {planOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  className="w-full flex items-center p-4 hover:bg-white rounded-[24px] transition-all active:scale-[0.98] group outline-none"
                >
                  <div className="w-12 h-12 bg-[#4A4A4A] rounded-full flex items-center justify-center text-white shadow-sm shrink-0">
                    {option.icon}
                  </div>
                  <div className="ml-4 text-left">
                    <p className="font-bold text-slate-900 leading-tight text-[16px]">
                      {option.title}
                    </p>
                    <p className="text-sm text-slate-400 font-medium">
                      {option.subtitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}