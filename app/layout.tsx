// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/page-transition";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MoneyLife.ch — 3e pilier 3a",
  description: "Scanne LPP, configure ton 3a et compare les offres partenaires.",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}

