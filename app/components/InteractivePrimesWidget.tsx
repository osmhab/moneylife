// app/components/InteractivePrimesWidget.tsx
"use client";

import { useState } from "react";
import { PlaneTakeoff, Activity, HeartCrack, Zap } from "lucide-react";

export default function InteractivePrimesWidget() {
  const [epargne, setEpargne] = useState(true);
  const [revenu, setRevenu] = useState(true);
  const [family, setFamily] = useState(true);
  const [pay, setPay] = useState(false);

  // Calcul du total en temps réel
  const total = (epargne ? 250 : 0) + (revenu ? 45 : 0) + (family ? 79.5 : 0) + (pay ? 12 : 0);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/10 backdrop-blur-md p-6 shadow-[0_0_40px_rgba(0,0,0,0.3)] border border-white/20 select-none">
      
      {/* En-tête Total */}
      <div className="flex flex-col items-center justify-center mb-6 border-b border-white/10 pb-5">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Montant mensuel total</span>
        <div className="text-4xl font-black tracking-tighter text-white tabular-nums transition-all duration-300">
          {total.toFixed(2)} <span className="text-base text-white/70 tracking-normal font-bold">CHF</span>
        </div>
      </div>
      
      {/* Liste des Protections */}
      <div className="space-y-4">
        
        {/* Ligne 1 : Épargne (flight_takeoff) */}
        <div 
          onClick={() => setEpargne(!epargne)}
          className={`flex items-center justify-between cursor-pointer transition-opacity duration-300 ${!epargne ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${epargne ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/60'}`}>
              <PlaneTakeoff size={14} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white leading-none">Mon Épargne</span>
              <span className="text-[10px] text-white/50 font-medium mt-1">+ 250.00 CHF</span>
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full relative shadow-inner transition-colors duration-300 ${epargne ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${epargne ? 'left-5 bg-white' : 'left-1 bg-white/80'}`}></div>
          </div>
        </div>

        {/* Ligne 2 : Revenu Protect (ecg_heart) */}
        <div 
          onClick={() => setRevenu(!revenu)}
          className={`flex items-center justify-between cursor-pointer transition-opacity duration-300 ${!revenu ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${revenu ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/60'}`}>
              <Activity size={14} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white leading-none">Revenu Protect</span>
              <span className="text-[10px] text-white/50 font-medium mt-1">+ 45.00 CHF</span>
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full relative shadow-inner transition-colors duration-300 ${revenu ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${revenu ? 'left-5 bg-white' : 'left-1 bg-white/80'}`}></div>
          </div>
        </div>

        {/* Ligne 3 : Family Protect (heart_broken) */}
        <div 
          onClick={() => setFamily(!family)}
          className={`flex items-center justify-between cursor-pointer transition-opacity duration-300 ${!family ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${family ? 'bg-rose-500/20 text-rose-400' : 'bg-white/10 text-white/60'}`}>
              <HeartCrack size={14} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white leading-none">Family Protect</span>
              <span className="text-[10px] text-white/50 font-medium mt-1">+ 79.50 CHF</span>
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full relative shadow-inner transition-colors duration-300 ${family ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${family ? 'left-5 bg-white' : 'left-1 bg-white/80'}`}></div>
          </div>
        </div>

        {/* Ligne 4 : Pay Protect */}
        <div 
          onClick={() => setPay(!pay)}
          className={`flex items-center justify-between cursor-pointer transition-opacity duration-300 ${!pay ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${pay ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-white/60'}`}>
              <Zap size={14} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white leading-none">Pay Protect</span>
              <span className="text-[10px] text-white/50 font-medium mt-1">+ 12.00 CHF</span>
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full relative shadow-inner transition-colors duration-300 ${pay ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${pay ? 'left-5 bg-white' : 'left-1 bg-white/80'}`}></div>
          </div>
        </div>

      </div>
    </div>
  );
}