// app/analyse/[id]/page.tsx
import React from "react";
import Link from "next/link";
import { db } from "@/lib/firebaseAdmin";
import type * as admin from "firebase-admin";


import PrefillConfiguratorButton from "../_components/PrefillConfiguratorButton";
import { computeAvsAiMonthly } from "@/lib/avsAI";
import AvsAiCard from "../_components/AvsAiCard";
import AnalysisGapsPanel from "../_components/AnalysisGapsPanel";


// LPP helpers & UI
import { computeLppAnalysis, type SurvivorContext } from "@/lib/lpp";
import LppCard from "../_components/LppCard";

// LAA (accident) helpers & UI
import {
  loadRegsLaa,
  computeAccidentDailyAllowance,
  computeAccidentInvalidityMonthly,
  computeAccidentSurvivorsMonthly,
} from "@/lib/laa";
import LaaCard from "../_components/LaaCard";


/* =========================
 * Types Firestore (LPP parsed & Analyse)
 * ========================= */
type LppParsed = {
  id?: string;
  clientToken?: string;
  // Identité & méta
  employeur?: string | null;
  caisse?: string | null;
  dateCertificat?: string | null;
  prenom?: string | null;
  nom?: string | null;
  dateNaissance?: string | null;
  // Salaires & avoirs
  salaireDeterminant?: number | null;
  deductionCoordination?: number | null;
  salaireAssureEpargne?: number | null;
  salaireAssureRisque?: number | null;
  avoirVieillesse?: number | null;
  avoirVieillesseSelonLpp?: number | null;
  interetProjetePct?: number | null;
  // Rentes & capitaux (annuels pour les rentes certificat)
  renteInvaliditeAnnuelle?: number | null;
  renteEnfantInvaliditeAnnuelle?: number | null;
  renteConjointAnnuelle?: number | null;
  renteOrphelinAnnuelle?: number | null;
  capitalDeces?: number | null;
  capitalRetraite65?: number | null;
  renteRetraite65Annuelle?: number | null;
  // Options / opérations
  rachatPossible?: number | null;
  eplDisponible?: number | null;
  miseEnGage?: boolean | null;

  // Méta IA
  proofs?: Record<
    string,
    { snippet: string; page?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  > | null;
  confidence?: number | null;
  needs_review?: boolean;
  extractedAt?: admin.firestore.FieldValue;
  docType?: "LPP_CERT";
  sourcePath?: string;
  filename?: string;
  text?: string;

  // Optionnel: anomalies listées par l'IA
  issues?: string[];
};

type AnalysisDoc = {
  clientToken: string;
  prefix?: string;
  status?: string;
  createdAt?: admin.firestore.FieldValue;
  offersParsedRefs?: string[];
  lppParsedRefs?: string[];
  files?: { filename: string; path: string }[];
  meta?: any;
};

/* =========================
 * Utils formatage
 * ========================= */
function formatChf(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(n);
}
function formatPct(p?: number | null) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(p) + " %";
}
function formatDateSwiss(s?: string | null) {
  if (!s) return "—";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}
const toMonthly = (annual?: number | null) =>
  typeof annual === "number" && Number.isFinite(annual) ? Math.round(annual / 12) : undefined;

/* =========================
 * Data loaders
 * ========================= */
async function getAnalysis(id: string): Promise<AnalysisDoc | null> {
  const snap = await db.collection("analyses").doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as AnalysisDoc) : null;
}

async function getLatestLppForClient(
  id: string,
  lppRefs?: string[]
): Promise<LppParsed | null> {
  let lpps: LppParsed[] = [];
  if (lppRefs && lppRefs.length) {
    const reads = await Promise.allSettled(
      lppRefs.map((rid) => db.collection("lpp_parsed").doc(rid).get())
    );
    lpps = reads
      .filter(
        (r): r is PromiseFulfilledResult<FirebaseFirestore.DocumentSnapshot> =>
          r.status === "fulfilled"
      )
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

/* =========================
 * Contexte survivants (LPP) à partir des métadonnées
 * ========================= */
function survivorContextFromMeta(meta: any): SurvivorContext {
  // Valeurs par défaut prudentes
  const maritalStatus =
    meta?.maritalStatus ??
    meta?.etatCivil ??
    "celibataire"; // 'marie' | 'mariee' | 'celibataire' | 'divorce' | 'divorcee' | 'partenariat_enregistre' | 'concubinage'

  return {
    maritalStatus,
    hasChild: !!(meta?.hasChild ?? meta?.enfantsACharge?.length),
    ageAtWidowhood: meta?.ageAtWidowhood, // souvent inconnu au moment de l'analyse
    marriageYears: meta?.marriageYears,
    registeredPartnershipYears: meta?.registeredPartnershipYears,
    cohabitationYears: meta?.cohabitationYears,
    beneficiaryDesignationOnFile: meta?.beneficiaryDesignationOnFile,
    hasCommonChildOrMaintenanceDuty: meta?.hasCommonChildOrMaintenanceDuty,
    remarriedOrNewRegPartner: false,
    newMarriageOrNewRegPartner: false,
    childAge: meta?.childAge,
    inTraining: meta?.inTraining,
  };
}

/* =========================
 * Helpers âge
 * ========================= */
function parseBirthDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  // dd.mm.yyyy
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  return undefined;
}
function computeAge(dateStr?: string | null): number | undefined {
  const d = parseBirthDate(dateStr);
  if (!d) return undefined;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

/* =========================
 * Page (Server Component)
 * ========================= */
type Props = { params: Promise<{ id: string }> };

export default async function AnalysePage({ params }: Props) {
  const { id } = await params;

  const analysis = await getAnalysis(id);
  if (!analysis) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Analyse introuvable</h1>
        <p className="text-sm text-gray-600">
          Aucun document d’analyse trouvé pour l’identifiant{" "}
          <span className="font-mono">{id}</span>.
        </p>
        <div className="mt-6">
          <Link href="/scan" className="text-blue-600 underline">
            Retour au scan
          </Link>
        </div>
      </main>
    );
  }

  // Dernier certificat LPP dispo
  const lpp = await getLatestLppForClient(id, analysis.lppParsedRefs);

  // Revenu annuel de référence (AVS & LPP)
  const revenuAnnuel: number =
    analysis?.meta?.revenuAnnuel ??
    (typeof lpp?.salaireDeterminant === "number" ? lpp!.salaireDeterminant! : undefined) ??
    60_000;

  // Coeff carrière AVS (1, 0.75, 0.5, 0.25)
  const coeff: 1 | 0.75 | 0.5 | 0.25 = analysis?.meta?.coeffCarriere ?? 1;

  // --- AVS/AI (Échelle 44)
  const avs = await computeAvsAiMonthly(revenuAnnuel, {
    year: 2025,
    coeffCarriere: coeff,
  });

  // --- LPP (coordinated salary, savings, survivants)
  const employmentRate: number =
    analysis?.meta?.employmentRate ??
    analysis?.meta?.tauxOccupation ??
    1;

  // Rente LPP de référence mensuelle (pour survivants) — priorité à invalidité/AVS pro si dispo
  const referenceMonthlyPension: number =
    toMonthly(lpp?.renteInvaliditeAnnuelle) ??
    toMonthly(lpp?.renteRetraite65Annuelle) ??
    (typeof lpp?.capitalRetraite65 === "number"
      ? Math.round((lpp!.capitalRetraite65! * 0.068) / 12) // min légal sur part obligatoire
      : 0);

  const survivorCtx: SurvivorContext = survivorContextFromMeta(analysis.meta || {});

  const lppRes = await computeLppAnalysis({
    year: 2025,
    annualSalary: revenuAnnuel,
    employmentRate,
    age: computeAge(lpp?.dateNaissance) ?? analysis?.meta?.age ?? 45,
    referenceMonthlyPension,
    useAdaptiveCoordination:
      !!analysis?.meta?.useAdaptiveCoordination || !!analysis?.meta?.coordinationAdaptative,
    survivorContext: survivorCtx,
  });

  // ===== LAA (accident) =====
  const laaRegs = await loadRegsLaa(2025);

  // Indemnité journalière
  const ij = computeAccidentDailyAllowance(revenuAnnuel, laaRegs);

  // Invalidité accident — degré par défaut 100% si rien fourni
  const degreeInvalidityPct: number =
    analysis?.meta?.accidentInvalidityPct ??
    analysis?.meta?.invaliditeAccidentPct ??
    100;

  const invAcc = computeAccidentInvalidityMonthly(
    {
      annualSalaryAvs: revenuAnnuel,
      degreeInvalidityPct: degreeInvalidityPct,
      aiMonthly: avs.invalidity, // coordination AI + LAA ≤ 90%
    },
    laaRegs
  );

  // Survivants accident — context minimal
  const maritalStatus = survivorCtx.maritalStatus;
  const isMarriedOrReg =
    maritalStatus === "marie" ||
    maritalStatus === "mariee" ||
    maritalStatus === "partenariat_enregistre";

  const spouseHasRightAccident: boolean =
    (analysis?.meta?.laaSpouseHasRight as boolean | undefined) ??
    (isMarriedOrReg && (survivorCtx.hasChild || (survivorCtx.ageAtWidowhood ?? 45) >= 45));

  const nbEnfants: number =
    analysis?.meta?.nbEnfants ??
    (Array.isArray(analysis?.meta?.enfantsACharge)
      ? analysis.meta.enfantsACharge.length
      : 0);

  const avsSurvivorsMonthlyTotal =
    (spouseHasRightAccident ? (avs.widowWidower ?? 0) : 0) +
    nbEnfants * (avs.child ?? 0);

  const survAcc = computeAccidentSurvivorsMonthly(
    {
      annualSalaryAvs: revenuAnnuel,
      spouseHasRight: spouseHasRightAccident,
      nOrphans: nbEnfants,
      nDoubleOrphans: analysis?.meta?.nDoubleOrphans ?? 0,
      avsAiSurvivorsMonthlyTotal: avsSurvivorsMonthlyTotal,
    },
    laaRegs
  );

  // Valeurs certificat converties en mensuel si disponibles
  const certWidowMonthly = toMonthly(lpp?.renteConjointAnnuelle);
  const certOrphanMonthly = toMonthly(lpp?.renteOrphelinAnnuelle);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analyse #{id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/scan"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ⟵ Refaire un scan
          </Link>
          {/* @ts-expect-error server/edge compat */}
          <PrefillConfiguratorButton clientToken={id} disabled={!lpp} />
        </div>
      </header>

      {/* Statut */}
      <section className="rounded-2xl border bg-white p-3 shadow-sm md:p-4">
        <p className="text-sm text-gray-600">
          Statut:{" "}
          <span className="font-medium">
            {analysis.status || "PARSED"}
          </span>{" "}
          {!!analysis.meta?.version && (
            <span className="ml-2 text-gray-500">• {analysis.meta.version}</span>
          )}
        </p>
      </section>

      {/* Bloc AVS/AI */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">1er pilier (AVS/AI)</h2>
        <AvsAiCard
          year={2025}
          oldAge65={avs.oldAge65}
          invalidity={avs.invalidity}
          widowWidower={avs.widowWidower}
          orphan={avs.orphan}
          child={avs.child}
          matchedIncome={avs.baseIncomeMatched}
          coeff={avs.coeff}
          forWidowWidower120={avs.forWidowWidower120}
          supplementary30={avs.supplementary30}
        />
      </section>

      {/* Bloc LPP (calculé) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">2e pilier (LPP/BVG)</h2>
        <LppCard
          year={lppRes.year}
          currency={lppRes.currency}
          coordinatedSalary={lppRes.coordinatedSalary}
          savingsCredit={lppRes.savingsCredit}
          survivor={lppRes.survivor}
          meta={lppRes.meta}
          certWidowWidowerMonthly={certWidowMonthly}
          certOrphanMonthly={certOrphanMonthly}
          certDeathCapital={typeof lpp?.capitalDeces === "number" ? lpp!.capitalDeces! : undefined}
        />
      </section>

      {/* Bloc Accident (LAA) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">Accident (LAA/UVG)</h2>
        <LaaCard
          year={2025}
          insuredAnnual={invAcc.insuredAnnual}
          daily={{ amountPerDay: ij.dailyAllowance, startsFromDay: ij.startsFromDay }}
          invalidity={{
            degreePct: degreeInvalidityPct,
            nominalMonthly: invAcc.nominalMonthly,
            coordinatedMonthly: invAcc.coordinatedMonthly,
            aiMonthly: invAcc.aiMonthly,
            totalMonthly: invAcc.totalMonthly,
            capMonthly: invAcc.capMonthly,
          }}
          survivors={{
            laaMonthlyTotal: survAcc.laaMonthlyTotal,
            avsMonthlyTotal: survAcc.avsMonthlyTotal,
            overallCapMonthly: survAcc.overallCapMonthly,
            spouseMonthly: survAcc.spouseMonthly,
            orphansMonthlyTotal: survAcc.orphansMonthlyTotal,
          }}
          meta={{
            weeklyHours: analysis.meta?.weeklyHours,
            nonOccupationalCovered: (analysis.meta?.weeklyHours ?? 0) >= 8,
            accidentKind: analysis.meta?.accidentKind, // 'occupational' | 'non_occupational'
          }}
        />
      </section>

      {/* Bloc Certificat LPP — détails extraits */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Certificat LPP</h2>
          {lpp && (
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: "#4fd1c5" }}
              >
                Confiance {Math.round((lpp.confidence ?? 0.7) * 100)}%
              </span>
              {lpp.needs_review && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                  Vérifier
                </span>
              )}
            </div>
          )}
        </div>

        {!lpp ? (
          <p className="text-sm text-gray-600">
            Aucun certificat LPP n’a été extrait pour ce client (encore).
          </p>
        ) : (
          <div className="space-y-6">
            {/* Identité & document */}
            <div>
              <h3 className="mb-2 font-medium">Identité & document</h3>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <Field label="Caisse de pension" value={lpp.caisse || "—"} />
                <Field label="Date du certificat" value={formatDateSwiss(lpp.dateCertificat)} />
                <Field label="Prénom" value={lpp.prenom || "—"} />
                <Field label="Nom" value={lpp.nom || "—"} />
                <Field label="Date de naissance" value={formatDateSwiss(lpp.dateNaissance)} />
                <Field label="Employeur" value={lpp.employeur || "—"} />
                <Field label="Fichier source" value={lpp.filename || lpp.sourcePath || "—"} />
              </div>
            </div>

            {/* Salaires & avoirs */}
            <div>
              <h3 className="mb-2 font-medium">Salaires & avoirs</h3>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <Field label="Salaire déterminant" value={formatChf(lpp.salaireDeterminant)} />
                <Field label="Déduction de coordination" value={formatChf(lpp.deductionCoordination)} />
                <Field label="Salaire assuré (Épargne)" value={formatChf(lpp.salaireAssureEpargne)} />
                <Field label="Salaire assuré (Risque)" value={formatChf(lpp.salaireAssureRisque)} />
                <Field label="Avoir de vieillesse (actuel)" value={formatChf(lpp.avoirVieillesse)} />
                <Field label="… dont selon LPP/BVG" value={formatChf(lpp.avoirVieillesseSelonLpp)} />
                <Field label="Taux d’intérêt projeté" value={formatPct(lpp.interetProjetePct)} />
              </div>
            </div>

            {/* Prestations & retraite */}
            <div>
              <h3 className="mb-2 font-medium">Prestations & retraite</h3>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <Field label="Rente d’invalidité (an)" value={formatChf(lpp.renteInvaliditeAnnuelle)} />
                <Field
                  label="Rente enfant d’invalide (an)"
                  value={formatChf(lpp.renteEnfantInvaliditeAnnuelle)}
                />
                <Field label="Rente de conjoint (an)" value={formatChf(lpp.renteConjointAnnuelle)} />
                <Field label="Rente d’orphelin (an)" value={formatChf(lpp.renteOrphelinAnnuelle)} />
                <Field label="Capital décès" value={formatChf(lpp.capitalDeces)} />
                <Field label="Capital à la retraite (65 ans)" value={formatChf(lpp.capitalRetraite65)} />
                <Field
                  label="Rente à la retraite (65 ans, an)"
                  value={formatChf(lpp.renteRetraite65Annuelle)}
                />
              </div>
            </div>

            {/* Options / opérations */}
            <div>
              <h3 className="mb-2 font-medium">Options & opérations</h3>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <Field label="Rachat possible" value={formatChf(lpp.rachatPossible)} />
                <Field label="EPL disponible" value={formatChf(lpp.eplDisponible)} />
                <Field
                  label="Mise en gage"
                  value={
                    lpp.miseEnGage == null ? "—" : lpp.miseEnGage ? "Oui" : "Non"
                  }
                />
              </div>
            </div>

            {/* Anomalies & preuves */}
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium">Anomalies détectées</h3>
                {Array.isArray(lpp.issues) && lpp.issues.length > 0 ? (
                  <ul className="space-y-1 list-disc pl-5 text-sm">
                    {lpp.issues.map((it: string, i: number) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">Aucune anomalie notée.</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-medium">Preuves (snippets)</h3>
                {lpp.proofs && Object.keys(lpp.proofs).length > 0 ? (
                  <div className="max-h-48 space-y-1 overflow-auto rounded border bg-gray-50 p-3 text-sm text-gray-800">
                    {Object.entries(lpp.proofs!).map(([k, v]) => (
                      <div key={k}>
                        <span className="mr-2 rounded bg-gray-200 px-1 py-0.5 font-mono text-xs">
                          {k}
                        </span>
                        <span>{v.snippet}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Aucune preuve disponible.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Lacunes — aperçu interactif */}
<section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
  <h2 className="mb-4 text-xl font-semibold">Lacunes (aperçu interactif)</h2>
  <AnalysisGapsPanel
    annualIncome={revenuAnnuel}
    avs={{
      invalidityMonthly: avs.invalidity,
      widowMonthly: avs.widowWidower,
      childMonthly: avs.child,
      oldAgeMonthly: avs.oldAge65,
    }}
    lpp={{
      invalidityMonthly: (typeof lpp?.renteInvaliditeAnnuelle === 'number') ? Math.round(lpp!.renteInvaliditeAnnuelle! / 12) : referenceMonthlyPension,
      widowMonthly: certWidowMonthly ?? lppRes.survivor.amounts.widowWidowerMonthly,
      orphanMonthly: certOrphanMonthly ?? lppRes.survivor.amounts.orphanMonthly,
      retirementAnnualFromCert: lpp?.renteRetraite65Annuelle ?? undefined,
      capitalAt65FromCert: lpp?.capitalRetraite65 ?? undefined,
      minConversionRatePct: lppRes.meta.convMinPct,
    }}
    survivorDefault={{
      maritalStatus: survivorCtx.maritalStatus,
      hasChild: !!survivorCtx.hasChild,
      ageAtWidowhood: survivorCtx.ageAtWidowhood,
    }}
    laaParams={laaRegs?.laa ? {
      insured_earnings_max: laaRegs.laa.insured_earnings_max,
      disabilityPctFull: laaRegs.laa.disability.pct_at_full_invalidity,
      overallCapPct: laaRegs.laa.coordination.invalidity_ai_laa_cap_pct,
      spousePct: laaRegs.laa.survivors.spouse_pct,
      orphanPct: laaRegs.laa.survivors.orphan_pct,
      doubleOrphanPct: laaRegs.laa.survivors.double_orphan_pct,
      familyCapPct: laaRegs.laa.survivors.family_cap_pct,
    } : undefined}
    initialTargets={{ invalidityPctTarget: 90, deathPctTarget: 80, retirementPctTarget: 80 }}
    initialCtx={{
      eventInvalidity: 'maladie',
      eventDeath: 'maladie',
      invalidityDegreePct: 100,
      childrenCount: analysis?.meta?.nbEnfants ?? 0,
      weeklyHours: analysis?.meta?.weeklyHours ?? undefined,
    }}
  />
</section>


      {/* Fichiers traités */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h3 className="mb-2 font-medium">Fichiers analysés</h3>
        {analysis.files?.length ? (
          <ul className="list-disc pl-5 text-sm">
            {analysis.files.map((f, i) => (
              <li key={i} className="break-all">
                {f.filename} <span className="text-gray-500">({f.path})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Aucun fichier listé.</p>
        )}
      </section>
    </main>
  );
}

/* =========================
 * Petits composants
 * ========================= */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-48 shrink-0 text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
