// app/[locale]/(site)/careers/[slug]/page.tsx
//
// Détail d'une offre d'emploi + tunnel de candidature.
// Le chrome est traduit (namespace `Careers`) ; le contenu de l'annonce est servi
// tel quel depuis app/lib/core/jobs.ts, dans la langue de travail du poste.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, MapPin, Building2, Clock, Check, Languages, Lock } from "lucide-react";
import { JOBS, getJob } from "@/lib/core/jobs";
import CareersFooter from "../_components/CareersFooter";
import ApplyFlow from "./_client/ApplyFlow";

export const viewport = { themeColor: "#ffffff" };

export function generateStaticParams() {
  return JOBS.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const job = getJob(slug);
  if (!job) return { title: "CreditX" };
  return {
    title: `${job.title} — ${job.location} | CreditX`,
    description: job.summary,
    robots: { index: true, follow: true },
  };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const job = getJob(slug);
  if (!job) notFound();

  const t = await getTranslations({ locale, namespace: "Careers" });

  // Balisage JobPosting : les agrégateurs (Google Jobs, jobup…) le lisent directement.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.summary,
    datePosted: job.publishedAt,
    employmentType: "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: "CreditX",
      sameAs: "https://creditx.ch",
    },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Sion", addressRegion: "VS", addressCountry: "CH" },
    },
  };

  return (
    <main className="relative bg-white text-slate-900 antialiased font-sans selection:bg-blue-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="relative pt-40 pb-16 md:pt-48 md:pb-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.35),transparent_60%)]" />
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <Link
            href="/careers"
            className="flex w-fit items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition mb-8"
          >
            <ArrowLeft size={16} />
            {t("back_to_openings")}
          </Link>

          <span className="block text-[11px] font-black uppercase tracking-widest text-blue-400">{job.department}</span>

          <h1 className="mt-3 text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.02] max-w-4xl">
            {job.title}
          </h1>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <HeroPill icon={MapPin}>{job.location}</HeroPill>
            <HeroPill icon={Clock}>{job.workload}</HeroPill>
            <HeroPill icon={Building2}>{job.workMode}</HeroPill>
          </div>

          <a
            href="#apply"
            className="mt-10 inline-flex items-center gap-3 h-14 px-8 rounded-2xl bg-white text-slate-900 font-bold text-[15px] hover:bg-slate-100 transition-all shadow-xl"
          >
            {t("apply_cta")}
          </a>
        </div>
      </section>

      {/* CONTENU */}
      <section className="relative py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-14 lg:gap-20 items-start">
          {/* Colonne principale */}
          <div>
            {/* Avertissement de langue quand l'annonce n'est pas dans la langue de l'interface */}
            {locale !== job.contentLocale && (
              <div className="mb-10 flex items-start gap-4 p-5 rounded-[20px] bg-amber-50 border border-amber-100">
                <Languages size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[15px] text-amber-900 font-medium leading-relaxed">
                  {t("language_notice")}
                </p>
              </div>
            )}

            <p className="text-xl md:text-2xl text-slate-700 font-medium leading-relaxed">{job.intro}</p>

            <div className="mt-14 space-y-14">
              {job.sections.map((section) => (
                <div key={section.title}>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-7">
                    {section.title}
                  </h2>

                  {section.lead && (
                    <p className="mb-6 text-[17px] text-slate-700 font-medium leading-relaxed">{section.lead}</p>
                  )}

                  <ul className="space-y-4">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-4">
                        <span className="mt-1 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Check size={14} strokeWidth={3} />
                        </span>
                        <span className="text-[17px] text-slate-700 font-medium leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne latérale collante */}
          <aside className="lg:sticky lg:top-28">
            <div className="p-7 rounded-[28px] bg-white border border-slate-200 shadow-lg">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{t("aside_title")}</h3>

              <dl className="mt-6 space-y-4 text-[15px]">
                <Row label={t("aside_location")} value={job.location} />
                <Row label={t("aside_workload")} value={job.workload} />
                <Row label={t("aside_mode")} value={job.workMode} />
                <Row label={t("aside_compensation")} value={job.compensation} />
                <Row label={t("aside_department")} value={job.department} />
              </dl>

              <a
                href="#apply"
                className="mt-7 flex items-center justify-center h-14 w-full rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all shadow-lg"
              >
                {t("apply_cta")}
              </a>
            </div>
          </aside>
        </div>
      </section>

      {/* TUNNEL DE CANDIDATURE */}
      <section id="apply" className="relative py-20 md:py-28 bg-[#F8F9FB] scroll-mt-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">{t("apply_title")}</h2>

            {job.closing.paragraphs.map((p) => (
              <p key={p} className="mt-5 text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
                {p}
              </p>
            ))}

            <p className="mt-7 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white border border-slate-200 text-sm font-bold text-slate-700 shadow-sm">
              <Lock size={15} className="text-slate-400" />
              {job.closing.note}
            </p>
          </div>

          <ApplyFlow job={job} />
        </div>
      </section>

      <CareersFooter locale={locale} />
    </main>
  );
}

function HeroPill({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-bold">
      <Icon size={14} />
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <dt className="text-slate-500 font-medium shrink-0">{label}</dt>
      <dd className="text-slate-900 font-bold text-right">{value}</dd>
    </div>
  );
}
