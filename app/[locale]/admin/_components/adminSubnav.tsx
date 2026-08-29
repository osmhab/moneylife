"use client";

// Sous-menu contextuel de la sidebar admin. Une page publie ses sous-sections
// (ex. Données personnelles → Identité, Adresse…) et AdminChrome les affiche
// en arborescence sous la nav, avec scroll-spy. Hors provider (app cliente),
// tout est un no-op inoffensif.

import * as React from "react";

export type SubnavItem = { id: string; label: string };
// Deux modes :
//  • scroll (défaut) : cliquer un item fait défiler vers l'ancre #id (scroll-spy auto).
//  • switch : `onSelect` fourni → cliquer appelle onSelect(id) et `activeId` pilote la surbrillance.
export type Subnav =
  | { crumbs?: string[]; items: SubnavItem[]; onSelect?: (id: string) => void; activeId?: string }
  | null;

type Ctx = { subnav: Subnav; setSubnav: (s: Subnav) => void };
const AdminSubnavContext = React.createContext<Ctx>({ subnav: null, setSubnav: () => {} });

export function AdminSubnavProvider({ children }: { children: React.ReactNode }) {
  const [subnav, setSubnav] = React.useState<Subnav>(null);
  const value = React.useMemo(() => ({ subnav, setSubnav }), [subnav]);
  return <AdminSubnavContext.Provider value={value}>{children}</AdminSubnavContext.Provider>;
}

export function useAdminSubnavState() {
  return React.useContext(AdminSubnavContext);
}

/**
 * Publie un sous-menu depuis une page. `deps` contrôle quand il se met à jour.
 * Nettoie (null) au démontage. No-op si aucun provider (espace client).
 */
export function usePublishAdminSubnav(subnav: Subnav, deps: React.DependencyList) {
  const { setSubnav } = React.useContext(AdminSubnavContext);
  React.useEffect(() => {
    setSubnav(subnav);
    return () => setSubnav(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
