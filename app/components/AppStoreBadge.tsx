"use client";

import { useLocale } from "next-intl";
import { APP_STORE_URL } from "@/lib/appStore";

// Ligne du haut du badge officiel, localisée. « App Store » reste non traduit.
const TOP: Record<string, string> = {
  fr: "Télécharger dans l'",
  de: "Laden im",
  it: "Scarica su",
  en: "Download on the",
};

/**
 * Badge Apple officiel « Télécharger dans l'App Store » (recréé en SVG inline,
 * localisé). Cliquable → fiche App Store CreditX.
 */
export default function AppStoreBadge({ className = "", height = 56 }: { className?: string; height?: number }) {
  const locale = useLocale();
  const top = TOP[locale] ?? TOP.fr;
  const width = height * 3;

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="App Store"
      className={`inline-block transition-transform hover:scale-[1.03] ${className}`}
      style={{ height }}
    >
      <svg width={width} height={height} viewBox="0 0 180 60" role="img" aria-hidden="true">
        <rect x="0.5" y="0.5" width="179" height="59" rx="12" fill="#000" stroke="#A6A6A6" strokeWidth="1" />
        {/* Logo Apple */}
        <path
          transform="translate(20, 15) scale(0.055)"
          fill="#fff"
          d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C61.4 141.9 8.4 175 8.4 250.6c0 22.9 4.2 46.5 12.5 70.8 11.1 32.6 51.2 112.6 93 111.3 21.8-.5 37.2-15.5 65.6-15.5 27.5 0 41.7 15.5 66.1 15.5 42.2-.6 78.5-73.4 89-106.1-56.6-26.7-53.6-78.2-53.6-79.9zM261.1 96.4c27.8-33 25.3-63 24.5-73.8-24.6 1.4-53.1 16.8-69.3 35.7-17.9 20.3-28.4 45.4-26.1 71.9 26.6 2 50.9-11.7 70.9-33.8z"
        />
        <text x="52" y="24" fill="#fff" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="11" fontWeight="400">
          {top}
        </text>
        <text x="52" y="45" fill="#fff" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="22" fontWeight="600">
          App Store
        </text>
      </svg>
    </a>
  );
}
