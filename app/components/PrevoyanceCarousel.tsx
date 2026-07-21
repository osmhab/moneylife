//app/components/PrevoyanceCarousel.tsx

"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { Landmark, ShieldCheck, BarChart3, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

export default function PrevoyanceCarousel() {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("PrevoyanceCarousel");

  const carouselRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const { clientWidth } = carouselRef.current;
      carouselRef.current.scrollBy({ 
        left: direction === "left" ? -clientWidth : clientWidth, 
        behavior: "smooth" 
      });
    }
  };

  return (
    <section className="relative w-full h-[95vh] min-h-[700px] overflow-hidden bg-black group">
      
      {/* Flèche Gauche (Cachée sur mobile, visible sur Desktop) */}
      <button 
        onClick={() => scroll("left")}
        className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-20 w-14 h-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl hover:bg-white/20 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <ChevronLeft size={32} />
      </button>

      {/* Flèche Droite (Cachée sur mobile, visible sur Desktop) */}
      <button 
        onClick={() => scroll("right")}
        className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-20 w-14 h-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl hover:bg-white/20 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <ChevronRight size={32} />
      </button>

      {/* Conteneur Scrollable (Snap horizontal) */}
      <div 
        ref={carouselRef}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        
        {/* SLIDE 1 : PROFESSIONNELLE */}
        <div className="relative w-full h-full flex-shrink-0 snap-center flex flex-col items-center justify-center px-6">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#0a2342]/90" />
          
          <div className="relative z-10 mb-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              {t.rich("slide1_title", { br: () => <br /> })}
            </h2>
            <p className="text-white/70 font-medium text-sm md:text-base">{t("slide1_sub")}</p>
          </div>

          <div className="relative z-10 w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-[40px] p-8 border border-white/20 shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1a4f8a] flex items-center justify-center text-white mb-6 shadow-inner">
              <Landmark size={32} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">{t("slide1_badge")}</p>
            <h3 className="text-5xl font-black text-white tracking-tighter mb-8">74'000<span className="text-lg text-white/50">CHF</span></h3>
            <ul className="w-full space-y-4 text-left">
              <li className="flex items-center justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/80 font-bold">{t("slide1_li1_lbl")}</span>
                <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-full">{t("slide1_li1_val")}</span>
              </li>
              <li className="flex items-center justify-between text-sm pb-1">
                <span className="text-white/80 font-bold">{t("slide1_li2_lbl")}</span>
                <span className="text-white font-black">{t("slide1_li2_val")}</span>
              </li>
            </ul>
          </div>

          {/* Pagination Dots (Slide 1 Actif) */}
          <div className="relative z-10 flex gap-2 mt-8">
            <div className="w-8 h-1.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
          </div>

          <Link href="/login" className="relative z-10 mt-8 group flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-black uppercase tracking-widest text-[#1a4f8a] shadow-xl hover:scale-105 active:scale-95 transition-all">
            {t("btn_open_account")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* SLIDE 2 : PRIVÉE */}
        <div className="relative w-full h-full flex-shrink-0 snap-center flex flex-col items-center justify-center px-6">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/lacunes.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#3d0a32]/90" />
          
          <div className="relative z-10 mb-8 text-center">
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              {t.rich("slide2_title", { br: () => <br /> })}
            </h2>
          </div>

          <div className="relative z-10 w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-[40px] p-8 border border-white/20 shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#C7129E] flex items-center justify-center text-white mb-6 shadow-inner">
              <ShieldCheck size={32} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">{t("slide2_badge")}</p>
            <h3 className="text-5xl font-black text-white tracking-tighter mb-8">28'435 <span className="text-lg text-white/50">CHF</span></h3>
            <ul className="w-full space-y-4 text-left">
              <li className="flex items-center justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/80 font-bold">{t("slide2_li1_lbl")}</span>
                <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-full">{t("slide2_li1_val")}</span>
              </li>
              <li className="flex items-center justify-between text-sm pb-1">
                <span className="text-white/80 font-bold">{t("slide2_li2_lbl")}</span>
                <span className="text-emerald-400 font-black">{t("slide2_li2_val")}</span>
              </li>
            </ul>
          </div>

          {/* Pagination Dots (Slide 2 Actif) */}
          <div className="relative z-10 flex gap-2 mt-8">
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
            <div className="w-8 h-1.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
          </div>

          <Link href="/login" className="relative z-10 mt-8 group flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-black uppercase tracking-widest text-[#C7129E] shadow-xl hover:scale-105 active:scale-95 transition-all">
            {t("btn_open_account")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* SLIDE 3 : GLOBALE */}
        <div className="relative w-full h-full flex-shrink-0 snap-center flex flex-col items-center justify-center px-6">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/documents.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#043d2c]/90" />
          
          <div className="relative z-10 mb-8 text-center">
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              {t.rich("slide3_title", { br: () => <br /> })}
            </h2>
          </div>

          <div className="relative z-10 w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-[40px] p-8 border border-white/20 shadow-2xl flex flex-col items-center text-center">
            <div className="absolute inset-0 bg-emerald-500/10 blur-2xl rounded-[40px]"></div>
            
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#043d2c] flex items-center justify-center text-white mb-6 shadow-inner border border-emerald-500/30">
              <BarChart3 size={32} />
            </div>
            <p className="relative z-10 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">{t("slide3_badge")}</p>
            <h3 className="relative z-10 text-5xl font-black text-white tracking-tighter mb-8">102'435 <span className="text-lg text-white/50">CHF</span></h3>
            <ul className="relative z-10 w-full space-y-4 text-left">
              <li className="flex items-center justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/80 font-bold">{t("slide3_li1_lbl")}</span>
                <span className="text-white font-black">{t("slide3_li1_val")}</span>
              </li>
              <li className="flex items-center justify-between text-sm pb-1">
                <span className="text-white/80 font-bold">{t("slide3_li2_lbl")}</span>
                <span className="text-white font-black">{t("slide3_li2_val")}</span>
              </li>
            </ul>
          </div>

          {/* Pagination Dots (Slide 3 Actif) */}
          <div className="relative z-10 flex gap-2 mt-8">
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
            <div className="w-8 h-1.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
          </div>

          <Link href="/login" className="relative z-10 mt-8 group flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 hover:bg-emerald-400 active:scale-95 transition-all">
            {t("btn_start_analysis")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

      </div>
    </section>
  );
}