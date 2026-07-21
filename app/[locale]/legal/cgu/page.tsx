// app/[locale]/legal/cgu/page.tsx
import LegalLayout from "../_components/LegalLayout";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

// 👈 NOUVEAU : Les métadonnées deviennent dynamiques avec getTranslations
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "CguPage" });

  return {
    title: t("title_metadata"),
    description: t("description_metadata"),
  };
}

export default function CguPage() {
  // 👈 NOUVEAU : Récupération des traductions pour le contenu de la page
  const t = useTranslations("CguPage");

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
            {t.rich("section1_p", {
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section2_title")}</h2>
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-sm">
            <p className="font-bold text-slate-900 mb-2">CreditX Sàrl</p>
            <p>{t("section2_address")}</p>
            <p className="mb-2">{t("section2_ide")}</p>
            <p>Email : <a href="mailto:info@creditx.ch" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">info@creditx.ch</a></p>
          </div>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section3_title")}</h2>
          <p>
            {t.rich("section3_p", {
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section4_title")}</h2>
          <p>{t("section4_p")}</p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section5_title")}</h2>
          <p>{t("section5_p")}</p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section6_title")}</h2>
          <ul className="space-y-3 list-none pl-0">
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span>
              <span>{t("section6_li1")}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span>
              <span>{t("section6_li2")}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></span>
              <span>{t("section6_li3")}</span>
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section7_title")}</h2>
          <p>{t("section7_p")}</p>
        </section>

        {/* Section 8 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section8_title")}</h2>
          <p>{t("section8_p")}</p>
        </section>

        {/* Section 9 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section9_title")}</h2>
          <p>{t("section9_p")}</p>
        </section>

        {/* Section 10 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section10_title")}</h2>
          <p>{t("section10_p")}</p>
        </section>

        {/* Section 11 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section11_title")}</h2>
          <p>{t("section11_p")}</p>
        </section>

        {/* Section 12 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section12_title")}</h2>
          <p>{t("section12_p")}</p>
        </section>

        {/* Section 13 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section13_title")}</h2>
          <p>{t("section13_p")}</p>
        </section>

        {/* Section 14 */}
        <section>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">{t("section14_title")}</h2>
          <p>
            {t.rich("section14_p", {
              link: (chunks) => <Link href="/contact" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">{chunks}</Link>,
              email: (chunks) => <a href="mailto:info@creditx.ch" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">{chunks}</a>
            })}
          </p>
        </section>

      </div>
    </LegalLayout>
  );
}