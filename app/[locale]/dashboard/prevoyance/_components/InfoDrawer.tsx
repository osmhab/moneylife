//app/[locale]/dashboard/prevoyance/_components/InfoDrawer.tsx
"use client";

import React from "react";
import { X, GraduationCap, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

interface InfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  title: string;
  value: string;
  definition: string;
  icon?: React.ReactNode;
}

export default function InfoDrawer({ 
  isOpen, 
  onClose, 
  onEdit, 
  title, 
  value, 
  definition, 
  icon 
}: InfoDrawerProps) {
  
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("InfoDrawer");

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden">
          
          {/* 1. OVERLAY SOMBRE ANIMÉ */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* 2. LE DRAWER INTERACTIF (DRAGGABLE) */}
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="y" // Glissement vertical uniquement
            dragConstraints={{ top: 0 }} // Empêche de monter plus haut que sa position
            dragElastic={0.2} // Petit effet de rebond vers le haut
            onDragEnd={(_, info) => {
              // Si on glisse vers le bas de plus de 100px, on ferme
              if (info.offset.y > 100) onClose();
            }}
            className="relative w-full max-w-md h-[82vh] flex flex-col items-center justify-start pt-24 pb-10 px-6
                       bg-gradient-to-b from-white/30 via-white/80 to-white
                       backdrop-blur-3xl rounded-t-[44px] shadow-2xl cursor-grab active:cursor-grabbing"
          >
            
            {/* LE HANDLE (Visible et interactif) */}
            <div className="absolute top-4 w-12 h-1.5 bg-slate-900/10 rounded-full" />
            
            {/* BOUTON FERMER */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 w-10 h-10 bg-black/5 hover:bg-black/10 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90"
            >
              <X size={20} className="text-slate-900/60" />
            </button>

            <div className="flex flex-col items-center text-center space-y-8 w-full">
              {/* Icône flottante */}
              <div className="w-22 h-22 bg-white/60 backdrop-blur-md rounded-[30px] flex items-center justify-center text-black shadow-sm border border-white [&>*]:text-black">
                {icon || <GraduationCap size={36} />}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.25em]">{title}</h3>
                <p className="text-slate-900 text-3xl font-black font-inter tracking-tight italic">{value}</p>
              </div>

              <Button 
                onClick={onEdit}
                className="rounded-full bg-slate-900 text-white px-10 py-6 h-auto text-sm font-bold shadow-2xl shadow-slate-900/20 active:scale-95 transition-all"
              >
                <Pencil size={14} className="mr-2" />
                {t("btn_edit")}
              </Button>

              {/* Carte de définition */}
              <div className="w-full bg-slate-50/40 rounded-[35px] p-8 border border-white/60 flex items-start space-x-4 text-left backdrop-blur-sm shadow-sm">
              <div className="shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center text-black shadow-sm border border-slate-50">
                <GraduationCap size={18} />
                </div>
                <p className="text-slate-600 text-[15px] leading-relaxed font-medium font-inter">
                  {definition}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}