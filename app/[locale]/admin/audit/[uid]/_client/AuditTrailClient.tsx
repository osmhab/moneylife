"use client";

// Piste d'audit d'un client — vue CRM inaltérable.
// Lit auditTrail/{uid}/events en temps réel (règles : lecture interne seule),
// avec filtres (type, période, texte) et export PDF pour transmission FINMA.

import React, { useEffect, useMemo, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { AUDIT_LABELS, type AuditEventType } from "lib/shared/core/audit";
import { Loader2, FileDown, ShieldCheck, Search } from "lucide-react";

type Row = {
  id: string;
  type: AuditEventType;
  at?: { seconds: number };
  summary?: string;
  actorType?: string;
  changes?: { label: string; before: unknown; after: unknown }[];
  document?: { docType?: string; method?: string; sourceUrl?: string } | null;
};

const fmt = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

const fmtDate = (s?: { seconds: number }) =>
  s?.seconds
    ? new Date(s.seconds * 1000).toLocaleString("fr-CH", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "—";

export default function AuditTrailClient({ uid }: { uid: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | AuditEventType>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "auditTrail", uid, "events"), orderBy("at", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Row)),
      (err) => { console.error("[audit] listener:", err); setRows([]); }
    );
    return () => unsub();
  }, [uid]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (search && !`${AUDIT_LABELS[r.type]} ${r.summary}`.toLowerCase().includes(search.toLowerCase())) return false;
      const t = r.at?.seconds ? r.at.seconds * 1000 : 0;
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime() + 86_400_000) return false;
      return true;
    });
  }, [rows, typeFilter, search, from, to]);

  const exportPdf = async () => {
    setDownloading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/audit/${uid}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export refusé");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `audit-${uid}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("L'export PDF a échoué.");
    } finally {
      setDownloading(false);
    }
  };

  if (rows === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Chargement de la piste d'audit…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-900">
      {/* En-tête */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white"><ShieldCheck size={22} /></div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Piste d'audit</h1>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">{uid}</p>
            </div>
          </div>
          <button
            onClick={exportPdf}
            disabled={downloading}
            className="px-5 py-3 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-full flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
            Exporter le PDF
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-bold outline-none">
            <option value="all">Tous les types</option>
            {(Object.keys(AUDIT_LABELS) as AuditEventType[]).map((t) => (
              <option key={t} value={t}>{AUDIT_LABELS[t]}</option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-bold outline-none" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-bold outline-none" />
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{filtered.length} événement{filtered.length > 1 ? "s" : ""}</span>
        </div>

        {/* Tableau */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-slate-100 px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-widest">
            <div className="col-span-3">Date & heure</div>
            <div className="col-span-3">Type</div>
            <div className="col-span-6">Détail</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Aucun événement pour ces filtres.</div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-slate-100 text-sm">
                <div className="col-span-3 font-mono text-[12px] text-slate-500">{fmtDate(r.at)}</div>
                <div className="col-span-3 font-black text-slate-900">{AUDIT_LABELS[r.type] ?? r.type}</div>
                <div className="col-span-6 text-slate-700">
                  <p>{r.summary}</p>
                  {(r.changes ?? []).map((c, j) => (
                    <p key={j} className="text-[12px] text-slate-500 mt-0.5">• {c.label} : {fmt(c.before)} → {fmt(c.after)}</p>
                  ))}
                  {r.document && (
                    <a href={r.document.sourceUrl} target="_blank" rel="noreferrer"
                       className="text-[12px] text-blue-600 font-bold mt-0.5 inline-block">
                      📎 {r.document.docType || "Document"}{r.document.method ? ` (${r.document.method})` : ""}
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
