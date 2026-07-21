"use client";

import { motion, animate } from "framer-motion";
import { useState, useEffect } from "react";

export default function SalaryGap() {
  const [currentSalary, setCurrentSalary] = useState(0);
  const [gap, setGap] = useState(0);
  
  const duration = 2;
  const initialSalary = 80000;
  const reducedSalary = 50000;
  const diff = initialSalary - reducedSalary;

  useEffect(() => {
    // Animation du salaire qui descend
    const controls = animate(initialSalary, reducedSalary, {
      duration: duration,
      delay: 0.5,
      ease: [0.22, 1, 0.36, 1], // Apple-style out easing
      onUpdate: (value) => {
        setCurrentSalary(Math.floor(value));
        setGap(Math.floor(initialSalary - value));
      },
    });
    return () => controls.stop();
  }, []);

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-white text-black font-sans p-10 aspect-[9/16] max-w-md mx-auto overflow-hidden">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center mt-12"
      >
        <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">Revenu Annuel</span>
        <h2 className="text-5xl font-bold tracking-tighter mt-2">
          {currentSalary.toLocaleString('fr-CH')}
          <span className="text-xl ml-1 text-gray-400">CHF</span>
        </h2>
      </motion.div>

      {/* Graphique de comparaison (Barres minimalistes) */}
      <div className="relative w-full flex justify-center items-end gap-8 h-64">
        {/* Barre Salaire Initial (Fantôme/Gris) */}
        <div className="relative flex flex-col items-center">
            <div className="w-16 h-64 bg-[#F5F5F7] rounded-2xl overflow-hidden relative">
                <motion.div 
                    initial={{ height: "100%" }}
                    animate={{ height: "62.5%" }} // (50/80) = 62.5%
                    transition={{ duration: duration, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute bottom-0 w-full bg-black rounded-b-2xl"
                />
            </div>
            <span className="mt-4 text-[10px] font-bold text-gray-400 uppercase">Retraite</span>
        </div>

        {/* Flèche ou Indicateur de Différence */}
        <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.5 }}
            className="absolute right-4 top-10 flex flex-col items-end"
        >
            <div className="text-red-500 font-bold text-xl leading-none">-{gap.toLocaleString('fr-CH')}</div>
            <div className="text-[10px] font-bold text-gray-300 uppercase">Lacune</div>
            <div className="h-[100px] w-[1px] bg-red-100 mt-2 relative">
                <div className="absolute top-0 right-0 w-2 h-[1px] bg-red-200" />
                <div className="absolute bottom-0 right-0 w-2 h-[1px] bg-red-200" />
            </div>
        </motion.div>
      </div>

      {/* Footer Conclusion */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2 }}
        className="mb-20 bg-[#F5F5F7] p-6 rounded-[24px] w-full text-center"
      >
        <p className="text-gray-500 text-sm font-medium">Votre perte de revenu :</p>
        <div className="text-3xl font-bold mt-1 tracking-tight">37.5% de moins</div>
      </motion.div>

    </div>
  );
}