"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, AnimatePresence, useMotionValueEvent } from "framer-motion";

const formatCHF = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "’");

function useCountUp(targetValue: number, durationMs: number, trigger: boolean) {
  const [count, setCount] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!trigger || hasStarted.current) return;
    hasStarted.current = true;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / durationMs, 1);
      
      if (progress === 1) {
        setCount(targetValue);
        return;
      }

      const easeOutExpo = 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(easeOutExpo * targetValue));
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [trigger, targetValue, durationMs]);

  return count;
}

function HeartBeat() {
  return (
    <motion.div
      animate={{ scale: [1, 1.15, 1.05, 1.2, 1], filter: ["drop-shadow(0 0 0px rgba(239,68,68,0))", "drop-shadow(0 0 15px rgba(239,68,68,0.4))", "drop-shadow(0 0 0px rgba(239,68,68,0))"] }}
      transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
      className="text-red-500 mb-8 flex justify-center"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-20 h-20">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3c1.913 0 3.607 1.019 4.562 2.594 1.109-1.826 3.123-2.594 5.375-2.594 2.974 0 5.438 2.322 5.438 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
      </svg>
    </motion.div>
  );
}

export default function MilestoneParallaxAd({ onClose, milestoneCHF = 500_000, goalCHF = 10_000_000 }: { onClose: () => void; milestoneCHF?: number; goalCHF?: number; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });

  useMotionValueEvent(useTransform(scrollYProgress, [0, 0.33, 0.66, 1], [0, 1, 2, 3]), "change", (latest) => {
    const rounded = Math.round(latest);
    if (rounded !== activeSlide) setActiveSlide(rounded);
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => { if (latest >= 0.99) onClose(); });

  const barWidth = useTransform(scrollYProgress, [0.4, 0.8], ["0%", "100%"]);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.4, 1, 1, 0]);
  
  // Progression horizontale
  const horizontalProgress = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  const animatedMilestone = useCountUp(milestoneCHF, 1500, activeSlide === 1);
  const animatedGoal = useCountUp(goalCHF, 1500, activeSlide === 2);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full overflow-y-auto snap-y snap-mandatory scroll-smooth" 
      style={{ height: "400vh" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-screen w-full snap-start" />
        ))}
      </div>

      <div className="fixed inset-0 h-screen w-full bg-[#F8FAFC] z-[9999] flex flex-col items-center justify-center overflow-hidden pointer-events-none">
        
        {/* ✅ TIMELINE MOBILE-FRIENDLY ET SYNCHRONISÉE */}
        <div className="absolute top-0 left-0 w-full h-1 bg-slate-200/50">
          <motion.div 
            style={{ width: horizontalProgress }} 
            className="h-full bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
          />
          
          {/* Points d'étape synchronisés avec activeSlide */}
          <div className="absolute top-0 left-0 w-full h-full flex justify-between px-6 sm:px-20 lg:px-40">
            {[0, 1, 2, 3].map((step) => (
              <div key={step} className="relative flex flex-col items-center justify-center h-full">
                <motion.div 
                  initial={false}
                  animate={{ 
                    scale: activeSlide === step ? 1.4 : 1,
                    backgroundColor: activeSlide >= step ? "#2563eb" : "#cbd5e1",
                    boxShadow: activeSlide === step ? "0 0 10px rgba(37,99,235,0.5)" : "0 0 0px transparent"
                  }}
                  className="w-2.5 h-2.5 rounded-full border-2 border-[#F8FAFC] z-10 transition-colors duration-300"
                />
              </div>
            ))}
          </div>
        </div>

        <motion.div style={{ opacity: bgOpacity }} className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-50 rounded-full blur-[120px]" />
        </motion.div>

        {/* Bouton Passé - Position ajustée pour mobile */}
        <button 
          onClick={onClose}
          className="absolute right-4 top-8 sm:right-8 sm:top-10 z-[10000] group flex items-center gap-2 sm:gap-3 rounded-full bg-white/80 backdrop-blur-md px-4 py-2 sm:px-6 sm:py-3 text-[10px] sm:text-xs font-bold text-[#001D38] border border-slate-200 shadow-sm pointer-events-auto"
        >
          <span className="opacity-50 group-hover:rotate-90 transition-transform">✕</span>
          <span className="hidden xs:inline">PASSER LA PRÉSENTATION</span>
          <span className="xs:hidden">PASSER</span>
        </button>

        <div className="relative z-10 w-full max-w-5xl px-6 sm:px-8">
          <AnimatePresence mode="wait">
            {activeSlide === 0 && (
              <Slide key="0">
                <div className="text-center">
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-blue-600 font-bold tracking-[0.3em] uppercase text-[10px] mb-4 block">Manifeste 2026</motion.span>
                  <h2 className="font-dmserif text-4xl md:text-7xl text-[#001D38] leading-[1.1]">
                    Depuis le <br/> 
                    <span className="italic text-blue-900">1<sup className="text-2xl lowercase">er</sup> janvier 2026</span>
                  </h2>
                  <motion.div className="mt-12 sm:mt-20 flex flex-col items-center gap-4">
                    <div className="w-px h-12 sm:h-16 bg-gradient-to-b from-blue-600 to-transparent" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scrollez</span>
                  </motion.div>
                </div>
              </Slide>
            )}

            {activeSlide === 1 && (
              <Slide key="1">
                <div className="text-center relative">
                  <div className="absolute -top-16 -left-4 text-[8rem] sm:text-[12rem] font-dmserif text-slate-100/50 select-none z-0">Result</div>
                  <div className="relative z-10">
                    <span className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mb-4 sm:mb-6 block">Impact Clients</span>
                    <div className="font-dmserif text-5xl sm:text-9xl text-[#001D38] tabular-nums leading-none">
                      <span className="text-2xl sm:text-4xl align-top mr-1 sm:mr-2 text-blue-600">CHF</span>
                      {formatCHF(animatedMilestone)}
                    </div>
                    <p className="mt-6 sm:mt-8 text-slate-500 text-lg sm:text-xl font-light max-w-md mx-auto leading-relaxed">
                      de potentiel identifié pour nos clients.
                    </p>
                  </div>
                </div>
              </Slide>
            )}

            {activeSlide === 2 && (
              <Slide key="2">
                <div className="w-full max-w-2xl text-center mx-auto">
                  <h2 className="font-dmserif text-4xl sm:text-6xl text-[#001D38] mb-8 sm:mb-12">
                    Objectif fin 2026, <br/> <span className="text-blue-600">on voit grand.</span>
                  </h2>
                  <div className="bg-white/40 backdrop-blur-xl rounded-[30px] sm:rounded-[40px] p-6 sm:p-10 border border-white/60 shadow-2xl shadow-blue-900/5">
                    <div className="font-dmserif text-4xl sm:text-8xl text-[#001D38] mb-6 sm:mb-8 tabular-nums tracking-tighter">
                      {formatCHF(animatedGoal)}
                    </div>
                    <div className="space-y-4">
                      <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                        <motion.div style={{ width: barWidth }} className="h-full bg-[#001D38]" />
                      </div>
                      <div className="flex justify-between text-[9px] sm:text-[10px] font-black text-blue-900/40 uppercase tracking-widest">
                        <span>Lancement</span>
                        <span>Sommet</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Slide>
            )}

            {activeSlide === 3 && (
              <Slide key="3">
                <div className="text-center">
                  <HeartBeat />
                  <h2 className="font-dmserif text-4xl sm:text-7xl text-[#001D38] leading-tight mb-4 sm:mb-6">
                    Merci pour votre <br/>confiance.
                  </h2>
                  <p className="text-slate-400 text-base sm:text-lg font-light tracking-wide mb-8 sm:mb-12">
                    L'avenir de la prévoyance commence ici.
                  </p>
                  <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                    <svg className="w-5 h-5 mx-auto text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                  </motion.div>
                </div>
              </Slide>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Indicator latérale (Masquée sur mobile pour ne pas surcharger) */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-6">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-1 transition-all duration-500 rounded-full ${i === activeSlide ? "h-12 bg-blue-600" : "h-4 bg-slate-200"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(10px)", y: 40 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      exit={{ opacity: 0, filter: "blur(10px)", y: -40 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center w-full h-full"
    >
      {children}
    </motion.div>
  );
}