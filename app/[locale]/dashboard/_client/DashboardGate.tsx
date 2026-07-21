"use client";

import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";
import type { ClientData } from "@/lib/core/types";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function DashboardGate({
  children,
  targetUid,
}: {
  children: React.ReactNode;
  targetUid?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState<boolean>(false);

  useEffect(() => {
    const uidToUse = targetUid || auth.currentUser?.uid;

    if (!uidToUse) {
      setLoading(false);
      setHasData(false);
      return;
    }

    const unsub = subscribeDonneesPersonnelles(
      uidToUse,
      (d: Partial<ClientData> | null) => {
        const obj = (d ?? {}) as any;
        const usefulKeys = [
          "Enter_prenom",
          "Enter_nom",
          "Enter_dateNaissance",
          "Enter_salaireAnnuel",
        ];

        const ok = usefulKeys.some((k) => {
          const v = obj?.[k];
          return typeof v === "number"
            ? v > 0
            : typeof v === "string"
            ? v.trim().length > 0
            : !!v;
        });

        setHasData(ok);
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [targetUid]);

  if (loading) return null;

  if (!hasData) {
    return (
      <div className="rounded-2xl border bg-background p-6 md:p-8">

        {/* Illustration Empty State */}
        <div className="mb-4 flex justify-center">
          <svg
            width="180"
            height="80"
            viewBox="0 0 180 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-muted-foreground"
          >
            {/* lignes de fond */}
            <line x1="10" y1="60" x2="170" y2="60" stroke="currentColor" strokeOpacity="0.2" />
            <line x1="10" y1="40" x2="170" y2="40" stroke="currentColor" strokeOpacity="0.2" />
            <line x1="10" y1="20" x2="170" y2="20" stroke="currentColor" strokeOpacity="0.2" />

            {/* barres vides */}
            <rect x="40" y="35" width="16" height="25" rx="2" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="4 3" />
            <rect x="82" y="25" width="16" height="35" rx="2" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="4 3" />
            <rect x="124" y="30" width="16" height="30" rx="2" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="4 3" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold">
          Votre analyse de prévoyance
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Pour afficher vos graphiques et vos résultats de prévoyance
          individuelle, commencez par remplir le questionnaire.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => router.push("/profil/wizard?wizard=1")}>
            Terminer le questionnaire
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}