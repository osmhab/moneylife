"use client";

// Page d'accès au partage sécurisé : branding CreditX → demande de code OTP →
// saisie du code → affichage des documents (liens servis par session). Strings
// via le namespace SharePage (fr/de).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck, FileText, ExternalLink, Lock } from "lucide-react";

interface Props { shareId: string }
type Phase = "loading" | "intro" | "code" | "unlocked" | "dead";

interface Info { senderName: string; count: number; recipientHint: string; expired: boolean }
interface Doc { name: string; idx: number }

export default function ShareClient({ shareId }: Props) {
  const t = useTranslations("SharePage");
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [deadMsg, setDeadMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/share/${shareId}/info`);
        if (!res.ok) { setDeadMsg(t("not_found")); setPhase("dead"); return; }
        const data: Info = await res.json();
        if (data.expired) { setDeadMsg(t("expired")); setPhase("dead"); return; }
        setInfo(data);
        setPhase("intro");
      } catch {
        setDeadMsg(t("error_generic")); setPhase("dead");
      }
    })();
  }, [shareId, t]);

  const sendCode = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/share/${shareId}/send-code`, { method: "POST" });
      if (res.status === 410) { setDeadMsg(t("expired")); setPhase("dead"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || t("error_generic")); return; }
      setPhase("code");
    } catch { setError(t("error_generic")); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.trim().length < 6) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/share/${shareId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || t("error_generic")); return; }
      setToken(j.token); setDocs(j.documents || []); setPhase("unlocked");
    } catch { setError(t("error_generic")); }
    finally { setBusy(false); }
  };

  const fileUrl = (idx: number) =>
    `/api/share/${shareId}/file/${idx}?token=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        {/* Wordmark */}
        <div className="text-center mb-8">
          <span className="text-2xl font-black tracking-tight text-slate-900">CreditX</span>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-emerald-600">
            <ShieldCheck size={13} />
            <span className="text-[10px] font-black uppercase tracking-widest">{t("secure_space")}</span>
          </div>
        </div>

        <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 p-8">
          {phase === "loading" && (
            <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
          )}

          {phase === "dead" && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Lock size={26} />
              </div>
              <p className="font-bold text-slate-700">{deadMsg}</p>
            </div>
          )}

          {phase === "intro" && info && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5 text-indigo-600">
                <FileText size={26} />
              </div>
              <h1 className="text-xl font-black text-slate-900 leading-snug">
                {t("wants_to_share", { name: info.senderName, count: info.count })}
              </h1>
              <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">{t("intro")}</p>
              <button
                onClick={sendCode} disabled={busy}
                className="mt-7 w-full py-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-black text-sm uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                {t("get_code")}
              </button>
              {error && <p className="text-sm font-bold text-rose-500 mt-4">{error}</p>}
            </div>
          )}

          {phase === "code" && info && (
            <div className="text-center">
              <h1 className="text-lg font-black text-slate-900">{t("enter_code")}</h1>
              <p className="text-sm font-medium text-slate-500 mt-2">{t("code_sent", { hint: info.recipientHint })}</p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" autoFocus placeholder="••••••"
                className="mt-6 w-full text-center tracking-[0.5em] text-2xl font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl py-4 outline-none focus:border-indigo-500"
              />
              <button
                onClick={verify} disabled={busy || code.length < 6}
                className="mt-5 w-full py-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-black text-sm uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                {t("verify")}
              </button>
              {error && <p className="text-sm font-bold text-rose-500 mt-4">{error}</p>}
              <button onClick={sendCode} disabled={busy} className="mt-4 text-xs font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest">
                {t("resend")}
              </button>
            </div>
          )}

          {phase === "unlocked" && (
            <div>
              <h1 className="text-lg font-black text-slate-900 mb-5 text-center">{t("unlocked_title")}</h1>
              <div className="space-y-2">
                {docs.map((d) => (
                  <a
                    key={d.idx} href={fileUrl(d.idx)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <FileText size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-800 truncate">{d.name}</span>
                    </div>
                    <ExternalLink size={16} className="text-slate-300 group-hover:text-slate-700 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] font-medium text-slate-400 mt-6 leading-relaxed">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
