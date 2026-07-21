//app/[locale]/dashboard/prevoyance/_components/SituationPrevoyancePage.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// --- COMPOSANT MATERIAL ICON ---
const MaterialIcon = ({ name, color = "inherit", size = 24, fill = true }: { name: string, color?: string, size?: number, fill?: boolean }) => (
  <span 
    className="material-symbols-rounded" 
    style={{ 
      color, 
      fontSize: `${size}px`,
      width: `${size}px`,
      height: `${size}px`,
      fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      fontFamily: "'Material Symbols Rounded'", 
      lineHeight: 1,
      display: 'inline-block',
      direction: 'ltr',
      fontStyle: 'normal',
      whiteSpace: 'nowrap',
      textTransform: 'none',
      letterSpacing: 'normal',
      wordWrap: 'normal'
    }}
  >
    {name}
  </span>
);

// --- HELPER FORMAT CHF SÉCURISÉ ---
const formatCHF = (val: number) => {
  return "CHF " + Math.round(val || 0).toLocaleString('fr-CH').replace(/,/g, "'");
};

interface SituationPrevoyancePageProps {
  analysis: any; 
  gradient?: string; 
  onAdd: () => void;
  activeIndex: number;
  onImprove: () => void;
  onOpenSection?: (sectionId: string) => void;
}

export default function SituationPrevoyancePage({ analysis, activeIndex, onImprove, onOpenSection }: SituationPrevoyancePageProps) {
  // 👈 NOUVEAU : Initialisation des traductions
  const t = useTranslations("SituationPrevoyancePage");

  useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('google-material-symbols')) {
      const link = document.createElement('link');
      link.id = 'google-material-symbols';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
      document.head.appendChild(link);
    }
  }, []);

  if (!analysis) return null;

  const dataRet = analysis.ret;
  const dataIG_Maladie = analysis.inc.maladie;
  const dataIG_Accident = analysis.inc.accident;
  const dataDec = analysis.dec;
  const sol = analysis.sol;

  // --- 1. CALCULS EXACTS ---
  const cibleRetraiteMensuelle = (analysis.sal * 0.8) / 12;
  const lacuneRetraiteMensuelle = Math.max(0, cibleRetraiteMensuelle - dataRet.renteTotale);

  const lacuneIG_Maladie = dataIG_Maladie.periodes && dataIG_Maladie.periodes.length > 0 
    ? Math.max(...dataIG_Maladie.periodes.map((p: any) => p.lacune)) 
    : 0;

  const lacuneIG_Accident = dataIG_Accident.periodes && dataIG_Accident.periodes.length > 0 
    ? Math.max(...dataIG_Accident.periodes.map((p: any) => p.lacune)) 
    : 0;

  const lacuneDeces = Math.max(0, dataDec.lacune);
  const isBadCoverage = analysis.totalScore < 80;

  // --- VARIABLES POUR LES NOUVELLES CARTES DÉTAILLÉES ---
  const cibleIGMensuelle = Math.round((analysis.sal * 0.9) / 12);
  const couvertureMaladie = Math.max(0, cibleIGMensuelle - lacuneIG_Maladie);
  const couvertureAccident = Math.max(0, cibleIGMensuelle - lacuneIG_Accident);
  const besoinDeces = dataDec.besoin || 0;
  const couvertureDeces = dataDec.actuel || 0;

  // CALCULS FISCAUX
  const PLAFOND_3A_ANNUEL = 7258;
  const existing3aAnnuel = analysis.sol.existing3a || 0; 

  const montantDeductible = Math.min(existing3aAnnuel, PLAFOND_3A_ANNUEL);
  const excedent = Math.max(0, existing3aAnnuel - PLAFOND_3A_ANNUEL);

  const salairePourFisc = analysis.sal || 0;
  const tauxFiscApproximatif = salairePourFisc > 150000 ? 0.30 : salairePourFisc > 80000 ? 0.25 : 0.20;
  
  const gainFiscalActuelAnnuel = montantDeductible * tauxFiscApproximatif;
  const utilisationPlafondPourcent = Math.round((montantDeductible / PLAFOND_3A_ANNUEL) * 100);

  // --- 2. DONNÉES DU GRAPHIQUE (AVEC COUCHE 3E PILIER) ---
  const ratioBase = (dataRet.currentMensuel / cibleRetraiteMensuelle) * 100;
  const ratio3a = ((dataRet.renteTotale - dataRet.currentMensuel) / cibleRetraiteMensuelle) * 100;

  const chartData = [
    { name: t("today"), base: 100, pilier3: 0 },
    { name: t("step_1"), base: 95, pilier3: ratio3a * 0.3 }, 
    { name: t("step_2"), base: 85, pilier3: ratio3a * 0.6 },
    { name: t("sec_retirement"), base: ratioBase, pilier3: ratio3a },
  ];

  return (
    <div className="h-full w-screen snap-center flex-shrink-0 flex flex-col overflow-y-auto pb-32 bg-gradient-to-b from-black to-[#816DEC]">
      
      {/* HEADER ÉPURÉ */}
      <div className="px-6 pt-8 pb-12 text-center animate-in fade-in duration-700">
        <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.4em] mb-4 drop-shadow-sm">{t("global_analysis")}</p>
        
        <h1 className="text-6xl font-black text-white tracking-tighter mb-10 drop-shadow-2xl">
          {analysis.totalScore}%
        </h1>
        
        <div className="flex flex-col items-center gap-6">
          <Button 
            onClick={onImprove} 
            className="rounded-full bg-white text-black px-10 py-7 text-sm font-black shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-all hover:bg-slate-100 uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <MaterialIcon name="bolt" size={20} color="currentColor" />
            {t("btn_improve")}
          </Button>
        </div>
      </div>

      {/* CONTENEUR PRINCIPAL */}
      <div className="px-6 space-y-5 flex-1 max-w-xl mx-auto w-full pb-20">
        
        {/* ======================================================== */}
        {/* CARTE 1 : RETRAITE (GRAPHIQUE)                           */}
        {/* ======================================================== */}
        <div onClick={() => onOpenSection?.("section-retraite")} className="bg-white rounded-[32px] p-8 shadow-[0_15px_60px_rgba(0,0,0,0.05)] cursor-pointer active:scale-95 transition-transform">
          
          <div className="flex items-center gap-2 text-slate-900 font-bold text-[13px] uppercase tracking-widest mb-6">
            <MaterialIcon name="flight_takeoff" size={20} color="#f43f5e" /> {t("sec_retirement")}
          </div>
          
          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t("est_needs_80")}</span>
              <span className="font-bold text-slate-900">{formatCHF(cibleRetraiteMensuelle)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t("proj_retirement")}</span>
              <span className="font-bold text-slate-900">{formatCHF(dataRet.renteTotale)}</span>
            </div>
            <div className="h-px w-full bg-slate-100 my-4"></div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold text-slate-900">{t("gap_detected")}</span>
              <span className={`font-bold ${lacuneRetraiteMensuelle > 50 ? 'text-[#FE3824]' : 'text-emerald-500'}`}>
                {lacuneRetraiteMensuelle > 50 ? `-${formatCHF(lacuneRetraiteMensuelle).replace('CHF ', '')}${t("per_month")}` : t("zero_chf_month")}
              </span>
            </div>
          </div>

          <div className="h-32 w-full -ml-5 mt-6 relative opacity-90">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                    <linearGradient id="fillBase" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3}/>
                        <stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                        <stop offset="100%" stopColor={isBadCoverage ? "#FE3824" : "#10B981"} stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="strokeBase" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4F46E5" />
                        <stop offset="50%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor={isBadCoverage ? "#FE3824" : "#10B981"} />
                    </linearGradient>
                    <linearGradient id="fill3a" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.6}/>
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.0}/>
                    </linearGradient>
                </defs>
                <XAxis dataKey="name" hide />
                <YAxis hide domain={[0, 'dataMax + 20']} />
                <Area stackId="1" type="monotone" dataKey="base" stroke="url(#strokeBase)" fill="url(#fillBase)" strokeWidth={4} isAnimationActive={false} />
                <Area stackId="1" type="monotone" dataKey="pilier3" stroke="#10B981" fill="url(#fill3a)" strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-between text-[11px] font-bold text-slate-400 pt-2 px-1">
             <span>{t("today")}</span>
             <span>{t("sec_retirement")}</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARTES 2 & 3 : INVALIDITÉ (MALADIE & ACCIDENT)           */}
        {/* ======================================================== */}
        <div className="space-y-5">
           <div onClick={() => onOpenSection?.("section-maladie")} className="rounded-[32px] bg-white p-8 shadow-[0_15px_60px_rgba(0,0,0,0.05)] cursor-pointer active:scale-95 transition-transform">
             <div className="flex items-center gap-2 text-slate-900 font-bold text-[13px] uppercase tracking-widest mb-6">
               <MaterialIcon name="ecg_heart" size={20} color="#f43f5e" /> {t("sec_illness")}
             </div>
             <div className="space-y-3">
               <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500 font-medium">{t("vital_needs")}</span>
                 <span className="font-bold text-slate-900">{formatCHF(cibleIGMensuelle)}</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500 font-medium">{t("current_coverage")}</span>
                 <span className="font-bold text-slate-900">{formatCHF(couvertureMaladie)}</span>
               </div>
               <div className="h-px w-full bg-slate-100 my-4"></div>
               <div className="flex justify-between items-center text-sm">
                 <span className="font-bold text-slate-900">{t("gap_detected")}</span>
                 <span className={`font-bold ${lacuneIG_Maladie > 0 ? 'text-[#FE3824]' : 'text-emerald-500'}`}>
                   {lacuneIG_Maladie > 0 ? `-${formatCHF(lacuneIG_Maladie).replace('CHF ', '')}${t("per_month")}` : t("zero_chf_month")}
                 </span>
               </div>
             </div>
           </div>

           <div onClick={() => onOpenSection?.("section-accident")} className="rounded-[32px] bg-white p-8 shadow-[0_15px_60px_rgba(0,0,0,0.05)] cursor-pointer active:scale-95 transition-transform">
             <div className="flex items-center gap-2 text-slate-900 font-bold text-[13px] uppercase tracking-widest mb-6">
               <MaterialIcon name="medical_services" size={20} color="#f43f5e" /> {t("sec_accident")}
             </div>
             <div className="space-y-3">
               <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500 font-medium">{t("vital_needs")}</span>
                 <span className="font-bold text-slate-900">{formatCHF(cibleIGMensuelle)}</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500 font-medium">{t("current_coverage")}</span>
                 <span className="font-bold text-slate-900">{formatCHF(couvertureAccident)}</span>
               </div>
               <div className="h-px w-full bg-slate-100 my-4"></div>
               <div className="flex justify-between items-center text-sm">
                 <span className="font-bold text-slate-900">{t("gap_detected")}</span>
                 <span className={`font-bold ${lacuneIG_Accident > 0 ? 'text-[#FE3824]' : 'text-emerald-500'}`}>
                   {lacuneIG_Accident > 0 ? `-${formatCHF(lacuneIG_Accident).replace('CHF ', '')}${t("per_month")}` : t("zero_chf_month")}
                 </span>
               </div>
             </div>
           </div>
        </div>

        {/* ======================================================== */}
        {/* CARTE 4 : DÉCÈS                                          */}
        {/* ======================================================== */}
        <div onClick={() => onOpenSection?.("section-deces")} className="rounded-[32px] bg-white p-8 shadow-[0_15px_60px_rgba(0,0,0,0.05)] cursor-pointer active:scale-95 transition-transform">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-[13px] uppercase tracking-widest mb-6">
            <MaterialIcon name="heart_broken" size={20} color="#f43f5e" /> {t("sec_death")}
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t("est_capital_needed")}</span>
              <span className="font-bold text-slate-900">{formatCHF(besoinDeces)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t("current_capitals")}</span>
              <span className="font-bold text-slate-900">{formatCHF(couvertureDeces)}</span>
            </div>
            <div className="h-px w-full bg-slate-100 my-4"></div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold text-slate-900">{t("gap_detected")}</span>
              <span className={`font-bold ${lacuneDeces > 0 ? 'text-[#FE3824]' : 'text-emerald-500'}`}>
                {lacuneDeces > 0 ? `-${formatCHF(lacuneDeces).replace('CHF ', '')}` : t("zero_chf")}
              </span>
            </div>
          </div>
        </div>

       {/* ======================================================== */}
        {/* CARTE 5 : OPTIMISATION FISCALE (GLASSMORPHISM)           */}
        {/* ======================================================== */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-[32px] p-8 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3),_0_0_40px_rgba(129,109,236,0.15)] space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-white/20 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 border border-white/10 rounded-full flex items-center justify-center shadow-sm text-white pt-0.5">
                <MaterialIcon name="savings" size={22} color="currentColor" />
            </div>
            <div>
              <h4 className="text-[13px] font-black uppercase tracking-widest text-white/70 mb-1">{t("sec_tax_opt")}</h4>
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-tight">{t("current_3a")}</p>
            </div>
          </div>

          <div className="relative z-10 pt-5 border-t border-white/10 space-y-8">
             <div className="bg-black/20 rounded-[28px] p-6 border border-white/10 animate-in zoom-in-95 duration-500 shadow-inner">
                <div className="flex justify-between items-end mb-5 gap-4">
                    <p className="text-[11px] font-black text-white/60 uppercase tracking-widest pb-1 max-w-[150px]">{t("tax_limit_usage")}</p>
                    <p className="text-5xl font-black text-white tracking-tighter leading-none drop-shadow-md">
                        {utilisationPlafondPourcent}<span className="text-2xl font-black text-white/40">%</span>
                    </p>
                </div>
                <div className="h-2.5 w-full bg-white/10 rounded-full overflow-visible flex shadow-inner">
                    <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full relative" 
                        style={{ width: `${utilisationPlafondPourcent}%` }} 
                    >
                        <div className="absolute inset-0 bg-emerald-400 blur-[6px] opacity-70"></div>
                    </div>
                </div>
                {excedent > 0 && (
                  <p className="text-[10px] text-emerald-400 font-bold uppercase pt-3 text-right tracking-tight drop-shadow-sm">
                    {t("limit_reached", { amount: formatCHF(excedent).replace('CHF ', '') })}
                  </p>
                )}
                
                <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60 font-medium">Investissement actuel</span>
                    <span className="font-bold text-white">{formatCHF(existing3aAnnuel)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60 font-medium">Plafond maximum 3A</span>
                    <span className="font-bold text-white">{formatCHF(PLAFOND_3A_ANNUEL)}</span>
                  </div>
                  
                  {montantDeductible < PLAFOND_3A_ANNUEL && (
                    <>
                      <div className="h-px w-full bg-white/10 my-2"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{t("left_to_invest")}</span>
                        <span className="text-sm font-black text-emerald-400">{formatCHF(PLAFOND_3A_ANNUEL - montantDeductible)}</span>
                      </div>
                    </>
                  )}
                </div>
             </div>

             <div className="space-y-3 px-1">
                <p className="text-[11px] font-black text-white/60 uppercase tracking-widest mb-1.5">{t("est_tax_savings")}</p>
                <p className="text-lg font-bold text-white tracking-tight flex items-baseline gap-1.5 drop-shadow-md">
                    {formatCHF(gainFiscalActuelAnnuel).replace('CHF', '').trim()} <span className="text-xs font-medium text-white/50">{t("chf_per_year")}</span>
                </p>
                <p className="text-[10px] leading-relaxed text-white/40 italic mt-2.5 max-w-sm">
                    {t("tax_disclaimer")}
                </p>
             </div>
             
             {PLAFOND_3A_ANNUEL - montantDeductible >= 600 && (
                <div className="pt-4 pb-2">
                    <Button 
                        onClick={onImprove}
                        className="w-full rounded-2xl bg-gradient-to-r from-[#816DEC] to-[#6c58e0] text-white hover:from-[#6c58e0] hover:to-[#816DEC] px-6 py-6 text-sm font-black transition-all flex items-center justify-between group shadow-[0_10px_30px_rgba(129,109,236,0.3)] hover:shadow-[0_15px_40px_rgba(129,109,236,0.5)] active:scale-95 border border-white/20"
                    >
                        <div className="flex items-center gap-2.5">
                            <MaterialIcon name="bolt" size={20} color="white" />
                            <span>{t("btn_opt_tax")}</span>
                        </div>
                        <span className="group-hover:translate-x-1 transition-transform flex items-center justify-center">
                            <MaterialIcon name="arrow_forward" size={20} color="white" />
                        </span>
                    </Button>
                </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}