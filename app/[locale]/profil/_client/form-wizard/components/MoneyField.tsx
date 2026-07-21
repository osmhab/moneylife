"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

function parseMoneyToNumber(s: string) {
  const clean = (s || "")
    .replace(/[^0-9.,']/g, "")
    .replace(/'/g, "")
    .replace(/,/g, ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}
function formatMoneyDisplay(n?: number) {
  const v = Number.isFinite(n as any) ? (n as number) : 0;
  return v.toLocaleString("fr-CH");
}

export default function MoneyField({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value?: number;
  onChange: (n: number) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [view, setView] = useState<string>(() => formatMoneyDisplay(value ?? 0));

  useEffect(() => {
    setView(formatMoneyDisplay(value ?? 0));
  }, [value]);

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={view}
      onChange={(e) => {
        setView(e.target.value);
        const n = parseMoneyToNumber(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onBlur={() => {
        const n = parseMoneyToNumber(view);
        const safe = Number.isFinite(n) ? n : 0;
        onChange(safe);
        setView(formatMoneyDisplay(safe));
      }}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}