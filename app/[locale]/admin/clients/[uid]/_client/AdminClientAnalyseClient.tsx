"use client";

import { usePathname } from "next/navigation";
import DashboardGate from "@/[locale]/dashboard/_client/DashboardGate";
import TopSummaryCards from "@/[locale]/dashboard/_client/TopSummaryCards";
import GraphsSlider from "@/[locale]/dashboard/_client/GraphsSlider";
import MobileDashboardCarousel from "@/[locale]/dashboard/_client/MobileDashboardCarousel";

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

export default function AdminClientAnalyseClient() {
  const pathname = usePathname();
  const targetUid = extractUidFromPath(pathname);

  return (
    <DashboardGate targetUid={targetUid}>
      {/* ✅ même structure que dashboard/page.tsx */}
      <div className="md:hidden">
        <GraphsSlider targetUid={targetUid} />
      </div>

      <div className="hidden md:block space-y-4">
        <GraphsSlider targetUid={targetUid} />
      </div>
    </DashboardGate>
  );
}