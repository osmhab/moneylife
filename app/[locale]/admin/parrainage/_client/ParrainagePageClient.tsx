"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";

type Parrain = { uid: string; name: string; iban: string; method: string; phone: string; email: string };
type Due = { id: string; amountCHF: number; refereeName: string; refereeUid: string | null; rewardDueAt: number | null; parrain: Parrain };
type Settings = { amountCHF: number; promoAmountCHF: number; promoUntil: number };

export default function ParrainagePageClient() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({ amountCHF: 80, promoAmountCHF: 0, promoUntil: 0 });
  const [currentAmount, setCurrentAmount] = useState(80);
  const [due, setDue] = useState<Due[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  async function token() {
    const u = auth.currentUser;
    if (!u) throw new Error("Non authentifié");
    return u.getIdToken();
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/parrainage", { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Erreur");
      setSettings(j.settings);
      setCurrentAmount(j.currentAmount);
      setDue(j.due || []);
    } catch (e: any) {
      toast.error(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/parrainage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ action: "settings", ...settings }),
      });
      if (!res.ok) throw new Error();
      toast.success("Barème enregistré ✅");
      await load();
    } catch {
      toast.error("Erreur d'enregistrement");
    } finally {
      setSavingSettings(false);
    }
  }

  async function act(id: string, action: "pay" | "cancel") {
    try {
      const res = await fetch("/api/admin/parrainage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) throw new Error();
      toast.success(action === "pay" ? "Marqué payé ✅" : "Annulé");
      setDue((d) => d.filter((x) => x.id !== id));
    } catch {
      toast.error("Erreur");
    }
  }

  const promoActive = settings.promoAmountCHF > 0 && settings.promoUntil > Date.now();
  const dateInput = settings.promoUntil ? new Date(settings.promoUntil).toISOString().slice(0, 10) : "";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Parrainage</h1>

      {/* Barème */}
      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Barème de récompense</h2>
          <span className="text-sm text-slate-500">
            En vigueur : <b className="text-slate-900">{currentAmount} CHF</b>
            {promoActive ? " (promo)" : ""}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="text-sm">
            <span className="text-slate-500">Montant de base (CHF)</span>
            <input type="number" className="mt-1 w-full rounded-lg border px-3 py-2"
              value={settings.amountCHF}
              onChange={(e) => setSettings((s) => ({ ...s, amountCHF: Number(e.target.value) }))} />
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Promo (CHF, 0 = aucune)</span>
            <input type="number" className="mt-1 w-full rounded-lg border px-3 py-2"
              value={settings.promoAmountCHF}
              onChange={(e) => setSettings((s) => ({ ...s, promoAmountCHF: Number(e.target.value) }))} />
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Promo jusqu'au</span>
            <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2"
              value={dateInput}
              onChange={(e) => setSettings((s) => ({ ...s, promoUntil: e.target.value ? new Date(e.target.value).getTime() : 0 }))} />
          </label>
        </div>
        <button onClick={saveSettings} disabled={savingSettings}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {savingSettings ? "Enregistrement…" : "Enregistrer le barème"}
        </button>
      </div>

      {/* Récompenses à payer */}
      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold mb-3">Récompenses à verser ({due.length})</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Chargement…</p>
        ) : due.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune récompense en attente. 🎉</p>
        ) : (
          <div className="space-y-3">
            {due.map((d) => (
              <div key={d.id} className="rounded-xl border p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">{d.parrain.name} <span className="text-slate-400 font-normal">← filleul {d.refereeName}</span></div>
                  <div className="text-sm text-slate-500 break-all">
                    IBAN {d.parrain.iban || "— (à demander au parrain)"}
                    {d.parrain.email ? ` · ${d.parrain.email}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold whitespace-nowrap">{d.amountCHF} CHF</span>
                  <button onClick={() => act(d.id, "pay")} className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm font-semibold">Marquer payé</button>
                  <button onClick={() => act(d.id, "cancel")} className="rounded-lg border px-3 py-2 text-sm text-slate-500">Annuler</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
