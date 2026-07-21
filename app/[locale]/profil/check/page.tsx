"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData, Legal_Settings } from "lib/shared/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import { LEGAL_2025 } from "@/lib/core/legal";

// Imports depuis Shared (Pour être sûr d'avoir la même logique que le Cloud)
import { 
  buildInvaliditeAccidentMatrix,
  buildInvaliditeMaladieMatrix,
  buildDecesAccidentMatrix,
  buildDecesMaladieMatrix,
  buildRetraiteMatrix 
} from "lib/shared/calculs/matrices";

/* ===== UI helpers ===== */
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mb-2">{children}</h2>;
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white/60 dark:bg-zinc-900/60 p-4 overflow-x-auto shadow-sm">
      {children}
    </div>
  );
}
function chf(n?: number | string) {
  const val = typeof n === 'string' ? parseFloat(n) : n;
  if (val == null || Number.isNaN(val)) return "0";
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(val));
}
function gapSign(v: number | string) {
  const val = typeof v === 'string' ? parseFloat(v) : v;
  return val >= 0 ? `- ${chf(val)}` : `+ ${chf(Math.abs(val))}`;
}

const DEFAULT_LEGAL_2025 = LEGAL_2025;

/* ===== Table de Comparaison ===== */
function ComparisonMatrixTable({ 
  title, 
  localMatrix, 
  cloudMatrix 
}: { 
  title: string; 
  localMatrix: any; 
  cloudMatrix: any 
}) {
  if (!localMatrix || !cloudMatrix) return null;

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <H2>{title}</H2>
        <div className="text-[10px] uppercase font-bold text-zinc-400">
          Vérification Cloud vs Local
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-3">Label</th>
            {localMatrix.headerYears.map((y: number) => (
              <th key={y} className="text-right py-2 pr-3">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {localMatrix.rows.map((row: any) => (
            <tr key={row.label} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 transition-colors">
              <td className="py-2 pr-3 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{row.label}</td>
              {row.cells.map((localVal: any, colIdx: number) => {
                const cloudRow = cloudMatrix?.rows?.find((r: any) => r.label === row.label);
                const cloudVal = cloudRow?.cells?.[colIdx];
                
                const isMatch = Math.abs(Number(localVal) - Number(cloudVal)) <= 5; // Tolérance 5 CHF
                const displayVal = row.label === "Lacune" ? gapSign(localVal) : chf(localVal);

                return (
                  <td 
                    key={colIdx} 
                    className={`text-right py-2 pr-3 font-mono ${
                      isMatch ? "text-emerald-600 font-bold" : "text-red-500 bg-red-50 font-black"
                    }`}
                    title={`Cloud: ${chf(cloudVal)} | Local: ${chf(localVal)}`}
                  >
                    {displayVal}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function EngineComparisonPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [cloudAnalysis, setCloudAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/login");
      else setUid(u.uid);
    });
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    
    // 1. Abonnement données perso
    const unsubLocal = subscribeDonneesPersonnelles(uid, (d) => {
      setClient(d as ClientData);
      setLoading(false);
    });

    // 2. Abonnement aux plans (INDISPENSABLE pour la ligne 3e pilier)
    const unsubPlans = onSnapshot(collection(db, `clients/${uid}/plans`), (snap) => {
      setPlans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Abonnement analyse Cloud
    const unsubCloud = onSnapshot(doc(db, `clients/${uid}/Analyse/current`), (snap) => {
      if (snap.exists()) setCloudAnalysis(snap.data());
    });

    return () => { unsubLocal(); unsubPlans(); unsubCloud(); };
  }, [uid]);

  // Calcul des matrices locales en utilisant DIRECTEMENT les fonctions de shared/matrices.ts
  const matrices = useMemo(() => {
    if (!client) return null;
    const legal = DEFAULT_LEGAL_2025;
    const echelle = Legal_Echelle44_2025.rows;

    return {
      invAcc: buildInvaliditeAccidentMatrix(client, legal, echelle, plans),
      invMal: buildInvaliditeMaladieMatrix(client, legal, echelle, plans),
      decAcc: buildDecesAccidentMatrix(client, legal, echelle, plans),
      decMal: buildDecesMaladieMatrix(client, legal, echelle, plans),
      retraite: buildRetraiteMatrix(client, legal, echelle, plans),
    };
  }, [client, plans]);

  if (!uid || loading) return <div className="p-10 text-center">Initialisation du comparateur...</div>;
  if (!client) return <div className="p-10 text-center">Aucune donnée client.</div>;
  if (!cloudAnalysis) return <div className="p-10 text-center animate-pulse">En attente du Cloud Engine (modifie une donnée)...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-zinc-50 min-h-screen">
      <header className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-900">Audit du Moteur de Calcul</h1>
          <p className="text-zinc-500 italic">Comparaison en temps réel : Logique Partagée vs Cloud Function</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Base: europe-west1</div>
          <div className="text-xs font-bold text-emerald-600">Moteur v1.1 - 3e Pilier Actif</div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <ComparisonMatrixTable 
          title="Invalidité — Accident" 
          localMatrix={matrices?.invAcc} 
          cloudMatrix={cloudAnalysis.projections.invalidite_accident}
        />
        <ComparisonMatrixTable 
          title="Invalidité — Maladie" 
          localMatrix={matrices?.invMal} 
          cloudMatrix={cloudAnalysis.projections.invalidite_maladie}
        />
        <ComparisonMatrixTable 
          title="Décès — Accident" 
          localMatrix={matrices?.decAcc} 
          cloudMatrix={cloudAnalysis.projections.deces_accident}
        />
        <ComparisonMatrixTable 
          title="Décès — Maladie" 
          localMatrix={matrices?.decMal} 
          cloudMatrix={cloudAnalysis.projections.deces_maladie}
        />
        <ComparisonMatrixTable 
          title="Retraite" 
          localMatrix={matrices?.retraite} 
          cloudMatrix={cloudAnalysis.projections.retraite}
        />
      </div>
    </div>
  );
}