"use client";

import { motion } from "framer-motion";

export default function ComparisonGraph() {
  const duration = 3;

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-white text-black font-sans p-10 aspect-[9/16] max-w-md mx-auto overflow-hidden">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mt-12"
      >
        <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400 text-center block mb-2">
          Le poids du retard
        </span>
        <h2 className="text-3xl font-black tracking-tight leading-none">
          COMMENCER À <br/>
          <span className="text-gray-400">35 ANS VS 45 ANS</span>
        </h2>
      </motion.div>

      {/* Graphique à deux courbes */}
      <div className="relative w-full h-80 mt-10">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Grille de fond ultra-légère */}
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5EA" strokeWidth="0.5" />
          <line x1="0" y1="0" x2="0" y2="100" stroke="#E5E5EA" strokeWidth="0.5" />
          
          {/* Courbe 1 : Départ 35 ans (Plus précoce, plus douce) */}
          <motion.path
            d="M 0,100 C 20,100 50,70 100,0" 
            fill="none"
            stroke="black"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: duration, ease: "easeInOut" }}
          />
          <motion.text
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            x="65" y="45" fontSize="5" fontWeight="bold"
          >
            DÈS 35 ANS
          </motion.text>

          {/* Courbe 2 : Départ 45 ans (Plus tard, pente beaucoup plus raide) */}
          {/* Elle reste à 0 plus longtemps puis explose verticalement */}
          <motion.path
            d="M 0,100 L 40,100 C 60,100 85,90 100,30" 
            fill="none"
            stroke="#FF3B30"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="4 2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: duration, ease: "easeInOut", delay: 0.5 }}
          />
          <motion.text
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            x="65" y="85" fill="#FF3B30" fontSize="5" fontWeight="bold"
          >
            DÈS 45 ANS
          </motion.text>
        </svg>

        {/* Labels des axes */}
        <div className="absolute -left-4 top-0 -rotate-90 origin-left text-[9px] font-bold text-gray-300 uppercase tracking-widest">
          Capital
        </div>
        <div className="absolute right-0 -bottom-6 text-[9px] font-bold text-gray-300 uppercase tracking-widest">
          Âge (Retraite)
        </div>
      </div>

      {/* Footer / Message clé */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5 }}
        className="mb-16 w-full"
      >
        <div className="border-t border-gray-100 pt-6 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Écart de capital</span>
            <span className="text-2xl font-black text-red-500">-240'000 CHF</span>
          </div>
          <div className="bg-black text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wide">
            Le coût du temps
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed italic text-center">
          "Attendre 10 ans, c'est diviser vos intérêts par deux."
        </p>
      </motion.div>

    </div>
  );
}