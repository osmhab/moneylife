import React from "react";
import TopRouteLoader from "@/app-components/TopRouteLoader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopRouteLoader />
      {children}
    </>
  );
}