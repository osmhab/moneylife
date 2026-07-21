//app/[locale]/legal/_components/LegalLayout.tsx
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

// 👈 NOUVEAU : Import de useTranslations
import { useTranslations } from "next-intl";

export default function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("LegalLayout");

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("back_to_site")}
          </Link>

          <div className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-[#4fd1c5]" />
            {t("legal")}
          </div>
        </div>

        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-gray-600 md:text-base">{subtitle}</p>
          ) : null}
        </header>

        <div className="prose prose-gray max-w-none prose-h2:mt-8 prose-h2:text-xl prose-h2:font-semibold prose-h3:text-base prose-h3:font-semibold prose-a:text-[#0030A8]">
          {children}
        </div>

        <footer className="mt-10 border-t pt-6 text-xs text-gray-500">
          <div>© {new Date().getFullYear()} CreditX Sàrl</div>
        </footer>
      </div>
    </div>
  );
}