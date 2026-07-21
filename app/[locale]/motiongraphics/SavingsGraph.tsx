"use client";

import { motion, animate } from "framer-motion";
import { useState, useEffect } from "react";

export default function SavingsGraph() {
  const [displayCount, setDisplayCount] = useState(0);
  const duration = 2.5; // Plus rapide
  const finalAmount = 600000;
  const dailySaving = 57;

  useEffect(() => {
    const controls = animate(0, finalAmount, {
      duration: duration,
      ease: [0.45, 0, 0.55, 1], // Apple-style smooth easing
      onUpdate: (value) => setDisplayCount(Math.floor(value)),
    });
    return () => controls.stop();
  }, [finalAmount]);

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-white text-black font-sans p-8 aspect-[9/16] max-w-md mx-auto overflow-hidden select-none">
      
      {/* Header Style Apple Health / Wallet */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mt-16"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-gray-400">
          Projection Retraite
        </span>
        <h2 className="text-5xl font-bold tracking-tight mt-2">
          {displayCount.toLocaleString('fr-CH')}
          <span className="text-xl ml-1 font-medium text-gray-400">CHF</span>
        </h2>
      </motion.div>

      {/* Graphique Minimaliste */}
      <div className="relative w-full h-64 px-2">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Lignes de repère ultra-fines */}
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5EA" strokeWidth="0.5" />
          <line x1="0" y1="0" x2="0" y2="100" stroke="#E5E5EA" strokeWidth="0.5" />

          {/* La Courbe - Fine et Rapide */}
          <motion.path
            d="M 0,100 C 50,100 80,80 100,0"
            fill="none"
            stroke="black"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: duration, ease: "easeIn" }}
          />

          {/* Point final pulsé */}
          <motion.circle
            cx="100"
            cy="0"
            r="2"
            fill="black"
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.5, 1] }}
            transition={{ delay: duration, duration: 0.5 }}
          />
        </svg>

        {/* Labels discrets */}
        <div className="flex justify-between mt-4 text-[10px] font-medium text-gray-400 uppercase tracking-widest">
          <span>Aujourd'hui</span>
          <span>+30 Ans</span>
        </div>
      </div>

      {/* Badge Bas de page */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mb-16 flex flex-col items-center gap-4"
      >
        <div className="h-[1px] w-12 bg-gray-100" />
        <div className="text-sm font-semibold tracking-tight">
          Basé sur <span className="text-black">{dailySaving} CHF</span> par jour
        </div>
      </motion.div>

    </div>
  );
}