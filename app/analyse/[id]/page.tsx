// app/analyse/[id]/page.tsx
import React, { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/firebaseAdmin";
import type * as admin from "firebase-admin";
import AutosaveBridge from './_client/AutosaveBridge';
import LppCertificateEditor from './_client/LppCertificateEditor';
import type { LppParsed, LppProofs } from '@/lib/layoutTypes';
import RobotApprentiCard from './_client/RobotApprentiCard';



import PrefillConfiguratorButton from "../_components/PrefillConfiguratorButton";
import { computeAvsAiMonthly } from "@/lib/avsAI";
import AvsAiCard from "../_components/AvsAiCard";
import GapsAndCardsClient from "../_components/GapsAndCardsClient";
import AnalysisArrivalToast from './_client/AnalysisArrivalToast';


// LPP helpers
import { computeLppAnalysis, type SurvivorContext } from "@/lib/lpp";

// LAA (accident) helpers
import {
  loadRegsLaa,
  computeAccidentDailyAllowance,
  computeAccidentInvalidityMonthly,
  computeAccidentSurvivorsMonthly,
} from "@/lib/laa";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { BadgeCheck } from "lucide-react";




export const dynamic = 'force-dynamic';
export const revalidate = 0; // pas de SSG/ISR



const SHOW_INFO_CARDS = false;

/* =========================
 * Types Firestore (LPP parsed & Analyse)
 * ========================= */


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
 * Helpers Server → Client (plain objects only)
 * ========================= */
function isPlainObject(o: any) {
  if (o === null || typeof o !== 'object') return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}
function tsToIso(v: any): string | undefined {
  // Firestore Timestamp: has toDate() or {_seconds,_nanoseconds}
  try {
    if (v?.toDate) return v.toDate().toISOString();
    if (typeof v?._seconds === 'number') {
      const ms = v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6);
      return new Date(ms).toISOString();
    }
  } catch (_) {}
  return undefined;
}
/** Supprime/convertit tout ce qui n'est pas “plain” pour être passé à un Client Component */
function sanitizeForClient<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) { out[k] = v; continue; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue; }
    if (Array.isArray(v)) {
      out[k] = v.map((el) => (typeof el === 'object' ? sanitizeForClient(el as any) : el));
      continue;
    }
    const iso = tsToIso(v);
    if (iso) { out[k] = iso; continue; }
    if (isPlainObject(v)) { out[k] = sanitizeForClient(v as any); continue; }
    // Sinon: on DROP (ex: classes, Map, Date, etc.)
    // console.warn('[sanitizeForClient] Dropped non-plain field:', k);
  }
  return out;
}




/* =========================
 * Page (Server Component)
 * ========================= */
export default async function AnalysePage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params; // ✅ attendre params avant d'utiliser id

  const analysis = await getAnalysis(id);
  if (!analysis) {
    return (
      <main className="w-full space-y-8 px-4 md:px-6">
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


// 1) AVS “actuelle” (risques immédiats: invalidité & survivants)
const avsNow = await computeAvsAiMonthly(revenuAnnuel, {
  year: 2025,
  coeffCarriere: coeff,
  // projectTo65: false (par défaut)
})

// 2) AVS “projetée 65” (pour la carte Retraite)
const startWorkYearCH =
  analysis?.meta?.debutActiviteYear ??
  analysis?.meta?.debutActiviteSuisse ??
  analysis?.meta?.startWorkYearCH ??
  analysis?.meta?.startYear ??
  undefined

const missingYearsList =
  analysis?.meta?.anneesSansCotisationList ??
  analysis?.meta?.missingYears ??
  [] as number[]

const birthDateISO = lpp?.dateNaissance ?? analysis?.meta?.dateNaissance ?? undefined

const avs65 = await computeAvsAiMonthly(revenuAnnuel, {
  year: 2025,
  coeffCarriere: coeff,          // fallback si infos incomplètes
  projectTo65: true,             // ← active la projection
  birthDateISO,
  startWorkYearCH,
  missingYears: Array.isArray(missingYearsList) ? missingYearsList : [],
})


  // --- LPP (coordinated salary, savings, survivants)
  const employmentRate: number =
    analysis?.meta?.employmentRate ??
    analysis?.meta?.tauxOccupation ??
    1;

  // Rente LPP de référence mensuelle (***uniquement pour survivants***, cf. minima 60% / 20%)
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
      aiMonthly: avsNow.invalidity, // coordination AI + LAA ≤ 90%
    },
    laaRegs
  );


  // Survivants accident — context minimal
  const maritalStatus = survivorCtx.maritalStatus;
  const isMarriedOrReg =
    maritalStatus === "marie" ||
    maritalStatus === "mariee" ||
    maritalStatus === "partenariat_enregistre";

  const ageAtWidowhood = computeAge(lpp?.dateNaissance) ?? analysis?.meta?.age;
const hasChildNow = !!survivorCtx.hasChild;

const spouseHasRightAccident: boolean =
  (analysis?.meta?.laaSpouseHasRight as boolean | undefined) ??
  (isMarriedOrReg && (hasChildNow || (typeof ageAtWidowhood === 'number' && ageAtWidowhood >= 45)));



  const nbEnfants: number =
    analysis?.meta?.nbEnfants ??
    (Array.isArray(analysis?.meta?.enfantsACharge)
      ? analysis.meta.enfantsACharge.length
      : 0);

  const avsSurvivorsMonthlyTotal =
  (spouseHasRightAccident ? (avsNow.widowWidower ?? 0) : 0) +
  nbEnfants * (avsNow.child ?? 0);



  const survAcc = computeAccidentSurvivorsMonthly(
    {
      annualSalaryAvs: revenuAnnuel,
      spouseHasRight: spouseHasRightAccident,
      nOrphans: nbEnfants,
      avsAiSurvivorsMonthlyTotal: avsSurvivorsMonthlyTotal,
    },
    laaRegs
  );

  // Valeurs certificat converties en mensuel si disponibles
  const certWidowMonthly = toMonthly(lpp?.renteConjointAnnuelle);
  const certOrphanMonthly = toMonthly(lpp?.renteOrphelinAnnuelle);
  const clientDocPath = analysis?.clientToken ? `clients/${analysis.clientToken}` : "";


  // Rente invalidité LPP depuis le certificat (si dispo) — on n'applique plus de fallback ici
const lppInvalidityFromCert =
  typeof lpp?.renteInvaliditeAnnuelle === "number"
    ? Math.round(lpp.renteInvaliditeAnnuelle / 12)
    : undefined;

// Inputs pour le fallback "minima légaux" — transmis à useGaps (calcul côté lib)
const ageYears = computeAge(lpp?.dateNaissance) ?? analysis?.meta?.age;

const currentAssetsLpp =
  (typeof lpp?.avoirVieillesseSelonLpp === "number" ? lpp.avoirVieillesseSelonLpp : undefined) ??
  (typeof lpp?.avoirVieillesse === "number" ? lpp.avoirVieillesse : undefined);





// Normalisation & sérialisation pour l'éditeur (Client Component)
const lppForEditor: LppParsed | null = lpp
  ? {
      ...(sanitizeForClient(lpp) as any),
      review: lpp.review ?? {
        status: lpp.needs_review ? 'flagged' : 'pending',
      },
      sources: lpp.sources ?? {},
    }
  : null;



const isVerified = lppForEditor?.review?.status === 'verified';




  return (
    <main className="w-full space-y-8 px-2 sm:px-4 lg:px-6">
      <AnalysisArrivalToast
        analysisId={id}
        confidence={lpp?.confidence ?? null}
        isVerified={isVerified}
        force
      />

      {/* Header */}
      <header className="flex items-center justify-between">
       
        <div className="flex items-center gap-2">
          <Link
            href="/scan"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refaire un scan
          </Link>
          {/* @ts-expect-error server/edge compat */}
          <PrefillConfiguratorButton clientToken={id} disabled={!lpp} />
        </div>
      </header>



      {/* Bloc AVS/AI */}
      {SHOW_INFO_CARDS && (
  <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
    <h2 className="mb-4 text-xl font-semibold">1er pilier (AVS/AI)</h2>
    <AvsAiCard
      year={2025}
      // retraite = projeté
      oldAge65={avs65.oldAge65}
      // risques immédiats = actuel
      invalidity={avsNow.invalidity}
      widowWidower={avsNow.widowWidower}
      orphan={avsNow.orphan}
      child={avsNow.child}
      // meta/info (peu critique) — tu peux prendre avs65 ou avsNow, même baseIncomeMatched
      matchedIncome={avs65.baseIncomeMatched ?? avsNow.baseIncomeMatched}
      // on garde le coeff ACTUEL pour transparence
      coeff={avsNow.coeff}
      forWidowWidower120={avs65.forWidowWidower120}
      supplementary30={avs65.supplementary30}
    />
    {/* Optionnel: petite ligne de transparence */}
    {typeof avs65.coeffProjectedTo65 === 'number' && (
      <p className="mt-2 text-xs text-muted-foreground">
        AVS projetée à 65 ans : {Math.round(avs65.coeffProjectedTo65 * 44)} / 44 années.
      </p>
    )}
  </section>
)}



      {/* Bloc interactif (Lacunes + LPP + LAA synchronisés) */}
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Chargement…</div>}>
      <GapsAndCardsClient
        key={id}
        clientDocPath={clientDocPath} 
        annualIncome={revenuAnnuel}
        avs={{
          // risques immédiats = AVS actuelle
          invalidityMonthly: avsNow.invalidity,
          widowMonthly: avsNow.widowWidower,
          childMonthly: avsNow.child,
          // retraite = AVS projetée à 65 ans
          oldAgeMonthly: avs65.oldAge65,
        }}

        lpp={{
  // 1) Invalidité (priorité au certif — le fallback minima sera fait dans useGaps)
  invalidityMonthly: lppInvalidityFromCert,
  invalidityChildMonthly:
    typeof lpp?.renteEnfantInvaliditeAnnuelle === "number"
      ? Math.round(lpp.renteEnfantInvaliditeAnnuelle / 12)
      : undefined, // sinon 20% sera appliqué côté useGaps

  // 2) Survivants LPP (priorité aux certifs; sinon minima calculés dans computeLppAnalysis)
  widowMonthly: certWidowMonthly ?? lppRes.survivor.amounts.widowWidowerMonthly,
  orphanMonthly: certOrphanMonthly ?? lppRes.survivor.amounts.orphanMonthly,

  // 3) Retraite LPP (pour l’estimation retraite et proxy éventuel)
  retirementAnnualFromCert: lpp?.renteRetraite65Annuelle ?? undefined,
  capitalAt65FromCert: lpp?.capitalRetraite65 ?? undefined,
  minConversionRatePct: lppRes.meta.convMinPct,

  // 4) ***NOUVEAU*** — Inputs pour fallback "minima invalidité" (conforme loi)
  invalidityMinYear: 2025,
  invalidityMinAgeYears: ageYears,
  invalidityMinCoordinatedSalary: lppRes.coordinatedSalary, // annuel LPP obligatoire
  invalidityMinCurrentAssets: currentAssetsLpp, // avoir acquis au moment du droit (si connu)
}}


        
   survivorDefault={{
  maritalStatus: survivorCtx.maritalStatus,
  hasChild: !!survivorCtx.hasChild,
  ageAtWidowhood: computeAge(lpp?.dateNaissance) ?? analysis?.meta?.age, // ✅ pas de "?? 45"
  partnerDesignated: !!survivorCtx.beneficiaryDesignationOnFile,
  cohabitationYears: survivorCtx.cohabitationYears,
  marriedSince5y: typeof survivorCtx.marriageYears === 'number'
    ? survivorCtx.marriageYears >= 5
    : undefined,
}}



        laaParams={
          laaRegs?.laa
            ? {
                insured_earnings_max: laaRegs.laa.insured_earnings_max,
                disabilityPctFull: laaRegs.laa.disability.pct_at_full_invalidity,
                overallCapPct: laaRegs.laa.coordination.invalidity_ai_laa_cap_pct,
                spousePct: laaRegs.laa.survivors.spouse_pct,
                orphanPct: laaRegs.laa.survivors.orphan_pct,
                familyCapPct: laaRegs.laa.survivors.family_cap_pct,
              }
            : undefined
        }
        initialTargets={{ invalidityPctTarget: 90, deathPctTarget: 80, retirementPctTarget: 80 }}
        initialCtx={{
          eventInvalidity: "maladie",
          eventDeath: "maladie",
          invalidityDegreePct: 100,
          childrenCount: analysis?.meta?.nbEnfants ?? 0,
          weeklyHours: analysis?.meta?.weeklyHours ?? undefined,
          birthDateISO,
        }}
        lppCard={{
          year: lppRes.year,
          currency: lppRes.currency,
          coordinatedSalary: lppRes.coordinatedSalary,
          savingsCredit: lppRes.savingsCredit,
          survivor: lppRes.survivor,
          meta: lppRes.meta,
          certWidowWidowerMonthly: certWidowMonthly,
          certOrphanMonthly: certOrphanMonthly,
          certDeathCapital: typeof lpp?.capitalDeces === "number" ? lpp.capitalDeces : undefined,
        }}
        laaCard={{
          year: 2025,
          insuredAnnual: invAcc.insuredAnnual,
          daily: { amountPerDay: ij.dailyAllowance, startsFromDay: ij.startsFromDay },
          invalidity: {
            degreePct: degreeInvalidityPct,
            nominalMonthly: invAcc.nominalMonthly,
            coordinatedMonthly: invAcc.coordinatedMonthly,
            aiMonthly: invAcc.aiMonthly,
            totalMonthly: invAcc.totalMonthly,
            capMonthly: invAcc.capMonthly,
          },
          survivors: {
            laaMonthlyTotal: survAcc.laaMonthlyTotal,
            avsMonthlyTotal: survAcc.avsMonthlyTotal,
            overallCapMonthly: survAcc.overallCapMonthly,
            spouseMonthly: survAcc.spouseMonthly,
            orphansMonthlyTotal: survAcc.orphansMonthlyTotal,
          },
          meta: {
            weeklyHours: analysis.meta?.weeklyHours,
            nonOccupationalCovered: (analysis.meta?.weeklyHours ?? 0) >= 8,
            accidentKind: analysis.meta?.accidentKind,
          },
        }}
      />
      </Suspense>









{/* Accordéon — LPP */}
<Accordion type="single" collapsible>
  {/* Item 1 : Robot apprenti (inclut l’éditeur) */}
  <AccordionItem
   value="robot-lpp"
   className="rounded-2xl border bg-white shadow-sm overflow-hidden"
   >
<AccordionTrigger 
id="robot-accordion-trigger"
className="px-4 md:px-6 text-base hover:bg-muted/40 data-[state=open]:bg-muted/30">
  <div className="flex w-full items-center gap-2 pr-2">
    <span className="group-hover:underline">Robot apprenti — Certificat LPP</span>

    {/* badge poussé à droite, avant le chevron */}
    {isVerified ? (
  <span
    className="ml-auto mr-2 inline-flex items-center gap-1 rounded-full border border-transparent
               bg-[#4fd1c5] px-2 py-0.5 text-xs font-medium text-white pointer-events-none"
  >
    <BadgeCheck className="h-3.5 w-3.5" />
    Vérifié
  </span>
) : (
  <span
    className="ml-auto mr-2 inline-flex items-center rounded-full border border-amber-200
               bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 pointer-events-none"
  >
    Vérifier svp
  </span>
)}

  </div>
</AccordionTrigger>





    <AccordionContent className="px-0 md:px-0 pb-0 md:pb-0">
      {!lppForEditor ? (
        <div className="px-4 md:px-6 pb-4 md:pb-6 text-sm text-gray-600">
          Aucun certificat LPP n’a été extrait pour ce client (encore).
        </div>
      ) : (
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          <RobotApprentiCard doc={lppForEditor} />
        </div>
      )}
    </AccordionContent>
  </AccordionItem>


</Accordion>








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

