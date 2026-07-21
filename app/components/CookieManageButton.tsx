// app/components/CookieManageButton.tsx
"use client";

import { openCookiePreferences } from "app/components/CookieBanner";
import { useTranslations } from "next-intl";

export default function CookieManageButton({
  className = "text-xs text-[#0030A8] underline underline-offset-4",
  label,
}: {
  className?: string;
  label?: string;
}) {
  const t = useTranslations("CookieManageButton");

  return (
    <button type="button" onClick={() => openCookiePreferences()} className={className}>
      {label || t("label")}
    </button>
  );
}