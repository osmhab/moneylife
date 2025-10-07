"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type NavLink = {
  href: string;
  label: string;
  external?: boolean;
};

type Props = {
  /** Ton logo en React node (ex: <img src="/logoMoneyLife.svg" className="h-6 w-auto" />) */
  Logo?: React.ReactNode;
  /** Liens de navigation (centre) */
  links: NavLink[];
  /** Lien et libellé du CTA (droite) */
  ctaHref?: string;
  ctaLabel?: string;
  /**
   * Apparence de la barre :
   * - "solid": fond blanc + (option) bordure basse
   * - "glass": verre (bg blanc translucide + backdrop-blur) ; au hover → fond blanc
   * - "transparent": aucun fond/bordure
   */
  variant?: "transparent" | "solid" | "glass";
  /** Afficher une bordure basse (utile surtout pour "solid" / "glass") */
  border?: boolean;
  /** Classes supplémentaires */
  className?: string;
  containerClassName?: string;
};

export default function NavBar({
  Logo,
  links,
  ctaHref = "/scan",
  ctaLabel = "Scannez votre certificat LPP",
  variant = "solid",
  border = true,
  className = "",
  containerClassName = "",
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const base =
    variant === "solid"
      ? [
          "bg-white",
          border ? "border-b border-slate-200/70" : "border-transparent",
        ].join(" ")
      : variant === "glass"
      ? [
          // couche verre translucide
          "bg-white/30",
          border ? "border-b border-white/40" : "border-transparent",
          // blur compatible (feature query)
          "supports-[backdrop-filter]:bg-white/30",
          "supports-[backdrop-filter]:backdrop-blur-md",
          // transitions & état hover → blanc “plein”, sans blur
          "transition-all duration-300",
          "hover:bg-white hover:backdrop-blur-0 hover:border-slate-200/70",
        ].join(" ")
      : "bg-transparent";

  return (
    <header className={["relative", base, className].join(" ")}>
      <div
        className={[
          "mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6",
          containerClassName,
        ].join(" ")}
      >
        {/* LEFT — Logo */}
        <div className="flex items-center">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="Accueil">
            {Logo ?? <span className="text-lg font-black text-[#0030A8]">MoneyLife</span>}
          </Link>
        </div>

        {/* CENTER — Liens desktop */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href + l.label}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener noreferrer" : undefined}
                aria-current={active ? "page" : undefined}
                className={[
                  "group relative rounded-full px-3 py-2 text-sm transition-colors",
                  active ? "text-slate-900" : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {l.label}
                {/* soulignement animé */}
                <span
                  className={[
                    "pointer-events-none absolute left-1/2 top-[calc(100%-2px)] h-[2px] w-0 -translate-x-1/2 rounded-full bg-slate-900 transition-all duration-300",
                    active ? "w-6" : "group-hover:w-6",
                  ].join(" ")}
                />
              </Link>
            );
          })}
        </nav>

        {/* RIGHT — CTA + Burger */}
        <div className="flex items-center gap-2">
          {/* CTA desktop */}
          <Link
            href={ctaHref}
            className="
              hidden sm:inline-flex items-center justify-center gap-2
              rounded-full bg-[#11243E] px-4 py-2.5
              text-white text-sm font-semibold
              shadow-[0_10px_22px_rgba(17,36,62,0.20)]
              transition-colors hover:bg-[#1B3766]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#11243E] focus-visible:ring-offset-2
            "
          >
            {ctaLabel}
            <ChevronRight className="h-4 w-4 opacity-90" aria-hidden="true" />
          </Link>

          {/* Menu mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Ouvrir le menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] sm:w-[380px] p-0">
              <SheetHeader className="px-5 pb-0 pt-4">
                <div className="flex items-center justify-between">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2"
                    aria-label="Accueil"
                  >
                    {Logo ?? <span className="text-base font-black text-[#0030A8]">MoneyLife</span>}
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                    <X className="h-5 w-5" />
                    <span className="sr-only">Fermer</span>
                  </Button>
                </div>
              </SheetHeader>

              <div className="mt-4 border-t border-slate-200/70" />

              <nav className="flex flex-col gap-1 px-5 py-4" aria-label="Navigation mobile">
                {links.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <Link
                      key={"m-" + l.href + l.label}
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "rounded-xl px-3 py-3 text-[15px] transition",
                        active
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {l.label}
                    </Link>
                  );
                })}

                <Link
                  href={ctaHref}
                  onClick={() => setOpen(false)}
                  className="
                    mt-2 inline-flex items-center justify-center gap-2
                    rounded-full bg-[#11243E] px-4 py-3
                    text-white text-[15px] font-semibold
                    shadow-[0_10px_22px_rgba(17,36,62,0.20)]
                    transition-colors hover:bg-[#1B3766]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#11243E] focus-visible:ring-offset-2
                  "
                >
                  {ctaLabel}
                  <ChevronRight className="h-4 w-4 opacity-90" aria-hidden="true" />
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
