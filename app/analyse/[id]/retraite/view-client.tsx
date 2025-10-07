// app/analyse/[id]/retraite/view-client.tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import AreaInteractive from '@/app/analyse/_components/charts/AreaInteractive'
import { useTimeline } from '@/app/analyse/_hooks/useTimeline'
import { useQuickParamsLoad } from '@/app/analyse/_hooks/useQuickParamsLoad'
import { useQuickParamsSync } from '@/app/analyse/_hooks/useQuickParamsSync'

// mapping d’unité entre quick params (en) et UI (fr)
const toUnit = (u: 'monthly' | 'annual' | 'mois' | 'an'): 'mois' | 'an' =>
  u === 'annual' || u === 'an' ? 'an' : 'mois'
const fromUnit = (u: 'mois' | 'an'): 'monthly' | 'annual' =>
  u === 'an' ? 'annual' : 'monthly'

type BaseProps = {
  clientDocPath: string
  annualIncome: number
  avs: { invalidityMonthly: number; widowMonthly: number; childMonthly: number; oldAgeMonthly: number }
  lpp: {
    invalidityMonthly: number
    widowMonthly: number
    orphanMonthly: number
    retirementAnnualFromCert?: number
    capitalAt65FromCert?: number
  }
  laa?: { invalidityMonthly?: number; survivorsMonthlyTotal?: number }
}

export default function RetirementClient({ id, base }: { id: string; base: BaseProps }) {
  // États principaux
  const [unit, setUnit] = React.useState<'mois' | 'an'>('mois')
  // Pas de toggle scénario ici (la LAA n’influe pas la retraite), on garde une valeur fixe
  const [scenario] = React.useState<'maladie' | 'accident'>('maladie')

  // Données serveur (vraies valeurs)
  const [annualIncome, setAnnualIncome] = React.useState<number>(base.annualIncome)
  const [avs] = React.useState(base.avs)
  const [lpp] = React.useState(base.lpp)
  const [laa] = React.useState(base.laa)

  // Paramètres annexes
  const [third] = React.useState(0)
  const [children, setChildren] = React.useState<string[]>([])
  const [currentAge, setCurrentAge] = React.useState(40)
  const [retirementStartAge, setRetirementStartAge] = React.useState(65)
  const [targetsPct, setTargetsPct] = React.useState({ invalidity: 80, death: 80, retirement: 80 })

  // Charger Quick Params (Firestore)
  useQuickParamsLoad({
    clientDocPath: base.clientDocPath,
    apply: (qp: any) => {
      if (qp?.unit) setUnit(toUnit(qp.unit))

      // revenu si stocké
      if (typeof qp?.annualIncome === 'number') setAnnualIncome(qp.annualIncome)

      // enfants / âges si stockés
      if (Array.isArray(qp?.childrenBirthYYYYMM)) setChildren(qp.childrenBirthYYYYMM as string[])
      if (typeof qp?.currentAge === 'number') setCurrentAge(qp.currentAge as number)
      if (typeof qp?.retirementStartAge === 'number') setRetirementStartAge(qp.retirementStartAge as number)

      // cibles (accepte {retirementPctTarget} ou {retirement})
      if (qp?.targets && typeof qp.targets === 'object') {
        const inv = Number(qp.targets.invalidityPctTarget ?? qp.targets.invalidity ?? targetsPct.invalidity)
        const dee = Number(qp.targets.deathPctTarget ?? qp.targets.death ?? targetsPct.death)
        const ret = Number(qp.targets.retirementPctTarget ?? qp.targets.retirement ?? targetsPct.retirement)
        setTargetsPct({ invalidity: inv, death: dee, retirement: ret })
      }
    },
  })

  // Synchronisation automatique (unité uniquement ici)
  useQuickParamsSync({
    clientDocPath: base.clientDocPath,
    enabled: true,
    payload: { unit: fromUnit(unit) },
  })

  // Fenêtre temporelle : aujourd’hui → +60 ans (ex. jusqu’à ~100 ans si 40 ans aujourd’hui)
  const start = React.useMemo(() => new Date(), [])
  const end = React.useMemo(
    () => new Date(new Date().getFullYear() + 60, new Date().getMonth(), 1),
    []
  )

  // Timeline (cible = % * revenu ; cible apparaît seulement à partir de l’âge de retraite)
  const { data, markers } = useTimeline({
    theme: 'retraite',
    start,
    end,
    unit,
    scenario,
    annualIncome,
    targetsPct,
    avs,
    lpp,
    laa,
    thirdPillarMonthly: 0,
    childrenBirthYYYYMM: children,
    retirementStartAge,
    currentAge,
  })

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Retraite — Détails dans le temps</h1>
        <Link href={`/analyse/${id}`} className="text-primary hover:underline">
          ← Retour
        </Link>
      </div>

      <AreaInteractive
        title="Prestations retraite vs Cible dans le temps"
        subtitle="AVS + LPP + 3e pilier après l’âge de retraite + ligne de cible (% du revenu)"
        unit={unit}
        onUnitChange={setUnit}
        data={data}
        markers={markers}
        showGap
      />
    </div>
  )
}
