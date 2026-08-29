import Link from "next/link";
import { ChevronRight, ShieldCheck, HeartPulse, ArrowRight, Layers, Blocks, RefreshCw, SlidersHorizontal, TrendingUp, Landmark, Lock, CheckCircle } from "lucide-react";
import CookieManageButton from "app/components/CookieManageButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AetherHero from "@/components/AetherHero";
import PersonasWidget from "@/components/PersonasWidget";
import SmartContracts from "@/components/SmartContracts";
import DownloadAppButton from "@/app-components/DownloadAppButton";
import AppStoreBadge from "@/app-components/AppStoreBadge";
import { getTranslations } from "next-intl/server";

export const viewport = { themeColor: "#ffffff" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ThirdPillar" });
  return {
    title: t("meta_title"),
    description: t("meta_desc"),
    robots: { index: true, follow: true },
  };
}

export default async function Pilier3Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ThirdPillar" });
  return (
    <main className="relative bg-white text-slate-900 antialiased font-sans selection:bg-blue-100">
      
      {/* SECTION 1 : HERO (AETHER FLOW INTERACTIF) */}
      <AetherHero />

      {/* SECTION 2 : LE CONCEPT LEGO DYNAMIQUE (PERSONAS) */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">{t("personas_title")}</h2>
            <p className="text-lg text-slate-600 font-medium">{t.rich("personas_subtitle", { b: (chunks) => <strong>{chunks}</strong> })}</p>
          </div>
          
          <PersonasWidget />
          
        </div>
      </section>

      {/* SECTION 3 : LES CAS D'USAGE (SMART CONTRACTS) */}
      <div className="w-full bg-white">
        {/* Titre d'introduction juste au-dessus des 3 blocs */}
        <div className="py-24 text-center max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
            {t("sc_title_1")} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{t("sc_title_2")}</span>
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            {t("sc_subtitle")}
          </p>
        </div>

        <SmartContracts />
      </div>

      {/* SECTION 4 : PILOTE AUTOMATIQUE */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="aspect-[9/16] rounded-[32px] overflow-hidden shadow-2xl relative max-w-md mx-auto md:max-w-none">
              <img src="/images/zen.png" alt="Tableau de bord temps réel" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/95 backdrop-blur-xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("auto_card_label")}</span>
                  <div className="flex items-center gap-1 text-emerald-500">
                    <TrendingUp size={14} />
                    <span className="text-xs font-bold">+4.2%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-500 block">{t("auto_card_sublabel")}</span>
                  <span className="text-4xl font-black text-slate-900 tracking-tighter block mb-4">12'450 <span className="text-lg text-slate-500 tracking-normal">CHF</span></span>
                  <button className="w-full h-12 bg-slate-100 text-slate-600 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition shadow-sm flex items-center justify-center gap-2">
                    <RefreshCw size={14} /> {t("auto_card_refresh")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 mb-6">
              <Lock size={14} className="text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">{t("auto_badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("auto_title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">{t("auto_text")}</p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-emerald-600 text-lg hover:text-emerald-700 transition group">
              {t("auto_cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 5 : FLEXIBILITÉ */}
      <section className="relative py-32 md:py-48 w-full overflow-hidden bg-[#F8F9FB]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 md:gap-32 items-center">
          <div className="order-1 flex flex-col items-start">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-6">
              <SlidersHorizontal size={14} className="text-indigo-600" />
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest">{t("flex_badge")}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.1]">{t("flex_title")}</h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 font-medium">
              {t("flex_text")}
            </p>
            <Link href="/signup" className="inline-flex items-center gap-3 font-bold text-indigo-600 text-lg hover:text-indigo-700 transition group">
              {t("flex_cta")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          
          <div className="order-2 relative">
            <div className="aspect-[9/16] rounded-[32px] overflow-hidden shadow-2xl relative max-w-md mx-auto md:max-w-none">
              <img src="/images/airport.png" alt="Ajustement de prime" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[85%] rounded-[24px] bg-white/95 backdrop-blur-xl p-6 shadow-xl border border-white/20">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t("flex_card_label")}</span>
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <span className="text-4xl font-black text-slate-900 tracking-tighter">500 <span className="text-base text-slate-500 tracking-normal">CHF</span></span>
                    <span className="text-xs font-bold text-emerald-500">{t("flex_card_saving")}</span>
                  </div>
                  <div className="relative h-3 w-full bg-slate-100 rounded-full">
                    <div className="absolute left-0 top-0 h-full w-[70%] bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]"></div>
                    <div className="absolute left-[70%] top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-white border-2 border-indigo-600 rounded-full shadow-lg cursor-pointer"></div>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>{t("flex_card_min")}</span>
                    <span>{t("flex_card_max")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER COPIÉ À L'IDENTIQUE DE TA PAGE PRINCIPALE */}
      <footer className="bg-white border-t border-slate-100 py-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <img src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" alt="CreditX Logo" className="h-8 w-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">{t("footer_tagline")}</p>

            {/* Télécharger l'app : desktop → modale QR ; mobile → lien direct App Store */}
            <div className="mt-5">
              <div className="hidden lg:block"><DownloadAppButton variant="badge" badgeHeight={40} /></div>
              <div className="lg:hidden"><AppStoreBadge height={40} /></div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm font-medium text-slate-500">
            <Link href="/careers" className="hover:text-slate-900 transition">{t("footer_careers")}</Link>
            <Link href="/contact" className="hover:text-slate-900 transition">{t("footer_contact")}</Link>
            <Link href="/legal/cgu" className="hover:text-slate-900 transition">{t("footer_cgu")}</Link>
            <Link href="/legal/confidentialite" className="hover:text-slate-900 transition">{t("footer_privacy")}</Link>
            <CookieManageButton className="hover:text-slate-900 transition" />
            
            <div className="hidden md:block w-px h-4 bg-slate-200"></div>

            <div className="flex items-center bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}