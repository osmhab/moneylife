"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MilestoneParallaxAd from "./MilestoneParallaxAd";

export default function MilestoneAdGate() {
  const [isVisible, setIsVisible] = useState(true);

  const handleFinish = () => {
    // 1. On lance la disparition de la pub
    setIsVisible(false);
    
    // 2. ✅ Forcer le scroll tout en haut (NavBar comprise)
    // On attend un cycle de rendu pour être sûr que la pub a libéré l'espace
    setTimeout(() => {
      window.scrollTo(0, 0);
      
      // Sécurité supplémentaire : forcer le scroll sur le body et le html
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 10);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          key="ad-gate-wrapper"
          exit={{ 
            opacity: 0, 
            height: 0, // On réduit la hauteur pour que le site remonte
            transition: { duration: 0.5, ease: "easeInOut" } 
          }}
          className="relative w-full bg-white"
        >
          <MilestoneParallaxAd onClose={handleFinish} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}