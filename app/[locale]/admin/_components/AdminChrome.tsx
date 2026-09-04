"use client";

// Chrome global de l'admin : sidebar repliable (icônes seules quand fermée) + badges de
// notification, présente sur TOUTES les pages /admin/*. Montée dans app/[locale]/admin/layout.tsx.
// L'état plié/déplié est persisté (localStorage).

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Users,
  FileText,
  LayoutDashboard,
  PhoneCall,
  Gift,
  Calculator,
  LineChart,
  Languages,
  Briefcase,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  UserRound, BookOpen,} from "lucide-react";
import { AdminSubnavProvider, useAdminSubnavState } from "./adminSubnav";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: "alerts";
};

const NAV: NavItem[] = [
  { href: "/admin/clients", label: "CRM Clients", icon: Users },
  { href: "/admin/analyses", label: "Analyses", icon: FileText },
  { href: "/admin/offres-wizard", label: "Offres-Wizard", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Leads & rappels", icon: PhoneCall },
  { href: "/admin/parrainage", label: "Parrainage", icon: Gift },
  { href: "/admin/reglements", label: "Règlements de caisse", icon: BookOpen },
  { href: "/admin/3a-simulator", label: "Simulateur 3a", icon: Calculator },
  { href: "/admin/learner-3a", label: "Learner 3a", icon: LineChart },
  { href: "/admin/recrutement", label: "Recrutement", icon: Briefcase },
  { href: "/admin/translations", label: "Traductions", icon: Languages },
  { href: "/admin/notifications", label: "Alertes back-office", icon: Bell, badgeKey: "alerts" },
  // En dernier : réglage personnel, consulté rarement, à l'écart du travail quotidien.
  { href: "/admin/mon-profil", label: "Mon profil", icon: UserRound },
];

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  return (
    <AdminSubnavProvider>
      <AdminChromeInner>{children}</AdminChromeInner>
    </AdminSubnavProvider>
  );
}

function AdminChromeInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [collapsed, setCollapsed] = React.useState(false);
  const [alerts, setAlerts] = React.useState(0);
  const [email, setEmail] = React.useState<string | null>(null);

  // Sous-menu contextuel publié par la page courante (ex. sections Données personnelles).
  const { subnav } = useAdminSubnavState();
  const [activeSection, setActiveSection] = React.useState<string>("");
  const itemIdsKey = subnav?.items.map((i) => i.id).join(",") || "";
  React.useEffect(() => {
    if (!subnav?.items.length || subnav.onSelect) return; // mode switch → pas de scroll-spy
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveSection((vis[0].target as HTMLElement).id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    subnav.items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdsKey]);

  // Restaure l'état plié/déplié après montage (évite un mismatch d'hydratation).
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("admin_sidebar_collapsed") === "1");
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("admin_sidebar_collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // Compte connecté (pour le pied de sidebar).
  React.useEffect(() => onAuthStateChanged(auth, (u) => setEmail(u?.email ?? null)), []);

  // Badge « Alertes » : notifications back-office non lues.
  React.useEffect(() => {
    const q = query(collection(db, "admin_notifications"), where("read", "==", false));
    const unsub = onSnapshot(q, (snap) => setAlerts(snap.size), () => setAlerts(0));
    return () => unsub();
  }, []);

  const badgeFor = (k?: NavItem["badgeKey"]) => (k === "alerts" ? alerts : 0);
  const isActive = (href: string) => pathname.includes(href);

  const handleLogout = async () => {
    try { await signOut(auth); } finally {
      const loc = pathname.split("/").filter(Boolean)[0] || "fr";
      window.location.href = `/${loc}/login`;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* SIDEBAR */}
      <aside
        className={[
          "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-64",
        ].join(" ")}
      >
        {/* En-tête : marque + toggle */}
        <div className="flex items-center gap-2.5 px-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Logo X Black.png" alt="CreditX" className="h-6 w-6 shrink-0 object-contain" />
          {!collapsed && (
            <>
              <span className="text-base font-bold tracking-tight text-slate-900">CreditX</span>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400">Admin</span>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const badge = badgeFor(item.badgeKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  "group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-blue-600",
                  collapsed ? "justify-center" : "",
                ].join(" ")}
              >
                <span className="relative inline-flex">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          {/* Sous-menu contextuel (publié par la page) — arborescence + scroll-spy. */}
          {!collapsed && subnav && subnav.items.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              {subnav.crumbs?.map((c, i) => (
                <div
                  key={i}
                  className={
                    i === (subnav.crumbs!.length - 1)
                      ? "px-3 pt-1 text-xs font-semibold text-slate-700"
                      : "px-3 text-[11px] text-slate-400"
                  }
                  style={{ paddingLeft: 12 + i * 12 }}
                >
                  {c}
                </div>
              ))}
              <div className="mt-1 space-y-0.5">
                {subnav.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() =>
                      subnav.onSelect
                        ? subnav.onSelect(it.id)
                        : document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className={[
                      "block w-full rounded-lg py-1.5 pr-3 text-left text-sm transition-colors",
                      (subnav.onSelect ? subnav.activeId : activeSection) === it.id
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                    ].join(" ")}
                    style={{ paddingLeft: 12 + (subnav.crumbs?.length ?? 0) * 12 }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Pied : compte + déconnexion + toggle */}
        <div className="border-t border-slate-100 p-2">
          {!collapsed && email && (
            <div className="truncate px-2.5 pb-2 text-[11px] font-medium text-slate-400" title={email}>
              {email}
            </div>
          )}
          <div className={collapsed ? "flex flex-col gap-1" : "flex items-center gap-1"}>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              className={[
                "flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600",
                collapsed ? "justify-center" : "flex-1",
              ].join(" ")}
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && "Déconnexion"}
            </button>
            <button
              onClick={toggle}
              title={collapsed ? "Déplier le menu" : "Replier le menu"}
              className="flex items-center justify-center rounded-xl px-2.5 py-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* CONTENU */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
