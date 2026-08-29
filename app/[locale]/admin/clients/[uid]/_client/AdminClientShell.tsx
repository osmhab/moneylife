"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Badge } from "@/components/ui/badge";
import {
  UserRound,
  FileText,
  Sparkles,
  PenTool,
  Calculator,
  StickyNote,
  ChevronRight,
  Users,
  Copy,
  Check,
} from "lucide-react";

function isActive(pathname: string, href: string) {
  // active si exact match, ou si la route commence par href (sauf pour overview)
  if (href.endsWith("/clients/" + href.split("/").pop())) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function computeAge(birth?: string): number | null {
  if (!birth) return null;
  // format attendu dd.MM.yyyy
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(birth.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const dob = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const mm = now.getMonth() - dob.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

type ClientHeader = {
  fullName: string;
  initials: string;
  email: string;
  status: string;
  age: number | null;
};

export default function AdminClientShell({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/admin/clients/${uid}`;

  const [header, setHeader] = React.useState<ClientHeader | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cSnap, dpSnap] = await Promise.all([
          getDoc(doc(db, "clients", uid)),
          getDoc(doc(db, "clients", uid, "DonneePersonnelles", "current")),
        ]);
        const c = cSnap.exists() ? (cSnap.data() as any) : {};
        const dp = dpSnap.exists() ? (dpSnap.data() as any) : {};

        const first = dp.Enter_prenom || c.firstName || "";
        const last = dp.Enter_nom || c.lastName || "";
        const fullName = `${first} ${last}`.trim() || "Client sans nom";
        const initials =
          `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

        if (!cancelled) {
          setHeader({
            fullName,
            initials,
            email: dp.Enter_email || c.email || "",
            status: (c.status || "").toString(),
            age: computeAge(dp.Enter_dateNaissance),
          });
        }
      } catch {
        if (!cancelled) setHeader(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const tabs = [
    { href: base, label: "Aperçu", icon: UserRound, badge: null as null | string },
    { href: `${base}/donnees-personnelles`, label: "Données perso", icon: FileText, badge: null },
    { href: `${base}/analyse-prevoyance`, label: "Analyse conseiller", icon: Calculator, badge: null },
    { href: `${base}/conseils`, label: "Notes d'entretien", icon: StickyNote, badge: null },
    { href: `${base}/config-3a`, label: "Config 3a", icon: Sparkles, badge: "bientôt" },
    { href: `${base}/offres`, label: "Offres", icon: PenTool, badge: "bientôt" },
  ];

  const statusStyle = (s: string) => {
    const v = s.toLowerCase();
    if (v === "deleted") return "bg-rose-50 text-rose-600 border-rose-200";
    if (v === "active" || v === "client") return "bg-emerald-50 text-emerald-600 border-emerald-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-6 space-y-5">
        {/* Fil d'Ariane — retour à la recherche sans « précédent » */}
        <nav className="flex items-center gap-1.5 text-sm text-slate-500">
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-blue-600 transition-colors"
          >
            <Users className="h-4 w-4" />
            Clients
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="font-semibold text-slate-900 truncate max-w-[50vw]">
            {header?.fullName ?? "…"}
          </span>
        </nav>

        {/* En-tête identité client */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400" />
          <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-md">
              {header?.initials ?? "…"}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {header?.fullName ?? "Chargement…"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                {header?.email && <span className="truncate">{header.email}</span>}
                {header?.age != null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{header.age} ans</span>
                  </>
                )}
                <button
                  onClick={copyUid}
                  title="Copier l'UID"
                  className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-400 transition-colors hover:text-slate-600"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {uid.slice(0, 10)}…
                </button>
              </div>
            </div>
            {header?.status && (
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyle(
                  header.status,
                )}`}
              >
                {header.status}
              </span>
            )}
          </div>
        </div>

        {/* Onglets — nav segmentée premium */}
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-1.5 px-1">
            {tabs.map((t) => {
              const active = isActive(pathname, t.href);
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                      : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                  {t.badge ? (
                    <Badge
                      variant="secondary"
                      className={`rounded-full text-[10px] ${
                        active ? "bg-white/20 text-white" : ""
                      }`}
                    >
                      {t.badge}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Contenu */}
        <div>{children}</div>
    </div>
  );
}

