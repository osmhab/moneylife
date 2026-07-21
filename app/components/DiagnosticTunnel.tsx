// app/components/DiagnosticTunnel.tsx

"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, X, 
  Briefcase, UserCircle, Coffee, 
  CheckCircle2, XCircle, HelpCircle, 
  TrendingDown, Info, ShieldAlert, HeartPulse, Building2, TrendingUp, AlertTriangle, ChevronRight, Lock
} from "lucide-react";
import Link from "next/link";

const variants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? "100%" : "-100%", opacity: 0 }),
};

export default function DiagnosticTunnel() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  
  // État étendu pour le nouveau branching
  const [answers, setAnswers] = useState({
    age: 35,
    status: "",
    revenue: 80000,
    hasPillar3: "",
    // Nouvelles questions si hasPillar3 === "yes"
    pillar3Type: "", // bank, insurance
    pillar3Premium: 250,
    pillar3Market: "", // yes, no
    pillar3Risks: "", // yes, no
  });

  const nextStep = () => {
    // Logique de branching dynamique
    if (step === 4) { // Etape "Avez-vous un 3e pilier ?"
        if (answers.hasPillar3 === "no") {
            // S'il n'en a pas, on saute directement au résultat (Etape 10)
            setDirection(1);
            setStep(10);
            return;
        }
    }
    
    // Règle générale : on avance jusqu'à l'étape 10 (le résultat final)
    if (step < 10) {
      setDirection(1);
      setStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (step === 10 && answers.hasPillar3 === "no") {
        setDirection(-1);
        setStep(4);
        return;
    }
    if (step > 0) {
      setDirection(-1);
      setStep((prev) => prev - 1);
    }
  };

  const updateAnswer = (key: keyof typeof answers, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const ChoiceCard = ({ icon: Icon, label, value, answerKey }: { icon: any, label: string, value: string, answerKey: keyof typeof answers }) => {
    const isSelected = answers[answerKey] === value;
    return (
      <button
        onClick={() => updateAnswer(answerKey, value)}
        className={`w-full flex items-center p-4 rounded-2xl border transition-all duration-300 ${
          isSelected 
            ? "bg-emerald-500/20 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]" 
            : "bg-white/5 border-white/10 hover:bg-white/10"
        }`}
      >
        <div className={`flex items-center justify-center w-12 h-12 rounded-full mr-4 ${isSelected ? "bg-emerald-500 text-white" : "bg-white/10 text-white/50"}`}>
          <Icon size={24} />
        </div>
        <span className={`text-lg font-bold ${isSelected ? "text-white" : "text-white/70"}`}>{label}</span>
      </button>
    );
  };

  const formatCHF = (num: number) => new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(num);
  
  // ==========================================
  // MOTEUR DE CALCUL (AVS, LPP, Lacunes)
  // ==========================================
  const RETIREMENT_AGE = 65;
  const yearsToRetirement = Math.max(1, RETIREMENT_AGE - answers.age);
  
  // 1. Estimation AVS (Simplifiée)
  const estimatedAVS = Math.min(2450, answers.revenue * 0.03); // Max légal ~2450/mois
  
  // 2. Estimation LPP (Simplifiée)
  // Déduction de coordination ~25'725 CHF
  const coordinatedSalary = Math.max(0, answers.revenue - 25725);
  // Taux de bonification moyen estimé (simplification pour le diagnostic public)
  let lppRate = 0;
  if (answers.age >= 25 && answers.age <= 34) lppRate = 0.07;
  else if (answers.age >= 35 && answers.age <= 44) lppRate = 0.10;
  else if (answers.age >= 45 && answers.age <= 54) lppRate = 0.15;
  else if (answers.age >= 55) lppRate = 0.18;
  
  const annualLppContribution = coordinatedSalary * lppRate;
  // Capital LPP accumulé + intérêts estimés (2%)
  const futureLppCapital = annualLppContribution * ((Math.pow(1.02, yearsToRetirement) - 1) / 0.02);
  const estimatedLPP = answers.status === "salarie" ? (futureLppCapital * 0.068) / 12 : 0; // Taux de conversion estimé 6.8%

  // 3. Estimation 3e Pilier Existant
  let future3aCapital = 0;
  if (answers.hasPillar3 === "yes") {
      const annual3a = answers.pillar3Premium * 12;
      const rate3a = answers.pillar3Market === "yes" ? 0.04 : 0.005; // 4% si marché, 0.5% si compte
      future3aCapital = annual3a * ((Math.pow(1 + rate3a, yearsToRetirement) - 1) / rate3a);
  }
  const estimated3aRente = (future3aCapital * 0.05) / 12; // Estimation de conversion

  // 4. Calcul de la Lacune
  const targetMonthlyIncome = (answers.revenue * 0.8) / 12; // Objectif 80% du salaire
  const currentTotalIncome = estimatedAVS + estimatedLPP + estimated3aRente;
  const monthlyGap = Math.max(0, targetMonthlyIncome - currentTotalIncome);
  
  // Risques
  const isInvalidityCovered = answers.status === "salarie" || answers.pillar3Risks === "yes";

  return (
    <div className="relative w-full h-screen flex flex-col bg-black overflow-y-auto scrollbar-hide">
      
      {/* HEADER */}
      <header className="relative z-50 w-full p-6 flex justify-between items-center sticky top-0 bg-black/50 backdrop-blur-md">
        {step > 0 && step < 10 ? (
          <button onClick={prevStep} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
            <ArrowLeft size={20} />
          </button>
        ) : <div className="w-10 h-10"></div>}

        {/* Barre de progression dynamique selon le parcours */}
        {step > 0 && step < 10 && (
          <div className="flex gap-2">
            {[...Array(answers.hasPillar3 === "yes" ? 8 : 4)].map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i < (step > 4 && answers.hasPillar3 === "yes" ? step - 1 : step) ? "w-8 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "w-4 bg-white/20"}`} />
            ))}
          </div>
        )}

        <Link href="/">
          <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
            <X size={20} />
          </button>
        </Link>
      </header>

      {/* ZONE CENTRALE */}
      <div className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-2xl"
          >
            <div className={`bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[40px] shadow-2xl relative overflow-hidden ${step === 10 ? "p-6 md:p-8" : "p-8 md:p-12"}`}>
              
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-32 bg-emerald-500/10 blur-[100px] pointer-events-none" />

              {/* === ETAPE 0 === */}
              {step === 0 && (
                <div className="text-center relative z-10">
                  <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4">
                    Le Diagnostic Expert.
                  </h1>
                  <p className="text-white/70 mb-10 text-lg">
                    Découvrez vos lacunes AVS/LPP et accédez à une simulation personnalisée de notre technologie d'offre.
                  </p>
                  <button onClick={nextStep} className="w-full py-5 rounded-full bg-white text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                    Démarrer l'audit gratuit
                  </button>
                </div>
              )}

              {/* === ETAPE 1 : L'ÂGE === */}
              {step === 1 && (
                <div className="flex flex-col items-center relative z-10">
                  <h2 className="text-3xl font-black text-white mb-2 text-center tracking-tight">Quel est votre âge ?</h2>
                  
                  <motion.div key={answers.age} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-7xl font-black text-white tracking-tighter mb-8 mt-6">
                    {answers.age} <span className="text-2xl text-white/50 font-medium tracking-normal">ans</span>
                  </motion.div>

                  <div className="relative w-full max-w-sm mb-12">
                    <div className="absolute top-1/2 left-0 h-2 -translate-y-1/2 bg-emerald-400 rounded-full pointer-events-none" style={{ width: `${((answers.age - 18) / (65 - 18)) * 100}%`, boxShadow: "0 0 15px rgba(52,211,153,0.5)" }} />
                    <input type="range" min="18" max="65" value={answers.age} onChange={(e) => updateAnswer("age", parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg relative z-10" />
                  </div>

                  <button onClick={nextStep} className="w-full py-4 rounded-full bg-emerald-500 text-white font-black uppercase tracking-widest hover:scale-105 transition-all">Continuer</button>
                </div>
              )}

              {/* === ETAPE 2 : STATUT === */}
              {step === 2 && (
                <div className="relative z-10">
                  <h2 className="text-3xl font-black text-white mb-8 text-center tracking-tight">Votre statut actuel ?</h2>
                  
                  <div className="space-y-4 mb-10">
                    <ChoiceCard icon={Briefcase} label="Employé(e) Salarié(e)" value="salarie" answerKey="status" />
                    <ChoiceCard icon={UserCircle} label="Indépendant(e)" value="independant" answerKey="status" />
                  </div>

                  <button onClick={nextStep} disabled={!answers.status} className={`w-full py-4 rounded-full font-black uppercase tracking-widest transition-all ${answers.status ? "bg-emerald-500 text-white hover:scale-105 cursor-pointer" : "bg-white/10 text-white/30 cursor-not-allowed"}`}>
                    Continuer
                  </button>
                </div>
              )}

              {/* === ETAPE 3 : REVENUS === */}
              {step === 3 && (
                <div className="flex flex-col items-center relative z-10">
                  <h2 className="text-3xl font-black text-white mb-2 text-center tracking-tight">Vos revenus annuels bruts ?</h2>
                  
                  <motion.div key={answers.revenue} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-8 mt-6 text-center">
                    {formatCHF(answers.revenue)}
                  </motion.div>

                  <div className="relative w-full max-w-sm mb-12">
                    <div className="absolute top-1/2 left-0 h-2 -translate-y-1/2 bg-emerald-400 rounded-full pointer-events-none" style={{ width: `${((answers.revenue - 20000) / (250000 - 20000)) * 100}%`, boxShadow: "0 0 15px rgba(52,211,153,0.5)" }} />
                    <input type="range" min="20000" max="250000" step="5000" value={answers.revenue} onChange={(e) => updateAnswer("revenue", parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg relative z-10" />
                  </div>

                  <button onClick={nextStep} className="w-full py-4 rounded-full bg-emerald-500 text-white font-black uppercase tracking-widest hover:scale-105 transition-all">Continuer</button>
                </div>
              )}

              {/* === ETAPE 4 : 3E PILIER EXISTANT === */}
              {step === 4 && (
                <div className="relative z-10">
                  <h2 className="text-3xl font-black text-white mb-8 text-center tracking-tight">Avez-vous déjà un 3ème Pilier ?</h2>
                  
                  <div className="space-y-4 mb-10">
                    <ChoiceCard icon={CheckCircle2} label="Oui, j'en ai un" value="yes" answerKey="hasPillar3" />
                    <ChoiceCard icon={XCircle} label="Non, pas encore" value="no" answerKey="hasPillar3" />
                  </div>

                  <button onClick={nextStep} disabled={!answers.hasPillar3} className={`w-full py-4 rounded-full font-black uppercase tracking-widest transition-all ${answers.hasPillar3 ? "bg-emerald-500 text-white hover:scale-105 cursor-pointer" : "bg-white/10 text-white/30 cursor-not-allowed"}`}>
                    Continuer
                  </button>
                </div>
              )}

              {/* === ETAPES EXPERTES (Seulement si hasPillar3 === "yes") === */}
              {step === 5 && answers.hasPillar3 === "yes" && (
                <div className="relative z-10">
                  <h2 className="text-3xl font-black text-white mb-8 text-center tracking-tight">De quel type ?</h2>
                  <div className="space-y-4 mb-10">
                    <ChoiceCard icon={Building2} label="Dans une Banque" value="bank" answerKey="pillar3Type" />
                    <ChoiceCard icon={ShieldAlert} label="Dans une Assurance" value="insurance" answerKey="pillar3Type" />
                  </div>
                  <button onClick={nextStep} disabled={!answers.pillar3Type} className={`w-full py-4 rounded-full font-black uppercase tracking-widest transition-all ${answers.pillar3Type ? "bg-emerald-500 text-white hover:scale-105" : "bg-white/10 text-white/30"}`}>Continuer</button>
                </div>
              )}

              {step === 6 && answers.hasPillar3 === "yes" && (
                <div className="flex flex-col items-center relative z-10">
                  <h2 className="text-3xl font-black text-white mb-2 text-center tracking-tight">Votre versement mensuel ?</h2>
                  <motion.div key={answers.pillar3Premium} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-5xl font-black text-white tracking-tighter mb-8 mt-6">
                    {formatCHF(answers.pillar3Premium)}
                  </motion.div>
                  <div className="relative w-full max-w-sm mb-12">
                    <div className="absolute top-1/2 left-0 h-2 -translate-y-1/2 bg-emerald-400 rounded-full pointer-events-none" style={{ width: `${(answers.pillar3Premium / 600) * 100}%` }} />
                    <input type="range" min="0" max="600" step="50" value={answers.pillar3Premium} onChange={(e) => updateAnswer("pillar3Premium", parseInt(e.target.value))} className="w-full h-2 bg-white/10 rounded-full appearance-none relative z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full" />
                  </div>
                  <button onClick={nextStep} className="w-full py-4 rounded-full bg-emerald-500 text-white font-black uppercase tracking-widest hover:scale-105 transition-all">Continuer</button>
                </div>
              )}

              {step === 7 && answers.hasPillar3 === "yes" && (
                <div className="relative z-10">
                  <h2 className="text-3xl font-black text-white mb-8 text-center tracking-tight">Est-il investi sur les marchés ?</h2>
                  <div className="space-y-4 mb-10">
                    <ChoiceCard icon={TrendingUp} label="Oui (Fonds de placement)" value="yes" answerKey="pillar3Market" />
                    <ChoiceCard icon={TrendingDown} label="Non (Compte épargne classique)" value="no" answerKey="pillar3Market" />
                  </div>
                  <button onClick={nextStep} disabled={!answers.pillar3Market} className={`w-full py-4 rounded-full font-black uppercase tracking-widest transition-all ${answers.pillar3Market ? "bg-emerald-500 text-white hover:scale-105" : "bg-white/10 text-white/30"}`}>Continuer</button>
                </div>
              )}

              {step === 8 && answers.hasPillar3 === "yes" && (
                <div className="relative z-10">
                  <h2 className="text-3xl font-black text-white mb-8 text-center tracking-tight">Couvre-t-il les risques de la vie ?</h2>
                  <p className="text-white/50 text-sm mb-6 text-center">Invalidité ou Décès</p>
                  <div className="space-y-4 mb-10">
                    <ChoiceCard icon={HeartPulse} label="Oui, je suis assuré" value="yes" answerKey="pillar3Risks" />
                    <ChoiceCard icon={AlertTriangle} label="Non / Je ne sais pas" value="no" answerKey="pillar3Risks" />
                  </div>
                  <button onClick={nextStep} disabled={!answers.pillar3Risks} className={`w-full py-4 rounded-full font-black uppercase tracking-widest transition-all ${answers.pillar3Risks ? "bg-emerald-500 text-white hover:scale-105" : "bg-white/10 text-white/30"}`}>Générer mon audit</button>
                </div>
              )}


              {/* === ETAPE 10 : LA PAGE DE RÉSULTAT (TEASING CREDITX) === */}
              {step === 10 && (
                <div className="relative z-10">
                  
                  {/* Section 1 : L'Analyse des Lacunes */}
                  <div className="mb-10 text-center">
                    <h2 className="text-3xl font-black text-white tracking-tighter mb-2">Attention, lacune détectée.</h2>
                    <p className="text-white/60 text-sm max-w-md mx-auto">
                      À la retraite, votre revenu mensuel estimé est de <strong className="text-white">{formatCHF(currentTotalIncome)}</strong> au lieu des <strong className="text-emerald-400">{formatCHF(targetMonthlyIncome)}</strong> nécessaires pour maintenir votre niveau de vie.
                    </p>
                  </div>

                  <div className="space-y-3 mb-8">
                    <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-sm font-bold text-white/70">AVS Estimée (1er Pilier)</span>
                      <span className="font-black text-white">{formatCHF(estimatedAVS)} /mois</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-sm font-bold text-white/70">LPP Estimée (2e Pilier)</span>
                      <span className="font-black text-white">{formatCHF(estimatedLPP)} /mois</span>
                    </div>
                    {answers.hasPillar3 === "yes" && (
                      <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
                        <span className="text-sm font-bold text-emerald-400">Votre 3e Pilier</span>
                        <span className="font-black text-emerald-400">+{formatCHF(estimated3aRente)} /mois</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                      <span className="text-sm font-black uppercase text-red-400">Lacune Mensuelle</span>
                      <span className="font-black text-red-400 text-xl">-{formatCHF(monthlyGap)}</span>
                    </div>
                    {!isInvalidityCovered && (
                       <div className="flex items-center gap-3 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
                         <AlertTriangle className="text-amber-400" size={20} />
                         <span className="text-sm font-medium text-amber-100">Risque Invalidité / Décès non couvert.</span>
                       </div>
                    )}
                  </div>

                  {/* Section 2 : Le Teasing de l'Interface CreditX (Glassmorphism Blur) */}
                  <div className="relative w-full rounded-3xl bg-[#1e1136]/50 border border-[#816DEC]/30 p-6 overflow-hidden mb-6">
                    {/* Le faux dashboard en arrière-plan */}
                    <div className="opacity-40 blur-sm pointer-events-none select-none">
                       <div className="flex justify-between items-center mb-6">
                         <div className="flex gap-2 items-center"><div className="w-8 h-8 rounded-full bg-emerald-500" /> <span className="font-black text-white text-xl">Épargne 3a</span></div>
                         <div className="w-12 h-6 bg-emerald-500 rounded-full" />
                       </div>
                       <div className="h-2 w-full bg-white/10 rounded-full mb-6"><div className="w-1/3 h-full bg-emerald-500 rounded-full" /></div>
                       
                       <div className="flex justify-between items-center mb-6">
                         <div className="flex gap-2 items-center"><div className="w-8 h-8 rounded-full bg-white/20" /> <span className="font-black text-white text-xl">Protection Maladie</span></div>
                         <div className="w-12 h-6 bg-white/20 rounded-full" />
                       </div>

                       <div className="flex justify-between items-end mt-8 border-t border-white/10 pt-4">
                         <span className="font-black text-white/50 text-sm">TOTAL NET</span>
                         <span className="font-black text-white text-4xl">450.- <span className="text-sm font-normal">/mois</span></span>
                       </div>
                    </div>

                    {/* L'overlay par-dessus le flou */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 px-6 text-center">
                       <Lock className="text-[#816DEC] mb-4" size={40} />
                       <h3 className="text-2xl font-black text-white mb-2">Comblez vos lacunes</h3>
                       <p className="text-white/70 text-sm mb-6">Découvrez notre calculateur d'offres en temps réel. Ajustez vos primes, protégez votre famille et optimisez votre fiscalité.</p>
                       <Link href="/login" className="w-full">
                         <button className="group w-full flex justify-center items-center gap-3 py-4 rounded-full bg-gradient-to-r from-[#816DEC] to-[#6c58e0] text-white font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(129,109,236,0.3)] hover:scale-105 transition-all">
                           Voir l'offre sur mesure <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                         </button>
                       </Link>
                    </div>
                  </div>
                  
                  <p className="text-center text-white/40 text-xs">Création de compte 100% gratuite et sans engagement.</p>
                </div>
              )}

            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}