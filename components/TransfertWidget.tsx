"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, FileText, CheckCircle2, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function TransfertWidget() {
  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-[32px] overflow-hidden bg-slate-900 shadow-2xl isolate">
      
      {/* EFFET 21st.dev : BORDER BEAM (Faisceau lumineux rotatif sur la bordure) */}
      <div className="absolute inset-0 z-0 overflow-hidden rounded-[32px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ ease: "linear", duration: 8, repeat: Infinity }}
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0_340deg,#816DEC_360deg)] opacity-20"
        />
        <div className="absolute inset-[2px] bg-slate-900 rounded-[30px] z-10" />
      </div>

      <div className="relative z-20 grid grid-cols-1 lg:grid-cols-2 gap-12 p-8 md:p-12 items-center">
        
        {/* TEXTE & CALL TO ACTION */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20">
            <Sparkles size={14} className="text-fuchsia-400" />
            <span className="text-[11px] font-bold text-fuchsia-400 uppercase tracking-widest">Nouveau : Audit IA</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
            Vous avez déjà un 3e pilier ? <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#816DEC] to-fuchsia-400">
              L'IA l'optimise pour vous.
            </span>
          </h2>
          <p className="text-slate-400 text-lg font-medium leading-relaxed">
            Ne laissez pas votre argent dormir dans un contrat obsolète. Notre algorithme scanne votre ancienne police, calcule les pénalités de sortie, et vous montre <strong className="text-white">exactement combien vous gagnez</strong> en transférant chez CreditX.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Link href="/audit" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-slate-900 font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              Auditer mon contrat <ArrowRight size={18} />
            </Link>
            <div className="flex items-center gap-3 text-slate-400 text-xs font-bold uppercase tracking-widest">
              <CheckCircle2 size={16} className="text-emerald-400" /> Gratuit & Sans engagement
            </div>
          </div>
        </div>

        {/* L'ANIMATION DU SCANNER */}
        <div className="relative w-full aspect-square md:aspect-[4/3] rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden flex items-center justify-center p-6">
          
          {/* L'ancien contrat (en gris, flou) */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="absolute left-6 top-10 w-48 h-64 bg-slate-800 rounded-xl border border-slate-700 p-4 shadow-xl flex flex-col gap-3 -rotate-6"
          >
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
              <FileText size={16} className="text-slate-500" />
              <div className="h-2 w-16 bg-slate-600 rounded-full" />
            </div>
            <div className="space-y-2 mt-2">
              <div className="h-2 w-full bg-slate-700 rounded-full" />
              <div className="h-2 w-3/4 bg-slate-700 rounded-full" />
              <div className="h-2 w-5/6 bg-slate-700 rounded-full" />
            </div>
            <div className="mt-auto">
              <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Rendement estimé</p>
              <p className="text-xl font-black text-slate-600">+ 0.8%</p>
            </div>
          </motion.div>

          {/* Le nouveau Dashboard CreditX (Lumineux) */}
          <motion.div 
            initial={{ y: 50, opacity: 0, x: 20 }}
            whileInView={{ y: 0, opacity: 1, x: 0 }}
            transition={{ delay: 0.3, type: "spring" }}
            viewport={{ once: true }}
            className="absolute right-6 bottom-10 w-56 h-auto bg-slate-900 rounded-2xl border border-[#816DEC]/50 p-5 shadow-[0_0_40px_rgba(129,109,236,0.3)] z-10 rotate-3 backdrop-blur-xl"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#816DEC]/20 flex items-center justify-center text-[#816DEC]">
                <TrendingUp size={16} />
              </div>
              <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">Optimisé</span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Gain Net à la retraite</p>
            
            {/* L'effet compteur (On simule l'emballement des chiffres) */}
            <motion.div 
              initial={{ scale: 0.8 }}
              whileInView={{ scale: 1 }}
              transition={{ delay: 0.6, type: "spring", bounce: 0.6 }}
              viewport={{ once: true }}
              className="text-3xl font-black text-white tracking-tighter"
            >
              + 42'500 <span className="text-sm text-slate-500 font-bold">CHF</span>
            </motion.div>
            
            <div className="mt-4 pt-4 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 leading-tight">Pénalité de rachat de 3'200 CHF déjà absorbée.</p>
            </div>
          </motion.div>

          {/* La ligne de scan IA */}
          <motion.div
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 4, ease: "linear", repeat: Infinity }}
            className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent z-20 shadow-[0_0_15px_#d946ef]"
          />
        </div>
      </div>
    </div>
  );
}