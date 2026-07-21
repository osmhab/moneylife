//app/dashboard/prevoyance/new-3a/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, ArrowRight, Sparkles, ShieldCheck, TrendingUp, 
  Home, HeartPulse, Wallet, Landmark, Activity, CheckCircle2, 
  Coins, Loader2, Lock, Umbrella, PiggyBank, AlertTriangle,
  Leaf, Flame 
} from "lucide-react";
import { Button } from "@/components/ui/button";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// --- TYPES ---
type WizardData = {
  objective: string[]; 
  philosophy: "flexibility" | "security" | null;
  riskProfile: "guaranteed" | "prudent" | "balanced" | "dynamic" | null; 
  isSmoker: boolean | null; 
  monthlyBudget: number;
};

const PLAFOND_ANNUEL = 7258;
const MAX_MENSUEL = Math.floor(PLAFOND_ANNUEL / 12);

export default function New3aWizard() {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("New3aWizard");

  const router = useRouter();
  const pathname = usePathname();
  
  // Calcule dynamiquement si on est en Admin ou en Client
  const basePath = pathname.includes('/admin/client') 
    ? pathname.substring(0, pathname.indexOf('/new-3a')) 
    : '/dashboard/prevoyance';

  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const totalSteps = 5; 

  const [formData, setFormData] = useState<WizardData>({
    objective: [], 
    philosophy: null,
    riskProfile: null,
    isSmoker: null, 
    monthlyBudget: 250,
  });

  const updateData = (fields: Partial<WizardData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const toggleObjective = (objectiveId: string) => {
    setFormData((prev) => {
      const current = prev.objective;
      if (current.includes(objectiveId)) {
        return { ...prev, objective: current.filter((id) => id !== objectiveId) };
      }
      return { ...prev, objective: [...current, objectiveId] };
    });
  };

  const handleNext = () => {
    if (step === 2 && formData.philosophy === "flexibility") {
      setStep(2.5);
      return;
    }

    if (step < totalSteps) {
      setStep(Math.floor(step) + 1);
    } else {
      generateOffer();
    }
  };

  const handleBack = () => {
    if (step === 2.5) setStep(2); 
    else if (step > 1) setStep(step - 1);
    else router.back();
  };

 const generateOffer = () => {
    setIsGenerating(true);
    sessionStorage.setItem("new3aWizardData", JSON.stringify(formData));
    
    setTimeout(() => {
      setIsGenerating(false);
      router.push(`${basePath}/new-3a/resultat`); 
    }, 1200);
  };

  const displayStep = Math.floor(step);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden flex flex-col relative">
      {/* Background immersif (inchangé) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-[#111827] to-[#1e1136] pointer-events-none" />
      <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] bg-[#816DEC] rounded-full blur-[160px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[50%] bg-emerald-900 rounded-full blur-[140px] opacity-20 pointer-events-none" />

      {/* HEADER */}
      <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between">
        <button 
          onClick={handleBack}
          disabled={isGenerating}
          className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-md border border-white/10 active:scale-90 transition-transform disabled:opacity-50"
        >
          <ArrowLeft size={20} />
        </button>
        
        {/* Barre de progression pointillée */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                displayStep > idx ? 'w-6 bg-white' : displayStep === idx + 1 ? 'w-6 bg-[#816DEC]' : 'w-2 bg-white/20'
              }`} 
            />
          ))}
        </div>
        <div className="w-10" />
      </div>

      {/* CONTENU ANIMÉ */}
      <main className="flex-1 relative z-10 flex flex-col overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          
          {/* ÉTAPE 1 : OBJECTIFS (MULTI-SÉLECTION) */}
          {step === 1 && (
            <WizardStep 
              key="step1" 
              stepNum={1} 
              total={totalSteps} 
              title={t("step1_title")} 
              onNext={handleNext} 
              canNext={formData.objective.length > 0} 
              nextLabel={t("btn_continue")}
              t={t}
            >
              <div className="grid grid-cols-1 gap-3">
                <SelectionCard 
                  title={t("obj_tax_title")} subtitle={t("obj_tax_desc")}
                  icon={<ShieldCheck size={24} />} selected={formData.objective.includes("fiscal")}
                  onClick={() => toggleObjective("fiscal")}
                />
                <SelectionCard 
                  title={t("obj_yield_title")} subtitle={t("obj_yield_desc")}
                  icon={<TrendingUp size={24} />} selected={formData.objective.includes("yield")}
                  onClick={() => toggleObjective("yield")}
                />
                <SelectionCard 
                  title={t("obj_immo_title")} subtitle={t("obj_immo_desc")}
                  icon={<Home size={24} />} selected={formData.objective.includes("immo")}
                  onClick={() => toggleObjective("immo")}
                />
                <SelectionCard 
                  title={t("obj_family_title")} subtitle={t("obj_family_desc")}
                  icon={<HeartPulse size={24} />} selected={formData.objective.includes("protection_family")}
                  onClick={() => toggleObjective("protection_family")}
                />
                <SelectionCard 
                  title={t("obj_income_title")} subtitle={t("obj_income_desc")}
                  icon={<Umbrella size={24} />} selected={formData.objective.includes("protection_income")}
                  onClick={() => toggleObjective("protection_income")}
                />
              </div>
            </WizardStep>
          )}

          {/* ÉTAPE 2 : PHILOSOPHIE */}
          {step === 2 && (
            <WizardStep 
              key="step2" 
              stepNum={2} 
              total={totalSteps} 
              title={t("step2_title")} 
              onNext={handleNext} 
              canNext={formData.philosophy !== null}
              nextLabel={t("btn_continue")}
              t={t}
            >
              <div className="grid grid-cols-1 gap-4">
                <SelectionCard 
                  title={t("phil_flex_title")} 
                  subtitle={t("phil_flex_desc")}
                  icon={<Landmark size={24} />} 
                  selected={formData.philosophy === "flexibility"}
                  onClick={() => updateData({ philosophy: "flexibility" })}
                  tall
                />
                <SelectionCard 
                  title={t("phil_sec_title")} 
                  subtitle={t("phil_sec_desc")}
                  icon={<Lock size={24} />} 
                  selected={formData.philosophy === "security"}
                  onClick={() => updateData({ philosophy: "security" })}
                  tall
                />
              </div>
            </WizardStep>
          )}

          {/* ÉTAPE D'INTERCEPTION BANCAIRE */}
          {step === 2.5 && (
            <WizardStep 
              key="step25" stepNum={2} total={totalSteps} title={t("step25_title")} 
              onNext={() => {}} canNext={true} hideNextButton={true} t={t}
            >
              <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-[32px] space-y-4 mb-8">
                <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-400">
                  <AlertTriangle size={28} />
                </div>
                <h3 className="text-xl font-black text-white">{t("alert_bank_title")}</h3>
                <p className="text-white/70 text-sm leading-relaxed font-medium">
                  {t.rich("alert_bank_p1", { strong: (chunks) => <strong>{chunks}</strong> })}
                </p>
                <p className="text-white/70 text-sm leading-relaxed font-medium">
                  {t("alert_bank_p2")}
                </p>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={() => { updateData({ philosophy: "security" }); setStep(3); }}
                  className="w-full rounded-2xl bg-white text-black hover:bg-slate-200 px-6 py-7 text-[15px] font-black transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] active:scale-95"
                >
                  {t("btn_opt_regular")}
                </Button>
                <Button 
                  onClick={() => router.push(basePath)}
                  className="w-full rounded-2xl bg-white/5 text-white hover:bg-white/10 px-6 py-7 text-[15px] font-bold transition-all border border-white/10 active:scale-95"
                >
                  {t("btn_leave_sim")}
                </Button>
              </div>
            </WizardStep>
          )}

          {/* ÉTAPE 3 : RISQUE */}
          {step === 3 && (
            <WizardStep 
              key="step3" 
              stepNum={3} 
              total={totalSteps} 
              title={t("step3_title")} 
              onNext={handleNext} 
              canNext={formData.riskProfile !== null}
              nextLabel={t("btn_continue")}
              t={t}
            >
              <div className="grid grid-cols-1 gap-3">
                <SelectionCard 
                  title={t("risk_guaranteed_title")} subtitle={t("risk_guaranteed_desc")}
                  icon={<PiggyBank size={24} />} selected={formData.riskProfile === "guaranteed"}
                  onClick={() => updateData({ riskProfile: "guaranteed" })}
                />
                <SelectionCard 
                  title={t("risk_prudent_title")} subtitle={t("risk_prudent_desc")}
                  icon={<Wallet size={24} />} selected={formData.riskProfile === "prudent"}
                  onClick={() => updateData({ riskProfile: "prudent" })}
                />
                <SelectionCard 
                  title={t("risk_balanced_title")} subtitle={t("risk_balanced_desc")}
                  icon={<Activity size={24} />} selected={formData.riskProfile === "balanced"}
                  onClick={() => updateData({ riskProfile: "balanced" })}
                />
                <SelectionCard 
                  title={t("risk_dynamic_title")} subtitle={t("risk_dynamic_desc")}
                  icon={<TrendingUp size={24} />} selected={formData.riskProfile === "dynamic"}
                  onClick={() => updateData({ riskProfile: "dynamic" })}
                />
              </div>
            </WizardStep>
          )}

          {/* ÉTAPE 4 : STATUT FUMEUR */}
          {step === 4 && (
            <WizardStep 
              key="step4" 
              stepNum={4} 
              total={totalSteps} 
              title={t("step4_title")} 
              onNext={handleNext} 
              canNext={formData.isSmoker !== null}
              nextLabel={t("btn_continue")}
              t={t}
            >
              <div className="grid grid-cols-1 gap-4">
                <SelectionCard 
                  title={t("smoker_no_title")} 
                  subtitle={t("smoker_no_desc")}
                  icon={<Leaf size={24} />} 
                  selected={formData.isSmoker === false} 
                  onClick={() => updateData({ isSmoker: false })} 
                  tall
                />
                <SelectionCard 
                  title={t("smoker_yes_title")} 
                  subtitle={t("smoker_yes_desc")}
                  icon={<Flame size={24} />} 
                  selected={formData.isSmoker === true} 
                  onClick={() => updateData({ isSmoker: true })} 
                  tall
                />
              </div>
            </WizardStep>
          )}

          {/* ÉTAPE 5 : BUDGET */}
          {step === 5 && !isGenerating && (
            <WizardStep 
              key="step5" 
              stepNum={5} 
              total={totalSteps} 
              title={t("step5_title")} 
              onNext={handleNext} 
              canNext={formData.monthlyBudget > 0}
              nextLabel={t("btn_generate")}
              t={t}
            >
              <div className="flex flex-col items-center justify-center space-y-10 py-4">
                
                {/* Grand Input */}
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-2xl font-bold text-white/50">CHF</span>
                  <input 
                    type="number"
                    value={formData.monthlyBudget || ""}
                    onChange={(e) => updateData({ monthlyBudget: Number(e.target.value) })}
                    className="w-full max-w-[200px] text-center bg-transparent text-5xl font-black text-white outline-none placeholder:text-white/20"
                    placeholder="0"
                  />
                  <span className="text-xl font-bold text-white/50">{t("per_month")}</span>
                </div>

                {/* Slider / Jauge */}
                <div className="w-full px-2 space-y-4">
                  <input 
                    type="range" 
                    min="50" max={MAX_MENSUEL} step="50"
                    value={formData.monthlyBudget}
                    onChange={(e) => updateData({ monthlyBudget: Number(e.target.value) })}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#816DEC]"
                  />
                  <div className="flex justify-between text-xs font-bold text-white/40 uppercase tracking-widest">
                    <span>{t("min_val")}</span>
                    <span>{t("max_val", { max: MAX_MENSUEL })}</span>
                  </div>
                </div>

                {/* Boutons rapides */}
                <div className="flex gap-3 w-full">
                  {[100, 300, MAX_MENSUEL].map((amount) => (
                     <button 
                       key={amount}
                       onClick={() => updateData({ monthlyBudget: amount })}
                       className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border ${
                         formData.monthlyBudget === amount 
                          ? 'bg-white text-black border-white' 
                          : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
                       }`}
                     >
                       {amount === MAX_MENSUEL ? t("maximum") : `${amount}.-`}
                     </button>
                  ))}
                </div>

              </div>
            </WizardStep>
          )}

          {/* ÉCRAN DE CHARGEMENT FINAL */}
          {isGenerating && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col items-center justify-center px-6 pb-20 space-y-8"
            >
               <div className="relative">
                 <div className="absolute inset-0 bg-[#816DEC] rounded-full blur-[50px] opacity-40 animate-pulse" />
                 <div className="w-24 h-24 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center relative z-10">
                   <Loader2 size={40} className="text-white animate-spin" />
                 </div>
               </div>
               <div className="text-center space-y-2">
                 <h2 className="text-2xl font-black tracking-tight">{t("loading_title")}</h2>
                 <p className="text-white/50 text-sm font-medium px-4">
                   {t("loading_desc")}
                 </p>
               </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

// --- SOUS-COMPOSANT : STRUCTURE COMMUNE D'UNE ÉTAPE ---
function WizardStep({ stepNum, total, title, children, onNext, canNext, nextLabel, hideNextButton = false, t }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 15 }} 
      animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" } }} 
      exit={{ opacity: 0, x: -10, transition: { duration: 0.1, ease: "easeIn" } }}
      className="flex-1 flex flex-col px-6 pt-4 pb-10 transform-gpu will-change-transform"
    >
      <div className="flex-1 space-y-8">
        <div>
          <p className="text-[#816DEC] font-black uppercase tracking-widest text-[11px] mb-3 flex items-center gap-2 drop-shadow-sm">
            <Sparkles size={14} /> {t("step_count", { step: stepNum, total: total })}
          </p>
          <h1 className="text-3xl font-black text-white tracking-tighter leading-tight pr-4">
            {title}
          </h1>
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </div>

      {!hideNextButton && (
        <div className="pt-8">
          <Button 
            onClick={onNext} disabled={!canNext}
            className="w-full rounded-2xl bg-white text-black hover:bg-slate-200 px-6 py-7 text-[15px] font-black transition-all flex items-center justify-between group disabled:opacity-50 disabled:active:scale-100 active:scale-95 shadow-[0_10px_40px_rgba(255,255,255,0.15)]"
          >
            <span>{nextLabel || "Continuer"}</span>
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// --- SOUS-COMPOSANT : CARTE DE SÉLECTION ---
function SelectionCard({ title, subtitle, icon, selected, onClick, tall = false }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-[28px] border transition-all duration-150 flex items-start gap-4 active:scale-[0.98] transform-gpu outline-none ${
        selected 
          ? 'bg-gradient-to-br from-[#816DEC]/20 to-[#816DEC]/5 border-[#816DEC] shadow-[0_0_30px_rgba(129,109,236,0.2)]' 
          : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
      } ${tall ? 'items-start py-6' : 'items-center'}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
        selected ? 'bg-[#816DEC] text-white shadow-lg shadow-[#816DEC]/30' : 'bg-white/10 text-white/50'
      }`}>
        {icon}
      </div>
      <div className="flex-1 pt-0.5">
        <p className={`font-black text-[16px] leading-tight transition-colors duration-300 ${selected ? 'text-white' : 'text-white/90'}`}>
          {title}
        </p>
        <p className={`text-[12px] font-medium mt-1.5 leading-snug ${selected ? 'text-white/70' : 'text-white/40'}`}>
          {subtitle}
        </p>
      </div>
      {selected && (
        <div className="shrink-0 mt-1">
          <CheckCircle2 size={20} className="text-[#816DEC]" />
        </div>
      )}
    </button>
  );
}