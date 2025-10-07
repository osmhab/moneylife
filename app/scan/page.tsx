// app/scan/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileUp, X, ShieldCheck } from "lucide-react";

/* Firebase */
import { storage, db, auth } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";

/* shadcn/ui */
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* Composants locaux */
import PreQuestionsStepper from "./_client/PreQuestionsStepper";
import TipsCarousel from "./_client/TipsCarousel";

/* Images */
import Image from "next/image";

type FileWithId = File & { _id?: string };
type UploadStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

export default function ScanPage() {
  const router = useRouter();

  /* ---------- Auth anonyme ---------- */
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) setUid(u.uid);
      else {
        const cred = await signInAnonymously(auth);
        setUid(cred.user.uid);
      }
    });
    return () => unsub();
  }, []);

  /* ---------- Token “métier” ---------- */
  const [clientToken, setClientToken] = useState<string>("");
  const batchPrefix = useMemo(() => (clientToken ? `offers/raw/${clientToken}` : ""), [clientToken]);
  useEffect(() => {
    if (!clientToken) setClientToken(crypto.randomUUID());
  }, [clientToken]);

  /* ---------- État UI ---------- */
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [showPreQuestions, setShowPreQuestions] = useState(false);
  const [preQuestionsComplete, setPreQuestionsComplete] = useState(false);

  const scanStarted =
    uploadStatus === "uploading" ||
    uploadStatus === "queued" ||
    uploadStatus === "processing";

  /* ---------- Progression d’analyse ---------- */
  const [analysisPct, setAnalysisPct] = useState(0);
  const rafRef = useRef<number | null>(null);
  const processingStartRef = useRef<number | null>(null);

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  useEffect(() => {
    stopRaf();

    if (uploadStatus === "idle" || uploadStatus === "error") {
      setAnalysisPct(0);
      return;
    }
    if (uploadStatus === "uploading") {
      setAnalysisPct((p) => Math.max(p, 15));
      return;
    }
    if (uploadStatus === "queued") {
      setAnalysisPct((p) => Math.max(p, 40));
      return;
    }
    if (uploadStatus === "processing") {
      const targetMs = 3 * 60 * 1000;
      const start = performance.now();
      processingStartRef.current = start;
      const base = Math.max(analysisPct, 50);
      const maxDuringProcessing = 90;

      const tick = (ts: number) => {
        const elapsed = ts - (processingStartRef.current ?? start);
        const t = Math.min(1, elapsed / targetMs);
        const eased = t * t * (3 - 2 * t);
        const next = base + (maxDuringProcessing - base) * eased;
        setAnalysisPct(next);
        if (t < 1 && uploadStatus === "processing") {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => stopRaf();
    }
    if (uploadStatus === "done") {
      setAnalysisPct(100);
      return;
    }
  }, [uploadStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Dropzone ---------- */
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files || []);
    addFiles(list);
  };
  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    addFiles(list);
    e.currentTarget.value = "";
  };
  const addFiles = (list: File[]) => {
    const accepted = list.filter(
      (f) => /(\.pdf$)|(^image\/)/i.test(f.type) || /\.pdf$/i.test(f.name)
    );
    const withIds = accepted.map((f) => {
      (f as FileWithId)._id = crypto.randomUUID();
      return f as FileWithId;
    });
    setFiles((prev) => [...prev, ...withIds]);
  };
  const removeFile = (id?: string) => {
    setFiles((prev) => prev.filter((f) => f._id !== id));
  };

  /* ---------- Démarrer upload + Stepper ---------- */
  const uploadAll = async () => {
    if (!clientToken) setClientToken(crypto.randomUUID());
    if (!files.length) {
      setError("Ajoute au moins un document (PDF/JPG/PNG).");
      return;
    }
    setError(null);
    setIsUploading(true);
    setUploadStatus("uploading");
    setShowPreQuestions(true);

    try {
      if (uid) {
        await setDoc(
          doc(db, "clients", uid),
          {
            token: clientToken,
            anonymous: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await setDoc(
        doc(db, "clients", clientToken),
        { fromUid: uid ?? null, updatedAt: serverTimestamp() },
        { merge: true }
      );

      for (const f of files) {
        const path = `${batchPrefix}/${encodeURIComponent(f.name)}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, f);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Échec de l’upload.");
      setIsUploading(false);
      setUploadStatus("error");
      return;
    }

    setIsUploading(false);
    setUploadStatus("queued");
    await triggerParse();
  };

  /* ---------- Lancer le parsing ---------- */
  const triggerParse = async () => {
    setIsParsing(true);
    setUploadStatus("processing");
    setError(null);

    try {
      const res = await fetch(
        `/api/jobs/parse?token=${encodeURIComponent(clientToken)}&prefix=${encodeURIComponent(batchPrefix)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Parse failed");
      }
      const data = await res.json().catch(() => ({}));
      const analysisId: string | undefined = data?.analysisId;

      setIsParsing(false);
      setUploadStatus("done");
      setShowPreQuestions(false);

      if (analysisId) router.push(`/analyse/${analysisId}`);
      else router.push(`/analyse/${clientToken}`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Impossible de lancer l’analyse.");
      setIsParsing(false);
      setUploadStatus("error");
    }
  };

  /* ---------- Accessibilité ---------- */
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  /* ---------- UI Helpers ---------- */
  const Primary = "#0030A8";
  const Success = "#4fd1c5";

  return (
    <main className="mx-auto min-h-[100dvh] max-w-5xl px-4 pb-28 pt-10 sm:pt-12">
      {/* Ruban sticky pendant le scan */}
      {scanStarted && (
        <div className="sticky top-2 z-40">
          <div className="mx-auto max-w-5xl rounded-2xl border bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--primary-10,#0030A81A)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0030A8]" />
                </span>
                <div className="leading-tight">
                  <div className="text-sm">
                    {uploadStatus === "uploading"
                      ? "Envoi en cours…"
                      : uploadStatus === "queued"
                      ? "Mise en file…"
                      : uploadStatus === "processing"
                      ? "Analyse en cours…"
                      : "Préparation…"}
                  </div>
                  <div className="mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(analysisPct)}%`,
                        background:
                          "linear-gradient(90deg, #0030A8, #4fd1c5)",
                        transition: "width 300ms ease",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-sm font-medium tabular-nums">{Math.round(analysisPct)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* En-tête “Stripe-like” (masqué pendant le scan) */}
      {!scanStarted && (
        <Card className="mb-6 bg-white/70 backdrop-blur supports-[backdrop-filter]:border-gray-200/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl sm:text-2xl">Scanner votre 2e pilier (LPP)</CardTitle>
            <CardDescription className="text-[13px] sm:text-sm">
              Déposez vos certificats LPP (PDF ou images). Nous analysons automatiquement et
              vous présentons votre étude de prévoyance en ~3 minutes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Zone centrale */}
      {!scanStarted ? (
        <Card className="border-slate-200/70">
          <CardContent className="p-5 sm:p-6">
            {/* Dropzone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:border-[#0030A8] focus-within:border-[#0030A8]"
            >
              {/* Halo animé au drag */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-2 ring-[#4fd1c5] transition-opacity group-hover:opacity-30" />

              {/* Icône */}
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-50">
                <Image
                  src="/images/certifLPP.svg"
                  alt="Certificat LPP"
                  width={84}
                  height={84}
                  className="object-contain"
                />
              </div>

              {/* Texte */}
              <div>
                <p className="mb-1 font-medium">Glisse-dépose ton certificat LPP ici</p>
                <p className="text-xs text-slate-500">Formats acceptés : PDF, JPG, PNG</p>
              </div>

              {/* Boutons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild className="rounded-2xl">
                  <label htmlFor="scan-file-input" className="cursor-pointer">
                    <FileUp className="mr-2 h-4 w-4" />
                    Sélectionner des fichiers
                  </label>
                </Button>
                <input
                  id="scan-file-input"
                  type="file"
                  className="sr-only"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={onSelect}
                />
                <span className="text-xs text-slate-500">ou déposez-les directement</span>
              </div>

              {/* Liste fichiers */}
              {files.length > 0 && (
                <ul className="mt-6 flex w-full flex-wrap items-center gap-2">
                  {files.map((f) => (
                    <li
                      key={f._id}
                      className="inline-flex max-w-full items-center gap-2 truncate rounded-full border bg-white px-3 py-1.5 text-sm shadow-sm"
                      title={f.name}
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        onClick={() => removeFile(f._id)}
                        className="rounded-full p-1 hover:bg-slate-100"
                        aria-label={`Retirer ${f.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Réassurance */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border bg-slate-50 p-4">
              <div className="flex-shrink-0 rounded-full bg-[#0030A8]/10 p-2">
                <ShieldCheck className="h-5 w-5 text-[#0030A8]" />
              </div>
              <div className="text-xs leading-relaxed text-slate-600">
                <p className="font-medium text-slate-800">Vos données sont sécurisées</p>
                <p>
                  Documents chiffrés et stockés en Suisse. Aucune transmission à des tiers sans
                  votre accord. Utilisation uniquement pour votre analyse et les offres demandées.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        // État “scan en cours” : Tips en focus
        <section className="mt-4">
          <h2 className="mb-2 px-1 text-lg font-semibold">Saviez-vous</h2>
          <div className="min-h-[60vh]">
            <TipsCarousel
              variant="saviez-vous"
              auto
              intervalMs={7000}
              clientToken={clientToken}
              full
              showTitle={false}
              showTimer
            />
          </div>
        </section>
      )}

      {/* Dock d’actions bas de page */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="hidden text-xs text-slate-500 sm:block">
            Palette : <span className="font-mono">#0030A8</span> /{" "}
            <span className="font-mono">#4fd1c5</span> / <span className="font-mono">#F59E0B</span>
          </p>
          <div className="ml-auto flex gap-2">
            {!scanStarted && (
              <Button
                onClick={async () => {
                  setError(null);
                  try {
                    const configId = crypto.randomUUID();
                    await setDoc(doc(db, "configs", configId), {
                      createdAt: serverTimestamp(),
                      clientToken,
                      uid: uid ?? null,
                      source: "manual",
                      sexe: null,
                      preset: "Recommandation",
                      step: "configurator",
                    });
                    router.push(`/configure/${configId}`);
                  } catch (e: any) {
                    console.error(e);
                    setError(e?.message ?? "Impossible de créer la configuration.");
                  }
                }}
                disabled={isUploading || isParsing}
                variant="outline"
                className="rounded-2xl"
              >
                Bypass (configurer sans scan)
              </Button>
            )}
            <Button
              onClick={uploadAll}
              disabled={!uid || isUploading || isParsing || files.length === 0 || scanStarted}
              className="rounded-2xl"
            >
              {isUploading ? "Envoi en cours…" : isParsing ? "Analyse…" : "Scanner mes documents"}
            </Button>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {!isOnline && (
        <Alert className="mt-6">
          <AlertDescription>
            Vous êtes hors ligne. Les enregistrements seront mis en file d’attente et repris automatiquement.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stepper des pré-questions */}
      {showPreQuestions && uid && clientToken && (
        <PreQuestionsStepper
          clientDocPath={`clients/${uid}`}
          clientToken={clientToken}
          open={showPreQuestions}
          onExit={() => setShowPreQuestions(false)}
          onComplete={() => {
            setPreQuestionsComplete(true);
            setShowPreQuestions(false);
          }}
        />
      )}
    </main>
  );
}
