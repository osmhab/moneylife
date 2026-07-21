//app/[locale]/dashboard/prevoyance/_components/UploadSourceDrawer.tsx
"use client";

import React, { useMemo } from "react";
import { Camera, Image as ImageIcon, FileSearch, ArrowRight } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

interface UploadSourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceSelect: (source: "camera" | "gallery" | "files") => void;
}

export default function UploadSourceDrawer({ 
  isOpen, 
  onClose, 
  onSourceSelect 
}: UploadSourceDrawerProps) {
  // 👈 NOUVEAU : Initialisation des traductions
  const t = useTranslations("UploadSourceDrawer");
  
  // 👈 MAJ : Le tableau est maintenant dans le composant pour accéder à 't'
  const sources = useMemo(() => [
    { id: "camera", title: t("src_camera"), icon: <Camera size={20} /> },
    { id: "gallery", title: t("src_gallery"), icon: <ImageIcon size={20} /> },
    { id: "files", title: t("src_files"), icon: <FileSearch size={20} /> },
  ] as const, [t]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* MAJ : Ajout de pt-8 pour garder un bel espacement en haut */}
      <DrawerContent className="bg-white border-none rounded-t-[40px] px-4 pt-8 pb-12 outline-none">
        
        <DrawerHeader className="text-center p-0 mb-8">
          <DrawerTitle className="text-[26px] font-bold text-slate-900">
            {t("title")}
          </DrawerTitle>
        </DrawerHeader>

        <div className="bg-[#F8F9FB] rounded-[32px] p-2 space-y-1">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => onSourceSelect(source.id as any)}
              className="w-full flex items-center p-4 hover:bg-white rounded-[24px] transition-all active:scale-[0.98] group outline-none"
            >
              <div className="w-12 h-12 bg-[#4A4A4A] rounded-full flex items-center justify-center text-white">
                {source.icon}
              </div>
              <div className="flex-1 ml-4 text-left">
                <p className="font-bold text-slate-900 text-[16px]">
                  {source.title}
                </p>
              </div>
              <ArrowRight className="text-slate-300 group-hover:text-slate-900" size={18} />
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}