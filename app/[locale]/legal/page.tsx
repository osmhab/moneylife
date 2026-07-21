// app/[locale]/legal/page.tsx
import Link from "next/link";
import { FileText, Shield, ArrowRight, Cookie } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

// 👈 NOUVEAU : Les métadonnées deviennent dynamiques avec getTranslations
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "LegalIndexPage" });

  return {
    title: t("title_metadata"),
    description: t("description_metadata"),
  };
}

export default function LegalIndexPage() {
  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("LegalIndexPage");

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-24">
        
        <div className="mb-12 md:mb-16">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 mb-6">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{t("badge_transparency")}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4 leading-tight">
            {t("title")}
          </h1>
          <p className="text-lg text-slate-600 font-medium max-w-2xl">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          {/* Carte 1 : Confidentialité */}
          <Link
            href="/legal/confidentialite"
            className="group relative flex flex-col justify-between rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
          >
            <div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {t("card_privacy_title")}
              </h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">
                {t("card_privacy_desc")}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm font-bold text-blue-600">
              {t("btn_consult")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Carte 2 : CGU */}
          <Link
            href="/legal/cgu"
            className="group relative flex flex-col justify-between rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
          >
            <div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner">
                <FileText className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {t("card_tos_title")}
              </h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">
                {t("card_tos_desc")}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm font-bold text-emerald-600">
              {t("btn_consult")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Carte 3 : Cookies */}
          <Link
            href="/legal/cookies"
            className="group relative flex flex-col justify-between rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl md:col-span-2 lg:col-span-1"
          >
            <div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 shadow-inner">
                <Cookie className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {t("card_cookies_title")}
              </h2>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">
                {t("card_cookies_desc")}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm font-bold text-slate-700">
              {t("btn_consult")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

        </div>

        {/* Bloc Contact */}
        <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-[32px] border border-slate-100 bg-slate-50 p-8 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">{t("contact_title")}</h3>
            <p className="mt-2 text-sm font-medium text-slate-600 leading-relaxed">
              {t.rich("contact_desc", {
                br: () => <br />
              })}
            </p>
          </div>
          <a 
            href="mailto:contact@creditx.ch" 
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg"
          >
            contact@creditx.ch
          </a>
        </div>

      </div>
    </div>
  );
}