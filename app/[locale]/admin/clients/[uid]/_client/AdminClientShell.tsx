"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserRound, FileText, Shield, Sparkles, PenTool } from "lucide-react";

function isActive(pathname: string, href: string) {
  // active si exact match, ou si la route commence par href (sauf pour overview)
  if (href.endsWith("/clients/" + href.split("/").pop())) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminClientShell({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const base = `/admin/clients/${uid}`;

  const tabs = [
    {
      href: base,
      label: "Aperçu",
      icon: UserRound,
      badge: null as null | string,
    },
    {
      href: `${base}/donnees-personnelles`,
      label: "Données perso",
      icon: FileText,
      badge: null as null | string,
    },
    {
        href: `${base}/analyse`,
        label: "Analyse",
        icon: Sparkles,
        badge: null,
    },
    {
      href: `${base}/config-3a`,
      label: "Config 3a",
      icon: Sparkles,
      badge: "bientôt",
    },
    {
      href: `${base}/offres`,
      label: "Offres",
      icon: PenTool,
      badge: "bientôt",
    },
    {
      href: `${base}/sante`,
      label: "Santé",
      icon: Shield,
      badge: "bientôt",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Client UID</div>
          <div className="font-mono text-sm truncate">{uid}</div>
        </div>
      </div>

      {/* Tabs */}
      <Card className="rounded-2xl p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            const Icon = t.icon;

            return (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition border",
                  active
                    ? "bg-muted border-muted-foreground/20"
                    : "bg-background hover:bg-muted/40 border-transparent",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{t.label}</span>
                {t.badge ? (
                  <Badge variant="secondary" className="rounded-full">
                    {t.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}