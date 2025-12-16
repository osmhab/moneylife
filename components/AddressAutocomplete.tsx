// components/AddressAutocomplete.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, MapPin } from "lucide-react";

type AddressAutocompleteProps = {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  initialStreet?: string; // ex. "Rue de la Gare 10"
  initialZip?: string;
  initialCity?: string;
  onAddressSelected: (addr: {
    street: string;
    zip: string;
    city: string;
    formatted: string;
  }) => void;
};

type Prediction = {
  placeId: string;
  label: string;
};

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  label = "Adresse (rue et numéro)",
  placeholder = "Commencez à taper votre adresse…",
  disabled,
  initialStreet,
  initialZip,
  initialCity,
  onAddressSelected,
}) => {
  const [search, setSearch] = useState<string>(
    initialStreet
      ? [initialStreet, initialZip, initialCity].filter(Boolean).join(", ")
      : ""
  );
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Fermer la liste quand on clique en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenList(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Recherche Google Places avec debounce
  useEffect(() => {
    if (!search || disabled) {
      setPredictions([]);
      setOpenList(false);
      return;
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/address/search?q=${encodeURIComponent(search)}`
        );
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || "Erreur lors de la recherche d'adresse.");
          setPredictions([]);
          setOpenList(false);
          return;
        }
        setPredictions(json.predictions || []);
        setOpenList((json.predictions || []).length > 0);
      } catch (err) {
        console.error("[AddressAutocomplete] search error:", err);
        setError("Erreur lors de la recherche d'adresse.");
        setPredictions([]);
        setOpenList(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [search, disabled]);

  const handleSelectPrediction = async (p: Prediction) => {
    try {
      setLoading(true);
      setError(null);
      setOpenList(false);

      const res = await fetch(
        `/api/address/details?placeId=${encodeURIComponent(p.placeId)}`
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Impossible de récupérer les détails d'adresse.");
        return;
      }

      const addr = json.address as {
        street: string;
        zip: string;
        city: string;
        formatted: string;
      };

      setSearch(addr.formatted || p.label);
      onAddressSelected(addr);
    } catch (err) {
      console.error("[AddressAutocomplete] details error:", err);
      setError("Impossible de récupérer les détails d'adresse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-1 relative">
      {label && <Label>{label}</Label>}

      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("pr-8", disabled && "bg-muted")}
          onFocus={() => {
            if (predictions.length > 0) setOpenList(true);
          }}
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <p className="text-[10px] text-destructive mt-1">
          {error}
        </p>
      )}

      {openList && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-60 overflow-auto">
          {predictions.map((p) => (
            <button
              key={p.placeId}
              type="button"
              className="flex w-full items-start gap-2 px-2 py-1.5 text-xs hover:bg-muted text-left"
              onClick={() => handleSelectPrediction(p)}
            >
              <MapPin className="mt-0.5 h-3 w-3 text-primary" />
              <span className="whitespace-normal break-words">
                {p.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};