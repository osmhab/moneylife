import React from "react";
import TopRouteLoader from "@/app-components/TopRouteLoader";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopRouteLoader />
      {children}
    </>
  );
}