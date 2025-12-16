"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  limit,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { auth, db, storage } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ArrowLeft, CheckCircle2, Copy, ExternalLink } from "lucide-react";

/* =======================
   Types
======================= */

type AttachmentCategory =
  | "offre"
  | "conditions_generales"
  | "signature"
  | "autres"
  | string;

type ClientAttachment = {
  id: string;
  name: string;
  storagePath: string;
  mimeType?: string | null;
  category?: AttachmentCategory;
};

type ClientCoverage = {
  label: string;
  sumInsured: number | null;
  premium: number | null;
  waitingPeriodMonths?: number | null;
};

type ClientSurrenderValue = {
  dateLabel: string;
  pess: number | null;
  mid: number | null;
  opt: number | null;
  guaranteed: number | null;
};

type ClientOffer = {
  id: string;
  insurer: string;
  contractForm: "3a" | "3b" | "";
  offerNumber?: string | null;
  startDateLabel?: string | null;
  endDateLabel?: string | null;
  premiumAnnual: number | null;
  premiumMonthly: number | null;

  coverages: ClientCoverage[];
  surrenderValues: ClientSurrenderValue[];
  surrenderValuesEpl?: ClientSurrenderValue[] | null;

  projectedModerateAmount: number | null;
  projectedModerateRatePct: number | null;

  attachments: ClientAttachment[];

  // SwissLife specific (extern signing)
  signingDocsUrl?: string | null;
  signingDocsPin?: string | null;

  // Health
  healthQuestionnaireRequired?: boolean | null;
  healthQuestionnaireUrl?: string | null;
  healthQuestionnaireTan?: string | null;
};

type OfferRequestDoc = {
  clientUid: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    sex?: string;
    birthdate?: string;
    nationality?: string;
    profession?: string;
    street?: string;
    zip?: string;
    city?: string;
    email?: string;
    etatCivilLabel?: string | null;
  } | null;

  adminOffers?: any[];
  adminOffersStatus?: "saved" | "sent";
  premiumFrequency?: "monthly" | "annual" | "yearly" | null;
};

/* =======================
   Helpers
======================= */

function civilityFromSex(sex?: string | null) {
  const s = (sex || "").toLowerCase();
  if (s.startsWith("f")) return "Madame";
  if (s.startsWith("m")) return "Monsieur";
  return "Monsieur";
}

function money(v: number | null, suffix = "CHF") {
  if (v == null) return "—";
  return `${v.toLocaleString("fr-CH")} ${suffix}`;
}

function paymentFrequencyLabel(freq?: string | null) {
  if (freq === "monthly") return "mensuelle";
  if (freq === "annual" || freq === "yearly") return "annuelle";
  return "annuelle";
}

function normalizeInsurer(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, "");
}

function isValidAvs(v: string) {
  const t = (v || "").trim();
  // format toléré: 756.0742.4410.72 (on autorise aussi sans points)
  const digits = t.replace(/\D/g, "");
  if (!digits.startsWith("756")) return false;
  // 13 chiffres si on enlève les points (756 + 10)
  if (digits.length !== 13) return false;
  return true;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copié ✅");
  } catch {
    toast.error("Impossible de copier.");
  }
}

/* =======================
   Steps
======================= */

const STEPS = [
  { id: "confirm_personal", title: "Confirmation des données personnelles" },
  { id: "technical_values", title: "Valeurs techniques" },
  { id: "payment", title: "Mode de paiement" },
  { id: "ubo", title: "Ayant droit économique" },
  { id: "general_conditions", title: "Conditions générales" },
  { id: "swisslife_sign", title: "Confirmation & signature SwissLife" }, // signature externe
  { id: "creditx_mandate", title: "Mandat de gestion CreditX" },
  { id: "id_docs", title: "Carte d’identité" }, // uniquement si 3b
  { id: "signature", title: "Signature manuscrite" }, // MoneyLife (mandat)
  { id: "health", title: "Questionnaire de santé" },
  { id: "done", title: "Merci" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/* =======================
   Component
======================= */

export default function SwissLife3aWizard({
  requestId,
  offerId,
}: {
  requestId: string;
  offerId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [requestDoc, setRequestDoc] = useState<OfferRequestDoc | null>(null);
  const [offer, setOffer] = useState<ClientOffer | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  // Step validations
  const [ackPersonal, setAckPersonal] = useState(false);
  const [ackTech, setAckTech] = useState(false);
  const [ackConditionsAccess, setAckConditionsAccess] = useState(false);

  // SwissLife external signing step
  const [swisslifeSigned, setSwisslifeSigned] = useState(false);
  const [swisslifeSigningOpened, setSwisslifeSigningOpened] = useState(false);

  // AVS
  const [avsNumber, setAvsNumber] = useState("");

  // Step 9 (id docs) – only for 3b
  const [idFront, setIdFront] = useState<{ url: string; path: string } | null>(null);
  const [idBack, setIdBack] = useState<{ url: string; path: string } | null>(null);
  const [uploadingIdSide, setUploadingIdSide] = useState<"front" | "back" | null>(null);

  // Step signature (MoneyLife) – only mandate
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signatureLocked, setSignatureLocked] = useState(false);

  // Mandat signed URL
  const [creditxMandateUrl, setCreditxMandateUrl] = useState<string | null>(null);

  // Health
  const [healthClicked, setHealthClicked] = useState(false);

  const progress = useMemo(() => {
    const pct = ((stepIndex + 1) / STEPS.length) * 100;
    return Math.max(2, Math.min(100, Math.round(pct)));
  }, [stepIndex]);

  const contact = requestDoc?.contact ?? null;
  const civility = civilityFromSex(contact?.sex ?? null);

  const contractForm = offer?.contractForm ?? "3a";
  const requiresIdDocs = contractForm === "3b"; // ✅ règle SwissLife
  const requiresHealth = offer?.healthQuestionnaireRequired === true;

  function shouldSkipStep(stepId: StepId) {
    if (stepId === "id_docs") return !requiresIdDocs;
    if (stepId === "health") return !requiresHealth;
    return false;
  }

  function nextIndex(from: number, dir: 1 | -1) {
    let i = from;
    while (true) {
      i = i + dir;
      if (i < 0) return 0;
      if (i >= STEPS.length) return STEPS.length - 1;
      const id = STEPS[i].id;
      if (!shouldSkipStep(id)) return i;
    }
  }

  function canGoNext() {
    if (!step) return false;

    if (step.id === "confirm_personal") {
      return ackPersonal && isValidAvs(avsNumber);
    }
    if (step.id === "technical_values") return ackTech;
    if (step.id === "general_conditions") return ackConditionsAccess;

    if (step.id === "swisslife_sign") {
      // user doit revenir et confirmer qu'il a signé
      return swisslifeSigned;
    }

    if (step.id === "id_docs") return !!idFront?.url && !!idBack?.url;

    // Signature MoneyLife : on exige mandat généré (pas les docs AXA)
    if (step.id === "signature") return !!signatureUrl && !!creditxMandateUrl;

    if (step.id === "health") return healthClicked || !requiresHealth;

    return true;
  }

  /* =======================
     Load + session reload
  ======================= */

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push(`/login?from=/dashboard/offres/swisslife/${requestId}/${offerId}`);
        return;
      }

      try {
        const reqRef = doc(db, "offers_requests_3e", requestId);
        const snap = await getDoc(reqRef);

        if (!snap.exists()) {
          toast.error("Demande introuvable.");
          router.push("/dashboard/offres");
          return;
        }

        const d = snap.data() as any;

        const docTyped: OfferRequestDoc = {
          clientUid: d.clientUid ?? "",
          contact: d.contact ?? null,
          adminOffers: Array.isArray(d.adminOffers) ? d.adminOffers : [],
          adminOffersStatus: d.adminOffersStatus,
          premiumFrequency: d.premiumFrequency ?? null,
        };

        if (docTyped.clientUid !== u.uid) {
          toast.error("Accès refusé à cette demande.");
          router.push("/dashboard/offres");
          return;
        }

        // find offer (same fallback strategy as AXA)
        let found = (docTyped.adminOffers ?? []).find((o: any) => (o?.id ?? "") === offerId);
        if (!found) {
          const m = String(offerId).match(new RegExp(`^offer_(\\d+)_${requestId}$`));
          const idx = m ? Number(m[1]) : null;
          if (idx != null && Number.isFinite(idx) && (docTyped.adminOffers ?? [])[idx]) {
            found = (docTyped.adminOffers ?? [])[idx];
          }
        }

        if (!found) {
          toast.error("Offre introuvable dans cette demande.");
          router.push("/dashboard/offres");
          return;
        }

        const normalizedOffer: ClientOffer = {
          id: found.id ?? offerId,
          insurer: found.insurer ?? "",
          contractForm: found.contractForm ?? "",
          offerNumber: found.offerNumber ?? null,
          startDateLabel: found.startDateLabel ?? null,
          endDateLabel: found.endDateLabel ?? null,
          premiumAnnual: typeof found.premiumAnnual === "number" ? found.premiumAnnual : null,
          premiumMonthly: typeof found.premiumMonthly === "number" ? found.premiumMonthly : null,
          coverages: Array.isArray(found.coverages) ? found.coverages : [],
          surrenderValues: Array.isArray(found.surrenderValues) ? found.surrenderValues : [],
          surrenderValuesEpl: Array.isArray(found.surrenderValuesEpl) ? found.surrenderValuesEpl : null,
          projectedModerateAmount:
            typeof found.projectedModerateAmount === "number" ? found.projectedModerateAmount : null,
          projectedModerateRatePct:
            typeof found.projectedModerateRatePct === "number" ? found.projectedModerateRatePct : null,
          attachments: Array.isArray(found.attachments) ? found.attachments : [],
          signingDocsUrl: typeof found.signingDocsUrl === "string" ? found.signingDocsUrl : null,
          signingDocsPin: typeof found.signingDocsPin === "string" ? found.signingDocsPin : null,
          healthQuestionnaireRequired:
            typeof found.healthQuestionnaireRequired === "boolean" ? found.healthQuestionnaireRequired : null,
          healthQuestionnaireUrl:
            typeof found.healthQuestionnaireUrl === "string" ? found.healthQuestionnaireUrl : null,
          healthQuestionnaireTan: (() => {
            const raw =
                found.healthQuestionnaireTan ??
                found.healthQuestionnaireTAN ??
                found.healthQuestionnairePin ??
                found.healthQuestionnairePIN ??
                null;
            return raw != null ? String(raw).trim() : null;
            })(),
        };

        // allow: "Swiss Life" / "SwissLife"
        const ins = normalizeInsurer(normalizedOffer.insurer);
        if (ins !== "swisslife") {
          toast.error("Ce flow est réservé aux offres SwissLife.");
          router.push("/dashboard/offres");
          return;
        }

        setRequestDoc(docTyped);
        setOffer(normalizedOffer);

        // session doc
        const sessionId = `${requestId}_${offerId}`;
        const sessionDocRef = doc(db, "offers_signing_sessions", sessionId);

        await setDoc(
          sessionDocRef,
          {
            requestId,
            offerId,
            clientUid: u.uid,
            insurer: "SwissLife",
            product: normalizedOffer.contractForm || "3a",
            status: "IN_PROGRESS",
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        // reload existing state (if returning later)
        try {
          const sessionSnap = await getDoc(sessionDocRef);
          if (sessionSnap.exists()) {
            const s = sessionSnap.data() as any;

            // AVS
            const savedAvs = s?.steps?.confirmPersonalData?.avsNumber ?? "";
            if (typeof savedAvs === "string") setAvsNumber(savedAvs);

            // external signing “done”
            const swissOpened = !!s?.steps?.swisslifeSigning?.openedAt;
            const swissDone = !!s?.steps?.swisslifeSigning?.completedAt;

            setSwisslifeSigningOpened(swissOpened);
            setSwisslifeSigned(swissDone);

            // id docs
            const fUrl = s?.steps?.idDocs?.frontUrl ?? null;
            const fPath = s?.steps?.idDocs?.frontPath ?? null;
            const bUrl = s?.steps?.idDocs?.backUrl ?? null;
            const bPath = s?.steps?.idDocs?.backPath ?? null;
            if (fUrl && fPath) setIdFront({ url: fUrl, path: fPath });
            if (bUrl && bPath) setIdBack({ url: bUrl, path: bPath });

            // signature pad
            const sigUrl = s?.steps?.signature?.imageUrl ?? null;
            const sigPath = s?.steps?.signature?.imagePath ?? null;
            setSignaturePath(sigPath);
            setSignatureUrl(sigUrl);

            // ✅ évite l'effet "double" (canvas + overlay)
            const c = canvasRef.current;
            if (c) {
            const ctx = c.getContext("2d");
            if (ctx) {
                const { width, height } = c.getBoundingClientRect();
                ctx.clearRect(0, 0, width, height);
            }
            }
            drawingRef.current = false;
            hasInkRef.current = false;

            // mandate
            const mandateUrl = s?.steps?.creditxMandatePdf?.url ?? null;
            setCreditxMandateUrl(mandateUrl);

            // lock pad if signature + mandate exist
            if (sigUrl && mandateUrl) setSignatureLocked(true);
          }
        } catch (e) {
          console.warn("[SwissLifeWizard] session reload failed", e);
        }

        setLoading(false);
      } catch (e) {
        console.error("[SwissLifeWizard] load error", e);
        toast.error("Erreur lors du chargement du flow SwissLife.");
        router.push("/dashboard/offres");
      }
    });

    return () => unsub();
  }, [router, requestId, offerId]);

  /* =======================
     Canvas setup
  ======================= */

  useEffect(() => {
    if (step?.id !== "signature") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = canvas.getBoundingClientRect();
    const w = Math.floor(width * ratio);
    const h = Math.floor(height * ratio);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0B1021";
      }
    }
  }, [step?.id]);

  /* =======================
     Actions
  ======================= */

  function goPrev() {
    setStepIndex((i) => nextIndex(i, -1));
  }

  async function goNext() {
    if (!canGoNext()) return;

    try {
      const sessionId = `${requestId}_${offerId}`;
      const ref = doc(db, "offers_signing_sessions", sessionId);

      // persist minimal per step
      if (step.id === "confirm_personal") {
        await setDoc(
          ref,
          {
            steps: {
              confirmPersonalData: {
                confirmed: true,
                confirmedAt: serverTimestamp(),
                avsNumber: avsNumber.trim(),
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (step.id === "technical_values") {
        await setDoc(
          ref,
          {
            steps: {
              technicalValues: { ack: true, ackAt: serverTimestamp() },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (step.id === "general_conditions") {
        await setDoc(
          ref,
          {
            steps: {
              generalConditions: { ackDocs: true, ackAt: serverTimestamp() },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (step.id === "swisslife_sign") {
        await setDoc(
          ref,
          {
            steps: {
              swisslifeSigning: {
                completedAt: serverTimestamp(),
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (step.id === "id_docs" && requiresIdDocs) {
        await setDoc(
          ref,
          {
            steps: {
              idDocs: {
                required: true,
                frontUrl: idFront?.url ?? null,
                frontPath: idFront?.path ?? null,
                backUrl: idBack?.url ?? null,
                backPath: idBack?.path ?? null,
                uploadedAt: serverTimestamp(),
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.error("[SwissLifeWizard] goNext persist error", e);
      toast.message("Info", {
        description: "Impossible d'enregistrer l'étape (vous pouvez continuer).",
      });
    }

    setStepIndex((i) => nextIndex(i, 1));
  }

  async function openStorageFile(att: ClientAttachment) {
    try {
      if (!att?.storagePath) throw new Error("storagePath missing");
      const url = await getDownloadURL(storageRef(storage, att.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[SwissLifeWizard] openStorageFile error", e);
      toast.error("Impossible d'ouvrir ce fichier.");
    }
  }

  async function uploadIdFile(side: "front" | "back", file: File) {
    const uid = requestDoc?.clientUid;
    if (!uid) {
      toast.error("Client UID manquant.");
      return;
    }

    try {
      setUploadingIdSide(side);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";

      const path = `clients/${uid}/offers_signing/${requestId}/${offerId}/id_${side}.${ext}`;
      const r = storageRef(storage, path);

      await uploadBytes(r, file, { contentType: file.type || undefined });
      const url = await getDownloadURL(r);

      if (side === "front") setIdFront({ url, path });
      else setIdBack({ url, path });

      toast.success(side === "front" ? "Recto uploadé." : "Verso uploadé.");
    } catch (e) {
      console.error("[SwissLifeWizard] uploadIdFile error", e);
      toast.error("Erreur lors de l’upload de la pièce d’identité.");
    } finally {
      setUploadingIdSide(null);
    }
  }

  function clearSignatureLocalOnly() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const { width, height } = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, width, height);
      }
    }
    hasInkRef.current = false;
    drawingRef.current = false;

    setSignatureUrl(null);
    setSignaturePath(null);
    setCreditxMandateUrl(null);
    setSignatureLocked(false);
  }

  function dataUrlToBlob(dataUrl: string) {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  // Signature MoneyLife -> upload png -> generate mandate -> persist session
  async function confirmSignatureUpload() {
    const canvas = canvasRef.current;
    const uid = requestDoc?.clientUid;

    if (!canvas || !uid) {
      toast.error("Impossible de confirmer la signature.");
      return;
    }
    if (!hasInkRef.current) {
      toast.error("Veuillez apposer une signature avant de confirmer.");
      return;
    }

    try {
      setSignatureUploading(true);

      // 1) upload signature.png
      const dataUrl = canvas.toDataURL("image/png");
      const blob = dataUrlToBlob(dataUrl);

      const sigPath = `clients/${uid}/offers_signing/${requestId}/${offerId}/signature.png`;
      const r = storageRef(storage, sigPath);

      await uploadBytes(r, blob, { contentType: "image/png" });
      const sigUrl = await getDownloadURL(r);

      setSignaturePath(sigPath);
      setSignatureUrl(sigUrl);

      // persist signature in session
      const sessionId = `${requestId}_${offerId}`;
      const ref = doc(db, "offers_signing_sessions", sessionId);

      await setDoc(
        ref,
        {
          steps: {
            signature: {
              imageUrl: sigUrl,
              imagePath: sigPath,
              confirmedAt: serverTimestamp(),
              source: "desktop",
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2) generate mandate signed (server)
      const resMandate = await fetch("/api/signing/creditx/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const jMandate = await resMandate.json().catch(() => null);

      if (!resMandate.ok) {
        console.error("[SwissLife] mandate api error:", jMandate);
        toast.error("Impossible de générer le mandat de gestion signé.");
        return;
      }

      const mandateUrl: string | null = typeof jMandate?.url === "string" ? jMandate.url : null;
      if (!mandateUrl) {
        toast.error("Mandat généré mais URL manquante.");
        return;
      }

      setCreditxMandateUrl(mandateUrl);
      setSignatureLocked(true);

      toast.success("Mandat de gestion signé prêt ✅");
    } catch (e) {
      console.error("[SwissLifeWizard] confirmSignatureUpload error", e);
      toast.error("Erreur lors de l'enregistrement de la signature.");
    } finally {
      setSignatureUploading(false);
    }
  }

  async function handleOpenSwissLifeSigning() {
    try {
      const url = offer?.signingDocsUrl ?? null;
      const pin = offer?.signingDocsPin ?? null;

      if (!url) {
        toast.error("Lien de signature SwissLife manquant.");
        return;
      }

      const sessionId = `${requestId}_${offerId}`;
      const ref = doc(db, "offers_signing_sessions", sessionId);

      await setDoc(
        ref,
        {
          steps: {
            swisslifeSigning: {
              url,
              pin: pin ?? null,
              openedAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      window.open(url, "_blank", "noopener,noreferrer");
      setSwisslifeSigningOpened(true);
    } catch (e) {
      console.error("[SwissLifeWizard] open signing error", e);
      toast.error("Impossible d’ouvrir la signature SwissLife.");
    }
  }

  async function handleOpenHealthQuestionnaire() {
    try {
      const url = offer?.healthQuestionnaireUrl ?? null;
      if (!url) {
        toast.error("Lien du questionnaire de santé manquant.");
        return;
      }

      const sessionId = `${requestId}_${offerId}`;
      const ref = doc(db, "offers_signing_sessions", sessionId);

      await setDoc(
        ref,
        {
          steps: {
            healthQuestionnaire: {
              required: true,
              url,
              tan: offer?.healthQuestionnaireTan ?? null,
              clickedAt: serverTimestamp(),
            },
          },
          status: "WAITING_HEALTH",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      window.open(url, "_blank", "noopener,noreferrer");

      setHealthClicked(true);
      setStepIndex((i) => nextIndex(i, 1));
    } catch (e) {
      console.error("[SwissLifeWizard] handleOpenHealthQuestionnaire error", e);
      toast.error("Impossible d’ouvrir le questionnaire de santé.");
    }
  }

  /* =======================
     Render
  ======================= */

  if (loading || !offer || !requestDoc) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Chargement du flow SwissLife…</div>
      </div>
    );
  }

  const conditionsFiles = (offer.attachments ?? []).filter((a) => a.category === "conditions_generales");

  return (
    <div className="min-h-[calc(100vh-0px)] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => router.push("/dashboard/offres")}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              SwissLife {contractForm || "3a"}
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              Étape {stepIndex + 1}/{STEPS.length}
            </Badge>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <Progress value={progress} />
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Card className="border border-primary/10">
          <CardHeader>
            <CardTitle className="text-base">{step.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Offre {offer.offerNumber ? `n° ${offer.offerNumber}` : ""} • Prime{" "}
              {money(offer.premiumMonthly, "CHF/mois")} • {money(offer.premiumAnnual, "CHF/an")}
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* STEP 1: confirm_personal + AVS */}
            {step.id === "confirm_personal" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Civilité</div>
                      <div className="font-medium">{civility}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Nom</div>
                      <div className="font-medium">
                        {(contact?.firstName ?? "—") + " " + (contact?.lastName ?? "")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Date de naissance</div>
                      <div className="font-medium">{contact?.birthdate ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Nationalité</div>
                      <div className="font-medium">{contact?.nationality ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Profession</div>
                      <div className="font-medium">{contact?.profession ?? "—"}</div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-[11px] text-muted-foreground">Adresse</div>
                      <div className="font-medium">
                        {(contact?.street ?? "—")}, {(contact?.zip ?? "")} {(contact?.city ?? "")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AVS */}
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <Label htmlFor="avs">Numéro AVS (obligatoire)</Label>
                  <Input
                    id="avs"
                    placeholder="756.0742.4410.72"
                    value={avsNumber}
                    onChange={(e) => setAvsNumber(e.target.value)}
                  />
                  {!avsNumber.trim() ? (
                    <p className="text-[11px] text-muted-foreground">Le numéro AVS commence par 756…</p>
                  ) : !isValidAvs(avsNumber) ? (
                    <p className="text-[11px] text-amber-700">
                      Format invalide. Exemple : 756.0742.4410.72
                    </p>
                  ) : (
                    <p className="text-[11px] text-emerald-700">Numéro AVS valide ✅</p>
                  )}
                </div>

                <div className="flex items-start gap-2 rounded-lg border bg-background p-3">
                  <Checkbox
                    checked={ackPersonal}
                    onCheckedChange={(v) => setAckPersonal(v === true)}
                    id="ack-personal"
                  />
                  <label htmlFor="ack-personal" className="text-sm leading-snug">
                    Je confirme que mes données affichées sont correctes
                  </label>
                </div>
              </div>
            )}

            {/* STEP 2: technical_values + EPL table */}
            {step.id === "technical_values" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Numéro d’offre</div>
                      <div className="font-medium">{offer.offerNumber ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Forme</div>
                      <div className="font-medium">{offer.contractForm || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Début</div>
                      <div className="font-medium">{offer.startDateLabel ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Fin</div>
                      <div className="font-medium">{offer.endDateLabel ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Prime annuelle</div>
                      <div className="font-semibold">{money(offer.premiumAnnual, "CHF/an")}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Prime mensuelle</div>
                      <div className="font-semibold">{money(offer.premiumMonthly, "CHF/mois")}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-3">
                  <div className="text-[12px] font-medium">Tableau des valeurs de rachat</div>

                  {(!offer.surrenderValues || offer.surrenderValues.length === 0) ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aucune valeur de rachat trouvée pour cette offre.
                    </p>
                  ) : (
                    <div className="mt-2 overflow-hidden rounded-md border">
                      <div className="grid grid-cols-5 bg-muted/40 px-2 py-2 text-[11px] font-medium text-muted-foreground">
                        <div>Date</div>
                        <div>Pess.</div>
                        <div>Modéré</div>
                        <div>Optim.</div>
                        <div>Garanti</div>
                      </div>

                      {offer.surrenderValues.map((row, rIdx) => (
                        <div
                          key={`${row.dateLabel}_${rIdx}`}
                          className={cn(
                            "grid grid-cols-5 px-2 py-2 text-[12px]",
                            rIdx % 2 === 0 ? "bg-background" : "bg-muted/10"
                          )}
                        >
                          <div className="font-medium">{row.dateLabel || "—"}</div>
                          <div>{money(row.pess, "CHF")}</div>
                          <div className="font-semibold">{money(row.mid, "CHF")}</div>
                          <div>{money(row.opt, "CHF")}</div>
                          <div>{money(row.guaranteed, "CHF")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* EPL table if present */}
                {Array.isArray(offer.surrenderValuesEpl) && offer.surrenderValuesEpl.length > 0 && (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-[12px] font-medium">Tableau des valeurs de rachat EPL</div>
                    <div className="mt-2 overflow-hidden rounded-md border">
                      <div className="grid grid-cols-5 bg-muted/40 px-2 py-2 text-[11px] font-medium text-muted-foreground">
                        <div>Date</div>
                        <div>Pess.</div>
                        <div>Modéré</div>
                        <div>Optim.</div>
                        <div>Garanti</div>
                      </div>

                      {offer.surrenderValuesEpl.map((row, rIdx) => (
                        <div
                          key={`${row.dateLabel}_${rIdx}`}
                          className={cn(
                            "grid grid-cols-5 px-2 py-2 text-[12px]",
                            rIdx % 2 === 0 ? "bg-background" : "bg-muted/10"
                          )}
                        >
                          <div className="font-medium">{row.dateLabel || "—"}</div>
                          <div>{money(row.pess, "CHF")}</div>
                          <div className="font-semibold">{money(row.mid, "CHF")}</div>
                          <div>{money(row.opt, "CHF")}</div>
                          <div>{money(row.guaranteed, "CHF")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg border bg-background p-3">
                  <Checkbox checked={ackTech} onCheckedChange={(v) => setAckTech(v === true)} id="ack-tech" />
                  <label htmlFor="ack-tech" className="text-sm leading-snug">
                    J&apos;ai pris connaissance des valeurs de rachat
                  </label>
                </div>
              </div>
            )}

            {/* STEP 3: payment */}
            {step.id === "payment" && (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="text-[11px] text-muted-foreground">
                    Mode de paiement{" "}
                    <span className="font-medium text-foreground">
                      (Prime {paymentFrequencyLabel(requestDoc?.premiumFrequency)})
                    </span>
                  </div>
                  <div className="mt-2 font-medium">Facture (QR)</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vous recevez un bulletin de versement QR et établissez un ordre permanent manuellement.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 4: ubo */}
            {step.id === "ubo" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-3 text-sm leading-relaxed">
                  <p className="font-medium">
                    Déclaration en vue de l&apos;identification de l&apos;ayant droit économique
                  </p>

                  <p>
                    La personne soussignée confirme, en qualité de preneur d’assurance, que la personne ci-dessous désignée
                    est l’ayant droit économique des valeurs patrimoniales versées aux entreprises:
                  </p>

                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-[11px] text-muted-foreground">Ayant droit économique</div>
                    <div className="font-semibold">
                      {civility} {(contact?.lastName ?? "—")} {(contact?.firstName ?? "")}
                    </div>
                  </div>

                  <div className="rounded-md border bg-amber-50 p-3">
                    <p className="text-[12px] font-semibold text-amber-900">Remarque importante</p>
                    <p className="mt-1 text-[12px] text-amber-900">
                      Est considérée comme &quot;ayant droit économique&quot; pour les contrats d’assurance avec part d’épargne
                      toute personne qui, du point de vue économique, agit en tant que dernier bailleur de fonds pour les primes dues.
                      La déclaration relative à l’ayant droit économique constitue un titre au sens de l’art. 110, al. 4 CP.
                      Le fait d’y indiquer à dessein de fausses informations peut entraîner une sanction (art. 251 CP).
                      Le preneur d’assurance s’engage à communiquer spontanément toute modification.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Cliquez sur <span className="font-medium">Continuer</span> pour valider cette déclaration.
                </p>
              </div>
            )}

            {/* STEP 5: general_conditions */}
            {step.id === "general_conditions" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="ack-conditions-access"
                      checked={ackConditionsAccess}
                      onCheckedChange={(v) => setAckConditionsAccess(v === true)}
                    />
                    <div className="space-y-1">
                      <label htmlFor="ack-conditions-access" className="text-sm font-medium leading-snug">
                        J&apos;ai obtenu l&apos;accès à mes Conditions d&apos;assurance
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Veuillez ouvrir et consulter les documents avant de continuer.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {conditionsFiles.length === 0 ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Aucune “Condition d’assurance” n’a été jointe à cette offre pour le moment.
                      </div>
                    ) : (
                      conditionsFiles.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{att.name || "Conditions d’assurance"}</div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-[11px]"
                            onClick={() => openStorageFile(att)}
                          >
                            Ouvrir
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: SwissLife external signing */}
            {step.id === "swisslife_sign" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-3 text-sm">
                  <p className="font-medium">
                    Pour confirmer votre offre, vous devez signer des documents de proposition officiels établis par SwissLife.
                  </p>

                  <Button
                    type="button"
                    className="w-full gap-2"
                    onClick={handleOpenSwissLifeSigning}
                    disabled={!offer?.signingDocsUrl}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Signer maintenant
                  </Button>

                  {!offer?.signingDocsUrl && (
                    <p className="text-xs text-amber-700">
                      Lien manquant : merci de contacter MoneyLife pour finaliser la signature SwissLife.
                    </p>
                  )}

                  <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <p className="text-[12px] text-muted-foreground">
                      Un PIN vous sera demandé pour l’accès aux documents.
                    </p>

                    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                      <div className="text-sm font-semibold">
                        {offer?.signingDocsPin ? offer.signingDocsPin : "—"}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-[11px] gap-2"
                        disabled={!offer?.signingDocsPin}
                        onClick={() => offer?.signingDocsPin && copyToClipboard(offer.signingDocsPin)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copier
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Dès que vous aurez signé les documents SwissLife, revenez sur cette page pour terminer le processus.
                    </p>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border bg-background p-3">
                    <Checkbox
                    checked={swisslifeSigned}
                    disabled={!swisslifeSigningOpened}
                    onCheckedChange={(v) => setSwisslifeSigned(v === true)}
                    id="ack-swisslife-signed"
                    />
                    <label
                    htmlFor="ack-swisslife-signed"
                    className={cn(
                        "text-sm leading-snug",
                        !swisslifeSigningOpened && "text-muted-foreground"
                    )}
                    >
                    J&apos;ai terminé la signature SwissLife
                    </label>
                    {!swisslifeSigningOpened && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Cliquez d’abord sur <span className="font-medium">Signer maintenant</span>.
                    </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: creditx_mandate – texte UI (acceptation), comme AXA */}
            {step.id === "creditx_mandate" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-3 text-sm leading-relaxed">
                  <p className="font-medium">
                    Mandat de gestion Intermédiaire non lié - CreditX Sàrl | Version 09.2025
                  </p>

                  <div className="rounded-md border bg-muted/20 p-3 text-[12px]">
                    <p className="font-medium">Établi par</p>
                    <p>CreditX Sàrl, exploitant la plateforme MoneyLife.ch et CreditX.ch</p>
                    <p>Avenue de la Gare 54, 1964 Conthey</p>
                    <p>+41 21 561 69 03</p>
                    <p>info@moneylife.ch | info@creditx.ch</p>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 text-[12px]">
                    <p>Numéro FINMA (CreditX) : <span className="font-medium">F01536084</span></p>
                    <p>Votre conseiller : <span className="font-medium">M. Habib Osmani</span> — FINMA <span className="font-medium">F01536085</span></p>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 text-[12px] text-muted-foreground">
                    En cliquant sur <span className="font-medium text-foreground">Continuer</span>, vous confirmez avoir lu et accepté ce mandat.
                    <br />
                    (Un timestamp “Lu et accepté” sera enregistré à l’étape Signature.)
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: id_docs (only 3b) */}
            {step.id === "id_docs" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <p className="text-sm font-medium">Carte d’identité</p>
                  <p className="text-xs text-muted-foreground">
                    Veuillez fournir la pièce d’identité recto et verso.
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
                    {/* Recto */}
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                      <p className="text-[12px] font-medium">Recto</p>

                      {idFront?.url ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Recto ajouté</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => window.open(idFront.url, "_blank", "noopener,noreferrer")}
                          >
                            Ouvrir
                          </Button>
                        </div>
                      ) : (
                        <>
                          <input
                            id="id-front"
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadIdFile("front", f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full text-[11px]"
                            disabled={uploadingIdSide === "front"}
                            onClick={() =>
                              (document.getElementById("id-front") as HTMLInputElement | null)?.click()
                            }
                          >
                            {uploadingIdSide === "front" ? "Upload…" : "Ajouter le recto"}
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Verso */}
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                      <p className="text-[12px] font-medium">Verso</p>

                      {idBack?.url ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Verso ajouté</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => window.open(idBack.url, "_blank", "noopener,noreferrer")}
                          >
                            Ouvrir
                          </Button>
                        </div>
                      ) : (
                        <>
                          <input
                            id="id-back"
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadIdFile("back", f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full text-[11px]"
                            disabled={uploadingIdSide === "back"}
                            onClick={() =>
                              (document.getElementById("id-back") as HTMLInputElement | null)?.click()
                            }
                          >
                            {uploadingIdSide === "back" ? "Upload…" : "Ajouter le verso"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="pt-1 text-[10px] text-muted-foreground">
                    Continuer sera activé dès que recto et verso auront été ajoutés.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 9: signature (MoneyLife) -> show ONLY mandate after confirm */}
            {step.id === "signature" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <p className="text-sm font-medium">Signature</p>
                  <p className="text-xs text-muted-foreground">
                    Veuillez apposer votre signature manuscrite sur l’écran.
                  </p>

                  <div className="rounded-md border bg-muted/10 p-2">
                    <div className="relative w-full">
                      <canvas
                        ref={canvasRef}
                        className={cn("w-full h-[220px] rounded-md bg-white touch-none", signatureLocked && "opacity-60")}
                        onPointerDown={(e) => {
                          if (signatureLocked) return;
                          const canvas = canvasRef.current;
                          if (!canvas) return;

                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;

                          drawingRef.current = true;

                          const rect = canvas.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;

                          ctx.beginPath();
                          ctx.moveTo(x, y);
                        }}
                        onPointerMove={(e) => {
                          if (signatureLocked) return;
                          if (!drawingRef.current) return;
                          const canvas = canvasRef.current;
                          if (!canvas) return;

                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;

                          const rect = canvas.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;

                          ctx.lineTo(x, y);
                          ctx.stroke();

                          hasInkRef.current = true;
                        }}
                        onPointerUp={() => {
                          drawingRef.current = false;
                        }}
                        onPointerCancel={() => {
                          drawingRef.current = false;
                        }}
                        onPointerLeave={() => {
                          drawingRef.current = false;
                        }}
                      />

                      {/* overlay signature if exists */}
                      {signatureUrl && (
                        <img
                          src={signatureUrl}
                          alt="Signature"
                          className="absolute inset-0 m-2 rounded-md object-contain pointer-events-none opacity-100"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="outline" disabled={signatureUploading}>
                          Effacer
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Recommencer la signature ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action supprimera la signature actuelle et le mandat généré.
                            Vous devrez signer à nouveau.
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={clearSignatureLocalOnly}>
                            Oui, recommencer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {!signatureLocked && (
                      <Button
                        type="button"
                        onClick={confirmSignatureUpload}
                        disabled={signatureUploading}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {signatureUploading ? "Traitement…" : "Confirmer"}
                      </Button>
                    )}
                  </div>

                  {signatureLocked && (
                    <div className="flex items-center gap-2 text-emerald-700 text-sm pt-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Signature confirmée</span>
                    </div>
                  )}

                  {/* Mandate only */}
                  {creditxMandateUrl && (
                    <div className="rounded-lg border bg-background p-3 space-y-2 mt-3">
                      <p className="text-sm font-medium">Mandat de gestion CreditX</p>
                      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/10 px-3 py-2">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-medium">Mandat de gestion signé</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => window.open(creditxMandateUrl, "_blank", "noopener,noreferrer")}
                        >
                          Ouvrir / Télécharger
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Vous pouvez consulter / télécharger le mandat avant de continuer.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 10: health */}
            {step.id === "health" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <p className="text-sm font-medium">Questionnaire de santé</p>
                  <p className="text-xs text-muted-foreground">
                    Pour valider cette offre, vous devez maintenant répondre à un questionnaire de santé.
                  </p>

                  <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <p className="text-[12px] text-muted-foreground">
                      Un TAN vous sera demandé pour l’accès aux documents. Voici votre PIN :
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                      <div className="text-sm font-semibold">
                        {offer?.healthQuestionnaireTan ? offer.healthQuestionnaireTan : "—"}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-[11px] gap-2"
                        disabled={!offer?.healthQuestionnaireTan}
                        onClick={() => offer?.healthQuestionnaireTan && copyToClipboard(offer.healthQuestionnaireTan)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copier
                      </Button>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      Cette page peut rester ouverte. Revenez dès que vous aurez répondu et terminer le processus de signature.
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleOpenHealthQuestionnaire}
                    disabled={!offer?.healthQuestionnaireUrl}
                  >
                    Répondre au questionnaire maintenant
                  </Button>

                  {!offer?.healthQuestionnaireUrl && (
                    <p className="text-xs text-amber-700">
                      Lien manquant : merci de contacter MoneyLife pour finaliser le questionnaire.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* STEP 11: done */}
            {step.id === "done" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-4 space-y-2">
                  <p className="text-base font-semibold">✅</p>

                  {requiresHealth ? (
                    <p className="text-sm text-muted-foreground">
                      Votre proposition est maintenant en cours d’envoi. Dès que votre questionnaire de santé sera finalisé,
                      nous vous informerons de la suite par email et sur votre dashboard MoneyLife.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Votre proposition est en cours de finalisation. Vous recevrez un email de confirmation et votre police
                      sera bientôt disponible sur votre plateforme MoneyLife.
                    </p>
                  )}

                  <Button type="button" className="w-full mt-2" onClick={() => router.push("/dashboard")}>
                    Retour à mon Dashboard
                  </Button>
                </div>
              </div>
            )}

            {/* Footer actions (masqué à l’étape finale) */}
            {step.id !== "done" && (
              <div className="pt-2 flex items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={goPrev} disabled={stepIndex === 0}>
                  Précédent
                </Button>

                <Button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext()}
                  className={cn("gap-2", !canGoNext() && "opacity-70")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Continuer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}