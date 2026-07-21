// app/components/CookieBanner.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

type CookiePrefs = {
  necessary: true; // always true
  analytics: boolean;
  marketing: boolean;
  updatedAt: number; // Date.now()
};

const STORAGE_KEY = "ml_cookie_prefs_v1";
const OPEN_EVENT = "ml:open_cookie_prefs";
const PREFS_EVENT = "ml:cookie_prefs";

function readPrefs(): CookiePrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookiePrefs;
    if (!parsed || parsed.necessary !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePrefs(p: CookiePrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  // Event pour que d'autres parties de l'app puissent réagir (analytics loader, etc.)
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: p }));
}

/** Utilitaire: lecture des prefs côté client */
export function getCookiePrefsClient(): CookiePrefs | null {
  if (typeof window === "undefined") return null;
  return readPrefs();
}

/** Utilitaire: ouvrir les préférences depuis n’importe où (footer, settings, etc.) */
export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export default function CookieBanner() {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("CookieBanner");

  const [ready, setReady] = React.useState(false);
  const [openPrefs, setOpenPrefs] = React.useState(false);
  const [showBanner, setShowBanner] = React.useState(false);

  const [analytics, setAnalytics] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);

  React.useEffect(() => {
    // au 1er load, si pas de choix enregistré => on affiche la bannière
    const existing = readPrefs();
    if (!existing) {
      setShowBanner(true);
    } else {
      setAnalytics(!!existing.analytics);
      setMarketing(!!existing.marketing);
    }
    setReady(true);
  }, []);

  // ✅ écoute l’event global pour ouvrir le panneau (footer "Gérer les cookies")
  React.useEffect(() => {
    const onOpen = () => setOpenPrefs(true);
    window.addEventListener(OPEN_EVENT, onOpen as any);
    return () => window.removeEventListener(OPEN_EVENT, onOpen as any);
  }, []);

  if (!ready) return null;

  const acceptAll = () => {
    writePrefs({
      necessary: true,
      analytics: true,
      marketing: true,
      updatedAt: Date.now(),
    });
    setShowBanner(false);
    setOpenPrefs(false);
  };

  const refuseAll = () => {
    writePrefs({
      necessary: true,
      analytics: false,
      marketing: false,
      updatedAt: Date.now(),
    });
    setShowBanner(false);
    setOpenPrefs(false);
  };

  const savePrefs = () => {
    writePrefs({
      necessary: true,
      analytics,
      marketing,
      updatedAt: Date.now(),
    });
    setShowBanner(false);
    setOpenPrefs(false);
  };

  return (
    <>
      {/* Banner */}
      {showBanner ? (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
          <div className="mx-auto w-full max-w-3xl rounded-3xl border bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t("title")}</div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {t("desc")}{" "}
                  <Link
                    href="/legal/cookies"
                    className="text-[#0030A8] underline underline-offset-4"
                  >
                    {t("read_more")}
                  </Link>
                  .
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="rounded-2xl bg-[#0030A8] hover:bg-[#002786]"
                    onClick={acceptAll}
                  >
                    {t("accept_all")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={refuseAll}
                  >
                    {t("refuse_all")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setOpenPrefs(true)}
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    {t("manage")}
                  </Button>
                </div>
              </div>

              <button
                type="button"
                className="rounded-xl p-2 hover:bg-gray-50"
                aria-label={t("close")}
                onClick={() => setShowBanner(false)}
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Preferences dialog */}
      <Dialog open={openPrefs} onOpenChange={setOpenPrefs}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{t("prefs_title")}</DialogTitle>
            <DialogDescription>
              {t("prefs_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid gap-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
              <div>
                <div className="text-sm font-semibold">{t("cat_necessary")}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {t("cat_necessary_desc")}
                </div>
              </div>
              <Switch checked={true} disabled />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
              <div>
                <div className="text-sm font-semibold">{t("cat_analytics")}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {t("cat_analytics_desc")}
                </div>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
              <div>
                <div className="text-sm font-semibold">{t("cat_marketing")}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {t("cat_marketing_desc")}
                </div>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl" onClick={refuseAll}>
                {t("refuse_all")}
              </Button>
              <Button
                className="rounded-2xl bg-[#0030A8] hover:bg-[#002786]"
                onClick={savePrefs}
              >
                {t("save")}
              </Button>
            </div>

            <div className="text-[12px] text-gray-500">
              <Link
                href="/legal/cookies"
                className="text-[#0030A8] underline underline-offset-4"
              >
                {t("cookie_policy")}
              </Link>{" "}
              •{" "}
              <button
                type="button"
                className="text-[#0030A8] underline underline-offset-4"
                onClick={acceptAll}
              >
                {t("accept_all")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}