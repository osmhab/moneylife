//app/scan/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { storage, db } from "@/lib/firebase"; // suppose que firebase.ts exporte { storage, db }
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

type FileWithId = File & { _id?: string };

export default function ScanPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client token pour relier tout le flux
  const clientToken = useMemo(() => crypto.randomUUID(), []);
  // Un préfixe dédié au lot, pratique pour /api/jobs/parse
  const batchPrefix = useMemo(() => `offers/raw/${clientToken}`, [clientToken]);

  // Drag & drop handlers
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files || []);
    addFiles(list);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    addFiles(list);
    // reset input pour pouvoir re-sélectionner les mêmes fichiers
    e.currentTarget.value = "";
  };

  const addFiles = (list: File[]) => {
    const accepted = list.filter((f) =>
      /(\.pdf$)|(^image\/)/i.test(f.type) || /\.pdf$/i.test(f.name)
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

  const uploadAll = async () => {
    if (!files.length) {
      setError("Ajoute au moins un document (PDF/JPG/PNG).");
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      // Upload chaque fichier sous offers/raw/{clientToken}/{filename}
      for (const f of files) {
        const path = `${batchPrefix}/${encodeURIComponent(f.name)}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, f);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Échec de l’upload.");
      setIsUploading(false);
      return;
    }
    setIsUploading(false);
    await triggerParse();
  };

  const triggerParse = async () => {
    setIsParsing(true);
    setError(null);
    try {
      // On appelle l’API parse en lui donnant le token client + le prefix de batch
      const res = await fetch(
        `/api/jobs/parse?token=${encodeURIComponent(
          clientToken
        )}&prefix=${encodeURIComponent(batchPrefix)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Parse failed");
      }
      const data = await res.json().catch(() => ({}));
      // Convention: l’API renvoie { analysisId } (ou à défaut, on peut afficher un toast)
      const analysisId: string | undefined = data?.analysisId;
      if (analysisId) {
        router.push(`/analyse/${analysisId}`);
      } else {
        // fallback: si pas d’id, on redirige vers l’analyse générique liée au token
        router.push(`/analyse/${clientToken}`);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Impossible de lancer l’analyse.");
      setIsParsing(false);
    }
  };

  const bypassToConfigurator = async () => {
    setError(null);
    try {
      // Crée une config minimale côté client (dev-friendly)
      const configId = crypto.randomUUID();
      await setDoc(doc(db, "configs", configId), {
        createdAt: serverTimestamp(),
        clientToken,
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
  };

  useEffect(() => {
    // Accessibilité: empêcher le navigateur d’ouvrir le fichier lors d’un drop
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <main className="min-h-[calc(100dvh-4rem)] mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Scanner mon 2e pilier (LPP)</h1>
        <p className="text-sm text-gray-500 mt-2">
          Dépose tes certificats LPP (PDF ou images). Nous analysons automatiquement et te
          proposons une configuration 3a adaptée.
        </p>
      </header>

      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-[#0030A8] transition-colors bg-white"
      >
        <p className="mb-3">Glisse-dépose tes fichiers ici</p>
        <p className="text-xs text-gray-500 mb-4">Formats acceptés : PDF, JPG, PNG</p>
        <label className="inline-block cursor-pointer rounded-2xl border px-4 py-2 hover:bg-gray-50">
          Sélectionner des fichiers
          <input
            type="file"
            className="sr-only"
            multiple
            accept="application/pdf,image/*"
            onChange={onSelect}
          />
        </label>

        {/* Liste fichiers */}
        {files.length > 0 && (
          <ul className="mt-6 text-left space-y-2">
            {files.map((f) => (
              <li
                key={f._id}
                className="flex items-center justify-between rounded-xl border px-3 py-2"
              >
                <span className="truncate max-w-[75%]">{f.name}</span>
                <button
                  onClick={() => removeFile(f._id)}
                  className="text-sm underline hover:no-underline"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={uploadAll}
          disabled={isUploading || isParsing || files.length === 0}
          className="rounded-2xl px-5 py-2.5 bg-[#0030A8] text-white disabled:opacity-50"
        >
          {isUploading ? "Envoi en cours…" : isParsing ? "Analyse…" : "Scanner mes documents"}
        </button>

        <button
          onClick={bypassToConfigurator}
          disabled={isUploading || isParsing}
          className="rounded-2xl px-5 py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Bypass (configurer sans scan)
        </button>

        <div className="ml-auto text-xs text-gray-500 self-center">
          <span className="inline-block rounded-full border px-2 py-1">
            Token client: {clientToken.slice(0, 8)}…
          </span>
        </div>
      </div>

      {/* Alerte */}
      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Note UI palette */}
      <p className="mt-8 text-xs text-gray-500">
        Palette: primary <span className="font-mono">#0030A8</span>, success{" "}
        <span className="font-mono">#4fd1c5</span>, warning{" "}
        <span className="font-mono">#F59E0B</span>.
      </p>
    </main>
  );
}
