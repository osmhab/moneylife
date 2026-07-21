// app/[locale]/legal/cookies/page.tsx
import LegalLayout from "../_components/LegalLayout";
import Link from "next/link";
import CookieManageButton from "app/components/CookieManageButton"; // 👈 Alias potentiellement corrigé (ajuste si besoin selon ton dossier)

import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

// 👈 NOUVEAU : Les métadonnées dynamiques
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "CookiesPolicyPage" });

  return {
    title: t("title_metadata"),
    description: t("description_metadata"),
  };
}

export default function CookiesPolicyPage() {
  // 👈 NOUVEAU : Récupération des traductions pour la page
  const t = useTranslations("CookiesPolicyPage");

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
          <p>
            {t("section1_p")}
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6">{t("section2_title")}</h2>

          <div className="space-y-8">
            {/* 2.1 */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span> {t("s2_1_title")}
              </h3>
              <p className="text-sm">
                {t.rich("s2_1_p", {
                  strong: (chunks) => <strong>{chunks}</strong>
                })}
              </p>
            </div>

            {/* 2.2 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> {t("s2_2_title")}
              </h3>
              <p className="text-sm">
                {t.rich("s2_2_p", {
                  strong: (chunks) => <strong>{chunks}</strong>
                })}
              </p>
            </div>

            {/* 2.3 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {t("s2_3_title")}
              </h3>
              <p className="text-sm">
                {t.rich("s2_3_p", {
                  strong: (chunks) => <strong>{chunks}</strong>
                })}
              </p>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section3_title")}</h2>
          <p className="mb-6">
            {t("section3_p")}
          </p>
          <div className="inline-block">
            <CookieManageButton className="rounded-xl bg-slate-900 text-white font-bold px-6 py-3 hover:bg-slate-800 transition-colors shadow-lg" />
          </div>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section4_title")}</h2>
          <p>
            {t("section4_p")}
          </p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section5_title")}</h2>
          <p>
            {t.rich("section5_p", {
              link: (chunks) => <Link href="/contact" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">{chunks}</Link>,
              email: (chunks) => <a href="mailto:info@creditx.ch" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">{chunks}</a>
            })}
          </p>
        </section>

      </div>
    </LegalLayout>
  );
}