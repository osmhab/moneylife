"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import DownloadAppButton from "@/app-components/DownloadAppButton";

// Import du hook de traduction
import { useTranslations } from "next-intl";

// 👈 NOUVEAU : On ajoute le type pour les sous-liens
type SubLink = {
  href: string;
  label: string;
  desc?: string; // Petite description optionnelle pour le dropdown
};

type NavLink = {
  href: string;
  label: string;
  external?: boolean;
  disabled?: boolean;
  subLinks?: SubLink[]; // 👈 NOUVEAU : Optionnel pour avoir un menu déroulant
};

type Props = {
  Logo?: React.ReactNode;
  links: NavLink[];
  ctaHref?: string;
  ctaLabel?: string;
  variant?: "transparent" | "solid" | "glass";
  border?: boolean;
  className?: string;
  containerClassName?: string;
};

export default function NavBar({
  Logo,
  links,
  ctaHref = "/login",
  ctaLabel,
  variant = "solid",
  border = true,
  className = "",
  containerClassName = "",
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [hash, setHash] = React.useState<string>("");
  const [scrolled, setScrolled] = React.useState(false);

  // Chargement des traductions de la Navbar
  const t = useTranslations("Navbar");
  
  // On utilise la prop ctaLabel si elle est fournie, sinon on prend la traduction par défaut
  const finalCtaLabel = ctaLabel || t("cta");

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setHash(window.location.hash || "");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href.includes("#")) {
      const targetHash = "#" + href.split("#")[1];
      if (pathname === "/") return hash === targetHash;
      return false;
    }
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const isGlass = variant === "glass";
  const appliedVariant = (isGlass && scrolled) ? "solid" : variant;

  const base =
    appliedVariant === "solid"
      ? ["bg-white/95 backdrop-blur-md", border ? "border-b border-slate-200" : "border-transparent"].join(" ")
      : appliedVariant === "glass"
      ? [
          "bg-white/5 border-b border-white/10 backdrop-blur-md",
          "transition-all duration-300",
          "hover:bg-white hover:border-slate-200 shadow-sm", 
        ].join(" ")
      : "bg-transparent";

  const isDarkBar = appliedVariant === "glass";

  return (
    <header className={["relative group z-50 transition-colors duration-300", base, className].join(" ")}>
      <div
        className={[
          "mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-6 sm:px-8",
          containerClassName,
        ].join(" ")}
      >
        {/* LEFT — Logo + liens desktop */}
        <div className="flex items-center gap-10">
          <Link href="/" className="inline-flex items-center gap-2" aria-label={t("sr_home")}>
            {Logo ?? (
              <img
                src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
                alt="CreditX"
                className={[
                  "h-8 md:h-10 w-auto transition-all duration-300",
                  isDarkBar ? "invert brightness-0 group-hover:invert-0 group-hover:brightness-100" : ""
                ].join(" ")}
              />
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-8" aria-label={t("sr_nav_main")}>
            {links.map((l) => {
              const active = isActive(l.href);
              
              if (l.disabled) {
                return (
                  <div
                    key={l.href + l.label}
                    className={[
                      "flex items-center gap-2 text-[15px] font-semibold cursor-default transition-colors",
                      isDarkBar ? "text-white/40 group-hover:text-slate-400" : "text-slate-400"
                    ].join(" ")}
                  >
                    {l.label}
                    <span className={["px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest", isDarkBar ? "bg-white/10 text-white/50 group-hover:bg-slate-100 group-hover:text-slate-500" : "bg-slate-100 text-slate-500"].join(" ")}>
                      {t("soon")}
                    </span>
                  </div>
                );
              }

              // 👈 NOUVEAU : Si le lien a un sous-menu (dropdown)
              if (l.subLinks) {
                return (
                  <div key={l.href + l.label} className="relative group/dropdown py-4">
                    <div
                      className={[
                        "flex items-center gap-1 text-[15px] font-semibold cursor-pointer transition-colors",
                        isDarkBar 
                          ? "text-white/90 hover:text-white group-hover:text-slate-600 group-hover:hover:text-slate-900" 
                          : active ? "text-slate-900" : "text-slate-600 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {l.label}
                      <ChevronDown className="h-4 w-4 transition-transform group-hover/dropdown:rotate-180" />
                    </div>

                    {/* La bulle du dropdown */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 translate-y-2 pointer-events-none group-hover/dropdown:opacity-100 group-hover/dropdown:translate-y-0 group-hover/dropdown:pointer-events-auto transition-all duration-200 z-50">
                      <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100 p-2 w-[260px] flex flex-col gap-1 relative overflow-hidden">
                        {l.subLinks.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className="flex flex-col px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors group/sublink"
                          >
                            <span className="text-sm font-bold text-slate-900 group-hover/sublink:text-indigo-600 transition-colors">{sub.label}</span>
                            {sub.desc && <span className="text-[11px] font-medium text-slate-500 mt-0.5 leading-snug">{sub.desc}</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              // Rendu classique si pas de sous-menu
              return (
                <Link
                  key={l.href + l.label}
                  href={l.href}
                  target={l.external ? "_blank" : undefined}
                  rel={l.external ? "noopener noreferrer" : undefined}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group/link relative text-[15px] font-semibold transition-colors",
                    isDarkBar 
                      ? "text-white/90 hover:text-white group-hover:text-slate-600 group-hover:hover:text-slate-900" 
                      : active ? "text-slate-900" : "text-slate-600 hover:text-slate-900",
                  ].join(" ")}
                >
                  {l.label}
                  <span
                    className={[
                      "pointer-events-none absolute left-1/2 top-[calc(100%+6px)] h-[2px] w-0 -translate-x-1/2 rounded-full transition-all duration-300",
                      isDarkBar ? "bg-white group-hover:bg-slate-900" : "bg-slate-900",
                      active ? "w-full" : "group-hover/link:w-full",
                    ].join(" ")}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        {/* RIGHT — CTA + Burger */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          <div className={["hidden sm:flex items-center transition-colors", isDarkBar ? "text-white/90 group-hover:text-slate-600" : "text-slate-600"].join(" ")}>
            <LanguageSwitcher />
          </div>

          {/* Télécharger l'app — ouvre une modale QR (façon Revolut), localisée (fr/de/en/it).
              Desktop uniquement (sur mobile, la Smart App Banner iOS s'en charge). */}
          <div className="hidden lg:flex items-center">
            <DownloadAppButton dark={isDarkBar} />
          </div>

          <Link
            href={ctaHref}
            className={[
              "hidden sm:inline-flex items-center justify-center gap-2",
              "rounded-full px-6 py-2.5 text-[14px] font-bold transition-all hover:scale-105 active:scale-95 shadow-lg",
              isDarkBar 
                ? "bg-white text-slate-900 group-hover:bg-slate-900 group-hover:text-white" 
                : "bg-slate-900 text-white"
            ].join(" ")}
          >
            {finalCtaLabel}
          </Link>

          {/* Menu mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={["md:hidden", isDarkBar ? "text-white group-hover:text-slate-900" : "text-slate-900"].join(" ")}
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">{t("sr_open_menu")}</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[88vw] sm:w-[380px] p-0 bg-white border-l-0 flex flex-col">
              <SheetHeader className="px-6 pb-0 pt-6 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>

                  <Link href="/" onClick={() => setOpen(false)} aria-label={t("sr_home")}>
                    <img
                      src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
                      alt="CreditX"
                      className="h-8 w-auto"
                    />
                  </Link>

                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-900">
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </SheetHeader>

              <div className="mt-8 border-t border-slate-100 flex-shrink-0" />

              <nav className="flex-1 overflow-y-auto flex flex-col gap-2 px-4 py-6" aria-label={t("sr_nav_mobile")}>
                {links.map((l) => {
                  const active = isActive(l.href);
                  
                  if (l.disabled) {
                    return (
                      <div
                        key={"m-" + l.href + l.label}
                        className="flex items-center justify-between rounded-2xl px-4 py-3 text-[16px] font-semibold text-slate-400 cursor-default"
                      >
                        {l.label}
                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                          {t("soon")}
                        </span>
                      </div>
                    );
                  }

                  // 👈 NOUVEAU : Si sous-menu, on l'affiche en accordéon / décalé sur mobile
                  if (l.subLinks) {
                    return (
                      <div key={"m-" + l.href + l.label} className="flex flex-col mb-2">
                        <div className="px-4 py-2 text-[13px] font-bold uppercase tracking-widest text-slate-400">
                          {l.label}
                        </div>
                        <div className="flex flex-col gap-1 pl-2">
                          {l.subLinks.map((sub) => (
                            <Link
                              key={"m-sub-" + sub.href}
                              href={sub.href}
                              onClick={() => setOpen(false)}
                              className="rounded-xl px-4 py-3 text-[16px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={"m-" + l.href + l.label}
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      onClick={() => setOpen(false)}
                      className={[
                        "rounded-2xl px-4 py-3 text-[16px] font-semibold transition-colors",
                        active
                          ? "bg-slate-50 text-blue-600"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-col gap-4">
                 <Link
                    href={ctaHref}
                    onClick={() => setOpen(false)}
                    className="
                      flex w-full items-center justify-center gap-2
                      rounded-full bg-slate-900 px-6 py-3.5
                      text-white text-[15px] font-bold
                      shadow-xl transition-all hover:bg-slate-800 active:scale-95
                    "
                  >
                    {finalCtaLabel}
                  </Link>
                 <div className="flex w-full justify-center py-3 bg-white rounded-full shadow-sm border border-slate-200">
                   <LanguageSwitcher />
                 </div>
              </div>

            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}