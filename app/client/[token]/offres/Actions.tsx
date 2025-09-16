"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  quoteId: string;
  partnerEmail: string;
  clientToken: string;
};

export default function Actions({ quoteId, partnerEmail, clientToken }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function chooseAndSign() {
    if (!partnerEmail) {
      setErr("Aucune adresse partenaire trouvée pour cette offre.");
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/quotes/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          clientToken,
          partnerEmail,
          cc: ["offers@moneylife.ch"],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Handoff failed");
      }
      setChosen(true);
      setMsg("Transmission envoyée. Vous serez contacté pour finaliser la signature.");
      // force un rafraîchissement des données côté serveur (quotes.status mis à jour)
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Impossible d’envoyer la passation.");
    } finally {
      setLoading(false);
    }
  }

  if (chosen) {
    return <span className="text-xs text-[#0f766e]">Choisie</span>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        onClick={chooseAndSign}
        disabled={loading}
        className="rounded-2xl px-4 py-2 bg-[#0030A8] text-white disabled:opacity-60"
        title="Choisir & signer"
      >
        {loading ? "Envoi…" : "Choisir & signer"}
      </button>
      {msg && <div className="text-sm text-[#0030A8]">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}
