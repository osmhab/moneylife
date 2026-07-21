"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Landmark, ShieldCheck, HeartPulse, ShieldAlert, CreditCard, ChevronDown, CheckCircle, ArrowRight } from "lucide-react";

const profiles = [
  {
    id: "young",
    name: "David,Employé (22 ans)",
    title: "100% Croissance",
    desc: "Un plan épargne sur deux fronts. L'un pour une utilisation à moyen terme et l'autre pour une stratégie long terme (retraite).",
    image: "/images/avatar-jeune.png",
    // Passage au mode sombre/monochrome pour le wallet
    gradient: "from-slate-800 to-black",
    masterCard: "CreditX 3a Plan",
    subCards: [
      { provider: "AXA", product: "Épargne 100% Actions", icon: ShieldCheck, color: "text-slate-700", logo: "/images/logo-axa.png" },
      { provider: "UBS", product: "Epargne", icon: Landmark, color: "text-slate-700", logo: "/images/logo-ubs.png" }
    ]
  },
  {
    id: "career",
    name: "Sophie, Indépendante (35 ans)",
    title: "Sécurité du Revenu",
    desc: "En tant qu'indépendante, le filet social est faible. Ce plan maximise les économies d'impôts tout en garantissant le maintien du salaire en cas de coup dur.",
    image: "/images/avatar-freelance.png",
    gradient: "from-zinc-800 to-neutral-950",
    masterCard: "CreditX Plan",
    subCards: [
      { provider: "AXA", product: "Epargne 3b 60% Actions", icon: Landmark, color: "text-slate-700", logo: "/images/logo-axa.png" },
      { provider: "SwissLife", product: "Rente Incapacité de gain 24k", icon: ShieldAlert, color: "text-slate-700", logo: "/images/logo-swisslife.png" },
      { provider: "Helvetia Baloise", product: "Capital Décès 105k", icon: HeartPulse, color: "text-slate-700", logo: "/images/logo-helvetiaBaloise.png" }
    ]
  },
  {
    id: "family",
    name: "Adrian, Père de Famille (42 ans)",
    title: "Protection Familiale",
    desc: "La priorité est de mettre les enfants à l'abri et de garantir le paiement de l'hypothèque si le pire devait arriver, tout en préparant sereinement la retraite.",
    image: "/images/avatar-famille.png",
    gradient: "from-gray-900 to-black",
    masterCard: "CreditX Plan",
    subCards: [
      { provider: "Raiffeisen", product: "Epargne 60% Actions (En gage)", icon: Landmark, color: "text-slate-700", logo: "/images/logo-raiffeisen.png" },
      { provider: "PAX", product: "Capital Décès 300k", icon: HeartPulse, color: "text-slate-700", logo: "/images/logo-pax.png" },
      { provider: "AXA", product: "Rente Invalidité 15k", icon: ShieldAlert, color: "text-slate-700", logo: "/images/logo-axa.png" }
    ]
  }
];

export default function SmartContracts() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleDeck = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="w-full flex flex-col gap-24 lg:gap-32 py-12">
      {profiles.map((profile, index) => {
        const isExpanded = expandedId === profile.id;
        const isEven = index % 2 === 0; 

        return (
          <div key={profile.id} className={`w-full max-w-7xl mx-auto px-6 flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-16 lg:gap-24`}>
            
            {/* COLONNE A : LE TEXTE PUR */}
            <div className="w-full lg:w-1/2 flex flex-col items-start">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 mb-6">
                <CheckCircle size={14} className="text-slate-600" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{profile.name}</span>
              </div>
              
              <h3 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 mb-6 leading-[1.1]">
                {profile.title}
              </h3>
              
              <p className="text-lg sm:text-xl text-slate-600 font-medium leading-relaxed mb-8">
                {profile.desc}
              </p>

              <button 
                onClick={() => toggleDeck(profile.id)}
                className="group flex items-center gap-3 text-sm font-bold text-slate-900 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                <span>{isExpanded ? "Fermer l'architecture" : "Inspecter le plan CreditX"}</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* COLONNE B : L'IMAGE DE FOND + LE WALLET PAR DESSUS */}
            <div className="w-full lg:w-1/2 flex justify-center">
              
              <div className="relative w-full max-w-[480px] h-[650px] rounded-[40px] overflow-hidden shadow-2xl flex flex-col justify-end items-center group cursor-pointer pb-6" onClick={() => toggleDeck(profile.id)}>
                
                <img 
                  src={profile.image} 
                  alt={profile.name} 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale-[20%]" 
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                <div className="relative z-10 w-full max-w-[340px] h-[520px] flex justify-center items-end cursor-pointer perspective-1000" onClick={() => toggleDeck(profile.id)}>
                  
                  {profile.subCards.map((card, idx) => {
                    const Icon = card.icon;
                    const closedY = -((idx + 1) * 12); 
                    const closedScale = 1 - ((idx + 1) * 0.05); 
                    
                    const openedY = -((idx * 115) + 210); 
                    const openedScale = 1;

                    return (
                      <motion.div
                        key={idx}
                        initial={false}
                        animate={{
                          y: isExpanded ? openedY : closedY,
                          scale: isExpanded ? openedScale : closedScale,
                          opacity: isExpanded ? 1 : 0.8,
                          zIndex: 10 - idx
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 24 }}
                        className="absolute bottom-6 w-[92%] h-[100px] bg-white rounded-[24px] border border-slate-200 shadow-xl p-4 flex items-center justify-between gap-4"
                      >
                        <div className="w-12 h-12 bg-white border border-slate-100 rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                          <img src={card.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                        </div>
                        
                        <div className="flex-1 flex flex-col justify-center text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{card.provider}</p>
                          <p className="text-sm sm:text-base font-bold text-slate-900 leading-tight">{card.product}</p>
                        </div>

                        <Icon size={24} className={card.color} />
                      </motion.div>
                    );
                  })}

                  <motion.div
                    animate={{
                      y: isExpanded ? 10 : 0,
                      scale: isExpanded ? 1.02 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`relative z-20 w-[96%] h-[190px] rounded-[32px] p-8 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 bg-gradient-to-br ${profile.gradient} text-white backdrop-blur-xl`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <CreditCard size={28} className="text-white/60 mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Plan 3e Pilier Consolidé</p>
                      </div>
                      <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md shadow-inner border border-white/5">
                        <ChevronDown size={20} className="text-white/80" />
                      </motion.div>
                    </div>
                    <div>
                      <p className="text-3xl font-black tracking-tight mb-1">{profile.masterCard}</p>
                      <p className="text-sm font-medium text-white/60">{isExpanded ? "Contrats dégroupés révélés" : "Appuyez pour inspecter le plan"}</p>
                    </div>
                  </motion.div>

                </div>
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}