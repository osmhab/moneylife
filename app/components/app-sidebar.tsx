//app/components/app-sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User2,
  FileText,
  LineChart,
  LogOut,
  Layers,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

import { startRouteLoading } from "@/app-components/route-loading";

import Image from "next/image";

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon; // (ou LucideIcon si tu veux être strict)
  children?: NavChild[];
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Tableau de bord",
    icon: LayoutDashboard,
  },
{
  href: "/dashboard/offres",
  label: "Mes offres",
  icon: FileText,
},
  {
    href: "/profil",
    label: "Détails personnels",
    icon: User2,
  },
  {
    href: "/profil/wizard?wizard=1",
    label: "Questionnaire",
    icon: FileText,
  },
  {
    href: "/profil/results",
    label: "Résultats",
    icon: LineChart,
  },
];

type SidebarApi = {
  collapsed: boolean;
  setCollapsed?: (v: boolean) => void;
  setOpen?: (v: boolean) => void;
};

export function AppSidebar() {
  const pathname = usePathname();
  const sidebar = useSidebar() as unknown as SidebarApi;
  const collapsed = sidebar.collapsed;

  // Nombre d'offres reçues (envoyées au client)
  const [offersCount, setOffersCount] = useState<number | null>(null);
  // Est-ce que l'utilisateur a déjà ouvert la page /dashboard/offres ?
  const [offersSeen, setOffersSeen] = useState<boolean>(false);

  // 1) Charger l'état "vu" depuis localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("offers_seen_v1");
    setOffersSeen(stored === "1");
  }, []);

  // 2) Quand on visite /dashboard/offres*, marquer comme vu
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith("/dashboard/offres")) {
      setOffersSeen(true);
      window.localStorage.setItem("offers_seen_v1", "1");
    }
  }, [pathname]);

  // 3) Charger le nombre d'offres envoyées au client
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setOffersCount(null);
        return;
      }
      try {
        const q = query(
          collection(db, "offers_requests_3e"),
          where("clientUid", "==", user.uid),
          where("adminOffersStatus", "==", "sent")
        );
        const snap = await getDocs(q);
        setOffersCount(snap.size);
      } catch (err) {
        console.error("[AppSidebar] Erreur chargement offersCount:", err);
        setOffersCount(null);
      }
    });

    return () => unsub();
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const isSmall = window.matchMedia("(max-width: 1024px)").matches; // mobile + iPad
    if (!isSmall) return;

    sidebar.setCollapsed?.(true);
    sidebar.setOpen?.(false);
  }, [pathname]); // ✅ à chaque navigation

  // Helper : démarre loader seulement si on navigue vraiment
const handleNavClick = (href: string) => {
  if (typeof window === "undefined") return;

  const current = window.location.pathname + window.location.search;
  if (current === href) return;

  startRouteLoading();

  const isSmall = window.matchMedia("(max-width: 1024px)").matches;
  if (isSmall) {
    sidebar.setCollapsed?.(true);
    sidebar.setOpen?.(false);
  }
};

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-muted/40 transition-[width] duration-200",
        collapsed ? "w-[56px]" : "w-60"
      )}
    >
      {/* Header logo */}
      <div className="flex h-16 items-center gap-2 px-3">
        <div className="flex h-9 w-9 items-center justify-center">
          <Image
            src="/logoMoneyLifeIconeDark.svg"
            alt="MoneyLife"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              MoneyLife
            </span>
            <span className="text-xs text-muted-foreground">Espace client</span>
          </div>
        )}
      </div>

      {/* Nav principale */}
      <nav className="flex-1 space-y-1 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const baseHref = item.href.split("?")[0];

          // Un child est-il exactement actif ? (ex: /dashboard/offres/en-preparation)
          const childActive =
            item.children?.some((child) => pathname === child.href) ?? false;

          // Onglet principal actif:
          // - /dashboard  -> uniquement quand on est exactement dessus
          // - autres      -> actif quand on est sur le parent ou un sous-chemin,
          //                  MAIS PAS si un child est déjà actif (pour éviter 2 onglets pleins)
          const isActive =
            baseHref === "/dashboard"
              ? pathname === "/dashboard"
              : (pathname === baseHref || pathname.startsWith(baseHref + "/")) &&
                !childActive;

          return (
            <div key={item.href}>
              {/* Lien principal */}
              <Link
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>

                    {/* Badge de nombre d'offres pour "Mes offres" */}
                    {item.href === "/dashboard/offres" &&
                      offersCount !== null &&
                      offersCount > 0 && (
                        <span
                          className={cn(
                            "ml-auto inline-flex items-center justify-center rounded-full px-2 py-[2px] text-[10px]",
                            // Si la page n'a jamais été vue -> style notification plus fort
                            !offersSeen
                              ? "bg-primary-foreground text-primary font-semibold"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {offersCount}
                        </span>
                      )}
                  </>
                )}
              </Link>

              {/* Sous-items */}
              {!collapsed && item.children && (
                <div className="ml-8 mt-1 flex flex-col space-y-1">
                  {item.children.map((child) => {
                    const isChildActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => handleNavClick(child.href)}
                        className={cn(
                          "text-xs px-2 py-1 rounded-md transition-colors",
                          isChildActive
                            ? "bg-primary/20 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer user / logout */}
      <div className="border-t px-2 py-3 flex flex-col gap-2">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <span className="text-xs font-medium">HO</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold">Mon compte</span>
              <span className="text-xs text-muted-foreground">
                Utilisateur connecté
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "justify-start gap-2 px-2 text-xs",
            collapsed && "justify-center px-0"
          )}
          type="button"
          onClick={async () => {
            const { auth } = await import("@/lib/firebase");
            const { signOut } = await import("firebase/auth");

            await signOut(auth);
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Se déconnecter</span>}
        </Button>
      </div>
    </aside>
  );
}