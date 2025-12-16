// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/page-transition";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoneyLife.ch — 3e pilier 3a",
  description: "Scanne LPP, configure ton 3a et compare les offres partenaires.",
};

export const viewport = { themeColor: "#0b1d33" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <PageTransition>{children}</PageTransition>

        {/* Toasts */}
        <Toaster position="top-center" richColors />

        {/* JSON-LD SEO */}
        <Script id="ml-jsonld" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FinancialService",
            name: "MoneyLife",
            url: "https://www.moneylife.ch",
            description:
              "Analyse LPP & 3e pilier avec IA : scannez, analysez vos couvertures et recevez des offres.",
            areaServed: "CH",
            brand: "MoneyLife",
            offers: { "@type": "Offer", availability: "https://schema.org/InStock" },
          })}
        </Script>
      </body>
    </html>
  );
}