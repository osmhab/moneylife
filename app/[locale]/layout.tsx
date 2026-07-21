// app/[locale]/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "app/globals.css";
import PageTransition from "@/components/page-transition";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";

import CookieBanner from "app/components/CookieBanner";

import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inter = Inter({ 
  variable: "--font-inter", 
  subsets: ["latin"],
  display: 'swap', 
});

export const metadata: Metadata = {
  title: "CreditX",
  description: "La prévoyance intelligente",
};

export const viewport = { themeColor: "#0b1d33" };

export default async function RootLayout({ 
  children,
  params
}: { 
  children: React.ReactNode;
  params: Promise<{ locale: string }>; 
}) {
  const GA_ID = process.env.NEXT_PUBLIC_GA4_ID;

  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-18078257413"
          strategy="afterInteractive"
        />
        
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'AW-18078257413');
            
            ${GA_ID ? `gtag('config', '${GA_ID}', { anonymize_ip: true });` : ''}
          `}
        </Script>

        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '1932389227417348');
            fbq('track', 'PageView');
          `}
        </Script>

        {/* 👇 NOUVEAU : Initialisation de Microsoft Clarity */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "wcz8wpovpp"); 
          `}
        </Script>
      </head>

      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        <NextIntlClientProvider messages={messages}>
          <PageTransition>{children}</PageTransition>

          <CookieBanner />
          <Toaster position="top-center" richColors />

          <Script id="ml-jsonld" type="application/ld+json" strategy="afterInteractive">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FinancialService",
              name: "CreditX",
              url: "https://www.creditx.ch",
              description:
                "Analyse LPP & 3e pilier avec IA : scannez, analysez vos couvertures et recevez des offres.",
              areaServed: "CH",
              brand: "CreditX",
              offers: { "@type": "Offer", availability: "https://schema.org/InStock" },
            })}
          </Script>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}