//app/[locale]/dashboard/prevoyance/_components/FortuneAnalysisDrawer.tsx
"use client";

import React, { useEffect } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ChevronDown, BarChart2, ShieldCheck, AlertCircle, BriefcaseMedical, HeartPulse, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
    
import { usePrevoyanceAnalysis } from "@/lib/hooks/usePrevoyanceAnalysis"; // Alias mis à jour si besoin

// 👈 NOUVEAU : Import pour la traduction
import { useTranslations } from "next-intl";

// --- CONFIGURATION DESIGN FINTECH ---
const COLORS = {
  red: "#e11d48",     // rose-600
  green: "#10b981",   // emerald-500
  blue: "#2563eb",    // blue-600
  text: "#0f172a",    // slate-900
  muted: "#64748b"    // slate-500
};

interface FortuneAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  plans: any[];
  clientAge: number;
  onSubscribe: (data: any) => void;
  onOpenProfile: () => void;
  clientInfo?: any;
  adminUid?: string;
  initialSlide?: "overview" | "solution" | string;
}

const formatCHF = (n: number) => 
  new Intl.NumberFormat('fr-CH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(Math.round(n)).replace(/\s/g, "'");

export default function FortuneAnalysisDrawer({ isOpen, onClose, plans, clientAge, onSubscribe, onOpenProfile, clientInfo, adminUid, initialSlide = "overview" }: FortuneAnalysisDrawerProps) {
  // 👈 NOUVEAU : Initialisation des traductions
  const t = useTranslations("FortuneAnalysisDrawer");

  const { analysis, loading, cloudData, config } = usePrevoyanceAnalysis(adminUid, plans, clientAge);
  const { allocation3a, setAllocation3a, isSmoothingIG, setIsSmoothingIG, includeTaxSavings, setIncludeTaxSavings, switches } = config;
  const { selRet, setSelRet, selInc, setSelInc, selDec, setSelDec, selPay, setSelPay } = switches;

  // Scroll dynamique
  useEffect(() => {
    if (isOpen && initialSlide && initialSlide !== "overview") {
      setTimeout(() => {
        const container = document.getElementById('drawer-main-container');
        if (!container) return;

        if (initialSlide === "solution") {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else {
            const targetSection = document.getElementById(initialSlide);
            if (targetSection) {
                const containerTop = container.getBoundingClientRect().top;
                const elementTop = targetSection.getBoundingClientRect().top;
                const offsetPosition = (elementTop - containerTop) + container.scrollTop - 24;
                container.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        }
      }, 500); 
    }
  }, [isOpen, initialSlide]);

  if (loading || !analysis) return null;

  const handleConfirmSubscription = () => {
    const finalData = {
      ...analysis,
      ...cloudData,
      sol: {
        ...analysis.sol,
        priceRet: selRet ? analysis.sol.priceRet : 0,
        priceInc: selInc ? analysis.sol.priceInc : 0,
        priceDec: selDec ? analysis.sol.priceDec : 0,
        pricePay: selPay ? analysis.sol.pricePay : 0,
      }
    };
    onSubscribe(finalData);
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="bg-slate-50 h-screen w-screen border-none focus:outline-none p-0 m-0 rounded-none font-sans tracking-tight overflow-hidden">
        <div className="sr-only">
          <DrawerTitle>{t("sr_title")}</DrawerTitle>
        </div>
        
        {/* HEADER FIXE - Style "App Bar" */}
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                <BarChart2 size={16} />
             </div>
             <div>
               <h1 className="text-sm font-bold text-slate-900 leading-tight">{t("header_title")}</h1>
               <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">{t("header_subtitle")}</p>
             </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              <ChevronDown size={20} />
          </button>
        </div>

        {/* CONTENEUR DE SCROLL NATUREL - Style "Document A4" */}
        <div id="drawer-main-container" className="h-full overflow-y-auto scroll-smooth text-slate-900 pb-32">
          
          <div className="max-w-3xl mx-auto bg-white min-h-screen border-x border-slate-200 shadow-sm">
            <div className="px-8 py-10 space-y-10">

              {/* HEADER SCORE GLOBAL */}
              <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                 <div>
                   <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{t("lbl_coverage_index")}</p>
                   <h2 className="text-2xl font-bold text-slate-900">{t("lbl_global_score")}</h2>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${analysis.totalScore >= 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                      {analysis.totalScore >= 80 ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                      <span className="text-2xl font-bold">{analysis.totalScore}%</span>
                    </div>
                 </div>
              </div>

              {/* SECTION : RETRAITE */}
              <section id="section-retraite" className="space-y-6">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      <BarChart2 size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{t("sec_ret_title")}</h2>
                  </div>
                  <span className={`text-sm font-bold ${analysis.ret.score >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t("lbl_coverage", { score: analysis.ret.score })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-6 items-start">
                  <div className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1 uppercase">{t("lbl_est_monthly_income")}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatCHF(analysis.ret.renteTotale)} <span className="text-xs text-slate-500 font-medium">{t("unit_chf_month")}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {t("lbl_goal_80", { amount: formatCHF((analysis.sal * 0.8) / 12) })}
                    </p>
                  </div>
                  <div className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1 uppercase">{t("lbl_capital_analysis")}</p>
                    {analysis.ret.aBesoin ? (
                      <>
                        <p className="text-2xl font-bold text-rose-600">
                          -{formatCHF(analysis.ret.cap)} <span className="text-xs text-rose-400 font-medium">{t("unit_chf")}</span>
                        </p>
                        <p className="text-[10px] text-rose-500/70 mt-2">{t("lbl_shortfall_legal_age")}</p>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        <ShieldCheck size={20} className="text-emerald-500" />
                        <span className="text-sm font-bold text-emerald-600">{t("lbl_goal_reached")}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-xs font-bold text-slate-600">{t("lbl_opt_3a", { pct: allocation3a })}</p>
                  </div>
                  <Slider value={[allocation3a]} onValueChange={(v) => setAllocation3a(v[0])} max={100} step={5} className="mb-6"/>

                  <div className="h-48 w-full border border-slate-200 rounded-xl bg-white p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analysis.ret.chartData}>
                        <YAxis hide domain={[0, 'dataMax + 200']} />
                        <defs>
                            <linearGradient id="colorAVS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.muted} stopOpacity={0.4}/><stop offset="95%" stopColor={COLORS.muted} stopOpacity={0}/></linearGradient>
                            <linearGradient id="colorLPP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.4}/><stop offset="95%" stopColor={COLORS.blue} stopOpacity={0}/></linearGradient>
                            <linearGradient id="color3a" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.green} stopOpacity={0.4}/><stop offset="95%" stopColor={COLORS.green} stopOpacity={0}/></linearGradient>
                        </defs>
                        <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const total = payload.reduce((sum, entry) => sum + (entry.value as number), 0);
                                return (
                                <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl">
                                    <p className="text-[10px] text-slate-500 font-bold mb-2 uppercase">{payload[0].payload.name}</p>
                                    <div className="space-y-1">
                                      <p className="text-[11px] flex justify-between gap-6 text-slate-600">{t("chart_avs")} <span className="font-bold text-slate-900">{formatCHF(payload[0].value as number)} {t("unit_chf")}</span></p>
                                      <p className="text-[11px] flex justify-between gap-6 text-blue-600">{t("chart_lpp")} <span className="font-bold text-blue-700">{formatCHF(payload[1].value as number)} {t("unit_chf")}</span></p>
                                      <p className="text-[11px] flex justify-between gap-6 text-emerald-600">{t("chart_3a")} <span className="font-bold text-emerald-700">{formatCHF(payload[2].value as number)} {t("unit_chf")}</span></p>
                                      <div className="pt-2 mt-2 border-t border-slate-100 text-xs font-bold flex justify-between text-slate-900">{t("chart_total")} <span>{formatCHF(total)} {t("unit_chf")}</span></div>
                                    </div>
                                </div>
                                );
                            }
                            return null;
                        }}/>
                        <Area stackId="1" type="stepAfter" dataKey="avs" stroke={COLORS.muted} fill="url(#colorAVS)" isAnimationActive={false} />
                        <Area stackId="1" type="stepAfter" dataKey="lpp" stroke={COLORS.blue} fill="url(#colorLPP)" isAnimationActive={false} />
                        <Area stackId="1" type="stepAfter" dataKey="capital" stroke={COLORS.green} fill="url(#color3a)" isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="pt-2">
                    <details className="group">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors outline-none list-none [&::-webkit-details-marker]:hidden p-2 rounded-lg hover:bg-slate-100">
                        <span>{t("tbl_view_math_details")}</span>
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm animate-in fade-in slide-in-from-top-2">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                            <tr>
                              <th className="px-4 py-3">{t("tbl_col_year_age")}</th>
                              <th className="px-4 py-3 text-right">{t("tbl_col_avs")}</th>
                              <th className="px-4 py-3 text-right text-blue-600">{t("tbl_col_lpp")}</th>
                              <th className="px-4 py-3 text-right text-emerald-600">{t("tbl_col_3a")}</th>
                              <th className="px-4 py-3 text-right text-slate-900">{t("tbl_col_monthly_total")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analysis.ret.chartData.map((row: any, i: number) => {
                              const age = parseInt(row.name);
                              const ageClientMath = Number(clientAge) || 35;
                              const anneeCalendrier = new Date().getFullYear() + (age - ageClientMath);
                              const total = row.avs + row.lpp + row.capital;
                              return (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3 font-bold text-slate-900">
                                    {anneeCalendrier} <span className="text-slate-400 font-medium ml-1">{t("lbl_age_format", { age: row.name })}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-slate-500">{formatCHF(row.avs)} {t("unit_chf")}</td>
                                  <td className="px-4 py-3 text-right text-blue-600">{formatCHF(row.lpp)} {t("unit_chf")}</td>
                                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatCHF(row.capital)} {t("unit_chf")}</td>
                                  <td className="px-4 py-3 text-right font-black text-slate-900">{formatCHF(total)} {t("unit_chf")}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                </div>
              </section>

              {/* SECTION : IG MALADIE */}
              <section id="section-maladie" className="space-y-6">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                      <BriefcaseMedical size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{t("sec_illness_title")}</h2>
                  </div>
                  <span className={`text-sm font-bold ${analysis.inc.maladie.score >= 90 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t("lbl_coverage", { score: analysis.inc.maladie.score })}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex flex-col">
                    <p className="text-sm font-bold text-slate-900">{t("lbl_smart_smoothing")}</p>
                    <p className="text-xs text-slate-500">{t("lbl_smoothing_desc")}</p>
                  </div>
                  <Switch checked={isSmoothingIG} onCheckedChange={setIsSmoothingIG} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-48 w-full border border-slate-200 rounded-xl bg-white p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analysis.inc.maladie.chartData}>
                        <defs>
                          <linearGradient id="colorIGMaladie" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.red} stopOpacity={0}/></linearGradient>
                        </defs>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 'dataMax + 1000']} />
                        <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const val = payload[0].value as number;
                              const gap = Math.round(analysis.inc.maladie.cible - val);
                              return (
                                <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl">
                                  <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">{payload[0].payload.name}</p>
                                  <p className="text-sm font-bold text-slate-900">{formatCHF(val)} {t("unit_chf")}</p>
                                  {gap > 10 ? (
                                    <p className="text-xs text-rose-600 font-bold mt-1">{t("chart_shortfall", { amount: formatCHF(gap) })}</p>
                                  ) : (
                                    <p className="text-xs text-emerald-600 font-bold mt-1">{t("chart_optimal_coverage")}</p>
                                  )}
                                </div>
                              );
                            }
                            return null;
                        }}/>
                        <ReferenceLine y={analysis.inc.maladie.cible} stroke={COLORS.text} strokeDasharray="3 3" label={{ position: 'top', value: t("chart_target_threshold"), fill: COLORS.muted, fontSize: 10 }} />
                        <Area type="stepAfter" dataKey="revenu" stroke={analysis.inc.maladie.score >= 90 ? COLORS.green : COLORS.red} fill={analysis.inc.maladie.score >= 90 ? "url(#color3a)" : "url(#colorIGMaladie)"} strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="pt-2 col-span-1 md:col-span-2">
                    <details className="group">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors outline-none list-none [&::-webkit-details-marker]:hidden p-2 rounded-lg hover:bg-slate-100">
                        <span>{t("tbl_view_income_proj")}</span>
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm animate-in fade-in slide-in-from-top-2">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                            <tr>
                              <th className="px-4 py-3">{t("tbl_col_year_age")}</th>
                              <th className="px-4 py-3 text-right text-slate-900">{t("tbl_col_proj_income")}</th>
                              <th className="px-4 py-3 text-right">{t("tbl_col_target_90")}</th>
                              <th className="px-4 py-3 text-right">{t("tbl_col_gap")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analysis.inc.maladie.chartData.map((row: any, i: number) => {
                              const valeurInitiale = parseInt(row.name);
                              const ageClientMath = Number(clientAge) || 35;
                              const anneeActuelle = new Date().getFullYear();
                              
                              let anneeCalendrier, ageAffichage;
                              
                              if (valeurInitiale > 2000) {
                                anneeCalendrier = valeurInitiale;
                                ageAffichage = ageClientMath + (valeurInitiale - anneeActuelle);
                              } else {
                                anneeCalendrier = anneeActuelle + (valeurInitiale - ageClientMath);
                                ageAffichage = valeurInitiale;
                              }

                              const ecart = row.revenu - row.besoin;
                              return (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3 font-bold text-slate-900">
                                    {anneeCalendrier} <span className="text-slate-400 font-medium ml-1">{t("lbl_age_format", { age: ageAffichage })}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-slate-900">{formatCHF(row.revenu)} {t("unit_chf")}</td>
                                  <td className="px-4 py-3 text-right text-slate-500">{formatCHF(row.besoin)} {t("unit_chf")}</td>
                                  <td className={`px-4 py-3 text-right font-bold ${ecart < -10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {ecart < -10 ? `${formatCHF(ecart)} ${t("unit_chf")}` : t("txt_ok")}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>

                  <div className="space-y-3">
                    {analysis.inc.maladie.periodes.length > 0 ? (
                      analysis.inc.maladie.periodes.map((p: any, i: number) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{t("lbl_period")}</p>
                            <p className="text-sm font-bold text-slate-900">{t("lbl_period_years", { start: p.debut, end: p.fin })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-rose-600">-{formatCHF(p.lacune)} <span className="text-[10px] text-rose-400">{t("unit_chf_m")}</span></p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-6 border border-slate-200 rounded-xl bg-slate-50 text-center">
                        <ShieldCheck className="text-emerald-500 mb-2" size={24} />
                        <p className="text-sm font-bold text-slate-900">{t("lbl_no_shortfall")}</p>
                        <p className="text-xs text-slate-500">{t("lbl_coverage_sufficient")}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* SECTION : IG ACCIDENT */}
              <section id="section-accident" className="space-y-6">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                      <AlertCircle size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{t("sec_accident_title")}</h2>
                  </div>
                  <span className={`text-sm font-bold ${analysis.inc.accident.score >= 90 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t("lbl_coverage", { score: analysis.inc.accident.score })}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-48 w-full border border-slate-200 rounded-xl bg-white p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analysis.inc.accident.chartData}>
                        <defs>
                          <linearGradient id="colorIGAccident" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.red} stopOpacity={0}/></linearGradient>
                        </defs>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 'dataMax + 1000']} />
                        <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const val = payload[0].value as number;
                              const gap = Math.round(analysis.inc.maladie.cible - val);
                              return (
                                <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl">
                                  <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">{payload[0].payload.name}</p>
                                  <p className="text-sm font-bold text-slate-900">{formatCHF(val)} {t("unit_chf")}</p>
                                  {gap > 10 && <p className="text-xs text-rose-600 font-bold mt-1">{t("chart_shortfall", { amount: formatCHF(gap) })}</p>}
                                </div>
                              );
                            }
                            return null;
                        }}/>
                        <ReferenceLine y={analysis.inc.maladie.cible} stroke={COLORS.text} strokeDasharray="3 3" label={{ position: 'top', value: t("chart_target_threshold"), fill: COLORS.muted, fontSize: 10 }} />
                        <Area type="stepAfter" dataKey="revenu" stroke={analysis.inc.accident.score >= 90 ? COLORS.green : COLORS.red} fill={analysis.inc.accident.score >= 90 ? "url(#color3a)" : "url(#colorIGAccident)"} strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="pt-2 col-span-1 md:col-span-2">
                    <details className="group">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors outline-none list-none [&::-webkit-details-marker]:hidden p-2 rounded-lg hover:bg-slate-100">
                        <span>{t("tbl_view_income_proj")}</span>
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm animate-in fade-in slide-in-from-top-2">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                            <tr>
                              <th className="px-4 py-3">{t("tbl_col_year_age")}</th>
                              <th className="px-4 py-3 text-right text-slate-900">{t("tbl_col_proj_income")}</th>
                              <th className="px-4 py-3 text-right">{t("tbl_col_target_90")}</th>
                              <th className="px-4 py-3 text-right">{t("tbl_col_gap")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analysis.inc.accident.chartData.map((row: any, i: number) => {
                              const valeurInitiale = parseInt(row.name);
                              const ageClientMath = Number(clientAge) || 35;
                              const anneeActuelle = new Date().getFullYear();
                              
                              let anneeCalendrier, ageAffichage;
                              
                              if (valeurInitiale > 2000) {
                                anneeCalendrier = valeurInitiale;
                                ageAffichage = ageClientMath + (valeurInitiale - anneeActuelle);
                              } else {
                                anneeCalendrier = anneeActuelle + (valeurInitiale - ageClientMath);
                                ageAffichage = valeurInitiale;
                              }

                              const cible = analysis.inc.maladie.cible;
                              const ecart = row.revenu - cible;
                              return (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3 font-bold text-slate-900">
                                    {anneeCalendrier} <span className="text-slate-400 font-medium ml-1">{t("lbl_age_format", { age: ageAffichage })}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-slate-900">{formatCHF(row.revenu)} {t("unit_chf")}</td>
                                  <td className="px-4 py-3 text-right text-slate-500">{formatCHF(cible)} {t("unit_chf")}</td>
                                  <td className={`px-4 py-3 text-right font-bold ${ecart < -10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {ecart < -10 ? `${formatCHF(ecart)} ${t("unit_chf")}` : t("txt_ok")}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>

                  <div className="space-y-3">
                    {analysis.inc.accident.periodes.length > 0 ? (
                      analysis.inc.accident.periodes.map((p: any, i: number) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{t("lbl_period")}</p>
                            <p className="text-sm font-bold text-slate-900">{t("lbl_period_years", { start: p.debut, end: p.fin })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-rose-600">-{formatCHF(p.lacune)} <span className="text-[10px] text-rose-400">{t("unit_chf_m")}</span></p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-6 border border-slate-200 rounded-xl bg-slate-50 text-center">
                        <ShieldCheck className="text-emerald-500 mb-2" size={24} />
                        <p className="text-sm font-bold text-slate-900">{t("lbl_laa_optimal")}</p>
                        <p className="text-xs text-slate-500">{t("lbl_no_extra_need")}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* SECTION : DÉCÈS */}
              <section id="section-deces" className="space-y-6">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center">
                      <HeartPulse size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{t("sec_death_title")}</h2>
                  </div>
                  <span className={`text-sm font-bold ${analysis.dec.score >= 90 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t("lbl_coverage", { score: analysis.dec.score })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1 uppercase">{t("lbl_calc_need")}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatCHF(analysis.dec.besoin)} <span className="text-xs text-slate-500 font-medium">{t("unit_chf")}</span>
                    </p>
                  </div>
                  <div className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1 uppercase">{t("lbl_current_coverage")}</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatCHF(analysis.dec.actuel)} <span className="text-xs text-emerald-500/70 font-medium">{t("unit_chf")}</span>
                    </p>
                  </div>
                </div>

                {analysis.dec.lacune > 0 && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-5 flex justify-between items-center">
                     <div>
                       <p className="text-sm font-bold text-rose-900">{t("lbl_missing_capital")}</p>
                       <p className="text-xs text-rose-700 mt-1">{t("lbl_secure_family")}</p>
                     </div>
                     <p className="text-2xl font-bold text-rose-600">-{formatCHF(analysis.dec.lacune)} {t("unit_chf")}</p>
                  </div>
                )}
              </section>

            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// --- SOUS-COMPOSANTS ---

function SolutionRow({ label, price, desc, icon, checked, onChange }: { label: string, price: string, desc: string, icon: string, checked: boolean, onChange: (v: boolean) => void }) {
  if (price === "0.00" && label !== "Pay Protect") return null;
  return (
    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-colors">
      <div className="flex gap-4 items-center">
        <div className={`p-2 rounded-lg ${checked ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
           <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>{icon}</span>
        </div>
        <div>
          <p className={`font-bold text-sm mb-0.5 ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{label}</p>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className={`font-bold text-sm ${checked ? 'text-slate-900' : 'text-slate-400'}`}>{price}</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}