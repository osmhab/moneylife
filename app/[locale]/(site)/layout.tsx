// app/[locale]/(site)/layout.tsx
import NavBar from "@/components/NavBar";
import { DM_Serif_Text, Inter } from "next/font/google";
import { getTranslations } from "next-intl/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSerif = DM_Serif_Text({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-dmserif",
  display: "swap",
});

export default async function SiteLayout({ 
  children,
  params
}: { 
  children: React.ReactNode,
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Navbar" });

  return (
    <div className={`${inter.variable} ${dmSerif.variable} font-sans`}>
      
      <div className="absolute top-0 left-0 w-full z-50">
        <NavBar
          Logo={
            <img
              src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
              alt="CreditX"
              className="h-8 md:h-10 w-auto invert brightness-0 transition-all duration-300 group-hover:invert-0 group-hover:brightness-100"
            />
          }
          links={[
            { 
              label: t("link_prevoyance"), 
              href: "#", // Agit comme déclencheur du menu déroulant
              subLinks: [
                { href: "/", label: t("sub_overview_label"), desc: t("sub_overview_desc") },
                { href: "/prevoyance/3e-pilier", label: t("sub_3a_label"), desc: t("sub_3a_desc") }
              ]
            },
            { label: t("link_hypo"), href: "/hypotheque", disabled: true },
            { label: t("link_credit"), href: "/private-credit", disabled: true },
          ]}
          ctaHref="/login"
          ctaLabel={t("cta")}
          variant="glass"
          border={false}
        />
      </div>

      {children}
    </div>
  );
}