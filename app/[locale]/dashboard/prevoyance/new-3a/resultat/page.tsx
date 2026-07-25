//app/[locale]/dashboard/prevoyance/new-3a/resultat/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Sparkles, Flame, Leaf, RotateCcw, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase"; // Alias
import { collection, getDocs, query } from "firebase/firestore";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

import SubscriptionWizardDrawer from "../../_components/SubscriptionWizardDrawer";
import { floorRenteIGMensuelle } from "@/lib/analysis/new3a";

// --- UTILITAIRE DE PRÉDICTION ACTUARIELLE ---
function calculatePredictedRate(model: any, age: number, isSmoker: boolean, isFemale: boolean, floor: number = 1.0) {
  if (!model || !Array.isArray(model.beta) || model.beta.length < 4) {
    return Math.exp(model?.fallbackLogMean || -5);
  }
  
  const beta = model.beta;
  const s = isSmoker ? 1 : 0;
  const f = isFemale ? 1 : 0;
  
  const logRate = beta[0] * 1 + beta[1] * age + beta[2] * s + beta[3] * f;
  let rate = Math.exp(logRate);

  if (isSmoker && floor > 1.0) {
    const logRateNS = beta[0] * 1 + beta[1] * age + beta[2] * 0 + beta[3] * f;
    const rateNonSmoker = Math.exp(logRateNS);
    rate = Math.max(rate, rateNonSmoker * floor);
  }

  return rate;
}

// --- COMPOSANT MATERIAL ICON ---
const MaterialIcon = ({ name, color = "inherit", size = 24, fill = true }: { name: string, color?: string, size?: number, fill?: boolean }) => (
  <span 
    className="material-symbols-rounded" 
    style={{ 
      color, fontSize: `${size}px`, width: `${size}px`, height: `${size}px`,
      fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      fontFamily: "'Material Symbols Rounded'", lineHeight: 1, display: 'inline-block', fontStyle: 'normal', whiteSpace: 'nowrap'
    }}
  >
    {name}
  </span>
);

export default function Resultat3aPage() {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("Resultat3aPage");

  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  // CORRECTION : useSearchParams permet de lire les "?uid=..." dans l'URL classique
  const adminUid = searchParams.get("uid") || searchParams.get("adminUid") || (params?.uid as string | undefined);

  const [selRet, setSelRet] = useState(true);
  const [selInc, setSelInc] = useState(false);
  const [selDec, setSelDec] = useState(false);
  const [selPay, setSelPay] = useState(true); 
  const [includeTaxSavings, setIncludeTaxSavings] = useState(false); 

  const [targets, setTargets] = useState<{primeEpargne: number | string, maladie: number | string, deces: number | string, retraite: number}>({ primeEpargne: 250, maladie: 0, deces: 0, retraite: 0 });
  const [originalTargets, setOriginalTargets] = useState({ primeEpargne: 250, maladie: 0, deces: 0, retraite: 0 });
  
  const [dismissedAlerts, setDismissedAlerts] = useState({ primeEpargne: false, maladie: false, deces: false });
  const [recoEpargne, setRecoEpargne] = useState(250);
  
  const [hasUserEditedEpargne, setHasUserEditedEpargne] = useState(false);

  const [isCalculating, setIsCalculating] = useState(true);
  const [premiums, setPremiums] = useState({ ret: 0, inc: 0, dec: 0, pay: 0 });
  const [projectedRetirement, setProjectedRetirement] = useState(0); 
  
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [wizardConfig, setWizardConfig] = useState<any>(null);
  const [clientAge, setClientAge] = useState(35);
  const [clientGender, setClientGender] = useState("M"); 
  const [existing3a, setExisting3a] = useState(0);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  // Arrondi au CENTIME (2 décimales), plus aux 5 centimes : précision des primes préservée.
  const round2 = (num: number) => Math.round(num * 100) / 100;

  useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('google-material-symbols')) {
      const link = document.createElement('link');
      link.id = 'google-material-symbols';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
      document.head.appendChild(link);
    }

    if (typeof window !== "undefined") {
      const savedData = sessionStorage.getItem("new3aWizardData");
      const analysisStr = sessionStorage.getItem("clientAnalysis");

      let parsedConfig = null;
      let realTargets = { primeEpargne: 250, maladie: 2000, deces: 50000, retraite: 0 }; 

      if (savedData) {
        parsedConfig = JSON.parse(savedData);
        setWizardConfig(parsedConfig);
        const objectives = parsedConfig.objective || [];
        setSelInc(objectives.includes("protection_income"));
        setSelDec(objectives.includes("protection_family") || objectives.includes("protection"));
      }

      if (analysisStr) {
        const analysis = JSON.parse(analysisStr);
        
        // 👈 CORRECTION : L'objet 'analysis' ne contient plus la date brute, on la cherche aussi dans 'parsedConfig' (le formulaire) !
        let parsedAge = analysis?.Enter_age || analysis?.age || parsedConfig?.age || parsedConfig?.Enter_age;
        const dateNaissanceStr = analysis?.Enter_dateNaissance || analysis?.dob || analysis?.dateNaissance || parsedConfig?.dob || parsedConfig?.dateNaissance || parsedConfig?.Enter_dateNaissance;
        
        if (!parsedAge && dateNaissanceStr && typeof dateNaissanceStr === 'string') {
          // Extraction robuste de l'année (fonctionne avec DD.MM.YYYY, YYYY-MM-DD ou même juste "1993")
          const yearMatch = dateNaissanceStr.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            parsedAge = new Date().getFullYear() - parseInt(yearMatch[0]);
          }
        }
        
        setClientAge(parsedAge || 35);
        setClientGender(analysis?.gender || analysis?.Gender || "M");
        setExisting3a(analysis?.sol?.existing3a || 0);

        const periodesMaladie = analysis?.inc?.maladie?.periodes;
        const periodesAccident = analysis?.inc?.accident?.periodes;
        
        let calcMaladie = 2000;
        if (periodesMaladie || periodesAccident) {
          const maxMaladie = periodesMaladie?.length > 0 ? Math.max(...periodesMaladie.map((p: any) => p.lacune || 0)) : 0;
          const maxAccident = periodesAccident?.length > 0 ? Math.max(...periodesAccident.map((p: any) => p.lacune || 0)) : 0;

          // Plancher assurable : lacune positive mais < 250/mois (3'000/an) → 250/mois ; 0 reste 0.
          calcMaladie = floorRenteIGMensuelle(Math.max(0, Math.round(Math.max(maxMaladie, maxAccident))));
        }

        let calcDeces = 50000;
        if (analysis?.dec?.lacune !== undefined) {
          calcDeces = Math.max(0, Math.round(analysis.dec.lacune / 1000) * 1000);
        }

        let calcRetraite = 0;
        // 👈 CORRECTION : L'algorithme exporte le capital manquant sous la variable 'cap', et non 'lacune' !
        if (analysis?.ret?.cap !== undefined) {
          calcRetraite = Math.max(0, analysis.ret.cap);
        }

        realTargets = {
          primeEpargne: parsedConfig?.monthlyBudget || 250,
          maladie: calcMaladie,
          deces: calcDeces,
          retraite: calcRetraite
        };
      } else if (parsedConfig) {
        realTargets.primeEpargne = parsedConfig.monthlyBudget || 250;
      }

      setTargets(realTargets);
      setOriginalTargets(realTargets); 
    }

    const fetchBenchmarks = async () => {
      try {
        const q = query(collection(db, "learner_models_3a")); 
        const snap = await getDocs(q);
        setBenchmarks(snap.docs.map(d => d.data()));
      } catch (error) {
        console.error("Erreur de récupération des modèles:", error);
      }
    };
    fetchBenchmarks();
  }, []);

  useEffect(() => {
    setIsCalculating(true);

    const calculate = setTimeout(() => {
      const numPrimeEpargne = Number(targets.primeEpargne) || 0;
      const numMaladie = Number(targets.maladie) || 0;
      const numDeces = Number(targets.deces) || 0;

      let incCost = 0;
      let decCost = 0;
      let payRate = 0.03; 

      const riskProfile = wizardConfig?.riskProfile || "balanced";
      const isSmoker = wizardConfig?.isSmoker === true;
      const isFemale = clientGender === "F";
      
      const ref = benchmarks.length > 0 ? benchmarks[0] : null;

      if (ref) {
        const deathRate = calculatePredictedRate(ref.deathUnit, clientAge, isSmoker, isFemale, ref.smokerFloors?.death);
        const disRate = calculatePredictedRate(ref.disabilityUnit, clientAge, isSmoker, isFemale, ref.smokerFloors?.disability);
        
        decCost = (Number(targets.deces) * deathRate) / 12;
        incCost = (Number(targets.maladie) * 12 * disRate) / 12; 
        payRate = calculatePredictedRate(ref.waiverRate, clientAge, isSmoker, isFemale, ref.smokerFloors?.waiver);
      } else {
        decCost = Number(targets.deces) * 0.00015;
        incCost = Number(targets.maladie) * 0.015;
      }

      const yieldRates: Record<string, number> = { guaranteed: 0.005, prudent: 0.025, balanced: 0.045, dynamic: 0.07 };
      const rate = yieldRates[riskProfile] || 0.045;
      const yearsToRetirement = Math.max(1, 65 - clientAge);

      let requiredMonthlyPremium = 0;
      if (targets.retraite > 0) {
        if (rate === 0) {
          requiredMonthlyPremium = targets.retraite / (yearsToRetirement * 12);
        } else {
          const annualPremium = (targets.retraite * rate) / (Math.pow(1 + rate, yearsToRetirement) - 1);
          requiredMonthlyPremium = annualPremium / 12;
        }
      }
      const idealEpargne = Math.max(0, round2(requiredMonthlyPremium));
      setRecoEpargne(idealEpargne);

      let epargnePremium = numPrimeEpargne;

      if (!hasUserEditedEpargne) {
        const budget = wizardConfig?.monthlyBudget || 250;
        const appliedInc = selInc ? incCost : 0;
        const appliedDec = selDec ? decCost : 0;
        
        let maxAffordableEpargne = budget - appliedInc - appliedDec;
        if (selPay) {
          maxAffordableEpargne = budget / (1 + payRate) - appliedInc - appliedDec;
        }
        
        let suggestedPremium = Math.max(idealEpargne, maxAffordableEpargne);
        suggestedPremium = Math.max(50, round2(suggestedPremium));
        
        if (numPrimeEpargne !== suggestedPremium) {
          epargnePremium = suggestedPremium;
          setTargets(prev => ({ ...prev, primeEpargne: suggestedPremium }));
        }
      }

      const payCost = selPay ? (epargnePremium + (selInc ? incCost : 0) + (selDec ? decCost : 0)) * payRate : 0;
      const annualContribution = epargnePremium * 12;
      
      let projected = 0;
      if (rate === 0) projected = annualContribution * yearsToRetirement;
      else projected = annualContribution * (Math.pow(1 + rate, yearsToRetirement) - 1) / rate;
      
      setProjectedRetirement(projected);

      setPremiums({
        ret: round2(epargnePremium),
        inc: round2(incCost),
        dec: round2(decCost),
        pay: round2(payCost)
      });
      
      setIsCalculating(false);
    }, 600); 

    return () => clearTimeout(calculate);
  }, [targets.primeEpargne, targets.maladie, targets.deces, benchmarks, wizardConfig, clientAge, clientGender, selInc, selDec, selPay, hasUserEditedEpargne]);

  const grossTotal = (selRet ? premiums.ret : 0) + (selInc ? premiums.inc : 0) + (selDec ? premiums.dec : 0) + (selPay ? premiums.pay : 0);
  const maxDeductibleMonthly = Math.max(0, 7258 - existing3a) / 12;
  let split3a = Math.min(grossTotal, maxDeductibleMonthly);
  if (split3a < 50) split3a = 0;

  const split3b = grossTotal - split3a;
  const isSpillover = split3b > 0 && (existing3a > 0 || split3a > 0);

  const taxSaving = round2(split3a * 0.25); 
  const finalTotal = includeTaxSavings ? Math.max(0, grossTotal - taxSaving) : grossTotal;

  // 👈 NOUVEAU : On utilise les traductions pour les profils
  const profileNames: Record<string, string> = {
    guaranteed: t("profiles.guaranteed"), 
    prudent: t("profiles.prudent"), 
    balanced: t("profiles.balanced"), 
    dynamic: t("profiles.dynamic")
  };

  const formattedWizardData = useMemo(() => {
    const analysisStr = typeof window !== "undefined" ? sessionStorage.getItem("clientAnalysis") : null;
    const baseAnalysis = analysisStr ? JSON.parse(analysisStr) : {};

    return {
      ...baseAnalysis, 
      sol: {
        priceRet: selRet ? premiums.ret : 0, priceInc: selInc ? premiums.inc : 0, priceDec: selDec ? premiums.dec : 0, pricePay: selPay ? premiums.pay : 0,
        total: round2(grossTotal), split3a: round2(split3a), split3b: round2(split3b), isSpillover: isSpillover,
        benchmarks: {
          retraite: benchmarks[0]?.provider || "Offre sur mesure", deces: benchmarks[0]?.provider || "Offre sur mesure", incapacite: benchmarks[0]?.provider || "Offre sur mesure"
        }
      },
      ret: { ...baseAnalysis.ret, cap: projectedRetirement }, 
      inc: { maladie: { periodes: [{ lacune: targets.maladie }] }, accident: { periodes: [{ lacune: targets.maladie }] } },
      dec: { ...baseAnalysis.dec, lacune: targets.deces }
    };
  }, [premiums, targets, selRet, selInc, selDec, selPay, grossTotal, benchmarks, projectedRetirement, split3a, split3b, isSpillover]);

  // 2 décimales partout (primes ET capitaux) : on ne perd plus la précision (ex. 604.80).
  const formatCHF = (val: number) => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val).replace(/\s/g, "'");
  const formatCHFCents = (val: number) => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val).replace(/\s/g, "'");

  return (
    <>
      <div className="min-h-screen bg-black text-white overflow-y-auto scrollbar-hide flex flex-col relative pb-32">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#111827] to-[#1e1136] pointer-events-none fixed" />
        <div className="absolute top-[-10%] left-[50%] -translate-x-1/2 w-[80%] h-[40%] bg-[#816DEC] rounded-full blur-[150px] opacity-20 pointer-events-none fixed" />

        <div className="relative z-10 px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 bg-black/20 backdrop-blur-xl border-b border-white/5">
          <button onClick={() => router.back()} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-md border border-white/10 active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>

          {/* 🚀 BOUTON DE REDIRECTION AVEC SAUVEGARDE DES CHIFFRES EXACTS */}
          {adminUid && (
            <Button 
              onClick={() => {
                // On capture exactement ce qui est affiché à l'écran
                const exactOfferData = {
                  premiumRet: premiums.ret || 0,
                  premiumInc: premiums.inc || 0,
                  premiumDec: premiums.dec || 0,
                  premiumPay: premiums.pay || 0, // 👈 AJOUT DE LA LIBÉRATION
                  capitalRet: projectedRetirement || 0,
                  coverageInc: targets.maladie || 0,
                  coverageDec: targets.deces || 0,
                  provider: benchmarks[0]?.provider || "Sur Mesure"
                };
                // On stocke ça dans la mémoire de session
                sessionStorage.setItem("creditx_temp_offer", JSON.stringify(exactOfferData));
                // On redirige
                router.push(`/${params.locale}/admin/client/${adminUid}/prevoyance/new-3a/offre`);
              }}
              className="bg-[#816DEC] hover:bg-[#816DEC]/90 text-white font-bold rounded-full px-5 py-2 text-xs flex items-center gap-2 shadow-lg shadow-[#816DEC]/20 transition-all active:scale-95"
            >
              <Sparkles size={14} className="text-purple-200" />
              Établir offre sur mesure
            </Button>
          )}
        </div>

        <main className="flex-1 relative z-10 flex flex-col px-6 pt-4 space-y-10 max-w-2xl mx-auto w-full">
          
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-white tracking-tighter leading-tight">{t("title")}</h1>
            <p className="text-white/50 text-sm font-medium">{t("subtitle")}</p>
          </div>

          <div className="space-y-8">
            {/* ÉPARGNE */}
            <ConfigRow 
              title={t("saving_title")} desc={t("saving_desc")} icon="flight_takeoff" 
              checked={selRet} onChange={setSelRet} 
              price={premiums.ret} 
              isCalculating={isCalculating} 
              formatCHFCents={formatCHFCents} 
              isAdmin={!!adminUid} provider={benchmarks[0]?.provider || "Sur Mesure"}
            >
              {selRet && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-1 bg-white/5 p-3 rounded-2xl border border-white/10">
                    <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest">{t("saving_premium_lbl")}</p>
                    <div className="relative flex items-center pr-8">
                      <input 
                        type="number" min="0" value={targets.primeEpargne} step="50" 
                        onChange={(e) => { 
                          setHasUserEditedEpargne(true); 
                          setTargets({...targets, primeEpargne: e.target.value === "" ? "" : Math.max(0, Number(e.target.value))}); 
                          if (dismissedAlerts.primeEpargne) setDismissedAlerts(prev => ({ ...prev, primeEpargne: false }));
                        }} 
                        className="w-full bg-transparent text-xl font-black outline-none text-white" 
                      />
                      <AnimatePresence>
                        {hasUserEditedEpargne && targets.primeEpargne !== recoEpargne && (
                          <motion.button 
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => { 
                              setTargets({...targets, primeEpargne: recoEpargne}); 
                              setHasUserEditedEpargne(false); 
                              setDismissedAlerts(prev => ({ ...prev, primeEpargne: false }));
                            }}
                            className="absolute right-0 p-1.5 bg-[#816DEC]/20 text-[#816DEC] rounded-lg hover:bg-[#816DEC] hover:text-white transition-colors"
                            title={t("tooltip_reset_reco")}
                          >
                            <RotateCcw size={14} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <AnimatePresence>
                    {hasUserEditedEpargne && targets.primeEpargne !== recoEpargne && !dismissedAlerts.primeEpargne && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, height: 0 }} 
                        animate={{ opacity: 1, y: 0, height: 'auto' }} 
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="overflow-hidden"
                      >
                        {Number(targets.primeEpargne) < recoEpargne ? (
                          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-amber-100/80 leading-snug">
                                {t.rich("alert_saving_low", { amount: formatCHF(recoEpargne), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, primeEpargne: true }))} className="text-amber-400/50 hover:text-amber-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-blue-100/80 leading-snug">
                                {t.rich("alert_saving_high", { amount: formatCHF(recoEpargne), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, primeEpargne: true }))} className="text-blue-400/50 hover:text-blue-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest mb-1 flex items-center gap-1.5">
                        <Sparkles size={12} /> {t("proj_cap_65")}
                      </p>
                      <p className="text-[11px] text-white/50 font-medium">
                        {t("profile_lbl")} <span className="text-white/80 font-bold">{profileNames[wizardConfig?.riskProfile || "balanced"]}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      {isCalculating ? (
                        <Loader2 size={18} className="animate-spin text-emerald-500 inline-block" /> 
                      ) : (
                        <p className="text-lg font-black text-emerald-400 tracking-tight">{formatCHF(projectedRetirement)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </ConfigRow>

            {/* MALADIE / REVENU PROTECT */}
            <ConfigRow 
              title={t("income_prot_title")} desc={t("income_prot_desc")} icon="ecg_heart" 
              checked={selInc} onChange={setSelInc} price={premiums.inc} 
              isCalculating={isCalculating} formatCHFCents={formatCHFCents}
              isAdmin={!!adminUid} provider={benchmarks[0]?.provider || "Sur Mesure"}
            >
              {selInc && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/10 relative">
                    <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest mb-1">{t("monthly_rent_lbl")}</p>
                    <div className="relative flex items-center pr-8">
                      <input 
                        type="number" min="0" value={targets.maladie} step="100" 
                        onChange={(e) => {
                          setTargets({...targets, maladie: e.target.value === "" ? "" : Math.max(0, Number(e.target.value))});
                          if (dismissedAlerts.maladie) setDismissedAlerts(prev => ({ ...prev, maladie: false })); 
                        }} 
                        className="w-full bg-transparent text-xl font-black outline-none text-white" 
                      />
                      <AnimatePresence>
                        {targets.maladie !== originalTargets.maladie && (
                          <motion.button 
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => {
                               setTargets({...targets, maladie: originalTargets.maladie});
                               setDismissedAlerts(prev => ({ ...prev, maladie: false }));
                            }}
                            className="absolute right-0 p-1.5 bg-[#816DEC]/20 text-[#816DEC] rounded-lg hover:bg-[#816DEC] hover:text-white transition-colors"
                            title={t("tooltip_reset_gap")}
                          >
                            <RotateCcw size={14} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {targets.maladie !== originalTargets.maladie && !dismissedAlerts.maladie && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, height: 0 }} 
                        animate={{ opacity: 1, y: 0, height: 'auto' }} 
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="overflow-hidden"
                      >
                        {Number(targets.maladie) < Number(originalTargets.maladie) ? (
                          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-amber-100/80 leading-snug">
                                {t.rich("alert_inc_low", { amount: formatCHF(Number(originalTargets.maladie)), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, maladie: true }))} className="text-amber-400/50 hover:text-amber-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-blue-100/80 leading-snug">
                                {t.rich("alert_inc_high", { amount: formatCHF(Number(originalTargets.maladie)), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, maladie: true }))} className="text-blue-400/50 hover:text-blue-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </ConfigRow>

            {/* DÉCÈS / FAMILY PROTECT */}
            <ConfigRow 
              title={t("family_prot_title")} desc={t("family_prot_desc")} icon="heart_broken" 
              checked={selDec} onChange={setSelDec} price={premiums.dec} 
              isCalculating={isCalculating} formatCHFCents={formatCHFCents}
              isAdmin={!!adminUid} provider={benchmarks[0]?.provider || "Sur Mesure"}
            >
              {selDec && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/10 relative">
                    <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest mb-1">{t("death_cap_lbl")}</p>
                    <div className="relative flex items-center pr-8">
                      <input 
                        type="number" min="0" value={targets.deces} step="1000" 
                        onChange={(e) => {
                          setTargets({...targets, deces: e.target.value === "" ? "" : Math.max(0, Number(e.target.value))});
                          if (dismissedAlerts.deces) setDismissedAlerts(prev => ({ ...prev, deces: false }));
                        }} 
                        className="w-full bg-transparent text-xl font-black outline-none text-white" 
                      />
                      <AnimatePresence>
                        {targets.deces !== originalTargets.deces && (
                          <motion.button 
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => {
                               setTargets({...targets, deces: originalTargets.deces});
                               setDismissedAlerts(prev => ({ ...prev, deces: false }));
                            }}
                            className="absolute right-0 p-1.5 bg-[#816DEC]/20 text-[#816DEC] rounded-lg hover:bg-[#816DEC] hover:text-white transition-colors"
                            title={t("tooltip_reset_gap")}
                          >
                            <RotateCcw size={14} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <AnimatePresence>
                    {targets.deces !== originalTargets.deces && !dismissedAlerts.deces && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, height: 0 }} 
                        animate={{ opacity: 1, y: 0, height: 'auto' }} 
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="overflow-hidden"
                      >
                        {Number(targets.deces) < Number(originalTargets.deces) ? (
                          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-amber-100/80 leading-snug">
                                {t.rich("alert_dec_low", { amount: formatCHF(Number(originalTargets.deces)), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, deces: true }))} className="text-amber-400/50 hover:text-amber-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex items-start gap-3 mt-1">
                            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[11px] text-blue-100/80 leading-snug">
                                {t.rich("alert_dec_high", { amount: formatCHF(Number(originalTargets.deces)), strong: (chunks) => <strong>{chunks}</strong> })}
                              </p>
                            </div>
                            <button onClick={() => setDismissedAlerts(prev => ({ ...prev, deces: true }))} className="text-blue-400/50 hover:text-blue-400 shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </ConfigRow>

            <ConfigRow 
              title={t("pay_prot_title")} desc={t("pay_prot_desc")} icon="bolt" 
              checked={selPay} onChange={setSelPay} price={premiums.pay} 
              isCalculating={isCalculating} formatCHFCents={formatCHFCents} 
              isAdmin={!!adminUid} provider={benchmarks[0]?.provider || "Sur Mesure"}
            />
          </div>

          <AnimatePresence>
            {isSpillover && (grossTotal > 0) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-2xl flex items-start gap-4 mt-2">
                   <div className="pt-0.5"><MaterialIcon name="info" color="#3b82f6" size={24} /></div>
                   <div className="flex-1">
                     <p className="text-[11px] font-black uppercase text-blue-400 tracking-widest mb-1.5">{t("spillover_title")}</p>
                     <p className="text-[12px] text-blue-100/70 leading-relaxed font-medium">
                       {t.rich("spillover_desc", { amount: formatCHF(existing3a), strong: (chunks) => <strong>{chunks}</strong>, br: () => <br/> })}
                     </p>
                     <div className="mt-3 space-y-1">
                       <div className="flex justify-between text-[13px]"><span className="text-blue-300">{t("pillar_3a")}</span><span className="font-black text-blue-200">{t("chf_per_month", { amount: formatCHFCents(split3a) })}</span></div>
                       <div className="flex justify-between text-[13px]"><span className="text-blue-300">{t("pillar_3b")}</span><span className="font-black text-blue-200">{t("chf_per_month", { amount: formatCHFCents(split3b) })}</span></div>
                     </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

          <div className="space-y-6">
            <div className="flex justify-between items-center bg-black/40 p-4 rounded-2xl border border-white/5">
              <p className="text-[12px] font-black uppercase tracking-widest text-emerald-400">{t("tax_saving_title")}</p>
              <div className="flex items-center gap-3">
                <p className="text-lg font-black text-white/50">- {formatCHFCents(taxSaving)} <span className="text-[10px] font-bold">{t("per_month")}</span></p>
                <Switch checked={includeTaxSavings} onCheckedChange={setIncludeTaxSavings} className="data-[state=checked]:bg-emerald-500" />
              </div>
            </div>

            <div className="flex justify-between items-end">
              <p className="text-[11px] font-black uppercase text-white/40 tracking-widest pb-2">{includeTaxSavings ? t("total_tax_incl") : t("total_net")}</p>
              <div className="text-right">
                <AnimatePresence mode="wait">
                  {isCalculating ? (
                    <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Loader2 size={32} className="animate-spin text-white/50 ml-auto" /></motion.div>
                  ) : (
                    <motion.p key="price" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-5xl font-black tracking-tighter text-white drop-shadow-md">
                      {formatCHFCents(finalTotal)} <span className="text-xs font-black tracking-widest text-white/40">{t("per_month")}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <Button onClick={() => setIsWizardOpen(true)} disabled={isCalculating || grossTotal === 0} className="w-full py-8 rounded-[32px] bg-gradient-to-r from-[#816DEC] to-[#6c58e0] text-white font-black text-lg uppercase shadow-[0_10px_30px_rgba(129,109,236,0.3)] active:scale-95 transition-all border-0 disabled:opacity-50">{t("btn_subscribe")}</Button>
          </div>
        </main>
      </div>

      <SubscriptionWizardDrawer 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)} 
        analysisData={formattedWizardData} 
        adminUid={adminUid} 
      />
    </>
  );
}

function ConfigRow({ title, desc, icon, checked, onChange, price, isCalculating, formatCHFCents, provider, isAdmin, children }: any) {
  return (
    <div className={`transition-opacity duration-300 ${!checked && 'opacity-60'}`}>
      <div className="flex items-start justify-between group mb-2">
        <div className="flex gap-4 items-start">
          <div className={`pt-0.5 transition-colors duration-300 ${checked ? 'text-white' : 'text-white/20'}`}><MaterialIcon name={icon} size={28} /></div>
          <div>
            <p className={`font-black text-2xl tracking-tight leading-none mb-1.5 transition-colors duration-300 ${checked ? 'text-white' : 'text-white/40'}`}>{title}</p>
            <p className={`text-[12px] font-medium leading-relaxed max-w-[200px] transition-colors duration-300 ${checked ? 'text-white/60' : 'text-white/20'}`}>{desc}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 pt-1">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              {isAdmin && checked && provider && !isCalculating && (
                <span className="text-[9px] font-black uppercase tracking-widest text-[#816DEC] bg-[#816DEC]/10 px-1.5 py-0.5 rounded border border-[#816DEC]/20 mb-1">
                  {provider}
                </span>
              )}
              {isCalculating && checked ? (
                <Loader2 size={20} className="animate-spin text-white/30" />
              ) : (
                <span className={`font-black text-2xl tracking-tight transition-colors duration-300 ${checked ? 'text-white' : 'text-white/20'}`}>
                  {formatCHFCents(price)}
                </span>
              )}
            </div>
            <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#816DEC] data-[state=unchecked]:bg-white/10 border-white/5" />
          </div>
        </div>
      </div>
      <AnimatePresence>
        {checked && children && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-11">{children}</motion.div>}
      </AnimatePresence>
    </div>
  );
}