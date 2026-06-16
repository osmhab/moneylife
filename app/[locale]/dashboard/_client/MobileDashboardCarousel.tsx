// app/dashboard/_client/MobileDashboardCarousel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, UIEvent } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData } from "@/lib/core/types";
import { cn } from "@/lib/utils";

import { KpiCard, computeSummary } from "./TopSummaryCards";

// Graphs existants
import InvalidityAreaChart from "./InvalidityAreaChart";
import DeathAreaChart from "./DeathAreaChart";
import RetirementAreaChart from "./RetirementAreaChart";

// Icônes
import { Accessibility, Skull, TreePalm, Flame } from "lucide-react";

type Slide = {
  id: "invalidite" | "deces" | "retraite";
  label: string;
  node: React.ReactNode;
};

export default function MobileDashboardCarousel() {
  const router = useRouter();

  // Auth/Data (identique à TopSummaryCards)
  const [uid, setUid] = useState<string | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  // Slider state
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid(null);
        setClient(null);
        setLoading(false);
        return;
      }
      setUid(u.uid);
      setLoading(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDonneesPersonnelles(uid, (d) => {
      setClient(d as ClientData | null);
      setLoading(false);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  const summary = useMemo(() => (client ? computeSummary(client) : null), [client]);

  const goToStory = () => router.push("/profil/story-mock");

  const slides: Slide[] = useMemo(() => {
    if (!summary) return [];

    const { needMonthly, invalidity, death, retirement } = summary;

    const getSeverity = (gapMonthlyAbs: number, need: number) => {
      if (need <= 0) return "pos" as const;
      if (gapMonthlyAbs <= 0) return "pos" as const;
      const ratio = gapMonthlyAbs / need;
      if (ratio <= 0.1) return "mid" as const;
      return "neg" as const;
    };

    const GraphShell = ({ children }: { children: React.ReactNode }) => (
      <div className="bg-background rounded-3xl border px-3 py-3 shadow-sm">
        {children}
      </div>
    );

    // INVALIDITÉ
    const invGap = invalidity.gapMonthly;
    const invDeltaPct = needMonthly > 0 ? -Math.round((invGap / needMonthly) * 100) : 0;
    const invSeverity = getSeverity(Math.abs(invGap), needMonthly);

    // DÉCÈS
    const deathGap = death.gapMonthly;
    const deathDeltaPct = needMonthly > 0 ? -Math.round((deathGap / needMonthly) * 100) : 0;
    const deathSeverity = getSeverity(Math.abs(deathGap), needMonthly);

    // RETRAITE
    const retGap = retirement.gapMonthly;
    const retDeltaPct = needMonthly > 0 ? -Math.round((retGap / needMonthly) * 100) : 0;
    const retSeverity = getSeverity(Math.abs(retGap), needMonthly);

    return [
      {
        id: "invalidite",
        label: "Invalidité",
        node: (
          <div className="space-y-3">
            <KpiCard
              title="Couverture en cas d’invalidité"
              icon={<Accessibility size={48} className="opacity-70" />}
              monthlyGap={invGap}
              coverageDeltaPct={invDeltaPct}
              severity={invSeverity}
              subtitleBottom="Optimisation requise"
              worstYearLabel={invalidity.maxYear?.toString() ?? null}
              onClick={goToStory}
            />
            <GraphShell>
              <InvalidityAreaChart />
            </GraphShell>
            <button
            type="button"
            onClick={() => router.push("/dashboard/prevoyance/new-3a")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
            <Flame className="h-4 w-4" />
            Optimiser maintenant
            </button>
          </div>
        ),
      },
      {
        id: "deces",
        label: "Décès",
        node: (
          <div className="space-y-3">
            <KpiCard
              title="Couverture en cas de décès"
              icon={<Skull size={48} className="opacity-70" />}
              monthlyGap={deathGap}
              coverageDeltaPct={deathDeltaPct}
              severity={deathSeverity}
              subtitleBottom="Optimisation requise"
              capital={death.capital || null}
              worstYearLabel={death.maxYear?.toString() ?? null}
              onClick={goToStory}
            />
            <GraphShell>
              <DeathAreaChart />
            </GraphShell>
            <button
                type="button"
                onClick={() => router.push("/dashboard/prevoyance/new-3a")}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
                >
                <Flame className="h-4 w-4" />
                Optimiser maintenant
                </button>
          </div>
        ),
      },
      {
        id: "retraite",
        label: "Retraite",
        node: (
          <div className="space-y-3">
            <KpiCard
              title="Situation à la retraite"
              icon={<TreePalm size={48} className="opacity-70" />}
              monthlyGap={retGap}
              coverageDeltaPct={retDeltaPct}
              severity={retSeverity}
              subtitleTop={retGap <= 0 ? "Rentes suffisantes" : "Rentes insuffisantes"}
              subtitleBottom={retGap <= 0 ? "Aucune optimisation requise" : "Optimisation requise"}
              worstYearLabel={retirement.maxYear?.toString() ?? null}
              onClick={goToStory}
            />
            <GraphShell>
              <RetirementAreaChart />
            </GraphShell>
            <button
            type="button"
            onClick={() => router.push("/dashboard/prevoyance/new-3a")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
            <Flame className="h-4 w-4" />
            Optimiser maintenant
            </button>
          </div>
        ),
      },
    ];
  }, [summary, router]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    if (idx !== activeIndex) {
      setActiveIndex(Math.max(0, Math.min(slides.length - 1, idx)));
    }
  };

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    el.scrollTo({ left: width * idx, behavior: "smooth" });
    setActiveIndex(idx);
  };

  if (!uid || loading || !client || !summary) {
    return (
      <div className="space-y-3">
        <div className="h-28 rounded-2xl bg-zinc-100 animate-pulse" />
        <div className="h-52 rounded-2xl bg-zinc-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header mini + dots (simple) */}
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-xs font-medium text-muted-foreground">
          {slides[activeIndex]?.label ?? "Résumé"}
        </div>
        <div className="flex items-center gap-1">
          {slides.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToIndex(idx)}
              className={cn(
                "h-2.5 rounded-full transition-all",
                idx === activeIndex ? "w-6 bg-zinc-900 dark:bg-zinc-100" : "w-2.5 bg-zinc-300 dark:bg-zinc-700"
              )}
              aria-label={s.label}
            />
          ))}
        </div>
      </div>

      {/* Slider simple (scroll snap) */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 scroll-smooth"
        onScroll={handleScroll}
      >
        {slides.map((s) => (
          <div key={s.id} className="w-full shrink-0 snap-center">
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}