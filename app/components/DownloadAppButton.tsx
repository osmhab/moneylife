"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AppStoreBadge from "./AppStoreBadge";

/**
 * Bouton « Télécharger l'app » (desktop) → modale façon Revolut :
 * un QR code à scanner (renvoie vers la fiche App Store) + le badge Apple
 * officiel en repli direct. Tous les textes viennent du namespace `Download`
 * (fr/de/en/it) ; le QR est un asset STATIQUE (URL App Store fixe), donc aucun
 * appel réseau ni dépendance runtime.
 */
export default function DownloadAppButton({ dark = false }: { dark?: boolean }) {
  const t = useTranslations("Download");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={[
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors",
            dark
              ? "text-white/90 hover:text-white group-hover:text-slate-700 group-hover:hover:text-slate-900"
              : "text-slate-700 hover:text-slate-900",
          ].join(" ")}
        >
          <Download className="h-4 w-4" />
          {t("cta")}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md rounded-[28px] p-8 text-center">
        <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </DialogTitle>
        <DialogDescription className="text-slate-500 font-medium">
          {t("subtitle")}
        </DialogDescription>

        {/* QR code (statique) — cadre blanc arrondi */}
        <div className="mx-auto mt-5 mb-4 w-52 h-52 rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/appstore/qr.svg" alt={t("qr_alt")} className="w-full h-full" />
        </div>

        {/* Séparateur « ou téléchargez directement » */}
        <div className="flex items-center gap-3 text-slate-400 text-[11px] font-semibold uppercase tracking-widest">
          <span className="h-px flex-1 bg-slate-200" />
          {t("or")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Badge Apple officiel localisé (fr/de/en/it) */}
        <div className="flex justify-center mt-4">
          <AppStoreBadge height={46} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
