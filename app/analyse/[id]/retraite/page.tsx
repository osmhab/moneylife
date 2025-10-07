// app/analyse/[id]/retraite/page.tsx
import { Suspense } from 'react'
import RetirementClient from './view-client'
import { db } from '@/lib/firebaseAdmin'
import { computeAvsAiMonthly } from '@/lib/avsAI'

export const dynamic = 'force-dynamic'

type AnalysisDoc = { clientToken?: string; meta?: any; lppParsedRefs?: string[] }
type LppParsed = {
  salaireDeterminant?: number | null
  renteRetraite65Annuelle?: number | null
  capitalRetraite65?: number | null
}

async function getAnalysis(id: string): Promise<AnalysisDoc | null> {
  const snap = await db.collection('analyses').doc(id).get()
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as AnalysisDoc) : null
}

async function getLatestLppForClient(id: string, lppRefs?: string[]) {
  let lpps: any[] = []
  if (lppRefs?.length) {
    const reads = await Promise.allSettled(
      lppRefs.map((rid) => db.collection('lpp_parsed').doc(rid).get())
    )
    lpps = reads
      .filter((r: any) => r.status === 'fulfilled' && r.value?.exists)
      .map((r: any) => ({ id: r.value.id, ...(r.value.data() as any) }))
  }
  if (!lpps.length) {
    const q = await db
      .collection('lpp_parsed')
      .where('clientToken', '==', id)
      .orderBy('extractedAt', 'desc')
      .limit(1)
      .get()
    lpps = q.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  }
  return (lpps[0] as LppParsed) || undefined
}

const toMonthly = (a?: number | null) =>
  typeof a === 'number' ? Math.round(a / 12) : undefined

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  const analysis = await getAnalysis(id)
  if (!analysis) return <div className="p-6">Analyse introuvable</div>

  // ✅ chemin DOCUMENT pour Quick Params (même doc que l’analyse principale)
  const clientDocPath =
    analysis?.clientToken ? `clients/${analysis.clientToken}` : `analyses/${id}`

  const lpp = await getLatestLppForClient(id, analysis.lppParsedRefs)

  // Revenu & AVS
  const revenuAnnuel =
    analysis?.meta?.revenuAnnuel ??
    (typeof lpp?.salaireDeterminant === 'number' ? lpp!.salaireDeterminant! : undefined) ??
    60000
  const coeff: 1 | 0.75 | 0.5 | 0.25 = analysis?.meta?.coeffCarriere ?? 1
  const avs = await computeAvsAiMonthly(revenuAnnuel, { year: 2025, coeffCarriere: coeff })

  // Référence LPP retraite
  const referenceMonthlyPension =
    toMonthly(lpp?.renteRetraite65Annuelle) ??
    (typeof lpp?.capitalRetraite65 === 'number'
      ? Math.round((lpp!.capitalRetraite65! * 0.068) / 12)
      : 0)

  const base = {
    clientDocPath, // ✅ chemin DOC valide (pair de segments)
    annualIncome: revenuAnnuel,
    avs: {
      invalidityMonthly: avs.invalidity,
      widowMonthly: avs.widowWidower,
      childMonthly: avs.child,
      oldAgeMonthly: avs.oldAge65,
    },
    lpp: {
      invalidityMonthly: referenceMonthlyPension, // homogénéité avec les autres pages
      widowMonthly: 0,
      orphanMonthly: 0,
      retirementAnnualFromCert: lpp?.renteRetraite65Annuelle ?? undefined,
      capitalAt65FromCert: lpp?.capitalRetraite65 ?? undefined,
    },
    laa: undefined as undefined,
  }

  return (
    <Suspense>
      <RetirementClient id={id} base={base} />
    </Suspense>
  )
}
