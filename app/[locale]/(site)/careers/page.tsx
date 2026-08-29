// app/[locale]/(site)/careers/page.tsx
//
// Page « Carrières » publique : hero éditorial + liste des postes ouverts.
// Le chrome est traduit (namespace `Careers`), le CONTENU des annonces reste
// rédigé dans la langue de travail du poste (cf. app/lib/core/jobs.ts).

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, MapPin, Building2, Clock, Cpu, Scale, LineChart, Mail } from "lucide-react";
import { JOBS } from "@/lib/core/jobs";
import CareersFooter from "./_components/CareersFooter";

export const viewport = { themeColor: "#ffffff" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Careers" });
  return {
    title: t("meta_title"),
    description: t("meta_desc"),
    robots: { index: true, follow: true },
  };
}

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Careers" });

  const values = [
    { icon: LineChart, title: t("value_1_title"), desc: t("value_1_desc") },
    { icon: Scale, title: t("value_2_title"), desc: t("value_2_desc") },
    { icon: Cpu, title: t("value_3_title"), desc: t("value_3_desc") },
  ];

  return (
    <main className="relative bg-white text-slate-900 antialiased font-sans selection:bg-blue-100">
      {/* HERO */}
      <section className="relative min-h-[88vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: "url('/images/creditx-careers.jpg')" }}
        />
        {/* Deux voiles : un assombrissement global (lisibilité du titre) + un
            fondu vers le blanc en bas, qui raccorde le hero à la section suivante. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-white" />
        {/* Renfort à gauche, sous le titre : la photo y est claire (mur, tableau). */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />

        {/* pt-40 : le contenu ne doit jamais passer sous la navbar translucide,
            même quand il devient plus haut que le min-h de la section. */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-40 pb-20 md:pb-28">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 mb-8">
            <span className="text-xs font-bold text-white uppercase tracking-widest">{t("badge")}</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.02] max-w-4xl drop-shadow-sm">
            {t.rich("hero_title", { br: () => <br /> })}
          </h1>

          <p className="mt-8 text-lg md:text-xl text-white/90 font-medium leading-relaxed max-w-2xl">
            {t("hero_subtitle")}
          </p>

          <a
            href="#openings"
            className="mt-10 inline-flex items-center gap-3 h-14 px-8 rounded-2xl bg-white text-slate-900 font-bold text-[15px] hover:bg-slate-100 transition-all shadow-xl"
          >
            {t("hero_cta")}
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* VALEURS */}
      <section className="relative py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
              {t("values_title")}
            </h2>
            <p className="text-lg text-slate-600 font-medium leading-relaxed">{t("values_subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v) => (
              <div
                key={v.title}
                className="p-8 rounded-[28px] bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-6">
                  <v.icon size={24} />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight mb-3">{v.title}</h3>
                <p className="text-[15px] text-slate-600 font-medium leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POSTES OUVERTS */}
      <section id="openings" className="relative py-24 md:py-32 bg-[#F8F9FB] scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
                {t("openings_title")}
              </h2>
              <p className="mt-4 text-lg text-slate-600 font-medium">
                {t("openings_count", { count: JOBS.length })}
              </p>
            </div>
          </div>

          <div className="rounded-[32px] bg-white border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {JOBS.map((job) => (
              <Link
                key={job.slug}
                href={`/careers/${job.slug}`}
                className="group flex flex-col md:flex-row md:items-center gap-5 md:gap-8 p-7 md:p-9 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-black uppercase tracking-widest text-blue-600">
                    {job.department}
                  </span>
                  <h3 className="mt-2 text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                    {job.title}
                  </h3>
                  <p className="mt-3 text-[15px] text-slate-600 font-medium leading-relaxed max-w-2xl">
                    {job.summary}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <Pill icon={MapPin}>{job.location}</Pill>
                    <Pill icon={Clock}>{job.workload}</Pill>
                    <Pill icon={Building2}>{job.workMode}</Pill>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3 text-slate-900 font-bold text-[15px]">
                  <span className="md:hidden lg:inline">{t("openings_view")}</span>
                  <span className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                    <ArrowRight size={20} />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* CANDIDATURE SPONTANÉE */}
          <div className="mt-8 p-8 md:p-10 rounded-[32px] bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">{t("spontaneous_title")}</h3>
              <p className="mt-2 text-[15px] text-slate-600 font-medium max-w-xl">{t("spontaneous_desc")}</p>
            </div>
            <Link
              href="/contact"
              className="shrink-0 inline-flex items-center gap-2 h-14 px-7 rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all shadow-lg"
            >
              <Mail size={18} />
              {t("spontaneous_cta")}
            </Link>
          </div>
        </div>
      </section>

      <CareersFooter locale={locale} />
    </main>
  );
}

function Pill({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
      <Icon size={13} />
      {children}
    </span>
  );
}
