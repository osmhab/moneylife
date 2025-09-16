// app/analyse/[id]/page.tsx
import React from "react";
import Link from "next/link";
import { db } from "@/lib/firebaseAdmin";
import type * as admin from "firebase-admin";
import PrefillConfiguratorButton from "../_components/PrefillConfiguratorButton";
import { computeAvsAiMonthly } from "@/lib/avsAI";
import AvsAiCard from "../_components/AvsAiCard";

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
  // Rentes & capitaux
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
  proofs?: Record<string, { snippet: string; page?: number; x1?: number; y1?: number; x2?: number; y2?: number }> | null;
  confidence?: number | null;
  needs_review?: boolean;
  extractedAt?: admin.firestore.FieldValue;
  docType?: "LPP_CERT";
  sourcePath?: string;
  filename?: string;
  text?: string;
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

function formatChf(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
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

export default async function AnalysePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const analysis = await getAnalysis(id);
  if (!analysis) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Analyse introuvable</h1>
        <p className="text-sm text-gray-600">
          Aucun document d’analyse trouvé pour l’identifiant <span className="font-mono">{id}</span>.
        </p>
        <div className="mt-6">
          <Link href="/scan" className="text-blue-600 underline">Retour au scan</Link>
        </div>
      </main>
    );
  }

  const lpp = await getLatestLppForClient(id, analysis.lppParsedRefs);

  // Revenu annuel de référence
  const revenuAnnuel =
    analysis?.meta?.revenuAnnuel ??
    lpp?.salaireDeterminant ??
    60000;

  const coeff: 1 | 0.75 | 0.5 | 0.25 = analysis?.meta?.coeffCarriere ?? 1;
  const avs = await computeAvsAiMonthly(revenuAnnuel, { year: 2025, coeffCarriere: coeff });

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analyse #{id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-600">
            Statut: <span className="font-medium">{analysis.status || "PARSED"}</span>{" "}
            {!!analysis.meta?.version && <span className="ml-2 text-gray-500">• {analysis.meta.version}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/scan" className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50">⟵ Refaire un scan</Link>
          {/* @ts-expect-error server/edge compat */}
          <PrefillConfiguratorButton clientToken={id} disabled={!lpp} />
        </div>
      </header>

      {/* Bloc AVS/AI */}
      <section className="rounded-2xl border p-4 md:p-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4">1er pilier (AVS/AI)</h2>
        <AvsAiCard
          oldAge65={avs.oldAge65}
          invalidity={avs.invalidity}
          widowWidower={avs.widowWidower}
          orphan={avs.orphan}
          child={avs.child}
          matchedIncome={avs.baseIncomeMatched}
          coeff={avs.coeff}
        />
      </section>

      {/* Bloc LPP résumé */}
      <section className="rounded-2xl border p-4 md:p-6 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Certificat LPP</h2>
          {lpp && (
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: "#4fd1c5" }}
              >
                Confiance {Math.round(((lpp.confidence ?? 0.7) * 100))}%
              </span>
              {lpp.needs_review && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
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
              <h3 className="font-medium mb-2">Identité & document</h3>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
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
              <h3 className="font-medium mb-2">Salaires & avoirs</h3>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <Field label="Salaire déterminant" value={formatChf(lpp.salaireDeterminant)} />
                <Field label="Déduction de coordination" value={formatChf(lpp.deductionCoordination)} />
                <Field label="Salaire assuré (Épargne)" value={formatChf(lpp.salaireAssureEpargne)} />
                <Field label="Salaire assuré (Risque)" value={formatChf(lpp.salaireAssureRisque)} />
                <Field label="Avoir de vieillesse (actuel)" value={formatChf(lpp.avoirVieillesse)} />
                <Field label="… dont selon LPP/BVG" value={formatChf(lpp.avoirVieillesseSelonLpp)} />
                <Field label="Taux d’intérêt projeté" value={formatPct(lpp.interetProjetePct)} />
              </div>
            </div>

            {/* Prestations risque & retraite */}
            <div>
              <h3 className="font-medium mb-2">Prestations & retraite</h3>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <Field label="Rente d’invalidité (an)" value={formatChf(lpp.renteInvaliditeAnnuelle)} />
                <Field label="Rente enfant d’invalide (an)" value={formatChf(lpp.renteEnfantInvaliditeAnnuelle)} />
                <Field label="Rente de conjoint (an)" value={formatChf(lpp.renteConjointAnnuelle)} />
                <Field label="Rente d’orphelin (an)" value={formatChf(lpp.renteOrphelinAnnuelle)} />
                <Field label="Capital décès" value={formatChf(lpp.capitalDeces)} />
                <Field label="Capital à la retraite (65 ans)" value={formatChf(lpp.capitalRetraite65)} />
                <Field label="Rente à la retraite (65 ans, an)" value={formatChf(lpp.renteRetraite65Annuelle)} />
              </div>
            </div>

            {/* Options / opérations */}
            <div>
              <h3 className="font-medium mb-2">Options & opérations</h3>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <Field label="Rachat possible" value={formatChf(lpp.rachatPossible)} />
                <Field label="EPL disponible" value={formatChf(lpp.eplDisponible)} />
                <Field
                  label="Mise en gage"
                  value={
                    lpp.miseEnGage == null
                      ? "—"
                      : lpp.miseEnGage
                      ? "Oui"
                      : "Non"
                  }
                />
              </div>
            </div>

            {/* Anomalies & preuves */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Anomalies détectées</h3>
                {Array.isArray((lpp as any).issues) && (lpp as any).issues.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(lpp as any).issues.map((it: string, i: number) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">Aucune anomalie notée.</p>
                )}
              </div>
              <div>
                <h3 className="font-medium mb-2">Preuves (snippets)</h3>
                {lpp.proofs && Object.keys(lpp.proofs).length > 0 ? (
                  <div className="text-sm text-gray-800 space-y-1 max-h-48 overflow-auto rounded border p-3 bg-gray-50">
                    {Object.entries(lpp.proofs!).map(([k, v]) => (
                      <div key={k}>
                        <span className="font-mono text-xs px-1 py-0.5 rounded bg-gray-200 mr-2">{k}</span>
                        <span className="">{v.snippet}</span>
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

      {/* Fichiers traités */}
      <section className="rounded-2xl border p-4 md:p-6 bg-white shadow-sm">
        <h3 className="font-medium mb-2">Fichiers analysés</h3>
        {analysis.files?.length ? (
          <ul className="text-sm list-disc pl-5">
            {analysis.files.map((f, i) => (
              <li key={i} className="break-all">{f.filename} <span className="text-gray-500">({f.path})</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Aucun fichier listé.</p>
        )}
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-48 shrink-0 text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
