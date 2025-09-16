// app/analyse/_components/PrefillConfiguratorButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  clientToken: string;
  payload: {
    sexe: string | null;
    primeMonthlyMin: number;
    primeMonthlyMax: number;
    renteAiMonthlyTarget: number;
    capitalDecesTarget: number;
    source?: string;
  };
};

export default function PrefillConfiguratorButton({ clientToken, payload }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const onClick = async () => {
    try {
      setLoading(true);
      setErr(null);

      const res = await fetch("/api/configs/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientToken, ...payload }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Une erreur est survenue");
      }

      const j = await res.json();
      const configId = j?.configId as string | undefined;
      if (configId) {
        router.push(`/configure/${configId}`);
      } else {
        throw new Error("configId manquant");
      }
    } catch (e: any) {
      setErr(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-2xl border bg-[#0030A8] px-4 py-2 text-white shadow hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Création en cours…" : "Pré-remplir et continuer"}
      </button>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {!err && !loading && (
        <p className="mt-2 text-xs text-gray-500">
          Astuce : vous pourrez ajuster la prime, la rente AI et le capital décès dans le configurateur.
        </p>
      )}
    </div>
  );
}
