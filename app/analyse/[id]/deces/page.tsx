import { Suspense } from 'react'
import DeathClient from './view-client'
import { db } from '@/lib/firebaseAdmin'
import { computeAvsAiMonthly } from '@/lib/avsAI'
import { computeLppAnalysis } from '@/lib/lpp'
import { loadRegsLaa, computeAccidentSurvivorsMonthly } from '@/lib/laa'

export const dynamic = 'force-dynamic'

type AnalysisDoc = { clientToken?: string; meta?: any; lppParsedRefs?: string[] }
type LppParsed = {
  salaireDeterminant?: number | null
  renteConjointAnnuelle?: number | null
  renteOrphelinAnnuelle?: number | null
  renteRetraite65Annuelle?: number | null
  capitalRetraite65?: number | null
  dateNaissance?: string | null
}

async function getAnalysis(id: string): Promise<AnalysisDoc | null> {
  const snap = await db.collection('analyses').doc(id).get()
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as AnalysisDoc) : null
}
async function getLatestLppForClient(id: string, lppRefs?: string[]) {
  let lpps: any[] = []
  if (lppRefs?.length) {
    const reads = await Promise.allSettled(lppRefs.map((rid) => db.collection('lpp_parsed').doc(rid).get()))
    lpps = reads.filter(r => r.status === 'fulfilled' && (r as any).value.exists).map((r:any)=>({ id:r.value.id, ...(r.value.data() as any) }))
  }
  if (!lpps.length) {
    const q = await db.collection('lpp_parsed').where('clientToken','==',id).orderBy('extractedAt','desc').limit(1).get()
    lpps = q.docs.map(d => ({ id:d.id, ...(d.data() as any) }))
  }
  return lpps[0] as LppParsed | undefined
}
const toMonthly = (a?: number | null) => typeof a === 'number' ? Math.round(a/12) : undefined
const parseBirthDate = (s?: string | null) => {
  if (!s) return undefined
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (m1) return new Date(+m1[3], +m1[2]-1, +m1[1])
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3])
}
const ageFrom = (d?: Date) => { if(!d) return undefined; const t=new Date(); let a=t.getFullYear()-d.getFullYear(); const m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) a--; return a }

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  const analysis = await getAnalysis(id)
  if (!analysis) return <div className="p-6">Analyse introuvable</div>

  // ✅ chemin DOCUMENT pour Quick Params (même doc que l’analyse principale)
  const clientDocPath =
    analysis?.clientToken ? `clients/${analysis.clientToken}` : `analyses/${id}`;


  const lpp = await getLatestLppForClient(id, analysis.lppParsedRefs)
  const revenuAnnuel =
    analysis?.meta?.revenuAnnuel ??
    (typeof lpp?.salaireDeterminant === 'number' ? lpp!.salaireDeterminant! : undefined) ??
    60000
  const coeff: 1 | 0.75 | 0.5 | 0.25 = analysis?.meta?.coeffCarriere ?? 1
  const avs = await computeAvsAiMonthly(revenuAnnuel, { year: 2025, coeffCarriere: coeff })

  const employmentRate: number = analysis?.meta?.employmentRate ?? analysis?.meta?.tauxOccupation ?? 1
  const referenceMonthlyPension =
    toMonthly(analysis?.meta?.renteInvaliditeAnnuelle) ??
    toMonthly(lpp?.renteRetraite65Annuelle) ??
    (typeof lpp?.capitalRetraite65 === 'number' ? Math.round(lpp!.capitalRetraite65! * 0.068 / 12) : 0)

  const age = ageFrom(parseBirthDate(lpp?.dateNaissance)) ?? analysis?.meta?.age ?? 45
  const lppRes = await computeLppAnalysis({
    year: 2025, annualSalary: revenuAnnuel, employmentRate, age,
    referenceMonthlyPension, useAdaptiveCoordination: !!(analysis?.meta?.coordinationAdaptative || analysis?.meta?.useAdaptiveCoordination),
    survivorContext: { maritalStatus: analysis?.meta?.etatCivil ?? 'celibataire', hasChild: !!analysis?.meta?.nbEnfants }
  })

  const laaRegs = await loadRegsLaa(2025)
  const spouseHasRight =
    (analysis?.meta?.laaSpouseHasRight as boolean | undefined) ??
    ((analysis?.meta?.etatCivil === 'marie' || analysis?.meta?.etatCivil === 'mariee' || analysis?.meta?.etatCivil === 'partenariat_enregistre')
      && (!!analysis?.meta?.nbEnfants || (analysis?.meta?.ageAtWidowhood ?? 45) >= 45))
  const nOrphans = analysis?.meta?.nbEnfants ?? 0
  const avsSurvivorsMonthlyTotal =
    (spouseHasRight ? (avs.widowWidower ?? 0) : 0) + nOrphans * (avs.child ?? 0)
  const survAcc = computeAccidentSurvivorsMonthly(
    { annualSalaryAvs: revenuAnnuel, spouseHasRight, nOrphans, avsAiSurvivorsMonthlyTotal: avsSurvivorsMonthlyTotal },
    laaRegs
  )

   // Pré-calcul LAA survivants en fonction du nombre d'orphelins (0..8 ici)
 const MAX_ORPHANS = Math.max(8, nOrphans ?? 0)
 const laaSurvivorsPerOrphans = Array.from({ length: MAX_ORPHANS + 1 }, (_, k) => {
   const avsK = (spouseHasRight ? (avs.widowWidower ?? 0) : 0) + k * (avs.child ?? 0)
   return computeAccidentSurvivorsMonthly(
     { annualSalaryAvs: revenuAnnuel, spouseHasRight, nOrphans: k, avsAiSurvivorsMonthlyTotal: avsK },
     laaRegs
   ).laaMonthlyTotal
 })

  const base = {
    clientDocPath, // ✅ passe un chemin DOC valide
    annualIncome: revenuAnnuel,
    avs: {
      invalidityMonthly: avs.invalidity,
      widowMonthly: avs.widowWidower,
      childMonthly: avs.child,
      oldAgeMonthly: avs.oldAge65,
    },
    lpp: {
      invalidityMonthly: referenceMonthlyPension,
     widowMonthly:
       (toMonthly(lpp?.renteConjointAnnuelle) ??
        lppRes?.survivor?.amounts?.widowWidowerMonthly ??
        0),
     orphanMonthly:
       (toMonthly(lpp?.renteOrphelinAnnuelle) ??
        lppRes?.survivor?.amounts?.orphanMonthly ??
        0),
      retirementAnnualFromCert: lpp?.renteRetraite65Annuelle ?? undefined,
      capitalAt65FromCert: lpp?.capitalRetraite65 ?? undefined,
    },
    laa: {
      invalidityMonthly: 0,
      survivorsMonthlyTotal: survAcc.laaMonthlyTotal,
    },
    laaSurvivorsPerOrphans,
   initialOrphans: nOrphans,
   spouseHasRight,
  }

  return (
    <Suspense>
      <DeathClient id={id} base={base} />
    </Suspense>
  )
}
