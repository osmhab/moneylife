import React from "react";
import TopRouteLoader from "@/app-components/TopRouteLoader";
import RequireAuth from "@/[locale]/profil/_client/RequireAuth";
import GlobalAlertBanner from "./prevoyance/_components/GlobalAlertBanner"; // 👈 L'import mis à jour

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlobalAlertBanner /> {/* 👈 La bannière est placée tout en haut */}
      <TopRouteLoader />
      <RequireAuth>{children}</RequireAuth>
    </>
  );
}