"use client";

import React, { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import SpinCardLoader from "../../../../components/SpinCardLoader";

// Même shape que dans ProfilUnifiedForm
type LppAiResult = {
  dateCertificat?: string | null;
  prenom?: string | null;
  nom?: string | null;
  dateNaissance?: string | null;
  salaireDeterminant?: number | null;
  deductionCoordination?: number | null;
  salaireAssureEpargne?: number | null;
  salaireAssureRisque?: number | null;
  avoirVieillesse?: number | null;
  avoirVieillesseSelonLpp?: number | null;
  renteInvaliditeAnnuelle?: number | null;
  renteEnfantInvaliditeAnnuelle?: number | null;
  renteConjointAnnuelle?: number | null;
  renteOrphelinAnnuelle?: number | null;
  capitalDeces?: number | null;
  capitalRetraite65?: number | null;
  renteRetraite65Annuelle?: number | null;
  rachatPossible?: number | null;
  eplDisponible?: number | null;
  miseEnGage?: boolean | null;
  proofs?: Record<string, { snippet: string }>;
  issues?: string[];
  confidence?: number | null;
};

type FormType = MinimalForm & {
  Enter_dateCertificatLPP?: string;
  Enter_typeSalaireAssure?: "general" | "split";
  Enter_salaireAnnuel?: number;
  Enter_salaireAssureLPP?: number;
  Enter_salaireAssureLPPRisque?: number;
  Enter_salaireAssureLPPEpargne?: number;
  Enter_rentevieillesseLPP65?: number;
  Enter_renteInvaliditeLPP?: number;
  Enter_renteEnfantInvaliditeLPP?: number;
  Enter_renteOrphelinLPP?: number;
  Enter_renteConjointLPP?: number;
  Enter_avoirVieillesseObligatoire?: number;
  Enter_avoirVieillesseTotal?: number;
  Enter_prestationCapital65?: number;
  Enter_rachatPossible?: number;
  Enter_eplPossibleMax?: number;
  Enter_miseEnGage?: boolean;
  DecesCapitaux?: {
    amount: number;
    plusRente: "oui" | "non" | "np";
    condition: "accident" | "maladie" | "les_deux" | "np";
  }[];
  Enter_lppScanMode?: "manual" | "scan";
};

function normalizeDateMask(s: string) {
  const d = (s || "").replace(/\D+/g, "");
  const dd = d.slice(0, 2),
    mm = d.slice(2, 4),
    yyyy = d.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
}

/**
 * Applique le résultat d'OCR LPP dans le form du wizard
 */
function applyLppAiToForm(form: UseFormReturn<FormType>, ai: LppAiResult) {
  const { setValue, getValues } = form;

  if (ai.dateCertificat) {
    setValue(
      "Enter_dateCertificatLPP",
      normalizeDateMask(ai.dateCertificat),
      { shouldDirty: true, shouldValidate: true }
    );
  }

  if (typeof ai.salaireDeterminant === "number") {
    setValue("Enter_salaireAnnuel", ai.salaireDeterminant, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const hasRisque = typeof ai.salaireAssureRisque === "number";
  const hasEpargne = typeof ai.salaireAssureEpargne === "number";

  if (hasRisque || hasEpargne) {
    if (hasRisque && hasEpargne && ai.salaireAssureRisque !== ai.salaireAssureEpargne) {
      setValue("Enter_typeSalaireAssure", "split", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(
        "Enter_salaireAssureLPPRisque",
        ai.salaireAssureRisque ?? undefined,
        { shouldDirty: true, shouldValidate: true }
      );
      setValue(
        "Enter_salaireAssureLPPEpargne",
        ai.salaireAssureEpargne ?? undefined,
        { shouldDirty: true, shouldValidate: true }
      );
    } else {
      setValue("Enter_typeSalaireAssure", "general", {
        shouldDirty: true,
        shouldValidate: true,
      });
      const val =
        ai.salaireAssureEpargne ?? ai.salaireAssureRisque ?? undefined;
      setValue("Enter_salaireAssureLPP", val, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  if (typeof ai.renteInvaliditeAnnuelle === "number") {
    setValue("Enter_renteInvaliditeLPP", ai.renteInvaliditeAnnuelle, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.renteEnfantInvaliditeAnnuelle === "number") {
    setValue(
      "Enter_renteEnfantInvaliditeLPP",
      ai.renteEnfantInvaliditeAnnuelle,
      { shouldDirty: true, shouldValidate: true }
    );
  }
  if (typeof ai.renteOrphelinAnnuelle === "number") {
    setValue("Enter_renteOrphelinLPP", ai.renteOrphelinAnnuelle, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.renteConjointAnnuelle === "number") {
    setValue("Enter_renteConjointLPP", ai.renteConjointAnnuelle, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  if (typeof ai.renteRetraite65Annuelle === "number") {
    setValue("Enter_rentevieillesseLPP65", ai.renteRetraite65Annuelle, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.capitalRetraite65 === "number") {
    setValue("Enter_prestationCapital65", ai.capitalRetraite65, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  if (typeof ai.avoirVieillesse === "number") {
    setValue("Enter_avoirVieillesseTotal", ai.avoirVieillesse, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.avoirVieillesseSelonLpp === "number") {
    setValue(
      "Enter_avoirVieillesseObligatoire",
      ai.avoirVieillesseSelonLpp,
      { shouldDirty: true, shouldValidate: true }
    );
  }

  if (typeof ai.rachatPossible === "number") {
    setValue("Enter_rachatPossible", ai.rachatPossible, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.eplDisponible === "number") {
    setValue("Enter_eplPossibleMax", ai.eplDisponible, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (typeof ai.miseEnGage === "boolean") {
    setValue("Enter_miseEnGage", ai.miseEnGage, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  if (typeof ai.capitalDeces === "number" && ai.capitalDeces > 0) {
    const existing =
      (getValues("DecesCapitaux") as FormType["DecesCapitaux"]) ?? [];
    const next = [
      ...existing,
      { amount: ai.capitalDeces, plusRente: "np", condition: "np" },
    ];
    setValue("DecesCapitaux", next as any, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
}

type ScanState = "idle" | "scanning" | "success" | "error";

export default function ScanLPPSection({
  form,
  onNext,
  onGlobalLoading,
}: {
  form: UseFormReturn<FormType>;
  onNext?: () => void;
  onGlobalLoading?: (v: boolean) => void;
}) {
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanPct, setScanPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualChosen, setManualChosen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isScanning = scanState === "scanning";

  const handleClickScan = () => {
    setManualChosen(false);
    form.setValue("Enter_lppScanMode" as any, "scan", {
      shouldDirty: true,
      shouldValidate: false,
    });
    fileInputRef.current?.click();
  };

  const handleChooseManual = () => {
    setManualChosen(true);
    setScanState("idle");
    setErrorMsg(null);
    setScanPct(0);

    // On enregistre le choix dans le form
    form.setValue("Enter_lppScanMode" as any, "manual", {
      shouldDirty: true,
      shouldValidate: false,
    });

    // 👉 On passe tout de suite à l'étape suivante si le wizard fournit onNext
    if (onNext) {
      onNext();
    }
  };

  async function handleScanFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const u = auth.currentUser;
    if (!u) {
      setErrorMsg(
        "Vous devez être connecté pour scanner votre certificat."
      );
      setScanState("error");
      return;
    }

    try {
      setScanState("scanning");
      onGlobalLoading?.(true);
      setManualChosen(false);
      setErrorMsg(null);
      setScanPct(10);

      const f = files[0];
      const isPdf =
        /\.pdf$/i.test(f.name) || f.type === "application/pdf";
      const ext = isPdf
        ? "pdf"
        : (f.type.split("/")[1] || "jpg").toLowerCase();

      const fileId = crypto.randomUUID();
      const storagePath = `clients/${u.uid}/lpp_raw/${fileId}.${ext}`;

      await uploadBytes(ref(storage, storagePath), f);
      setScanPct(40);

      const jwt = await u.getIdToken(true);
      const res = await fetch(`/api/lpp/parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ filePath: storagePath }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `Parse fail ${res.status} ${res.statusText} — ${txt}`
        );
      }

      const { docId } = await res.json();
      setScanPct(70);

      const snap = await getDoc(
        doc(db, "clients", u.uid, "lpp_parsed", docId)
      );
      if (!snap.exists()) {
        throw new Error("Document parsé introuvable");
      }

      const parsed = snap.data() as LppAiResult;
      setScanPct(85);

      applyLppAiToForm(form, parsed);

      setScanPct(100);
      setScanState("success");
      form.setValue("Enter_lppScanMode" as any, "scan", {
        shouldDirty: true,
        shouldValidate: false,
      });
        } catch (e) {
      console.error("Scan error:", e);
      setScanState("error");
      setErrorMsg(
        "Il y a eu un problème avec votre scan. Vérifiez qu’il s’agit bien d’un certificat LPP et que le document est lisible, puis réessayez."
      );
    } finally {
      onGlobalLoading?.(false);
      setTimeout(() => setScanPct(0), 600);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4 relative">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Vous pouvez soit{" "}
          <span className="font-medium">saisir manuellement</span> les
          informations de votre certificat LPP, soit{" "}
          <span className="font-medium">scanner votre certificat</span> et
          nous remplirons automatiquement les étapes LPP pour vous.
        </p>
      </div>

      {/* Input de fichier caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleScanFiles(e.target.files)}
      />

      {/* État "scan en cours" */}
      {scanState === "scanning" && (
        <div className="rounded-xl border px-3 py-2 text-xs flex items-center justify-between bg-muted/60">
          <span>Analyse du certificat en cours…</span>
          <span className="tabular-nums">
            {scanPct > 0 ? `${Math.round(scanPct)}%` : ""}
          </span>
        </div>
      )}

      {/* Succès du scan */}
      {scanState === "success" && (
        <div className="rounded-xl border border-emerald-400/60 bg-emerald-50/80 px-3 py-3 text-xs text-emerald-900">
          <p className="font-medium">
            Votre scan est terminé ✅
          </p>
          <p className="mt-1">
            Les sections LPP suivantes ont été pré-remplies. Veuillez vérifier
            et corriger si nécessaire, puis cliquez sur{" "}
            <span className="font-semibold">Suivant</span> pour continuer.
          </p>
        </div>
      )}

      {/* Erreur de scan */}
      {scanState === "error" && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-900">
          <p className="font-medium">Problème lors du scan</p>
          <p className="mt-1">
            {errorMsg ??
              "Vérifiez qu’il s’agit bien d’un certificat LPP et que la qualité du document est suffisante, puis réessayez."}
          </p>
        </div>
      )}

      {/* Boutons d'action */}
      <div className="space-y-3">
        {/* Bouton scan (change de label après succès) */}
        <Button
          type="button"
          variant="secondary"
          onClick={handleClickScan}
          disabled={isScanning}
          className="w-full rounded-xl"
        >
          {scanState === "success"
            ? "Scanner à nouveau mon certificat"
            : isScanning
            ? "Analyse…"
            : "Scanner mon certificat LPP"}
        </Button>

        {/* Bouton saisir manuellement (caché si scan réussi) */}
        {scanState !== "success" && (
          <Button
            type="button"
            variant={manualChosen ? "default" : "ghost"}
            className="w-full rounded-xl"
            onClick={handleChooseManual}
            disabled={isScanning}
          >
            Saisir les informations manuellement
          </Button>
        )}

        {/* Feedback visuel quand le mode manuel est choisi */}
        {manualChosen && scanState !== "success" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Vous avez choisi de{" "}
            <span className="font-semibold">saisir les informations manuellement</span>.
            Continuez avec le bouton <span className="font-semibold">Suivant</span> pour passer aux
            étapes LPP.
          </p>
        )}

        {!manualChosen && scanState === "idle" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Vous pourrez toujours revenir en arrière ou relancer un scan plus tard si nécessaire.
          </p>
        )}
      </div>

          </div>
  );
}