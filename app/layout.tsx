// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/page-transition";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MoneyLife.ch — 3e pilier 3a",
  description: "Scanne LPP, configure ton 3a et compare les offres partenaires.",
};

export const viewport = { themeColor: '#0b1d33' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <PageTransition>{children}</PageTransition>
        <Toaster position="top-center" richColors />

      </body>
    </html>
  );
}

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context":"https://schema.org",
      "@type":"FinancialService",
      "name":"MoneyLife",
      "url":"https://www.moneylife.ch",
      "description":"Analyse LPP & 3e pilier avec IA : scannez, analysez vos couvertures et recevez des offres.",
      "areaServed":"CH",
      "brand":"MoneyLife",
      "offers":{"@type":"Offer","availability":"https://schema.org/InStock"}
    })
  }}
/>


