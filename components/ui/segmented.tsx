"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Item = { value: string; label: string; icon?: React.ReactNode };

export function Segmented({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: Item[];
  className?: string;
}) {
  const index = items.findIndex((it) => it.value === value);
  const pct = 100 / items.length;

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      className={cn(
        "relative flex rounded-full bg-muted p-1 shadow-sm border border-muted/40 overflow-hidden",
        className
      )}
    >
      {/* Thumb animé */}
      <motion.span
        className="absolute top-1 bottom-1 rounded-full bg-background shadow"
        initial={false}
        animate={{ left: `${index * pct}%`, width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      />

      {items.map((it) => (
        <ToggleGroup.Item
          key={it.value}
          value={it.value}
          className={cn(
            "relative z-10 inline-flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm outline-none transition-colors",
            "text-muted-foreground hover:text-foreground",
            "data-[state=on]:text-foreground font-medium",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4fd1c5]"
          )}
        >
          <span className="flex items-center gap-2">
            {it.icon} {it.label}
          </span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
