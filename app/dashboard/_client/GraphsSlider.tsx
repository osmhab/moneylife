"use client";

import React, { useRef, useState, UIEvent } from "react";
import InvalidityAreaChart from "./InvalidityAreaChart";
import DeathAreaChart from "./DeathAreaChart";
import RetirementAreaChart from "./RetirementAreaChart";
import { cn } from "@/lib/utils";

const slides = [
  {
    id: "invalidite",
    label: "Invalidité",
    component: <InvalidityAreaChart />,
  },
  {
    id: "deces",
    label: "Décès",
    component: <DeathAreaChart />,
  },
  {
    id: "retraite",
    label: "Retraite",
    component: <RetirementAreaChart />,
  },
];

export default function GraphsSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    const width = el.clientWidth;
    el.scrollTo({
      left: width * idx,
      behavior: "smooth",
    });
    setActiveIndex(idx);
  };

  return (
    <div className="bg-background flex-1 rounded-xl md:min-h-min border px-3 py-3">
      {/* Header + dots */}
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground">
            Graphiques détaillés
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            Slide horizontal entre Invalidité, Décès et Retraite
          </span>
        </div>
        <div className="flex items-center gap-1">
          {slides.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToIndex(idx)}
              className={cn(
                "h-2.5 rounded-full transition-all",
                idx === activeIndex
                  ? "w-6 bg-zinc-900 dark:bg-zinc-100"
                  : "w-2.5 bg-zinc-300 dark:bg-zinc-700"
              )}
              aria-label={s.label}
            />
          ))}
        </div>
      </div>

      {/* Slider */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 scroll-smooth"
        onScroll={handleScroll}
      >
        {slides.map((s) => (
          <div
            key={s.id}
            className="w-full shrink-0 snap-center"
          >
            {s.component}
          </div>
        ))}
      </div>
    </div>
  );
}