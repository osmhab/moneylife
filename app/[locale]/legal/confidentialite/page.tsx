// app/[locale]/legal/confidentialite/page.tsx
import LegalLayout from "../_components/LegalLayout";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

// 👈 NOUVEAU : Les métadonnées deviennent dynamiques avec getTranslations
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "ConfidentialitePage" });

  return {
    title: t("title_metadata"),
    description: t("description_metadata"),
  };
}

export default function ConfidentialitePage() {
  // 👈 NOUVEAU : Récupération des traductions pour le contenu
  const t = useTranslations("ConfidentialitePage");

  return (
    <LegalLayout
      title={t("layout_title")}
      subtitle={t("layout_subtitle")}
    >
      <div className="max-w-3xl mx-auto space-y-12 text-slate-600 leading-relaxed">
        
        {/* Date de mise à jour */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 border border-slate-100 text-sm font-medium text-slate-500">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          {t.rich("last_update", {
            b: (chunks) => <span className="font-bold text-slate-700">{chunks}</span>
          })}
        </div>

        {/* Section 1 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section1_title")}</h2>
          <p className="mb-6">
            {t("section1_desc")}
          </p>
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-sm mb-6">
            <p className="font-bold text-slate-900 mb-2">CreditX Sàrl</p>
            <p>{t("address_line1")}</p>
            <p>{t("address_line2")}</p>
            <p className="mt-2"><strong>{t("ide")}</strong> CHE-203.347.547</p>
            <p><strong>{t("email")}</strong> <a href="mailto:contact@creditx.ch" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">contact@creditx.ch</a></p>
          </div>
          <p>
            {t("section1_p2")}
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6">{t("section2_title")}</h2>

          <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">{t("s2_1_title")}</h3>
          <ul className="space-y-3 list-none pl-0">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_1_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_1_l2")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_1_l3")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_1_l4")}</span></li>
          </ul>

          <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">{t("s2_2_title")}</h3>
          <ul className="space-y-3 list-none pl-0 mb-4">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s2_2_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s2_2_l2")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s2_2_l3")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s2_2_l4")}</span></li>
          </ul>
          <p className="text-sm bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100">
            {t("s2_2_note")}
          </p>

          <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">{t("s2_3_title")}</h3>
          <p className="mb-4">
            {t("s2_3_p")}
          </p>
          <ul className="space-y-3 list-none pl-0">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 shrink-0"></span><span>{t("s2_3_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 shrink-0"></span>
              <span>
                {t.rich("s2_3_l2", {
                  strong: (chunks) => <strong className="text-slate-900">{chunks}</strong>
                })}
              </span>
            </li>
          </ul>

          <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">{t("s2_4_title")}</h3>
          <ul className="space-y-3 list-none pl-0 mb-4">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_4_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_4_l2")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span><span>{t("s2_4_l3")}</span></li>
          </ul>
          <p className="text-sm bg-slate-100 text-slate-700 p-4 rounded-xl">
            {t.rich("s2_4_note", {
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </p>

          <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">{t("s2_5_title")}</h3>
          <ul className="space-y-3 list-none pl-0 mb-4">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span><span>{t("s2_5_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span><span>{t("s2_5_l2")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span><span>{t("s2_5_l3")}</span></li>
          </ul>
          <p>
            {t("s2_5_note")}
          </p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section3_title")}</h2>
          <ul className="space-y-3 list-none pl-0">
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s3_l1")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s3_l2")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s3_l3")}</span></li>
            <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></span><span>{t("s3_l4")}</span></li>
          </ul>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6">{t("section4_title")}</h2>
          
          <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{t("s4_1_title")}</h3>
          <p className="mb-6">
            {t("s4_1_p")}
          </p>

          <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{t("s4_2_title")}</h3>
          <p className="mb-6">
            {t("s4_2_p")}
          </p>

          <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{t("s4_3_title")}</h3>
          <p className="mb-6">
            {t("s4_3_p")}
          </p>

          <div className="p-5 mt-6 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-4">
            <span className="text-emerald-500 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <p className="text-emerald-900 font-medium">
              {t.rich("s4_guarantee", {
                strong: (chunks) => <strong>{chunks}</strong>
              })}
            </p>
          </div>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section5_title")}</h2>
          <p>
            {t("section5_p")}
          </p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section6_title")}</h2>
          <ul className="space-y-4 list-none pl-0">
            <li className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold text-slate-700">{t("s6_k1")}</span>
              <span className="text-sm text-slate-500 text-right">{t("s6_v1")}</span>
            </li>
            <li className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold text-slate-700">{t("s6_k2")}</span>
              <span className="text-sm text-rose-500 font-bold text-right">{t("s6_v2")}</span>
            </li>
            <li className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-bold text-slate-700">{t("s6_k3")}</span>
              <span className="text-sm text-blue-500 font-bold text-right">{t("s6_v3")}</span>
            </li>
            <li className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 gap-2">
              <span className="font-bold text-slate-700">{t("s6_k4")}</span>
              <span className="text-sm text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full text-center sm:text-right">{t("s6_v4")}</span>
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section7_title")}</h2>
          <p className="mb-4">
            {t("section7_p1")}
          </p>
          <p>
            {t("section7_p2")} <a href="mailto:info@creditx.ch" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">info@creditx.ch</a>
          </p>
        </section>

        {/* Section 8 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section8_title")}</h2>
          <p>
            {t("section8_p")}
          </p>
        </section>

      </div>
    </LegalLayout>
  );
}