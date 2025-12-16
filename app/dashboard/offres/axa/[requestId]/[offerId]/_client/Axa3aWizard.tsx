// app/dashboard/offres/axa/[requestId]/[offerId]/_client/Axa3aWizard.tsx
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";

type AttachmentCategory = "offre" | "conditions_generales" | "signature" | "autres" | string;

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
  pessRatePct?: number | null;
  midRatePct?: number | null;
  optRatePct?: number | null;

  attachments: ClientAttachment[];
  healthQuestionnaireRequired?: boolean | null;
  healthQuestionnaireUrl?: string | null;
};

type OfferRequestDoc = {
  clientUid: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    sex?: string; // "M"/"F" ou autre
    birthdate?: string; // "dd.mm.yyyy" selon ton admin
    nationality?: string;
    street?: string;
    zip?: string;
    city?: string;
    etatCivilLabel?: string | null;
  } | null;
  adminOffers?: any[];
  adminOffersStatus?: "saved" | "sent";
premiumFrequency?: "monthly" | "annual" | "yearly" | null; // 👈 AJOUT

};

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
  return "annuelle"; // fallback sûr
}

const STEPS = [
  { id: "confirm_personal", title: "Confirmation des données personnelles" },
  { id: "technical_values", title: "Valeurs techniques" },
  { id: "payment", title: "Mode de paiement" },
  { id: "ubo", title: "Ayant droit économique" },
  { id: "general_conditions", title: "Conditions générales" },
  { id: "insured_consent", title: "Consentement – personne à assurer" },
  { id: "axa_confirm", title: "Confirmation & signature AXA" },
  { id: "creditx_mandate", title: "Mandat de gestion CreditX" },
  { id: "id_docs", title: "Carte d’identité" },
  { id: "signature", title: "Signature manuscrite" },
  { id: "health", title: "Questionnaire de santé" },
  { id: "done", title: "Merci" },
] as const;

export default function Axa3aWizard({
  requestId,
  offerId,
}: {
  requestId: string;
  offerId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [clientUid, setClientUid] = useState<string | null>(null);

  const [requestDoc, setRequestDoc] = useState<OfferRequestDoc | null>(null);
  const [offer, setOffer] = useState<ClientOffer | null>(null);

  const [fatca, setFatca] = useState<{
    isUsCitizenOrResident?: "yes" | "no";
    isUsTaxableOther?: "yes" | "no";
  } | null>(null);

  // Wizard state
  const [stepIndex, setStepIndex] = useState(0);

  // Step validations
  const [ackPersonal, setAckPersonal] = useState(false);
  const [ackTech, setAckTech] = useState(false);
  const [ackConditionsAccess, setAckConditionsAccess] = useState(false);
  const [ackLegalPoints, setAckLegalPoints] = useState(false);

  // Step 9 - ID docs upload
const [idFront, setIdFront] = useState<{ url: string; path: string } | null>(null);
const [idBack, setIdBack] = useState<{ url: string; path: string } | null>(null);
const [uploadingIdSide, setUploadingIdSide] = useState<"front" | "back" | null>(null);

// Step 10 - Signature

const [signedDocs, setSignedDocs] = useState<{ url: string }[]>([]);
const [signingDocsLoading, setSigningDocsLoading] = useState(false);

// Mandat CreditX signé
const [creditxMandateUrl, setCreditxMandateUrl] = useState<string | null>(null);

const canvasRef = useRef<HTMLCanvasElement | null>(null);
const drawingRef = useRef(false);
const hasInkRef = useRef(false);

const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
const [signaturePath, setSignaturePath] = useState<string | null>(null);
const [signatureUploading, setSignatureUploading] = useState(false);
const [signatureLocked, setSignatureLocked] = useState(false);


const [healthClicked, setHealthClicked] = useState(false);


  const [paymentViewed, setPaymentViewed] = useState(false);

  const progress = useMemo(() => {
    const pct = ((stepIndex + 1) / STEPS.length) * 100;
    return Math.max(2, Math.min(100, Math.round(pct)));
  }, [stepIndex]);

  const step = STEPS[stepIndex];

  // --- Load auth + request + offer ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push(`/login?from=/dashboard/offres/axa/${requestId}/${offerId}`);
        return;
      }
      setClientUid(u.uid);

      try {
        const ref = doc(db, "offers_requests_3e", requestId);
        const snap = await getDoc(ref);

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

        // sécurité : l’utilisateur ne doit voir que ses demandes
        if (docTyped.clientUid !== u.uid) {
          toast.error("Accès refusé à cette demande.");
          router.push("/dashboard/offres");
          return;
        }

        let found = (docTyped.adminOffers ?? []).find((o: any) => (o?.id ?? "") === offerId);

        // 🔹 Fallback: si les offers n'ont pas d'id en base, on utilise le format client "offer_{idx}_{requestId}"
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

        // normalize minimal
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
          pessRatePct: typeof found.pessRatePct === "number" ? found.pessRatePct : null,
          midRatePct: typeof found.midRatePct === "number" ? found.midRatePct : null,
          optRatePct: typeof found.optRatePct === "number" ? found.optRatePct : null,
          attachments: Array.isArray(found.attachments) ? found.attachments : [],
          healthQuestionnaireRequired:
            typeof found.healthQuestionnaireRequired === "boolean" ? found.healthQuestionnaireRequired : null,
          healthQuestionnaireUrl:
            typeof found.healthQuestionnaireUrl === "string" ? found.healthQuestionnaireUrl : null,
        };

        if ((normalizedOffer.insurer || "").trim() !== "AXA") {
          toast.error("Ce flow est réservé aux offres AXA.");
          router.push("/dashboard/offres");
          return;
        }

        setRequestDoc(docTyped);
        setOffer(normalizedOffer);

        // FATCA : last health_lifestyle_3epilier
        const qRef = query(
          collection(db, "clients", u.uid, "health_lifestyle_3epilier"),
          orderBy("updatedAt", "desc"),
          limit(1)
        );
        const qSnap = await getDocs(qRef);
        if (!qSnap.empty) {
          const raw = qSnap.docs[0].data() as any;
          setFatca({
            isUsCitizenOrResident: raw.isUsCitizenOrResident,
            isUsTaxableOther: raw.isUsTaxableOther,
          });
        } else {
          setFatca(null);
        }

        // Create / touch signing session doc (simple)
const sessionId = `${requestId}_${offerId}`;
const sessionDocRef = doc(db, "offers_signing_sessions", sessionId);

await setDoc(
  sessionDocRef,
  {
    requestId,
    offerId,
    clientUid: u.uid,
    insurer: "AXA",
    product: "3a",
    status: "IN_PROGRESS",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  },
  { merge: true }
);

// ✅ Recharger l’état existant (si l’utilisateur revient plus tard)
try {
  const sessionSnap = await getDoc(sessionDocRef);
  if (sessionSnap.exists()) {
    const s = sessionSnap.data() as any;

    const sigUrl = s?.steps?.signature?.imageUrl ?? null;
    const sigPath = s?.steps?.signature?.imagePath ?? null;

    const axaUrls: string[] = Array.isArray(s?.steps?.signedDocuments?.urls)
      ? s.steps.signedDocuments.urls
      : [];

    const mandateUrl = s?.steps?.creditxMandatePdf?.url ?? null;

    setSignatureUrl(sigUrl);
    setSignaturePath(sigPath);

    setSignedDocs(axaUrls.map((url: string) => ({ url })));
    setCreditxMandateUrl(mandateUrl);

    // lock si signature + docs déjà générés
    if (sigUrl && axaUrls.length > 0) setSignatureLocked(true);
  }
} catch (e) {
  console.warn("[Axa3aWizard] session reload failed", e);
}

setLoading(false);

      } catch (e) {
        console.error("[Axa3aWizard] load error", e);
        toast.error("Erreur lors du chargement du flow AXA.");
        router.push("/dashboard/offres");
      }
    });


    return () => unsub();
  }, [router, requestId, offerId]);

  useEffect(() => {
  if (step?.id !== "signature") return;

  const canvas = canvasRef.current;
  if (!canvas) return;

  resizeCanvasToDisplaySize(canvas);

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0B1021";
  }
}, [step?.id]);

  const contact = requestDoc?.contact ?? null;
  const civility = civilityFromSex(contact?.sex ?? null);

  // Conditions pour étapes conditionnelles (on gèrera plus tard en “skip step”)
  const contractForm = offer?.contractForm ?? "3a";
  const nationality = (contact?.nationality ?? "").trim();
  const requiresIdDocs = contractForm === "3b" || (contractForm === "3a" && nationality && nationality !== "Suisse");
  const requiresHealth = offer?.healthQuestionnaireRequired === true;

  function shouldSkipStep(stepId: (typeof STEPS)[number]["id"]) {
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
    if (step.id === "confirm_personal") return ackPersonal;
    if (step.id === "technical_values") return ackTech;
    if (step.id === "general_conditions") return ackConditionsAccess && ackLegalPoints;
    if (step.id === "id_docs") return !!idFront?.url && !!idBack?.url;
    if (step.id === "signature")
  return !!signatureUrl && signedDocs.length > 0 && !!creditxMandateUrl;
    if (step.id === "health") return healthClicked || !requiresHealth;
    return true;
  }

  async function pushOfferStatus(status: "SIGNED" | "SIGNED_WAITING_HEALTH" | "SIGNED_FINALIZING") {
  try {
    const u = auth.currentUser;
    if (!u) return;

    const idToken = await u.getIdToken();

    const sessionId = `${requestId}_${offerId}`;

    const res = await fetch("/api/offers/3epilier/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ sessionId, status }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      console.error("[pushOfferStatus] error", j);
    }
  } catch (e) {
    console.error("[pushOfferStatus] exception", e);
  }
}

  async function goNext() {
  if (!canGoNext()) return;

  try {
    const sessionId = `${requestId}_${offerId}`;
    const ref = doc(db, "offers_signing_sessions", sessionId);



    if (step.id === "general_conditions" && ackConditionsAccess && ackLegalPoints) {
    await setDoc(
        ref,
        {
        steps: {
            generalConditions: {
            ackDocs: true,
            ackLegal: true,
            ackAt: serverTimestamp(),
            },
        },
        updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
    }

    if (step.id === "ubo") {
    await setDoc(
        ref,
        {
        steps: {
            ubo: {
            viewedAt: serverTimestamp(),
            },
        },
        updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
    }

    if (step.id === "confirm_personal" && ackPersonal) {
      await setDoc(
        ref,
        {
          steps: {
            confirmPersonalData: {
              confirmed: true,
              confirmedAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (step.id === "technical_values" && ackTech) {
      await setDoc(
        ref,
        {
          steps: {
            technicalValues: {
              ack: true,
              ackAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }



    if (step.id === "insured_consent") {
  const place = contact?.city ?? "—";

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateText = `${dd}.${mm}.${yyyy}`;

  await setDoc(
    ref,
    {
      steps: {
        insuredConsent: {
          place,
          dateText,
          acceptedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

if (step.id === "axa_confirm") {
  const place = contact?.city ?? "—";

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateText = `${dd}.${mm}.${yyyy}`;

  await setDoc(
    ref,
    {
      steps: {
        axaProposalAck: {
          place,
          dateText,
          acceptedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

if (step.id === "creditx_mandate") {
  const place = contact?.city ?? "—";

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateText = `${dd}.${mm}.${yyyy}`;

  await setDoc(
    ref,
    {
      steps: {
        creditxMandate: {
          place,
          dateText,
          acceptedAt: serverTimestamp(),
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

if (step.id === "signature") {
  // L'utilisateur a signé + les docs sont déjà générés via "Confirmer"
  // Ici on marque juste le statut au moment où il quitte l'étape 10.
  await pushOfferStatus(requiresHealth ? "SIGNED" : "SIGNED_FINALIZING");
}





  } catch (e) {
    console.error("[Axa3aWizard] persistStepAck error", e);
    toast.message("Info", {
      description: "Impossible d'enregistrer l'étape (vous pouvez continuer).",
    });
  }

  setStepIndex((i) => nextIndex(i, 1));
}
  function goPrev() {
    setStepIndex((i) => nextIndex(i, -1));
  }

  async function openStorageFile(att: ClientAttachment) {
  try {
    if (!att?.storagePath) throw new Error("storagePath missing");
    const url = await getDownloadURL(storageRef(storage, att.storagePath));
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.error("[Axa3aWizard] openStorageFile error", e);
    toast.error("Impossible d'ouvrir ce fichier.");
  }
}

async function handleOpenHealthQuestionnaire() {
  try {
    const url = offer?.healthQuestionnaireUrl ?? null;
    if (!url) {
      toast.error("Lien du questionnaire de santé manquant.");
      return;
    }

    // 1) Persist clickedAt
    const sessionId = `${requestId}_${offerId}`;
    const ref = doc(db, "offers_signing_sessions", sessionId);

    await setDoc(
      ref,
      {
        steps: {
          healthQuestionnaire: {
            required: true,
            url,
            clickedAt: serverTimestamp(),
          },
        },
        status: "WAITING_HEALTH",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await pushOfferStatus("SIGNED_WAITING_HEALTH");

    // 2) Ouvrir dans un nouvel onglet
    window.open(url, "_blank", "noopener,noreferrer");

    // 3) Débloquer + passer à Merci (step 12)
    setHealthClicked(true);
    setStepIndex((i) => nextIndex(i, 1));
  } catch (e) {
    console.error("[Axa3aWizard] handleOpenHealthQuestionnaire error", e);
    toast.error("Impossible d’ouvrir le questionnaire de santé.");
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
    console.error("[Axa3aWizard] uploadIdFile error", e);
    toast.error("Erreur lors de l’upload de la pièce d’identité.");
  } finally {
    setUploadingIdSide(null);
  }
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
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
      ctx.strokeStyle = "#0B1021"; // neutre sombre
    }
  }
}

function clearSignature() {
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
  setSignedDocs([]);
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
    setSigningDocsLoading(true);

    // 1) Upload signature.png
    const dataUrl = canvas.toDataURL("image/png");
    const blob = dataUrlToBlob(dataUrl);

    const path = `clients/${uid}/offers_signing/${requestId}/${offerId}/signature.png`;
    const r = storageRef(storage, path);

    await uploadBytes(r, blob, { contentType: "image/png" });
    const url = await getDownloadURL(r);

    setSignaturePath(path);
    setSignatureUrl(url);

    toast.success("Signature enregistrée.");

    // 2) Apposer la signature sur les PDFs AXA (et obtenir les URLs)
    const res = await fetch("/api/signing/axa/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: `${requestId}_${offerId}` }),
    });

    const j = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("AXA SIGN API error:", j);
      toast.error("Erreur lors de la génération des documents signés.");
      return;
    }

    const urls: string[] = Array.isArray(j?.signedUrls) ? j.signedUrls : [];
    if (urls.length === 0) {
      toast.error("Aucun document signé n’a été généré.");
      return;
    }

    setSignedDocs(urls.map((u) => ({ url: u })));
toast.success("Documents AXA signés prêts ✅");

// 3) Générer le mandat CreditX SIGNÉ (après signature)
const resMandate = await fetch("/api/signing/creditx/mandate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId: `${requestId}_${offerId}` }),
});

const jMandate = await resMandate.json().catch(() => null);

if (!resMandate.ok) {
  console.error("[Mandate] API error:", jMandate);
  toast.error("Impossible de générer le mandat de gestion signé.");
  return;
}

const mandateUrl: string | null = typeof jMandate?.url === "string" ? jMandate.url : null;
if (!mandateUrl) {
  toast.error("Mandat généré mais URL manquante.");
  return;
}

setCreditxMandateUrl(mandateUrl);
toast.success("Mandat de gestion signé prêt ✅");

setSignatureLocked(true);
  } catch (e) {
    console.error("[Axa3aWizard] confirmSignatureUpload error", e);
    toast.error("Erreur lors de l'enregistrement de la signature.");
  } finally {
    setSigningDocsLoading(false);
    setSignatureUploading(false);
  }
}

  if (loading || !offer || !requestDoc) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Chargement du flow AXA…</div>
      </div>
    );
  }

  // Helpers attachments
  const conditionsFiles = (offer.attachments ?? []).filter((a) => a.category === "conditions_generales");
  const signatureDocs = (offer.attachments ?? []).filter((a) => a.category === "signature");

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
              AXA 3a
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
              Offre {offer.offerNumber ? `n° ${offer.offerNumber}` : ""} • Prime {money(offer.premiumMonthly, "CHF/mois")} • {money(offer.premiumAnnual, "CHF/an")}
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* STEP 1 */}
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
                    <div className="sm:col-span-2">
                      <div className="text-[11px] text-muted-foreground">Adresse</div>
                      <div className="font-medium">
                        {(contact?.street ?? "—")}, {(contact?.zip ?? "")} {(contact?.city ?? "")}
                      </div>
                    </div>
                  </div>
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

            {/* STEP 2 */}
            {step.id === "technical_values" && (
            <div className="space-y-4">
                {/* Bloc infos offre */}
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

                {/* Capital projeté + hypothèses */}
                <div className="rounded-lg border bg-background p-3">
                <div className="text-[12px] font-medium">Projection (scénario modéré)</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Capital projeté</div>
                    <div className="text-base font-semibold">
                        {money(offer.projectedModerateAmount, "CHF")}
                    </div>
                    </div>
                    <div className="rounded-md bg-muted/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Rendement modéré</div>
                    <div className="text-base font-semibold">
                        {offer.projectedModerateRatePct != null ? `${offer.projectedModerateRatePct}%/an` : "—"}
                    </div>
                    </div>
                </div>

                {(offer.pessRatePct != null || offer.midRatePct != null || offer.optRatePct != null) && (
                    <div className="mt-3 text-xs text-muted-foreground">
                    Hypothèses taux (VR) :{" "}
                    <span className="font-medium text-foreground">
                        {offer.pessRatePct != null ? `Pess. ${offer.pessRatePct}%` : "Pess. —"}
                        {" · "}
                        {offer.midRatePct != null ? `Mod. ${offer.midRatePct}%` : "Mod. —"}
                        {" · "}
                        {offer.optRatePct != null ? `Opt. ${offer.optRatePct}%` : "Opt. —"}
                    </span>
                    </div>
                )}
                </div>

                {/* Couvertures */}
                <div className="rounded-lg border bg-background p-3">
                <div className="text-[12px] font-medium">Couvertures & primes de risque</div>

                {(!offer.coverages || offer.coverages.length === 0) ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                    Aucune couverture de risque (offre 100% épargne).
                    </p>
                ) : (
                    <div className="mt-2 space-y-2">
                    {offer.coverages.map((c, idx) => (
                        <div key={idx} className="rounded-md border bg-muted/20 p-2">
                        <div className="text-sm font-semibold">{c.label || `Couverture ${idx + 1}`}</div>
                        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                            <div>
                            <div className="text-[11px] text-muted-foreground">
                                {c.label === "Libération du paiement des primes" ? "Délai d’attente" : "Somme assurée"}
                            </div>
                            <div className="font-medium">
                                {c.label === "Libération du paiement des primes"
                                ? (c.waitingPeriodMonths != null ? `${c.waitingPeriodMonths} mois` : "—")
                                : money(c.sumInsured, "CHF")}
                            </div>
                            </div>
                            <div>
                            <div className="text-[11px] text-muted-foreground">Prime</div>
                            <div className="font-medium">{money(c.premium, "CHF/an")}</div>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                )}
                </div>

                {/* Valeurs de rachat */}
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
                        <div>Pessimiste</div>
                        <div>Modéré</div>
                        <div>Optimiste.</div>
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

                {/* Ack */}
                <div className="flex items-start gap-2 rounded-lg border bg-background p-3">
                <Checkbox
                    checked={ackTech}
                    onCheckedChange={(v) => setAckTech(v === true)}
                    id="ack-tech"
                />
                <label htmlFor="ack-tech" className="text-sm leading-snug">
                    J&apos;ai pris connaissance des valeurs de rachat
                </label>
                </div>
            </div>
            )}

            {/* STEP 3 */}
            {step.id === "payment" && (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="text-[11px] text-muted-foreground">
                    Mode de paiement{" "}
                    <span className="font-medium text-foreground">
                      (Prime {requestDoc?.contact?.etatCivilLabel ? "" : ""}{/* placeholder */}
                      {paymentFrequencyLabel(requestDoc?.premiumFrequency)}
                      )
                    </span>
                  </div>
                  <div className="mt-2 font-medium">QR Facture</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vous recevez un bulletin de versement QR et établissez un ordre permanent manuellement.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step.id === "ubo" && (
            <div className="space-y-4">
                <div className="rounded-lg border bg-background p-3 space-y-3 text-sm leading-relaxed">
                <p className="font-medium">
                    Déclaration en vue de l&apos;identification de l&apos;ayant droit économique
                </p>

                <p>
                    La personne soussignée confirme, en qualité de preneur d’assurance, que la personne ci-dessous
                    désignée est l’ayant droit économique des valeurs patrimoniales versées aux entreprises:
                </p>

                <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-[11px] text-muted-foreground">Ayant droit économique</div>
                    <div className="font-semibold">
                    {civility} {contact?.lastName ?? "—"} {contact?.firstName ?? ""}
                    </div>
                </div>

                <div className="rounded-md border bg-amber-50 p-3">
                    <p className="text-[12px] font-semibold text-amber-900">Remarque importante</p>
                    <p className="mt-1 text-[12px] text-amber-900">
                    Est considérée comme &quot;ayant droit économique&quot; pour les contrats d’assurance avec part
                    d’épargne toute personne qui, du point de vue économique, agit en tant que dernier bailleur de
                    fonds pour les primes dues.
                    </p>
                    <p className="mt-2 text-[12px] text-amber-900">
                    La déclaration relative à l’ayant droit économique constitue un titre au sens de l’art. 110, al. 4
                    du code pénal suisse (CP). Le fait d’y indiquer à dessein de fausses informations peut par conséquent
                    entraîner une sanction pour cause de faux dans les titres, conformément à l’art. 251 CP.
                    </p>
                    <p className="mt-2 text-[12px] text-amber-900">
                    Le preneur d’assurance s’engage à communiquer spontanément toute modification concernant l’ayant droit
                    économique.
                    </p>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 text-[12px] text-muted-foreground space-y-2">
                    <p>
                    AXA conserve les données personnelles reçues pour l’établissement d’une offre pendant cinq ans à compter
                    de la date d’établissement, même si le contrat d’assurance n’est pas conclu. Elle utilise ces données
                    afin d’améliorer ses produits et ses offres ainsi que pour recommander au proposant d’autres produits
                    susceptibles de l’intéresser.
                    </p>
                    <p>
                    Veuillez tenir compte des autres remarques sur le traitement des données à la partie
                    &quot;Autres dispositions&quot; des conditions d’assurance.
                    </p>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 text-[12px] text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">
                    Convention relative aux contrats pour lesquels l’âge ordinaire de la retraite AVS est dépassé
                    </p>
                    <p>
                    Le proposant est conscient que le contrat d’assurance ne peut être prolongé au-delà de l’âge ordinaire
                    de la retraite AVS que si l’activité lucrative est maintenue. Le proposant s’engage à résilier le
                    contrat dès lors qu’il cesse son activité lucrative avant l’échéance prévue du contrat, toutefois après
                    avoir atteint l’âge ordinaire de la retraite AVS.
                    </p>
                </div>
                </div>

                <p className="text-xs text-muted-foreground">
                Cliquez sur <span className="font-medium">Continuer</span> pour valider cette déclaration.
                </p>
            </div>
            )}

            {/* STEP 5 */}
            {step.id === "general_conditions" && (
            <div className="space-y-4">
                {/* Checkbox A : accès conditions + liens */}
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
                        <br />
                        (Côté admin : ajoute des pièces jointes en catégorie{" "}
                        <span className="font-mono">conditions_generales</span>.)
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

                {/* Checkbox B : modales */}
                <div className="rounded-lg border bg-background p-3">
                <div className="flex items-start gap-2">
                    <Checkbox
                    id="ack-legal-points"
                    checked={ackLegalPoints}
                    onCheckedChange={(v) => setAckLegalPoints(v === true)}
                    />
                    <div className="space-y-2">
                    <label htmlFor="ack-legal-points" className="text-sm font-medium leading-snug">
                        J&apos;ai lu les points suivants et je donne mon accord à la collecte des données nécessaires par AXA.
                    </label>

                    <div className="flex flex-wrap gap-2">
                        {/* Modal 1 */}
                        <Dialog>
                        <DialogTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="text-[11px]">
                            Particularités fiscales (étranger)
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                            <DialogTitle>Particularités fiscales en cas de relations avec l’étranger</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm space-y-3 leading-relaxed">
                            <p>
                                La preneuse ou le preneur d’assurance prend acte de ce qui suit: AXA Vie SA est tenue, dans
                                certaines circonstances, de transmettre les informations concernant ce contrat aux autorités
                                fiscales d’un ou de plusieurs pays dans lesquels la preneuse ou le preneur d’assurance a un
                                domicile fiscal ou est assujetti(e) à l’impôt.
                            </p>
                            <p>
                                Pour qu’AXA Vie SA puisse satisfaire aux obligations qui lui sont imposées par un traité
                                international, par la loi ou par toute autre norme juridique, la preneuse ou le preneur
                                d’assurance l’autorise expressément à communiquer les informations liées au présent contrat
                                aux autorités fiscales des pays dans lesquels la preneuse ou le preneur d’assurance a un
                                domicile fiscal ou est assujetti(e) à l’impôt. En outre, la preneuse ou le preneur
                                d’assurance consent à ce qu’AXA Vie SA transmette de telles informations aux autorités
                                fiscales suisses et aux autorités fiscales étrangères compétentes. Pour le cas où AXA Vie SA
                                serait juridiquement tenue de prélever l’impôt à la source, la preneuse ou le preneur
                                d’assurance déclare accepter ce qui suit: AXA Vie SA réduit les prestations dues
                                contractuellement du montant de l’impôt à la source.
                            </p>
                            <p>
                                Par sa signature, la preneuse ou le preneur d’assurance s’engage à communiquer immédiatement
                                et par écrit à AXA Vie SA toute modification concernant son obligation fiscale ayant des
                                répercussions sur les obligations précitées. Il ou elle s’engage en outre à déclarer
                                correctement sa situation financière aux autorités fiscales compétentes.
                            </p>
                            </div>
                        </DialogContent>
                        </Dialog>

                        {/* Modal 2 */}
                        <Dialog>
                        <DialogTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="text-[11px]">
                            Traitement & collecte de données
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                            <DialogTitle>Remarques relatives au traitement et à la collecte de données</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm space-y-3 leading-relaxed">
                            <p className="font-medium">Traitement des données personnelles</p>
                            <p>
                                Le proposant déclare être légalement autorisé à communiquer le cas échéant les données
                                personnelles de tiers (membres de la famille, bénéficiaires) et avoir été informé des
                                obligations qui en découlent à l’égard de ces tiers. AXA traite les données à caractère
                                personnel conformément aux dispositions légales applicables. Des informations sur le but de
                                la collecte de données, la nature des données collectées, les destinataires ainsi que la
                                conservation des données sont disponibles à l’adresse AXA.ch/protection-donnees. AXA conserve
                                les données personnelles reçues pour l’établissement d’une offre ou d’une proposition pendant
                                cinq ans à compter de la date d’établissement de l’offre, même si le contrat d’assurance
                                n’est pas conclu. À des fins de simplification administrative, les données peuvent être
                                partagées, dans le cadre de l’exécution du contrat, avec d’autres sociétés du Groupe AXA
                                ainsi qu’avec des partenaires mandatés, ou leur être transmises.
                            </p>

                            <p className="font-medium">Consultation de dossiers officiels, médicaux ou autres</p>
                            <p>
                                La personne à assurer (si elle est mineure ou sous curatelle: son représentant légal) autorise
                                AXA à se procurer, pour déterminer son obligation de verser des prestations en cas de décès,
                                des renseignements auprès d’autres sociétés du Groupe AXA, d’autres institutions d’assurance,
                                des services administratifs ainsi que des médecins, thérapeutes, cliniques, institutions de
                                soins, employeurs, caisses de pension, caisses-maladie, institutions de prévoyance et de
                                libre passage, caisses de compensation, l’assurance-invalidité fédérale ainsi qu’auprès
                                d’autres personnes et instances disposant des informations nécessaires, de même qu’à
                                transmettre, dans la mesure requise, des données personnelles à des réassureurs et à d’autres
                                institutions d’assurance appartenant au Groupe AXA, et délie les personnes et instances
                                susmentionnées de leur obligation de garder le secret. Cette libération de l’obligation de
                                garder le secret demeure expressément valable au-delà du décès.
                            </p>
                            </div>
                        </DialogContent>
                        </Dialog>

                        {/* Modal 3 */}
                        <Dialog>
                        <DialogTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="text-[11px]">
                            Exactitude & intégralité
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                            <DialogTitle>Exactitude et intégralité des renseignements</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm space-y-3 leading-relaxed">
                            <p>
                                Par leur signature, la preneuse ou le preneur d’assurance et les personnes assurées confirment
                                le caractère exact et exhaustif des renseignements fournis.
                            </p>
                            <p>
                                AXA Vie SA est en droit de résilier le contrat si les renseignements figurant dans les
                                documents relatifs à la proposition, y compris ses éventuelles annexes, ou dans le présent
                                document sont inexacts ou incomplets (art. 6 de la loi sur le contrat d'assurance). Le ou la
                                signataire du présent document confirme l’exactitude des données qui y figurent, même si
                                celles-ci ont été rédigées par une autre personne.
                            </p>
                            <p>
                                Les faux renseignements ainsi que le fait de ne pas communiquer une modification de la
                                résidence fiscale donneront lieu à des poursuites pénales.
                            </p>
                            <p>
                                La preneuse ou le preneur d’assurance confirme l’exactitude et l’exhaustivité de la déclaration
                                en vue de l'identification de l'ayant droit économique, dans la mesure où celle-ci est
                                nécessaire. Entre l’établissement de la proposition et la réception de la police, la preneuse
                                ou le preneur d’assurance s’engage à communiquer immédiatement toute modification de sa
                                situation personnelle ou de son état de santé.
                            </p>
                            </div>
                        </DialogContent>
                        </Dialog>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Vous pouvez ouvrir chaque point, puis cocher la case lorsque vous avez lu.
                    </p>
                    </div>
                </div>
                </div>
            </div>
            )}

            {/* STEP 6 */}
{step.id === "insured_consent" && (
  <div className="space-y-4">
    <div className="rounded-lg border bg-background p-3 space-y-3 text-sm leading-relaxed">
      <p className="font-medium">
        Déclaration de consentement de la personne à assurer
      </p>

      <div className="rounded-md border bg-muted/20 p-3">
        <div className="text-[11px] text-muted-foreground">Personne à assurer</div>
        <div className="font-semibold">
          {(contact?.firstName ?? "—") + " " + (contact?.lastName ?? "")}
          {contact?.birthdate ? `, né(e) le ${contact.birthdate}` : ""}
        </div>
      </div>

      <p className="font-medium">Consultation de dossiers officiels, médicaux ou autres</p>
      <p>
        La personne à assurer autorise AXA à prendre connaissance de documents officiels,
        médicaux ou autres auprès d&apos;institutions d&apos;assurance, d&apos;organismes
        officiels et d&apos;autres sociétés du Groupe AXA, dans le cadre de la conclusion
        du contrat ou d&apos;un éventuel cas de prestation.
      </p>

      <p className="font-medium">Libération de l&apos;obligation de garder le secret</p>
      <p>
        La personne à assurer délie les médecins, chiropraticiens, physiothérapeutes et
        psychothérapeutes de leur obligation de garder le secret vis-à-vis d&apos;AXA Vie SA.
      </p>
    </div>

    {/* Lieu / Date en lecture seule */}
    <div className="rounded-lg border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Lieu</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {contact?.city ?? "—"}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Date</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {new Date().toLocaleDateString("fr-CH")}
          </div>
          <p className="text-[10px] text-muted-foreground">
            La date exacte enregistrée sera celle du moment où vous cliquez sur Continuer.
          </p>
        </div>
      </div>
    </div>

    <p className="text-xs text-muted-foreground">
      En cliquant sur <span className="font-medium">Continuer</span>, vous acceptez cette déclaration.
    </p>
  </div>
)}


{/* STEP 7 */}
{step.id === "axa_confirm" && (
  <div className="space-y-4">
    <div className="rounded-lg border bg-background p-3 space-y-4 text-sm leading-relaxed">
      <p className="font-medium">Confirmation et signature</p>

      <div className="rounded-md border bg-muted/20 p-3">
        <div className="text-[11px] text-muted-foreground">Ayant droit économique</div>
        <div className="font-semibold">
          {contact?.firstName ?? "—"} {contact?.lastName ?? ""}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[12px]">
          <div>
            <div className="text-[11px] text-muted-foreground">Rue / n°</div>
            <div className="font-medium">{contact?.street ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">NPA / Lieu</div>
            <div className="font-medium">
              {(contact?.zip ?? "")} {(contact?.city ?? "")}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Pays</div>
            <div className="font-medium">Suisse</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Nationalité</div>
            <div className="font-medium">{contact?.nationality ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Date de naissance</div>
            <div className="font-medium">{contact?.birthdate ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">Traitement des données personnelles</p>
        <p>
          Le proposant déclare être légalement autorisé à communiquer le cas échéant les données personnelles de tiers
          (membres de la famille, bénéficiaires) et avoir assumé les obligations qui en découlent à l&apos;égard de ces
          tiers. AXA traite les données à caractère personnel conformément aux dispositions légales applicables et met à
          disposition des informations notamment sur le but du traitement de données, la nature des fichiers, les
          destinataires ainsi que la conservation des données sur AXA.ch/protection-donnees. AXA conserve les données
          personnelles reçues pour l&apos;établissement d&apos;une offre ou d&apos;une proposition pendant cinq ans à
          compter de la date d&apos;établissement, même si le contrat d&apos;assurance n&apos;est pas conclu.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">
          Particularités fiscales en cas de relations avec l&apos;étranger
        </p>
        <p>
          Le preneur d&apos;assurance prend acte qu&apos;AXA Vie SA peut être tenue de transmettre des informations liées
          au présent contrat aux autorités fiscales suisses et/ou étrangères, selon les circonstances. En signant, le
          preneur d&apos;assurance autorise expressément cette transmission lorsque la loi ou des accords internationaux
          l&apos;exigent et s&apos;engage à informer AXA Vie SA de toute modification de sa situation fiscale.
        </p>
      </div>

      {/* FATCA (lecture seule) */}
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="text-[12px] font-medium text-foreground">
          Déclaration concernant l&apos;assujettissement à l&apos;impôt aux États-Unis
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[12px]">
          <div className="rounded-md border bg-background p-2">
            <div className="text-[11px] text-muted-foreground">
              Citoyenneté américaine ou domicile aux États-Unis ?
            </div>
            <div className="font-semibold">
              {fatca?.isUsCitizenOrResident === "yes"
                ? "Oui"
                : fatca?.isUsCitizenOrResident === "no"
                ? "Non"
                : "Non renseigné"}
            </div>
          </div>

          <div className="rounded-md border bg-background p-2">
            <div className="text-[11px] text-muted-foreground">
              Soumis(e) à l&apos;impôt aux États-Unis pour d&apos;autres motifs ?
            </div>
            <div className="font-semibold">
              {fatca?.isUsTaxableOther === "yes"
                ? "Oui"
                : fatca?.isUsTaxableOther === "no"
                ? "Non"
                : "Non renseigné"}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          (Ces réponses proviennent de votre questionnaire Santé &amp; Lifestyle.)
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">Exactitude et intégralité des renseignements</p>
        <p>
          Par leur signature, le preneur d&apos;assurance et les personnes assurées confirment l&apos;exactitude et
          l&apos;intégralité des renseignements fournis. AXA Vie SA peut résilier le contrat si les renseignements
          figurant dans les documents relatifs à la proposition sont inexacts ou incomplets (art. 6 LCA). Toute fausse
          déclaration peut entraîner des poursuites pénales.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">
          Convention relative aux contrats pour lesquels l&apos;âge ordinaire de la retraite AVS est dépassé
        </p>
        <p>
          Le proposant est conscient que le contrat d&apos;assurance ne peut être prolongé au-delà de l&apos;âge
          ordinaire de la retraite AVS que si l&apos;activité lucrative est maintenue. Il s&apos;engage à résilier le
          contrat dès lors qu&apos;il cesse son activité lucrative avant l&apos;échéance prévue, toutefois après avoir
          atteint l&apos;âge ordinaire de la retraite AVS.
        </p>
      </div>
    </div>

    {/* Lieu / Date en lecture seule */}
    <div className="rounded-lg border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Lieu</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {contact?.city ?? "—"}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Date</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {new Date().toLocaleDateString("fr-CH")}
          </div>
          <p className="text-[10px] text-muted-foreground">
            La date exacte enregistrée sera celle du moment où vous cliquez sur Continuer.
          </p>
        </div>
      </div>
    </div>

    <p className="text-xs text-muted-foreground">
      En cliquant sur <span className="font-medium">Continuer</span>, vous confirmez avoir lu et accepté ces éléments.
    </p>
  </div>
)}


{/* STEP 8 */}
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
        <p>+41 21 561 69 05</p>
        <p>info@moneylife.ch | info@creditx.ch</p>
      </div>

      <p>
        Nous conseillons nos clients de manière indépendante, en collaborant avec plusieurs compagnies
        d’assurance et de financement.
      </p>

      <div className="rounded-md border bg-muted/20 p-3 text-[12px]">
        <p>
          Numéro FINMA (CreditX) : <span className="font-medium">F01536084</span>
        </p>
        <p>
          Votre conseiller : <span className="font-medium">M. Habib Osmani</span> — FINMA{" "}
          <span className="font-medium">F01536085</span>
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">1. Mandant (Client)</p>
        <p>
          {(contact?.firstName ?? "—")} {(contact?.lastName ?? "")}
          <br />
          {contact?.street ?? "—"}
          <br />
          {(contact?.zip ?? "")} {(contact?.city ?? "")}
          <br />
          Date de naissance : {contact?.birthdate ?? "—"}
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">2. Objet du mandat</p>
        <p>
          Le Mandant confie au Mandataire la mission de le conseiller, de rechercher et de gérer ses solutions
          de prévoyance et d’assurance du 3ᵉ pilier (3a) ainsi que, le cas échéant, d’autres produits financiers
          connexes proposés via MoneyLife.ch. Le Mandataire agit en qualité d’intermédiaire non lié
          conformément à l’article 45 LSA.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">3. Étendue du mandat</p>
        <p>
          Le mandat comprend notamment : la collecte des informations nécessaires à l’analyse des besoins,
          la demande et la comparaison d’offres auprès de compagnies partenaires, la présentation de ces offres,
          l’assistance administrative lors de la souscription du contrat choisi, et le suivi des relations avec
          l’assureur dans la mesure du possible.
        </p>
        <p>
          Le Mandataire n’a aucun pouvoir de signature au nom du Mandant et ne peut conclure ou résilier un
          contrat d’assurance sans son accord explicite.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">4. Indépendance et transparence</p>
        <p>
          Le Mandataire exerce son activité en toute indépendance et n’est lié à aucune compagnie par un contrat
          d’exclusivité. Il informe le Mandant que des commissions de courtage peuvent être perçues auprès des
          assureurs partenaires et que ces commissions représentent la rémunération standard de l’intermédiation.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">5. Confidentialité et protection des données</p>
        <p>
          Les données personnelles du Mandant sont traitées conformément à la nLPD. Elles sont utilisées
          exclusivement pour l’analyse, la demande d’offres et la gestion des relations avec les assureurs.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">6. Durée et révocation</p>
        <p>
          Le mandat prend effet à la date de sa signature et reste valable jusqu’à révocation. Le Mandant peut
          révoquer le mandat à tout moment par email à info@creditx.ch.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">7. Responsabilité</p>
        <p>
          Le Mandataire agit avec diligence et compétence. Il ne saurait toutefois être tenu responsable de
          décisions, primes ou conditions émises par les assureurs, ni de toute omission d’information du Mandant.
        </p>
      </div>

      <div className="space-y-2 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">8. Droit applicable et for</p>
        <p>
          Le présent mandat est régi par le droit suisse. Le for juridique exclusif est au siège de CreditX Sàrl,
          sous réserve des dispositions légales impératives.
        </p>
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-[12px] text-muted-foreground">
        En cliquant sur <span className="font-medium text-foreground">Continuer</span>, vous confirmez avoir lu et accepté ce mandat.
      </div>
    </div>

    {/* Lieu / Date lecture seule */}
    <div className="rounded-lg border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Lieu</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {contact?.city ?? "—"}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Date</Label>
          <div className="h-9 flex items-center rounded-md border bg-muted/20 px-3 text-sm">
            {new Date().toLocaleDateString("fr-CH")}
          </div>
          <p className="text-[10px] text-muted-foreground">
            La date exacte enregistrée sera celle du moment où vous cliquez sur Continuer.
          </p>
        </div>
      </div>
    </div>
  </div>
)}


{/* STEP 9 */}
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

          { idFront?.url ? (
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Recto ajouté</span>
                </div>

                <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px]"
                    onClick={() => window.open(idFront.url, "_blank", "noopener,noreferrer")}
                >
                    Ouvrir
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[11px]"
                    onClick={() => setIdFront(null)}
                >
                    Remplacer
                </Button>
                </div>
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
                className={cn(
                "w-full h-[220px] rounded-md bg-white touch-none",
                signatureLocked && "opacity-60 pointer-events-none"
                )}
                disabled={uploadingIdSide === "front"}
                onClick={() => (document.getElementById("id-front") as HTMLInputElement | null)?.click()}
              >
                {uploadingIdSide === "front" ? "Upload…" : "Ajouter le recto"}
              </Button>
            </>
          )}
        </div>

        {/* Verso */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-[12px] font-medium">Verso</p>

          { idBack?.url ? (
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Verso ajouté</span>
                </div>

                <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px]"
                    onClick={() => window.open(idBack.url, "_blank", "noopener,noreferrer")}
                >
                    Ouvrir
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[11px]"
                    onClick={() => setIdBack(null)}
                >
                    Remplacer
                </Button>
                </div>
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
                onClick={() => (document.getElementById("id-back") as HTMLInputElement | null)?.click()}
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


{/* STEP 10 */}
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
      className={cn(
        "w-full h-[220px] rounded-md bg-white touch-none",
        signatureLocked && "opacity-60"
      )}
      onPointerDown={(e) => {
        if (signatureLocked) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        resizeCanvasToDisplaySize(canvas);

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

    {/* ✅ Overlay: si une signature existe, on l’affiche dans le pad */}
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
  {/* Effacer => confirmation + reset total */}
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        type="button"
        variant="outline"
        disabled={signatureUploading || signingDocsLoading}
      >
        Effacer
      </Button>
    </AlertDialogTrigger>

    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Recommencer la signature ?</AlertDialogTitle>
        <AlertDialogDescription>
          Cette action supprimera la signature actuelle et les documents signés générés.
          Vous devrez signer à nouveau.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel>Annuler</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => {
            // reset total
            clearSignature();         // reset canvas + signatureUrl/signaturePath
            setSignedDocs([]);        // supprime les docs téléchargeables
            setSignatureLocked(false);// réactive le pad
            hasInkRef.current = false;
            drawingRef.current = false;
          }}
        >
          Oui, recommencer
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  {/* Confirmer => seulement si pas lock */}
  {!signatureLocked && (
    <Button
      type="button"
      onClick={confirmSignatureUpload}
      disabled={signatureUploading || signingDocsLoading}
      className="gap-2"
    >
      <CheckCircle2 className="h-4 w-4" />
      {signatureUploading || signingDocsLoading ? "Traitement…" : "Confirmer"}
    </Button>
  )}
</div>

      {signatureLocked && (
        <div className="flex items-center gap-2 text-emerald-700 text-sm pt-1">
            <CheckCircle2 className="h-4 w-4" />
            <span>Signature confirmée</span>
        </div>
        )}

      {/* Documents signés à télécharger */}
{signingDocsLoading && (
  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
    Génération des documents signés…
  </div>
)}

{!signingDocsLoading && signedDocs.length > 0 && (
  <div className="rounded-lg border bg-background p-3 space-y-2">
    <p className="text-sm font-medium">Documents AXA signés</p>

    <div className="space-y-2">
      {signedDocs.map((d, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-2 rounded-md border bg-muted/10 px-3 py-2"
        >
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Document AXA signé {idx + 1}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-[11px]"
            onClick={() => window.open(d.url, "_blank", "noopener,noreferrer")}
          >
            Ouvrir / Télécharger
          </Button>
        </div>
      ))}
    </div>

    <p className="text-[10px] text-muted-foreground">
      Vous pouvez consulter / télécharger vos documents avant de continuer.
    </p>
  </div>
)}
{/* Mandat de gestion CreditX signé */}
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
      Ce mandat autorise CreditX à gérer votre dossier.
    </p>
  </div>
)}
    </div>
  </div>
)}


{/* STEP 11 */}
{step.id === "health" && (
  <div className="space-y-4">
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <p className="text-sm font-medium">Questionnaire de santé</p>
      <p className="text-xs text-muted-foreground">
        Pour valider cette offre, vous devez maintenant répondre à un questionnaire de santé.
      </p>

      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        <p className="text-[12px] text-muted-foreground">
          Cette page peut rester ouverte. Revenez dès que vous aurez répondu pour terminer le processus.
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

{/* STEP 12 */}
{step.id === "done" && (
  <div className="space-y-4">
    <div className="rounded-lg border bg-background p-4 space-y-2">
      <p className="text-base font-semibold">✅</p>

      {requiresHealth ? (
        <p className="text-sm text-muted-foreground">
          Votre proposition est maintenant en cours d’envoi. Dès que votre questionnaire de santé sera finalisé et étudié par AXA,
          nous vous informerons de la suite par email et sur votre dashboard MoneyLife.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Votre proposition est en cours de finalisation. Vous recevrez un email de confirmation et votre police
          vous sera bientôt disponible sur votre plateforme MoneyLife.
        </p>
      )}

      <Button
        type="button"
        className="w-full mt-2"
        onClick={() => router.push("/dashboard")}
      >
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