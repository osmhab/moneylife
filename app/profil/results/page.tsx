// app/profil/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

// Events
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import { computeRetraite } from "@/lib/calculs/events/retraite";

// Dates/format
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

/* ===== UI helpers ===== */
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mb-2">{children}</h2>;
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white/60 dark:bg-zinc-900/60 p-4 overflow-x-auto">
      {children}
    </div>
  );
}
function chf(n?: number) {
  if (n == null || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function gapSign(v: number) {
  // Besoin - Total : si positif -> "− n", si négatif (surplus) -> "+ n"
  return v >= 0 ? `- ${chf(v)}` : `+ ${chf(Math.abs(v))}`;
}

const { meta } = Legal_Echelle44_2025;

const DEFAULT_LEGAL_2025: Legal_Settings = {
  Legal_SalaireAssureMaxLAA: 148_200,
  Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
  Legal_DeductionCoordinationMinLPP: 26_460,
  Legal_SeuilEntreeLPP: 22_680,
  Legal_SalaireMaxLPP: 90_720,
  Legal_SalaireAssureMaxLPP: 64_260,
  Legal_SalaireAssureMinLPP: 3_780,
  Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
  Legal_CotisationsMinLPP: {},
  Legal_AgeRetraiteAVS: 65,
  Legal_AgeLegalCotisationsAVS: 21,
  Legal_Echelle44Version: "2025-01",
  Legal_ijAccidentTaux: 80, // ✅ VIRGULE ICI

  // 🆕 Bonifications AVS
  Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
  Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
  Legal_BTE_SplitMarried: 0.5,
};

/* ===== Dates helpers ===== */
function birthYearFromMask(mask?: string) {
  if (!mask || !isValidDateMask(mask)) return undefined;
  const [dd, mm, yyyy] = normalizeDateMask(mask).split(".");
  return Number(yyyy);
}
function currentYear() {
  return new Date().getFullYear();
}
function yearDate(y: number) {
  return new Date(y, 0, 1);
}

/* ===== Matrices ===== */
type Matrix = { headerYears: number[]; rows: { label: string; cells: (number | string)[] }[] };

function buildInvaliditeAccidentMatrix(client: ClientData, legal: Legal_Settings): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS); // jusqu'à 65
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  // IJ Accident (annuelle) — constante pour la phase 1
  const firstRes = computeInvaliditeAccident(
    client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(startY) }
  );
  const ijAnnual = firstRes.phaseIj.annualIj;

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Indemnités journalières Accident", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] }, // 0 ici
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y, idx) => {
    const yearIndex = idx; // 0-based depuis l'année de départ
    let ai = 0, lpp = 0, laa = 0, ij = 0, capitals = 0, total = 0, gap = 0;

    if (yearIndex < 2) {
      // Phase 1 : uniquement IJ
      ij = ijAnnual;
      total = ij;
    } else {
      // Phase 2 : uniquement rentes (AI total + LAA coordonnée + LPP après top-up)
      const res = computeInvaliditeAccident(
        client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y) }
      );
      ai  = res.phaseRente.annual.aiTotal;     // adulte + enfants
      lpp = res.phaseRente.annual.lppAfterCap; // top-up LPP
      laa = res.phaseRente.annual.laaAfterCap; // LAA réduite
      total = ai + lpp + laa;
    }

    gap = need - total;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(ij);
    rows[4].cells.push(capitals);
    rows[5].cells.push(total);
    rows[6].cells.push(need);
    rows[7].cells.push(gap);
  });

  return { headerYears: years, rows };
}

function buildInvaliditeMaladieMatrix(client: ClientData, legal: Legal_Settings): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  // IJ Maladie (annuelle) — constante pour la phase 1
  const first = computeInvaliditeMaladie(yearDate(startY), client, legal, Legal_Echelle44_2025.rows);
  const ijAnnual = first.phaseIj.annualIj;

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Indemnités journalières Maladie", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] }, // 0 ici
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach((y, idx) => {
    const yearIndex = idx;
    let ai = 0, lpp = 0, laa = 0, ij = 0, capitals = 0, total = 0, gap = 0;

    if (yearIndex < 2) {
      // Phase 1 : uniquement IJ
      ij = ijAnnual;
      total = ij;
    } else {
      // Phase 2 : uniquement rentes (AI total + LPP adulte + enfants)
      const res = computeInvaliditeMaladie(yearDate(y), client, legal, Legal_Echelle44_2025.rows);
      // ✅ ne pas redéclarer ; on assigne à la variable `ai` déjà déclarée plus haut
      ai = (res.phaseRente.annual as any).aiTotal ?? res.phaseRente.annual.ai;
      lpp = (res.phaseRente.annual.lppInvalidite ?? 0) + (res.phaseRente.annual.lppEnfants ?? 0);
      laa = 0;
      total = ai + lpp + laa;
    }

    gap = need - total;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(ij);
    rows[4].cells.push(capitals);
    rows[5].cells.push(total);
    rows[6].cells.push(need);
    rows[7].cells.push(gap);
  });

  return { headerYears: years, rows };
}

function buildDecesAccidentMatrix(client: ClientData, legal: Legal_Settings): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  const capitalYear = startY; // afficher le capital uniquement sur l'année en cours

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

const deathRef = new Date(); // décès supposé le jour de l’analyse
years.forEach((y) => {
  const res = computeDecesAccident(
    deathRef,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) } // enfants calculés à la date de paiement (colonne)
  );
    const ai = res.annual.avs;
    const lpp = res.annual.lppAfterCap;
    const laa = res.annual.laaAfterCap;
    const capitalsRaw = res.capitals.totalCapitalsAccident ?? 0;
    // afficher le capital une seule fois (année courante), 0 sinon
    const capitals = y === capitalYear ? capitalsRaw : 0;
    const total = ai + lpp + laa;
    const gap = need - total;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(capitals);
    rows[4].cells.push(total);
    rows[5].cells.push(need);
    rows[6].cells.push(gap);
  });

  return { headerYears: years, rows };
}

function buildDecesMaladieMatrix(client: ClientData, legal: Legal_Settings): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(startY, (by ?? startY) + legal.Legal_AgeRetraiteAVS);
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  const capitalYear = startY; // afficher le capital uniquement sur l'année en cours

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

const deathRef = new Date(); // décès supposé le jour de l’analyse
years.forEach((y) => {
  const res = computeDecesMaladie(
    deathRef,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) } // enfants calculés à la date de paiement (colonne)
  );
    const ai = res.annual.avs;
    const lpp = res.annual.lppRentes;
    const laa = 0;
    const capitalsRaw = res.capitals.totalCapitalsMaladie ?? 0;
    // afficher le capital une seule fois (année courante), 0 sinon
    const capitals = y === capitalYear ? capitalsRaw : 0;
    const total = ai + lpp + laa;
    const gap = need - total;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(capitals);
    rows[4].cells.push(total);
    rows[5].cells.push(need);
    rows[6].cells.push(gap);
  });

  return { headerYears: years, rows };
}

function buildRetraiteMatrix(client: ClientData, legal: Legal_Settings): Matrix {
  const need = client.Enter_salaireAnnuel ?? 0;
  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startAt = (by ?? currentYear()) + legal.Legal_AgeRetraiteAVS; // 65 ans
  const endY = startAt + 22; // 65 → 87
  const years = Array.from({ length: endY - startAt + 1 }, (_, i) => startAt + i);

  const rows = [
    { label: "AVS/AI", cells: [] as number[] },
    { label: "LPP", cells: [] as number[] },
    { label: "LAA", cells: [] as number[] },
    { label: "Prestations en capital / indemnité unique", cells: [] as number[] },
    { label: "Prestation totale", cells: [] as number[] },
    { label: "Besoin (Salaire)", cells: [] as number[] },
    { label: "Lacune", cells: [] as (number | string)[] },
  ];

  years.forEach(() => {
    const res = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
    const ai = res.annual.avs;
    const lpp = res.annual.lpp;
    const laa = 0;
    const capitals = 0;
    const total = ai + lpp + laa;
    const gap = need - total;

    rows[0].cells.push(ai);
    rows[1].cells.push(lpp);
    rows[2].cells.push(laa);
    rows[3].cells.push(capitals);
    rows[4].cells.push(total);
    rows[5].cells.push(need);
    rows[6].cells.push(gap);
  });

  return { headerYears: years, rows };
}

/* ===== Table renderer ===== */
function MatrixTable({ title, matrix }: { title: string; matrix: Matrix }) {
  return (
    <Card>
      <H2>{title}</H2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 pr-3"> </th>
            {matrix.headerYears.map((y) => (
              <th key={y} className="text-right py-2 pr-3">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.label}>
              <td className="py-2 pr-3">{r.label}</td>
              {r.cells.map((v, i) => (
                <td key={i} className="text-right py-2 pr-3">
                  {r.label === "Lacune" ? gapSign(v as number) : chf(v as number)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ===== Page ===== */
export default function ProfilClientResultsPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUid(u.uid);
    });
    return () => unsub();
  }, [router]);

  // Data
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDonneesPersonnelles(uid, (d) => {
      setClient(d as ClientData | null);
      setLoading(false);
    });
    return () => { if (unsub) unsub(); };
  }, [uid]);

  if (!uid) return <div className="p-6 max-w-5xl mx-auto">Connectez-vous.</div>;
  if (loading) return <div className="p-6 max-w-5xl mx-auto">Chargement…</div>;
  if (!client) return <div className="p-6 max-w-5xl mx-auto">Aucune donnée trouvée.</div>;

  const legal = DEFAULT_LEGAL_2025;

  const mInvAcc = buildInvaliditeAccidentMatrix(client, legal);
  const mInvMal = buildInvaliditeMaladieMatrix(client, legal);
  const mDecAcc = buildDecesAccidentMatrix(client, legal);
  const mDecMal = buildDecesMaladieMatrix(client, legal);
  const mRet = buildRetraiteMatrix(client, legal);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Prestations (matrices annuelles)</h1>

      <MatrixTable title="Invalidité — Accident" matrix={mInvAcc} />
      <MatrixTable title="Invalidité — Maladie" matrix={mInvMal} />
      <MatrixTable title="Décès — Accident" matrix={mDecAcc} />
      <MatrixTable title="Décès — Maladie" matrix={mDecMal} />
      <MatrixTable title="Retraite" matrix={mRet} />
    </div>
  );
}