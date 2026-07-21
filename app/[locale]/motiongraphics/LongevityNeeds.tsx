"use client";

import { motion, animate } from "framer-motion";
import { useState, useEffect } from "react";

export default function LongevityNeeds() {
  const [total, setTotal] = useState(0);
  const duration = 2.5;

  useEffect(() => {
    // Animation du compteur final
    const controls = animate(0, 600000, {
      duration: duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setTotal(Math.floor(value)),
    });
    return () => controls.stop();
  }, []);

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-white text-black font-sans p-10 aspect-[9/16] max-w-md mx-auto overflow-hidden">
      
      {/* Header : L'équation */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mt-12 space-y-1"
      >
        <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">Espérance de vie : 85 ans</span>
        <h2 className="text-3xl font-bold tracking-tight">20 ans à financer</h2>
      </motion.div>

      {/* Visualisation : Grille d'années */}
      <div className="grid grid-cols-5 gap-2 w-full px-4">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="aspect-square bg-[#F5F5F7] rounded-lg flex items-center justify-center relative overflow-hidden"
          >
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: "100%" }}
              transition={{ delay: 1, duration: 0.5 }}
              className="absolute bottom-0 w-full bg-black opacity-[0.05]"
            />
            <span className="text-[10px] font-bold text-gray-300 z-10">{i + 1}</span>
          </motion.div>
        ))}
      </div>

      {/* Calcul et Résultat */}
      <div className="mb-20 w-full flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-gray-400 text-sm font-medium mb-2"
        >
          30'000 CHF × 20 ans =
        </motion.div>
        
        <div className="text-6xl font-black tracking-tighter">
          {total.toLocaleString('fr-CH')}
        </div>
        <div className="text-xl font-bold text-gray-400 mt-1">CHF</div>

        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: "80%" }}
          transition={{ delay: 0.5, duration: 1.5 }}
          className="h-[2px] bg-black mt-8"
        />
      </div>

    </div>
  );
}