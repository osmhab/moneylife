// app/analyse/[id]/invalidite/page.tsx
import React, { Suspense } from "react";
import Link from "next/link";
import type * as admin from "firebase-admin";
import { db } from "@/lib/firebaseAdmin";
import { computeAvsAiMonthly } from "@/lib/avsAI";
import type { LppParsed } from "@/lib/layoutTypes";
import { loadRegsLaa } from "@/lib/laa";
import InvaliditeViewClient from "./view-client";
import RequireAccount from "../_client/RequireAccount";



export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================
 * Types Firestore
 * ========================= */
type AnalysisDoc = {
  id?: string;
  clientToken: string;
  status?: string;
  createdAt?: admin.firestore.FieldValue;
  offersParsedRefs?: string[];
  lppParsedRefs?: string[];
  files?: { filename: string; path: string }[];
  meta?: any;
};

async function getAnalysis(id: string): Promise<AnalysisDoc | null> {
  const snap = await db.collection("analyses").doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as AnalysisDoc) : null;
}

async function getLatestLppForClient(id: string, lppRefs?: string[]): Promise<LppParsed | null> {
  let lpps: LppParsed[] = [];
  if (lppRefs && lppRefs.length) {
    const reads = await Promise.allSettled(
      lppRefs.map((rid) => db.collection("lpp_parsed").doc(rid).get())
    );
    lpps = reads
      .filter((r): r is PromiseFulfilledResult<FirebaseFirestore.DocumentSnapshot> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, ...(d.data() as any) })) as LppParsed[];
  }
  if (!lpps.length) {
    const q = await db
      .collection("lpp_parsed")
      .where("clientToken", "==", id)
      .orderBy("extractedAt", "desc")
      .limit(1)
      .get();
    lpps = q.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as LppParsed[];
  }
  if (!lpps.length) return null;
  lpps.sort((a, b) => {
    const ta = (a as any).extractedAt?.toMillis?.() ?? 0;
    const tb = (b as any).extractedAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return lpps[0];
}

function toMonthly(annual?: number | null) {
  return typeof annual === "number" && Number.isFinite(annual) ? Math.round(annual / 12) : undefined;
}

function isPlainObject(o: any) {
  if (o === null || typeof o !== "object") return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}
function tsToIso(v: any): string | undefined {
  try {
    if (v?.toDate) return v.toDate().toISOString();
    if (typeof v?._seconds === "number") {
      const ms = v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6);
      return new Date(ms).toISOString();
    }
  } catch {}
  return undefined;
}
function sanitizeForClient<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.map((el) => (typeof el === "object" ? sanitizeForClient(el as any) : el));
      continue;
    }
    const iso = tsToIso(v);
    if (iso) {
      out[k] = iso;
      continue;
    }
    if (isPlainObject(v)) {
      out[k] = sanitizeForClient(v as any);
      continue;
    }
    // drop
  }
  return out;
}

/* =========================
 * Page
 * ========================= */
export default async function InvaliditePage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params; // ✅ must await params

  const analysis = await getAnalysis(id);
  if (!analysis) {
    return (
      <main className="w-full space-y-8 px-4 md:px-6">
        <h1 className="mb-2 text-2xl font-semibold">Analyse introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Aucun document d’analyse trouvé pour l’identifiant <span className="font-mono">{id}</span>.
        </p>
        <div className="mt-4">
          <Link href="/scan" className="text-blue-600 underline">
            Retour au scan
          </Link>
        </div>
      </main>
    );
  }

  const lpp = await getLatestLppForClient(id, analysis.lppParsedRefs);

  // Revenu ann. de référence
  const revenuAnnuel: number =
    analysis?.meta?.revenuAnnuel ??
    (typeof lpp?.salaireDeterminant === "number" ? lpp!.salaireDeterminant! : undefined) ??
    60_000;

  // Coeff carrière AVS (défaut 1 si meta absent)
  const coeff: 1 | 0.75 | 0.5 | 0.25 = analysis?.meta?.coeffCarriere ?? 1;

  // AVS/AI (actuel → risques immédiats)
  const avsNow = await computeAvsAiMonthly(revenuAnnuel, {
    year: 2025,
    coeffCarriere: coeff,
  });

  // LPP — invalidité/adultes + enfants (priorité certificat)
  const lppInvalidityMonthly =
    typeof lpp?.renteInvaliditeAnnuelle === "number" ? Math.round(lpp.renteInvaliditeAnnuelle / 12) : undefined;
  const lppInvalidityChildMonthly =
    typeof lpp?.renteEnfantInvaliditeAnnuelle === "number" ? Math.round(lpp.renteEnfantInvaliditeAnnuelle / 12) : undefined;

  // LAA — barèmes (pour la coordination côté client)
  const laaRegs = await loadRegsLaa(2025);
  const laaParams = laaRegs?.laa
    ? {
        insured_earnings_max: laaRegs.laa.insured_earnings_max,
        disabilityPctFull: laaRegs.laa.disability.pct_at_full_invalidity,
        overallCapPct: laaRegs.laa.coordination.invalidity_ai_laa_cap_pct,
        spousePct: laaRegs.laa.survivors.spouse_pct,
        orphanPct: laaRegs.laa.survivors.orphan_pct,
        familyCapPct: laaRegs.laa.survivors.family_cap_pct,
      }
    : undefined;


    // Date de naissance pour la projection/timeline (si dispo)
const birthDateISO =
  (typeof (lpp as any)?.dateNaissance === "string" ? (lpp as any).dateNaissance : undefined) ??
  (typeof analysis?.meta?.dateNaissance === "string" ? analysis.meta.dateNaissance : undefined);


  // Même logique que sur la page principale
 const clientDocPath = analysis?.clientToken ? `clients/${analysis.clientToken}` : "";

  // Normalisation LPP pour l’éditeur éventuel
  const lppForClient = lpp ? (sanitizeForClient(lpp) as any) : null;

  return (
    <main className="w-full space-y-6 px-2 sm:px-4 lg:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/analyse/${id}`} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
            ← Retour à l’analyse
          </Link>
        </div>
        <div className="text-sm text-muted-foreground">Vue: Invalidité (maladie / accident) — Timeline</div>
      </header>


    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Chargement…</div>}>
  <RequireAccount onReady={() => { /* optionnel: refresh ou no-op */ }}>
    <InvaliditeViewClient
      analysisId={id}
      clientDocPath={analysis?.clientToken ? `clients/${analysis.clientToken}` : ""}
      annualIncome={revenuAnnuel}
      avs={{
        invalidityMonthly: avsNow.invalidity,
        childMonthly: avsNow.child,
        widowMonthly: avsNow.widowWidower,
      }}
      lpp={{
        invalidityMonthly: lppInvalidityMonthly,
        invalidityChildMonthly: lppInvalidityChildMonthly,
      }}
      laaParams={laaParams}
      ctx={{
        eventInvalidity:
          (analysis?.meta?.eventInvalidity === "accident" || analysis?.meta?.eventInvalidity === "maladie")
            ? analysis.meta.eventInvalidity
            : "maladie",
        invalidityDegreePct:
          typeof analysis?.meta?.accidentInvalidityPct === "number" && Number.isFinite(analysis.meta.accidentInvalidityPct)
            ? analysis.meta.accidentInvalidityPct
            : (typeof analysis?.meta?.invaliditeAccidentPct === "number" && Number.isFinite(analysis.meta.invaliditeAccidentPct)
                ? analysis.meta.invaliditeAccidentPct
                : 100),
        childrenCount:
          Array.isArray(analysis?.meta?.enfantsACharge)
            ? analysis.meta.enfantsACharge.length
            : (typeof analysis?.meta?.nbEnfants === "number" ? analysis.meta.nbEnfants : 0),
        childrenBirthdates:
          (Array.isArray(analysis?.meta?.enfantsACharge) && analysis.meta.enfantsACharge.length
            ? analysis.meta.enfantsACharge
            : analysis?.meta?.childrenBirthdates) ?? [],
        weeklyHours: analysis?.meta?.weeklyHours ?? undefined,
      }}
    />
  </RequireAccount>
</Suspense>



    </main>
  );
}
