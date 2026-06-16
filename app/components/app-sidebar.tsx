//app/components/app-sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User2,
  FileText,
  FileCheck2,
  LogOut,
  X,
  User as UserIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";

import { startRouteLoading } from "@/app-components/route-loading";
import Image from "next/image";

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavChild[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/dashboard/donnees-personnelles", label: "Données personnelles", icon: User2 },
];

type SidebarApi = {
  collapsed: boolean;
  open?: boolean;
  setCollapsed?: (v: boolean) => void;
  setOpen?: (v: boolean) => void;
};

export function AppSidebar() {
  const pathname = usePathname();
  const sidebar = useSidebar() as unknown as SidebarApi;
  const collapsed = sidebar.collapsed;

  // ✅ user pour le footer (photoURL / displayName / email)
  const [user, setUser] = useState<FirebaseUser | null>(null);

  // Nombre d'offres reçues (envoyées au client)
  const [offersCount, setOffersCount] = useState<number | null>(null);
  // Est-ce que l'utilisateur a déjà ouvert la page /dashboard/offres ?
  const [offersSeen, setOffersSeen] = useState<boolean>(false);

  // ✅ Contrats actifs (Couverture active)
  const [contractsCount, setContractsCount] = useState<number | null>(null);
  // Est-ce que l'utilisateur a déjà ouvert /dashboard/contrats ?
  const [contractsSeen, setContractsSeen] = useState<boolean>(false);

  // Wizard terminé ? (sinon on masque “Données personnelles”)
  const [hasClientData, setHasClientData] = useState<boolean>(false);

  // 1) Charger l'état "vu" depuis localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedOffers = window.localStorage.getItem("offers_seen_v1");
    setOffersSeen(storedOffers === "1");

    const storedContracts = window.localStorage.getItem("contracts_seen_v1");
    setContractsSeen(storedContracts === "1");
  }, []);

  // 2) Quand on visite /dashboard/offres*, marquer comme vu
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (pathname.startsWith("/dashboard/offres")) {
      setOffersSeen(true);
      window.localStorage.setItem("offers_seen_v1", "1");
    }

    if (pathname.startsWith("/dashboard/contrats")) {
      setContractsSeen(true);
      window.localStorage.setItem("contracts_seen_v1", "1");
    }
  }, [pathname]);

  // 3) Charger le nombre d'offres envoyées + savoir si le client a déjà des données + setUser
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);

      if (!u) {
        setOffersCount(null);
        setContractsCount(null);
        setHasClientData(false);
        return;
      }

      // a) offersCount
      try {
        const qy = query(
          collection(db, "offers_requests_3e"),
          where("clientUid", "==", u.uid),
          where("adminOffersStatus", "==", "sent")
        );
        const snap = await getDocs(qy);
        setOffersCount(snap.size);
      } catch (err) {
        console.error("[AppSidebar] Erreur chargement offersCount:", err);
        setOffersCount(null);
      }

          // a2) contractsCount (Couverture active)
      try {
        // On récupère les sessions les plus récentes et on compte celles où coverage.activeAt existe.
        // (On évite les where complexes sur nested fields → pas d'index supplémentaire.)
        const qy = query(
          collection(db, "offers_signing_sessions"),
          where("clientUid", "==", u.uid),
          limit(50)
        );

        const snap = await getDocs(qy);

        let count = 0;
        snap.docs.forEach((d) => {
          const x: any = d.data();
          const activeAt = x?.steps?.coverage?.activeAt ?? null;
          if (activeAt) count += 1;
        });

        setContractsCount(count);
      } catch (err) {
        console.error("[AppSidebar] Erreur chargement contractsCount:", err);
        setContractsCount(null);
      }

      // b) hasClientData (wizard “terminé”)
      try {
        const snap = await getDoc(doc(db, "clients", u.uid));
        const d = (snap.exists() ? snap.data() : null) as any;

        const usefulKeys = [
          "Enter_prenom",
          "Enter_nom",
          "Enter_dateNaissance",
          "Enter_salaireAnnuel",
        ];

        const ok = usefulKeys.some((k) => {
          const v = d?.[k];
          return typeof v === "number"
            ? v > 0
            : typeof v === "string"
              ? v.trim().length > 0
              : !!v;
        });

        setHasClientData(ok);
      } catch (err) {
        console.error("[AppSidebar] Erreur chargement client data:", err);
        setHasClientData(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const smallNow = window.matchMedia("(max-width: 1024px)").matches; // mobile + iPad
    if (!smallNow) return;

    sidebar.setCollapsed?.(true);
    sidebar.setOpen?.(false);
  }, [pathname]); // ✅ à chaque navigation

  // Helper : démarre loader seulement si on navigue vraiment
  const handleNavClick = (href: string) => {
    if (typeof window === "undefined") return;

    const current = window.location.pathname + window.location.search;
    if (current === href) return;

    startRouteLoading();
  };

  // ✅ Sur mobile/tablette: si "collapsed", on n'affiche PAS la sidebar du tout
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = () => setIsSmall(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const mobileVisible = isSmall && !collapsed;

  // ✅ Bloque le scroll seulement quand la sidebar est ouverte en mobile
  useEffect(() => {
    if (!mobileVisible) return;

    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [mobileVisible]);

  return (
    <>
      {/* ✅ Backdrop mobile (fade) */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300",
          mobileVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => {
          sidebar.setCollapsed?.(true);
          sidebar.setOpen?.(false);
        }}
      />

      <aside
        className={cn(
          "flex flex-col bg-muted transition-all duration-300 ease-out",

          // Desktop
          !isSmall && "border-r",
          !isSmall && (collapsed ? "w-[56px]" : "w-60"),

          // Mobile: panneau slide-in plein écran
          isSmall &&
            "fixed inset-y-0 left-0 z-50 w-screen max-w-[100vw] border-none overflow-y-auto overscroll-contain",

          // Animation mobile (slide)
          isSmall &&
            (mobileVisible
              ? "translate-x-0 opacity-100"
              : "-translate-x-full opacity-0 pointer-events-none")
        )}
      >
        {/* Header logo */}
        <div className="flex h-16 items-center gap-2 px-3">
          {/* ✅ Bouton fermer (mobile) */}
          {isSmall && (
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => {
                sidebar.setCollapsed?.(true);
                sidebar.setOpen?.(false);
              }}
              className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          )}

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
              <span className="text-xs text-muted-foreground">
                Espace client
              </span>
            </div>
          )}
        </div>

        {/* Nav principale */}
        <nav className="flex-1 space-y-1 px-1">
  {navItems
    // On garde l'onglet Données personnelles TOUJOURS
    // Mais on continue de masquer “Contrats” s'il n'y a rien
    .filter((it) => (it.href === "/dashboard/contrats" ? (contractsCount ?? 0) > 0 : true))
    .map((item) => {
            const Icon = item.icon;
            const baseHref = item.href.split("?")[0];

            const childActive =
              item.children?.some((child) => pathname === child.href) ?? false;

            const isActive =
              baseHref === "/dashboard"
                ? pathname === "/dashboard"
                : (pathname === baseHref || pathname.startsWith(baseHref + "/")) &&
                  !childActive;

            return (
              <div key={item.href}>
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

                      {/* Badge nombre d'offres pour "Mes offres" */}
                      {item.href === "/dashboard/offres" &&
                        offersCount !== null &&
                        offersCount > 0 && (
                          <span
                            className={cn(
                              "ml-auto inline-flex items-center justify-center rounded-full px-2 py-[2px] text-[10px]",
                              !offersSeen
                                ? "bg-primary-foreground text-primary font-semibold"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {offersCount}
                          </span>
                        )}

                      {/* ✅ Badge nombre de contrats pour "Contrats" */}
                      {item.href === "/dashboard/contrats" &&
                        contractsCount !== null &&
                        contractsCount > 0 && (
                          <span
                            className={cn(
                              "ml-auto inline-flex items-center justify-center rounded-full px-2 py-[2px] text-[10px]",
                              !contractsSeen
                                ? "bg-primary-foreground text-primary font-semibold"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {contractsCount}
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
        <div className="border-t px-2 py-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
              !collapsed && "hover:bg-muted/50"
            )}
          >
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary overflow-hidden">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : user?.displayName ? (
                <span className="text-xs font-semibold">
                  {user.displayName
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
            </div>

            {/* User info */}
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold truncate">
                  {user?.displayName ?? "Mon compte"}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {user?.email ?? "Utilisateur connecté"}
                </span>
              </div>
            )}
          </div>

          {/* Logout */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "mt-1 w-full justify-start gap-2 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
            type="button"
            onClick={async () => {
              const { signOut } = await import("firebase/auth");

              await signOut(auth);

              // ✅ redirection publique (jamais /(auth)/login)
              window.location.assign("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Se déconnecter</span>}
          </Button>
        </div>
      </aside>
    </>
  );
}