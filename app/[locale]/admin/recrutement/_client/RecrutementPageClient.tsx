// app/[locale]/admin/recrutement/_client/RecrutementPageClient.tsx
//
// Back-office des candidatures déposées sur /careers.
//
// ⚠️ Les données NE transitent PAS par le SDK Firestore du navigateur : elles
// passent par /api/admin/careers/applications (Admin SDK + `requireInternal`).
// Un dossier contient du casier judiciaire et des poursuites — rien de tout cela
// ne doit être lisible côté client, et l'écran ne dépend ainsi d'aucune règle
// Firestore déployée. Téléchargement des pièces via /api/admin/files/view.

"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Search, Mail, Phone, MapPin, Linkedin, Download, Trash2, Loader2,
  Briefcase, FileText, Inbox, Calendar, RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getJob, describeAnswer } from "@/lib/core/jobs";

type StoredDoc = {
  slotId: string;
  slotLabel: string;
  fileName: string;
  path: string;
  size: number;
  contentType: string;
};

type Application = {
  id: string;
  reference: string;
  jobSlug: string;
  jobTitle: string;
  jobLocation?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city?: string | null;
  linkedin?: string | null;
  message?: string | null;
  answers: Record<string, string>;
  /** Texte libre exigé par certaines options (ex. « Autre formation »). */
  precisions?: Record<string, string>;
  documents: StoredDoc[];
  status: string;
  /** ISO 8601 — sérialisé par la route serveur. */
  createdAt?: string | null;
};

const STATUSES = [
  { value: "nouveau", label: "Nouveau", className: "bg-blue-100 text-blue-700" },
  { value: "en_cours", label: "En cours", className: "bg-amber-100 text-amber-700" },
  { value: "entretien", label: "Entretien", className: "bg-violet-100 text-violet-700" },
  { value: "recrute", label: "Recruté", className: "bg-emerald-100 text-emerald-700" },
  { value: "refuse", label: "Refusé", className: "bg-slate-200 text-slate-600" },
];

function statusMeta(value: string) {
  return STATUSES.find((s) => s.value === value) ?? STATUSES[0];
}

function formatDate(app: Application) {
  if (!app.createdAt) return "—";
  const d = new Date(app.createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function RecrutementPageClient() {
  const [apps, setApps] = React.useState<Application[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Chaque appel serveur porte le jeton Firebase de l'admin connecté.
  const authedFetch = React.useCallback(async (init?: RequestInit) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("NO_TOKEN");
    return fetch("/api/admin/careers/applications", {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }, []);

  // On attend la restauration de la session : sans jeton, la route répond 401.
  React.useEffect(() => onAuthStateChanged(auth, (u) => setReady(!!u)), []);

  const load = React.useCallback(async () => {
    try {
      const res = await authedFetch();
      if (res.status === 401 || res.status === 403) {
        setError("Votre compte n'a pas accès aux candidatures (compte interne requis).");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setApps(data.applications ?? []);
      setError(null);
    } catch (e) {
      console.error("[recrutement]", e);
      setError("Lecture des candidatures impossible.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  React.useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!term) return true;
      return [a.firstName, a.lastName, a.email, a.reference, a.jobTitle]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [apps, search, statusFilter]);

  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null;

  async function changeStatus(app: Application, status: string) {
    // Optimiste : le select doit répondre immédiatement, la route confirme après.
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
    try {
      const res = await authedFetch({ method: "PATCH", body: JSON.stringify({ id: app.id, status }) });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Statut mis à jour");
    } catch {
      toast.error("Mise à jour impossible");
      void load(); // remet l'affichage en phase avec le serveur
    }
  }

  async function removeApplication(app: Application) {
    if (!confirm(`Supprimer définitivement la candidature de ${app.firstName} ${app.lastName} , pièces jointes comprises ?`)) return;
    try {
      const res = await authedFetch({ method: "DELETE", body: JSON.stringify({ id: app.id }) });
      if (!res.ok) throw new Error(String(res.status));
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      toast.success("Candidature et pièces supprimées");
    } catch {
      toast.error("Suppression impossible");
    }
  }

  async function download(d: StoredDoc) {
    setDownloading(d.path);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("no token");
      const res = await fetch(`/api/admin/files/view?path=${encodeURIComponent(d.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Téléchargement impossible");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
          <Briefcase className="text-blue-600" size={28} />
          Recrutement
        </h1>
        <p className="mt-2 text-sm text-slate-500 font-medium">
          Candidatures déposées depuis la page Carrières du site.
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-4 p-5 rounded-2xl bg-red-50 border border-red-100">
          <p className="flex-1 text-sm font-bold text-red-800">{error}</p>
          <Button
            variant="outline"
            onClick={() => { setLoading(true); void load(); }}
            className="h-10 px-4 rounded-xl font-bold text-sm border-red-200 bg-white"
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom, un e-mail, une référence…"
            className="h-12 pl-11 rounded-xl bg-white border-slate-200 font-medium"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* La liste n'est plus temps réel (lecture serveur) : rafraîchissement manuel. */}
          <Button
            variant="outline"
            onClick={() => void load()}
            className="h-12 w-12 p-0 rounded-xl border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            aria-label="Rafraîchir"
          >
            <RefreshCw size={16} />
          </Button>
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Toutes ({apps.length})
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>
              {s.label} ({apps.filter((a) => a.status === s.value).length})
            </FilterChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-500 py-20 justify-center">
          <Loader2 className="animate-spin" size={18} /> Chargement…
        </div>
      ) : apps.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* LISTE */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-6 text-sm text-slate-500 font-medium">Aucun résultat.</p>
            )}
            {filtered.map((a) => {
              const meta = statusMeta(a.status);
              const active = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left p-5 transition-colors ${active ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-black text-slate-900 truncate">
                      {a.firstName} {a.lastName}
                    </p>
                    <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 font-medium truncate">{a.jobTitle}</p>
                  <p className="mt-2 text-xs text-slate-400 font-bold">{formatDate(a)} · {a.reference}</p>
                </button>
              );
            })}
          </div>

          {/* DÉTAIL */}
          {selected ? (
            <ApplicationDetail
              app={selected}
              onStatus={changeStatus}
              onDelete={removeApplication}
              onDownload={download}
              downloading={downloading}
            />
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center text-slate-500 font-medium">
              Sélectionnez une candidature.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-16 text-center">
      <Inbox size={40} className="mx-auto text-slate-300 mb-4" />
      <p className="text-lg font-black text-slate-900">Aucune candidature pour l&apos;instant</p>
      <p className="mt-2 text-sm text-slate-500 font-medium">
        Les dépôts effectués sur /careers apparaîtront ici en temps réel.
      </p>
    </div>
  );
}

function ApplicationDetail({
  app, onStatus, onDelete, onDownload, downloading,
}: {
  app: Application;
  onStatus: (a: Application, s: string) => void;
  onDelete: (a: Application) => void;
  onDownload: (d: StoredDoc) => void;
  downloading: string | null;
}) {
  const job = getJob(app.jobSlug);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-7 md:p-9">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {app.firstName} {app.lastName}
          </h2>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            {app.jobTitle}{app.jobLocation ? ` · ${app.jobLocation}` : ""}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-slate-400">
            <Calendar size={13} /> {formatDate(app)} · Réf. {app.reference}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={app.status}
            onChange={(e) => onStatus(app, e.target.value)}
            className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => onDelete(app)}
            className="h-11 w-11 p-0 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
            aria-label="Supprimer"
          >
            <Trash2 size={17} />
          </Button>
        </div>
      </div>

      {/* Coordonnées */}
      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ContactRow icon={Mail} href={`mailto:${app.email}`}>{app.email}</ContactRow>
        <ContactRow icon={Phone} href={`tel:${app.phone}`}>{app.phone}</ContactRow>
        {app.city && <ContactRow icon={MapPin}>{app.city}</ContactRow>}
        {app.linkedin && (
          <ContactRow
            icon={Linkedin}
            href={app.linkedin.startsWith("http") ? app.linkedin : `https://${app.linkedin}`}
          >
            {app.linkedin}
          </ContactRow>
        )}
      </div>

      {/* Pré-qualification */}
      <Section title="Pré-qualification">
        <ul className="space-y-3">
          {(job?.screening ?? []).map((q) => (
            <li key={q.id} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
              <span className="text-sm text-slate-500 font-medium sm:w-1/2 shrink-0">{q.label}</span>
              <span className="text-sm text-slate-900 font-bold">
                {describeAnswer(job!, q.id, app.answers?.[q.id] ?? "", app.precisions?.[q.id])}
              </span>
            </li>
          ))}
          {!job && (
            <li className="text-sm text-slate-500 font-medium">
              Offre retirée du site — réponses brutes : {JSON.stringify(app.answers)}
            </li>
          )}
        </ul>
      </Section>

      {/* Message */}
      {app.message && (
        <Section title="Message">
          <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{app.message}</p>
        </Section>
      )}

      {/* Documents */}
      <Section title={`Documents (${app.documents?.length ?? 0})`}>
        <ul className="space-y-2">
          {(app.documents ?? []).map((d) => (
            <li
              key={d.path}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200"
            >
              <FileText size={16} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{d.slotLabel}</p>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {d.fileName} · {formatBytes(d.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => onDownload(d)}
                disabled={downloading === d.path}
                className="h-9 px-3 rounded-lg text-blue-600 hover:bg-blue-50 font-bold text-sm shrink-0"
              >
                {downloading === d.path ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 pt-7 border-t border-slate-100">
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function ContactRow({
  icon: Icon, href, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href?: string;
  children: React.ReactNode;
}) {
  const content = (
    <span className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
      <Icon size={15} className="text-slate-400 shrink-0" />
      <span className="text-sm font-bold text-slate-900 truncate">{children}</span>
    </span>
  );
  if (!href) return content;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition">
      {content}
    </a>
  );
}
