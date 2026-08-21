// app/[locale]/(site)/page.tsx
import Link from "next/link";
import { ChevronRight, ShieldCheck, HeartPulse, ScanFace, FileText, CheckCircle, Activity, Landmark, Building2, ArrowRight } from "lucide-react";
import CookieManageButton from "app/components/CookieManageButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrevoyanceCarousel from "app/components/PrevoyanceCarousel";
import InteractivePrimesWidget from "app/components/InteractivePrimesWidget";
import DownloadAppButton from "app/components/DownloadAppButton";
import AppStoreBadge from "app/components/AppStoreBadge";

// 👈 IMPORT NEXT-INTL
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export const viewport = { themeColor: "#ffffff" };

// 👈 NOUVEAU : Fonction dynamique pour traduire les balises SEO (Meta)
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home.Metadata" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true, follow: true },
  };
}

// On ajoute "async", on récupère les "params" de l'URL, et on force la traduction avec getTranslations
export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });

  return (
    <main className="relative bg-white text-slate-900 antialiased font-sans selection:bg-blue-100">
      
      {/* SECTION 1 : HERO */}
      <section className="relative min-h-[95vh] w-full overflow-hidden flex flex-col justify-center pt-28 md:pt-32 pb-20 px-6">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('/images/hero.jpg')" }} />
        <div className="absolute inset-0 bg-black/20 lg:bg-gradient-to-r lg:from-black/60 lg:via-black/10 lg:to-transparent backdrop-blur-none[1px] lg:backdrop-blur-none" />

        <div className="relative z-10 max-w-6xl mx-auto w-full flex flex-col mt-6 md:mt-10">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full max-w-2xl mx-auto lg:mx-0">
            
            {/* Titre avec gestion du saut de ligne HTML */}
            <h1 
              className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1] mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700"
              dangerouslySetInnerHTML={{ __html: t("Hero.title") }} 
            />
            
            {/* Sous-titre avec gestion des balises <bold> depuis le JSON */}
            <p className="text-lg md:text-2xl text-white/95 font-medium leading-relaxed mb-10 max-w-xl text-balance animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
              {t.rich("Hero.subtitle", {
                bold: (chunks) => <strong className="text-white font-bold drop-shadow-sm">{chunks}</strong>
              })}
            </p>

            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 mb-12 lg:mb-16">
              <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-[17px] font-bold text-[#1a365d] shadow-xl transition-all hover:bg-slate-100 hover:scale-105 active:scale-95">
                {t("Hero.cta")}
              </Link>
            </div>
          </div>

          {/* WIDGET HERO — verre dépoli translucide (façon app) : gros total,
              dots dynamiques, puis les 3 piliers (1er inclus) en rangées glass.
              Peu de couleurs : icônes en verre blanc, pas de dégradés saturés. */}
          <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
            <div className="bg-white/10 backdrop-blur-xl rounded-[32px] p-5 border border-white/20 shadow-2xl text-left flex flex-col gap-5">

              {/* Total + dots dynamiques */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 mb-1.5">{t("Hero.widget_total_label")}</p>
                <p className="text-[38px] leading-none font-semibold text-white tracking-tight tabular-nums">
                  586'400 <span className="text-base font-medium text-white/50 align-top">CHF</span>
                </p>
                <div className="flex items-center gap-1.5 mt-4">
                  <span className="h-1.5 w-5 rounded-full bg-white" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                </div>
              </div>

              {/* Les 3 piliers — rangées translucides, icônes en verre */}
              <div className="space-y-2">
                {/* 1er pilier */}
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white shrink-0">
                    <Landmark size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white leading-tight">{t("Hero.widget_1p")}</p>
                    <p className="text-[10px] text-white/50 font-medium">{t("Hero.widget_1p_desc")}</p>
                  </div>
                  <p className="text-sm font-bold text-white tabular-nums">2'350<span className="text-[10px] font-semibold text-white/50">{t("Hero.widget_mois")}</span></p>
                </div>

                {/* 2e pilier */}
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white shrink-0">
                    <Building2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white leading-tight">{t("Hero.widget_2p")}</p>
                    <p className="text-[10px] text-white/50 font-medium">{t("Hero.widget_2p_desc")}</p>
                  </div>
                  <p className="text-sm font-bold text-white tabular-nums">512'400</p>
                </div>

                {/* 3e pilier */}
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white shrink-0">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white leading-tight">{t("Hero.widget_3p")}</p>
                    <p className="text-[10px] text-white/50 font-medium">{t("Hero.widget_3p_desc")}</p>
                  </div>
                  <p className="text-sm font-bold text-white tabular-nums">74'000</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 : LE SCAN LPP */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="aspect-[4/5] rounded-[32px] overflow-hidden shadow-2xl relative">
              <img src="/images/simplePhoto.jpg" alt={t("Scan.title")} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white p-5 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0"><ScanFace size={24} strokeWidth={2} /></div>
                <div>
                  <p className="text-[15px] font-bold text-slate-900">{t("Scan.widget_title")}</p>
                  <p className="text-xs text-slate-500 font-medium">{t("Scan.widget_subtitle")}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 mb-6">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">{t("Scan.badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("Scan.title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">{t("Scan.text")}</p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-blue-600 text-lg hover:text-blue-700 transition group">
              {t("Scan.cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 3 : L'ANALYSE GLOBALE */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-[#F8F9FB]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-2 relative">
            <div className="aspect-[4/5] rounded-[32px] overflow-hidden shadow-2xl relative">
              <img src="/images/lacunes.jpg" alt={t("Analysis.title")} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/95 backdrop-blur-xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mb-4"><HeartPulse size={18} className="text-red-500" /> {t("Analysis.widget_title")}</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">{t("Analysis.widget_besoins")}</span><span className="font-bold text-slate-900">4 500 CHF</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">{t("Analysis.widget_couverture")}</span><span className="font-bold text-slate-900">3 200 CHF</span>
                  </div>
                  <div className="h-px w-full bg-slate-100 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">{t("Analysis.widget_lacune")}</span>
                    <span className="text-base font-black text-red-500">{t("Analysis.widget_lacune_val")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-100 mb-6">
              <span className="text-xs font-bold text-red-600 uppercase tracking-widest">{t("Analysis.badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("Analysis.title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">{t("Analysis.text")}</p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-red-600 text-lg hover:text-red-700 transition group">
              {t("Analysis.cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 3.5 : CRÉATION 3E PILIER */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="aspect-[9/16] rounded-[32px] overflow-hidden shadow-2xl relative max-w-md mx-auto md:max-w-none">
              <img src="/images/offre.jpg" alt={t("Creation.title")} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/95 backdrop-blur-xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("Creation.widget_etape")}</span>
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><Activity size={14} /></div>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-6 leading-tight">{t("Creation.widget_question")}</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-3xl font-black text-slate-900 tracking-tighter">350 <span className="text-base text-slate-500 tracking-normal">CHF</span></span>
                  </div>
                  <div className="relative h-2 w-full bg-slate-100 rounded-full">
                    <div className="absolute left-0 top-0 h-full w-[45%] bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]"></div>
                    <div className="absolute left-[45%] top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-pointer"></div>
                  </div>
                  <button className="w-full h-12 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2 mt-2">
                    {t("Creation.widget_btn")} <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 mb-6">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">{t("Creation.badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("Creation.title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">{t("Creation.text")}</p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-blue-600 text-lg hover:text-blue-700 transition group">
              {t("Creation.cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 4 : COFFRE-FORT NUMÉRIQUE */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-[#F8F9FB]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-1">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 mb-6">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">{t("Vault.badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("Vault.title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">{t("Vault.text")}</p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-emerald-600 text-lg hover:text-emerald-700 transition group">
              {t("Vault.cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <div className="order-2 relative">
            <div className="aspect-[9/16] rounded-[32px] overflow-hidden shadow-2xl relative max-w-md mx-auto md:max-w-none">
              <img src="/images/documents_resized.jpg" alt={t("Vault.title")} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/10 backdrop-blur-none p-6 shadow-[0_0_40px_rgba(0,0,0,0.3)] border border-white/20">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2 text-white font-bold text-sm"><FileText size={18} className="text-emerald-400" /> {t("Vault.widget_title")}</div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{t("Vault.widget_select")}</span>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/10 border border-white/20 cursor-pointer shadow-sm hover:bg-white/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded border border-emerald-400 bg-emerald-500 flex items-center justify-center text-white"><CheckCircle size={14} /></div>
                      <div className="flex flex-col"><span className="text-xs font-bold text-white">{t("Vault.widget_doc1")}</span><span className="text-[10px] text-white/50 font-medium">PDF • 1.2 MB</span></div>
                    </div>
                    <FileText size={16} className="text-white/30" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/10 border border-white/20 cursor-pointer shadow-sm hover:bg-white/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded border border-emerald-400 bg-emerald-500 flex items-center justify-center text-white"><CheckCircle size={14} /></div>
                      <div className="flex flex-col"><span className="text-xs font-bold text-white">{t("Vault.widget_doc2")}</span><span className="text-[10px] text-white/50 font-medium">PDF • 850 KB</span></div>
                    </div>
                    <FileText size={16} className="text-white/30" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors opacity-70">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded border border-white/30 bg-white/10 flex items-center justify-center"></div>
                      <div className="flex flex-col"><span className="text-xs font-bold text-white">{t("Vault.widget_doc3")}</span><span className="text-[10px] text-white/50 font-medium">PDF • 3.4 MB</span></div>
                    </div>
                    <FileText size={16} className="text-white/20" />
                  </div>
                </div>
                <button className="w-full h-12 bg-white text-emerald-900 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-100 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2">
                  {t("Vault.widget_btn")} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 : LES PRIMES */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="aspect-[9/16] rounded-[32px] overflow-hidden shadow-2xl relative max-w-md mx-auto md:max-w-none">
              <img src="/images/primes.jpg" alt={t("Premiums.title")} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <InteractivePrimesWidget />
            </div>
          </div>
          <div className="order-1 md:order-2 flex flex-col items-start">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 mb-6">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">{t("Premiums.badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("Premiums.title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">
              {t.rich("Premiums.text", {
                bold: (chunks) => <strong className="text-slate-900 font-bold">{chunks}</strong>
              })}
            </p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-slate-900 text-lg hover:text-slate-700 transition group mb-10">
              {t("Premiums.cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <div className="w-full max-w-md border-t border-slate-100 pt-6">
              <p className="text-[11px] leading-relaxed text-slate-400 font-medium">{t("Premiums.disclaimer")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 : RÉSUMÉ CAROUSEL */}
      <PrevoyanceCarousel />

      {/* SECTION 8 : FAQ */}
      <section className="relative py-24 md:py-32 w-full bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">{t("FAQ.title")}</h2>
            <p className="text-lg text-slate-600 font-medium">{t("FAQ.subtitle")}</p>
          </div>

          <div className="space-y-4">
            {/* FAQ Item Generator Function for cleaner code */}
            {[
              { q: "q1", a: "a1", box: true },
              { q: "q2", a: "a2" },
              { q: "q3", a: "a3" },
              { q: "q4", a: "a4" },
              { q: "q5", a: "a5" },
              { q: "q6", a: "a6" },
            ].map((item, i) => (
              <details key={i} className="group border border-slate-200 rounded-2xl bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-1.5 p-6 text-slate-900 font-bold text-lg">
                  {t(`FAQ.${item.q}`)}
                  <span className="relative size-5 shrink-0"><ChevronRight className="absolute inset-0 size-5 transition-transform duration-300 group-open:rotate-90 text-slate-400" /></span>
                </summary>
                <div className="px-6 pb-6 text-slate-600 font-medium leading-relaxed space-y-4">
                  <p>{t(`FAQ.${item.a}`)}</p>
                  {item.box && (
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-sm leading-relaxed">
                      <strong className="font-black text-indigo-900 block mb-1">{t("FAQ.box_title")}</strong> 
                      {t.rich("FAQ.box_text", { bold: (chunks) => <strong>{chunks}</strong> })}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-sm font-bold text-slate-500 mb-4">{t("FAQ.more_questions")}</p>
            <Link href="/contact" className="inline-flex items-center gap-2 text-blue-600 font-bold hover:text-blue-700 transition-colors">
              {t("FAQ.contact_support")} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 9 : DISCLAIMER LÉGAL */}
      <section className="bg-slate-50 border-t border-slate-200 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">{t("Legal.title")}</h3>
          <div className="space-y-4 text-[11px] leading-relaxed text-slate-400 text-justify font-medium">
            <p>{t.rich("Legal.p1", { bold: (chunks) => <strong>{chunks}</strong> })}</p>
            <p>{t.rich("Legal.p2", { bold: (chunks) => <strong>{chunks}</strong> })}</p>
            <p>{t.rich("Legal.p3", { bold: (chunks) => <strong>{chunks}</strong> })}</p>
            <p>{t.rich("Legal.p4", { bold: (chunks) => <strong>{chunks}</strong> })}</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <img src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" alt="CreditX Logo" className="h-8 w-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">{t("Footer.subtitle")}</p>

            {/* Télécharger l'app : desktop → modale QR (façon Revolut) ;
                mobile → lien direct App Store (un QR sur son propre téléphone est inutile). */}
            <div className="mt-5">
              <div className="hidden lg:block"><DownloadAppButton variant="badge" badgeHeight={40} /></div>
              <div className="lg:hidden"><AppStoreBadge height={40} /></div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm font-medium text-slate-500">
            <Link href="/contact" className="hover:text-slate-900 transition">{t("Footer.contact")}</Link>
            <Link href="/legal/cgu" className="hover:text-slate-900 transition">{t("Footer.terms")}</Link>
            <Link href="/legal/confidentialite" className="hover:text-slate-900 transition">{t("Footer.privacy")}</Link>
            <CookieManageButton className="hover:text-slate-900 transition" />
            
            {/* Petit séparateur visuel (visible uniquement sur desktop) */}
            <div className="hidden md:block w-px h-4 bg-slate-200"></div>

            {/* 👈 NOUVEAU : Le sélecteur de langue du Footer */}
            <div className="flex items-center bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <LanguageSwitcher />
            </div>
            
          </div>
        </div>
      </footer>
    </main>
  );
}