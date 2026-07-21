"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, ShieldCheck, Landmark, HeartPulse, ShieldAlert, Cpu } from "lucide-react";
import Link from "next/link";

// --- DONNÉES DU MARCHÉ & DES PROFILS ---
const TOTAL_TILES = 24; // Une grille de 24 prestataires/fonds

const profiles = [
  {
    id: "young",
    label: "Jeune Actif",
    color: "#3b82f6", // Blue
    glow: "rgba(59, 130, 246, 0.5)",
    winners: [2, 11, 19], // Les index des tuiles gagnantes dans la grille
    details: [
      { title: "Banque A", desc: "Fonds Actions 100%", icon: Landmark },
      { title: "Assurance X", desc: "Exonération primes", icon: ShieldCheck },
      { title: "Gestion IA", desc: "Rééquilibrage auto", icon: Cpu }
    ]
  },
  {
    id: "career",
    label: "Indépendante",
    color: "#a855f7", // Purple
    glow: "rgba(168, 85, 247, 0.5)",
    winners: [4, 9, 21],
    details: [
      { title: "Banque B", desc: "Profil Équilibré ESG", icon: Landmark },
      { title: "Assurance Y", desc: "Rente Incapacité Max", icon: ShieldAlert },
      { title: "Assurance Z", desc: "Protection Juridique", icon: ShieldCheck }
    ]
  },
  {
    id: "family",
    label: "Père de Famille",
    color: "#10b981", // Emerald
    glow: "rgba(16, 185, 129, 0.5)",
    winners: [0, 14, 22],
    details: [
      { title: "Banque C", desc: "Capital Garanti 3a", icon: Landmark },
      { title: "Assurance W", desc: "Capital Décès 300k", icon: HeartPulse },
      { title: "Assurance X", desc: "Rente Invalidité", icon: ShieldAlert }
    ]
  }
];

export default function MarketMatrix() {
  const [activeIdx, setActiveIdx] = useState(1); // Commence sur "Indépendante"
  const activeProfile = profiles[activeIdx];
  
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pathCoordinates, setPathCoordinates] = useState("");

  // Fonction pour dessiner la ligne entre les tuiles gagnantes
  const updateLaserPath = () => {
    if (!gridRef.current) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    
    const points = activeProfile.winners.map(index => {
      const tile = tileRefs.current[index];
      if (!tile) return null;
      const rect = tile.getBoundingClientRect();
      // Calculer le centre de la tuile par rapport à la grille
      return {
        x: rect.left - gridRect.left + rect.width / 2,
        y: rect.top - gridRect.top + rect.height / 2
      };
    }).filter(Boolean) as {x: number, y: number}[];

    if (points.length < 2) return;

    // Créer un chemin SVG fluide (Courbes)
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      // Points de contrôle pour courber la ligne
      const cpX = prev.x + (curr.x - prev.x) / 2;
      d += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    setPathCoordinates(d);
  };

  // Mettre à jour le laser au changement de profil ou redimensionnement
  useEffect(() => {
    // Petit délai pour laisser le temps au DOM de se peindre correctement
    const timeoutId = setTimeout(updateLaserPath, 50);
    window.addEventListener("resize", updateLaserPath);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateLaserPath);
    };
  }, [activeIdx]);

  return (
    <div className="w-full bg-[#050505] rounded-[32px] sm:rounded-[40px] border border-white/10 shadow-2xl overflow-hidden py-16 sm:py-20 px-6 sm:px-12 relative flex flex-col items-center">
      
      {/* Grille de fond très subtile */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:2rem_2rem] z-0" />

      {/* EN-TÊTE DE LA SECTION */}
      <div className="relative z-20 flex flex-col items-center text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
          <Sparkles size={14} className="text-white" />
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Scanner de Marché IA</span>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white mb-6 leading-tight">
          Filtrer le bruit. <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-white">Ne garder que l'excellence.</span>
        </h2>
        <p className="text-base sm:text-lg text-slate-400 font-medium leading-relaxed max-w-2xl">
          Plus de 40 partenaires analysés en temps réel. Sélectionnez un profil ci-dessous et regardez notre algorithme isoler la combinaison parfaite pour votre 3e pilier.
        </p>
      </div>

      {/* SÉLECTEUR DE PROFILS */}
      <div className="relative z-20 flex flex-wrap justify-center gap-3 p-2 bg-white/5 backdrop-blur-md rounded-full border border-white/10 mb-12">
        {profiles.map((profile, idx) => (
          <button
            key={profile.id}
            onClick={() => setActiveIdx(idx)}
            className={`relative px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${activeIdx === idx ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            {activeIdx === idx && (
              <motion.div
                layoutId="matrixTab"
                className="absolute inset-0 rounded-full z-0 border"
                style={{ backgroundColor: `${profile.color}20`, borderColor: `${profile.color}50` }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            )}
            <span className="relative z-10">{profile.label}</span>
          </button>
        ))}
      </div>

      {/* LA MATRICE (LA GRILLE DE TUILES) */}
      <div className="relative z-10 w-full max-w-4xl mx-auto" ref={gridRef}>
        
        {/* LE LASER ANIMÉ (SVG Overlay) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" style={{ overflow: 'visible' }}>
          <motion.path
            key={activeProfile.id} // Force le re-render de l'animation à chaque changement
            d={pathCoordinates}
            fill="none"
            stroke={activeProfile.color}
            strokeWidth="3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            style={{ filter: `drop-shadow(0 0 10px ${activeProfile.color})` }}
          />
        </svg>

        {/* LES TUILES */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 relative z-10">
          {Array.from({ length: TOTAL_TILES }).map((_, index) => {
            const isWinner = activeProfile.winners.includes(index);
            const winnerDataIndex = activeProfile.winners.indexOf(index);
            const winnerData = isWinner ? activeProfile.details[winnerDataIndex] : null;
            const Icon = winnerData?.icon;

            return (
              <motion.div
                key={index}
                // @ts-ignore : Assignation dynamique de la ref
                ref={(el) => (tileRefs.current[index] = el)}
                animate={{
                  opacity: isWinner ? 1 : 0.15,
                  scale: isWinner ? 1.05 : 1,
                  borderColor: isWinner ? activeProfile.color : "rgba(255,255,255,0.05)",
                  backgroundColor: isWinner ? `${activeProfile.color}15` : "rgba(255,255,255,0.02)",
                }}
                transition={{ duration: 0.5 }}
                className="aspect-square rounded-xl sm:rounded-2xl border backdrop-blur-sm flex flex-col items-center justify-center p-2 text-center transition-all shadow-lg relative overflow-hidden"
              >
                {isWinner && winnerData && Icon && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="flex flex-col items-center gap-1 sm:gap-2"
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${activeProfile.color}30`, color: activeProfile.color }}>
                      <Icon size={14} className="sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white leading-tight mb-0.5">{winnerData.title}</p>
                        <p className="text-[9px] text-slate-400 font-medium leading-tight">{winnerData.desc}</p>
                    </div>
                  </motion.div>
                )}
                {/* Lueur de fond si gagnant */}
                {isWinner && (
                    <div className="absolute inset-0 blur-xl opacity-30 pointer-events-none" style={{ backgroundColor: activeProfile.color }} />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* PANNEAU RÉCAPITULATIF (RÉSULTAT) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeProfile.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="relative z-20 mt-12 sm:mt-16 w-full max-w-2xl bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Architecture du Plan</p>
            <p className="text-lg font-bold text-white">3 modules assemblés <span className="text-slate-500 font-medium">parmi 40+ partenaires.</span></p>
          </div>
          <Link href="/signup" className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-black text-xs sm:text-sm uppercase tracking-widest transition-all hover:bg-slate-200 active:scale-95 shrink-0">
            Découvrir mes matchs
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </AnimatePresence>

    </div>
  );
}