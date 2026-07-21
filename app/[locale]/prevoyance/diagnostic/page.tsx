// app/[locale]/prevoyance/diagnostic/page.tsx

import DiagnosticTunnel from "app/components/DiagnosticTunnel";
import { getTranslations } from "next-intl/server";

export default async function DiagnosticPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // On chargera les traductions plus tard si besoin
  // const t = await getTranslations({ locale, namespace: "Diagnostic" });

  return (
    <main className="min-h-screen bg-black overflow-hidden flex flex-col font-sans">
      <DiagnosticTunnel />
    </main>
  );
}