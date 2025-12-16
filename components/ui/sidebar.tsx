"use client";

import * as React from "react";
import type { ReactNode, HTMLAttributes } from "react";
import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within <SidebarProvider>");
  }
  return ctx;
}

type SidebarProviderProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Provider racine du layout avec sidebar.
 * Utilisation:
 * <SidebarProvider>
 *   <AppSidebar />
 *   <SidebarInset>...</SidebarInset>
 * </SidebarProvider>
 */
export function SidebarProvider({
  children,
  className,
  ...rest
}: SidebarProviderProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  const value = React.useMemo(
    () => ({
      collapsed,
      toggle: () => setCollapsed((v) => !v),
      setCollapsed,
    }),
    [collapsed]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={cn("flex min-h-screen w-full bg-background", className)}
        {...rest}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarInsetProps = {
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Zone principale (contenu à droite de la sidebar).
 */
export function SidebarInset({ children, className, ...rest }: SidebarInsetProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-1 flex-col overflow-hidden bg-background",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

type SidebarTriggerProps = {
  className?: string;
};

/**
 * Bouton pour plier/déplier la sidebar.
 */
export function SidebarTrigger({ className }: SidebarTriggerProps) {
  const { toggle } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn("h-8 w-8", className)}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Ouvrir / fermer le menu</span>
    </Button>
  );
}

// On exporte le hook pour l'utiliser dans AppSidebar
export { useSidebar };