"use client";

import { useLocale } from "next-intl";
import { APP_STORE_URL } from "@/lib/appStore";

// Badges officiels Apple déposés dans public/appstore/{locale}.svg.
const AVAILABLE = new Set(["fr", "de", "en", "it"]);

/**
 * Badge officiel « Télécharger dans l'App Store » (SVG Apple), localisé.
 * Cliquable → fiche App Store CreditX. Repli sur EN si la langue est absente.
 */
export default function AppStoreBadge({ className = "", height = 54 }: { className?: string; height?: number }) {
  const locale = useLocale();
  const lang = AVAILABLE.has(locale) ? locale : "en";

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="App Store"
      className={`inline-block transition-transform hover:scale-[1.03] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/appstore/${lang}.svg`} alt="Télécharger dans l'App Store" style={{ height, width: "auto" }} />
    </a>
  );
}
