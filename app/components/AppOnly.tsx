"use client";

import { useTranslations } from "next-intl";
import { Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import AppStoreBadge from "./AppStoreBadge";

export type AppOnlyFeature = "scan" | "optimise" | "vault";

// Contenu partagé : icône + titre + phrase selon la feature + badge App Store.
function Body({ feature }: { feature: AppOnlyFeature }) {
  const t = useTranslations("AppOnly");
  return (
    <div className="flex flex-col items-center text-center px-6 py-8">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-white">
        <Smartphone className="h-8 w-8" />
      </div>
      <DialogTitle className="text-xl font-bold text-foreground">{t("title")}</DialogTitle>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t(feature)}</p>
      <p className="mt-1 max-w-sm text-sm font-medium text-foreground/70">{t("hint")}</p>
      <div className="mt-6">
        <AppStoreBadge height={54} />
      </div>
    </div>
  );
}

/** Modale « disponible sur l'app » — pour intercepter le clic sur un bouton. */
export function AppOnlyModal({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  feature: AppOnlyFeature;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <Body feature={feature} />
      </DialogContent>
    </Dialog>
  );
}

/** Écran plein « disponible sur l'app » — pour remplacer une page entière. */
export function AppOnlyScreen({ feature }: { feature: AppOnlyFeature }) {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border bg-card shadow-sm">
        <Body feature={feature} />
      </div>
    </div>
  );
}
