// app/[locale]/(site)/careers/_components/CareersFooter.tsx
//
// Footer du site public, repris à l'identique pour les pages Carrières
// (logo, liens légaux, sélecteur de langue) + le lien « Carrières » lui-même.

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import CookieManageButton from "app/components/CookieManageButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default async function CareersFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "Careers" });

  return (
    <footer className="bg-white border-t border-slate-100 py-20">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
            alt="CreditX"
            className="h-8 w-auto mb-3"
          />
          <p className="text-sm text-slate-500 font-medium">{t("footer_tagline")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm font-medium text-slate-500">
          <Link href="/careers" className="hover:text-slate-900 transition">{t("footer_careers")}</Link>
          <Link href="/contact" className="hover:text-slate-900 transition">{t("footer_contact")}</Link>
          <Link href="/legal/cgu" className="hover:text-slate-900 transition">{t("footer_cgu")}</Link>
          <Link href="/legal/confidentialite" className="hover:text-slate-900 transition">{t("footer_privacy")}</Link>
          <CookieManageButton className="hover:text-slate-900 transition" />

          <div className="hidden md:block w-px h-4 bg-slate-200" />

          <div className="flex items-center bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
