"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { Landmark, ShieldCheck, HeartPulse, Layers, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// --- COMPOSANT COMPTEUR ANIMÉ ---
function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const controls = animate(displayValue, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplayValue(Math.round(v)),
    });
    return controls.stop;
  }, [value]);

  return <>{displayValue}</>;
}

export default function PersonasWidget() {
  const t = useTranslations("ThirdPillar");
  const [activeIdx, setActiveIdx] = useState(0);

  // Données des personas : les valeurs non textuelles (image, prix, icône, couleur)
  // restent ici ; les libellés viennent des traductions (namespace ThirdPillar).
  const personas = [
    {
      id: "young",
      label: t("pw_young_label"),
      title: t("pw_young_title"),
      desc: t("pw_young_desc"),
      image: "/images/avatar-jeune.png",
      price: 350,
      blocks: [
        { id: "epargne", title: t("pw_young_b1_title"), subtitle: t("pw_young_b1_sub"), icon: Landmark, color: "bg-blue-500", shadow: "shadow-blue-500/30" }
      ]
    },
    {
      id: "career",
      label: t("pw_career_label"),
      title: t("pw_career_title"),
      desc: t("pw_career_desc"),
      image: "/images/avatar-freelance.png",
      price: 580,
      blocks: [
        { id: "epargne", title: t("pw_career_b1_title"), subtitle: t("pw_career_b1_sub"), icon: Landmark, color: "bg-blue-500", shadow: "shadow-blue-500/30" },
        { id: "revenu", title: t("pw_career_b2_title"), subtitle: t("pw_career_b2_sub"), icon: ShieldCheck, color: "bg-indigo-500", shadow: "shadow-indigo-500/30" }
      ]
    },
    {
      id: "family",
      label: t("pw_family_label"),
      title: t("pw_family_title"),
      desc: t("pw_family_desc"),
      image: "/images/avatar-famille.png",
      price: 720,
      blocks: [
        { id: "epargne", title: t("pw_family_b1_title"), subtitle: t("pw_family_b1_sub"), icon: Landmark, color: "bg-blue-500", shadow: "shadow-blue-500/30" },
        { id: "revenu", title: t("pw_family_b2_title"), subtitle: t("pw_family_b2_sub"), icon: ShieldCheck, color: "bg-indigo-500", shadow: "shadow-indigo-500/30" },
        { id: "family", title: t("pw_family_b3_title"), subtitle: t("pw_family_b3_sub"), icon: HeartPulse, color: "bg-rose-500", shadow: "shadow-rose-500/30" }
      ]
    }
  ];

  const activePersona = personas[activeIdx];
  const angleStep = 360 / personas.length;

  return (
    // 1. PADDING MOBILE RÉDUIT (p-6 au lieu de p-10) ET GAP RÉDUIT (gap-10)
    <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-24 p-6 sm:p-10 md:p-16 rounded-[32px] sm:rounded-[40px] bg-[#050505] border border-white/5 shadow-2xl relative overflow-hidden">
      
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] z-0" />

      {/* 2. TAILLE DE L'ORBITE RÉDUITE SUR MOBILE (w-[260px]) */}
      <div className="relative w-[260px] h-[260px] sm:w-[400px] sm:h-[400px] flex shrink-0 items-center justify-center z-10 mt-6 lg:mt-0">
        
        <div className="absolute inset-4 sm:inset-8 rounded-full border border-slate-800" />
        <div className="absolute inset-4 sm:inset-8 rounded-full border border-[#a855f7]/20 shadow-[0_0_50px_rgba(168,85,247,0.1)]" />

        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: activeIdx * -angleStep }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
        >
          {personas.map((persona, i) => {
            const rotation = i * angleStep;
            return (
              <div
                key={persona.id}
                // 3. TAILLE DU RAIL AJUSTÉE SUR MOBILE (w-[240px])
                className="absolute top-1/2 left-1/2 flex items-center justify-center w-[240px] h-[240px] sm:w-[380px] sm:h-[380px] pointer-events-none"
                style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <motion.button
                    onClick={() => setActiveIdx(i)}
                    animate={{ rotate: (activeIdx * angleStep) - rotation }}
                    transition={{ type: "spring", stiffness: 50, damping: 20 }}
                    // 4. AVATARS PLUS PETITS SUR MOBILE (w-12 h-12)
                    className={`pointer-events-auto relative flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 rounded-full border-2 overflow-hidden transition-all duration-300 focus:outline-none ${activeIdx === i ? "border-[#a855f7] scale-125 shadow-[0_0_30px_rgba(168,85,247,0.5)] z-20" : "border-slate-800 opacity-40 hover:opacity-100 hover:scale-110 z-10"}`}
                  >
                    <img src={persona.image} alt={persona.label} className="w-full h-full object-cover" />
                    <div className={`absolute inset-0 transition-colors ${activeIdx === i ? "bg-transparent" : "bg-black/40 hover:bg-transparent"}`} />
                  </motion.button>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* 5. CŒUR DU RÉACTEUR AJUSTÉ (w-32 h-32) */}
        <div className="relative z-20 flex flex-col items-center justify-center text-center w-32 h-32 sm:w-48 sm:h-48 rounded-full bg-[#050505] border border-slate-800 shadow-2xl backdrop-blur-md">
            <p className="text-[9px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-1">{t("pw_total")}</p>
            <div className="flex items-end gap-1 text-white">
              <span className="text-3xl sm:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
                <AnimatedNumber value={activePersona.price} />
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-500 mb-1 sm:mb-2">CHF</span>
            </div>
        </div>
      </div>

      {/* COLONNE DE DROITE */}
      <div className="flex-1 w-full flex flex-col items-start max-w-xl z-10">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#1A0B2E] border border-[#a855f7]/30 mb-6">
          <Layers size={14} className="text-[#a855f7]" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{t("pw_profile", { label: activePersona.label })}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.h2
            key={activePersona.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            // 6. TYPOGRAPHIE RÉDUITE POUR MOBILE (text-3xl)
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-4 leading-[1.1]"
          >
            {activePersona.title}
          </motion.h2>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.p
            key={activePersona.desc}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            // 7. HAUTEUR MINIMALE ADAPTÉE POUR MOBILE (min-h-[110px])
            className="text-base sm:text-lg text-slate-400 leading-relaxed mb-8 font-medium min-h-[110px] sm:min-h-[90px]"
          >
            {activePersona.desc}
          </motion.p>
        </AnimatePresence>

        <div className="w-full flex flex-col gap-3 mb-8">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{t("pw_composition")}</p>
          <AnimatePresence initial={false}>
            {activePersona.blocks.map((block, index) => {
              const Icon = block.icon;
              return (
                <motion.div
                  key={block.id}
                  initial={{ opacity: 0, y: 15, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, y: 15, height: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30, delay: index * 0.1 }}
                  className="bg-white/5 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between border border-white/10 origin-bottom"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 rounded-xl ${block.color} flex items-center justify-center text-white shrink-0 shadow-lg ${block.shadow}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{block.title}</p>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">{block.subtitle}</p>
                    </div>
                  </div>
                  <CheckCircle size={16} className="text-[#a855f7]/50 hidden sm:block" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <Link href="/signup" className="group inline-flex items-center justify-center gap-3 px-6 sm:px-8 py-4 rounded-xl bg-white text-black font-bold text-sm sm:text-[15px] transition-all hover:bg-slate-200 active:scale-95 w-full sm:w-auto shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]">
          {t("pw_cta")} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}