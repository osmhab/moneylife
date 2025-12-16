// app/dashboard/page.tsx
import { AppSidebar } from "../components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import RequireAuth from "../profil/_client/RequireAuth";
import TopSummaryCards from "./_client/TopSummaryCards";
import GraphsSlider from "./_client/GraphsSlider";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Espace client
                </span>
                <h1 className="text-sm font-semibold leading-tight">
                  Tableau de bord
                </h1>
              </div>
            </div>
          </header>

          {/* Contenu principal */}
          <div className="flex flex-1 flex-col gap-4 p-4 pt-3">
            {/* Cartes de synthèse */}
            <TopSummaryCards />

            {/* Graphiques détaillés en slider horizontal */}
            <GraphsSlider />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}