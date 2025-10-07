// app/analyse/[id]/deces/view-client.tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import AreaInteractive from '@/app/analyse/_components/charts/AreaInteractive'
import { useTimeline } from '@/app/analyse/_hooks/useTimeline'
import { useQuickParamsLoad } from '@/app/analyse/_hooks/useQuickParamsLoad'
import { useQuickParamsSync } from '@/app/analyse/_hooks/useQuickParamsSync'
import { Segmented as UISegmented } from '@/components/ui/segmented'
import { Activity, HeartPulse } from 'lucide-react'

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
  laaSurvivorsPerOrphans?: number[]   // << nouveau
  initialOrphans?: number             // << fallback si pas de dates de naissance
  spouseHasRight?: boolean            // << info de droit conjoint
}

export default function DeathClient({ id, base }: { id: string; base: BaseProps }) {
  // États principaux
  const [unit, setUnit] = React.useState<'mois' | 'an'>('mois')
  const [scenario, setScenario] = React.useState<'maladie' | 'accident'>('maladie')

  // Données serveur (vraies valeurs)
  const [annualIncome, setAnnualIncome] = React.useState<number>(base.annualIncome)
  const [avs, setAvs] = React.useState(base.avs)
  const [lpp, setLpp] = React.useState(base.lpp)
  const [laa, setLaa] = React.useState(base.laa)

  // Paramètres annexes
  const [third, setThird] = React.useState(0)
  const [children, setChildren] = React.useState<string[]>(
   [] // si tu veux un fallback "N enfants sans dates", on peut injecter des placeholders plus tard
)
  const [currentAge, setCurrentAge] = React.useState(40)
  const [retirementStartAge, setRetirementStartAge] = React.useState(65)
  const [targetsPct, setTargetsPct] = React.useState({ invalidity: 80, death: 80, retirement: 80 })

  // Charger Quick Params (Firestore)
  useQuickParamsLoad({
    clientDocPath: base.clientDocPath,
    apply: (qp: any) => {
      if (qp?.unit) setUnit(toUnit(qp.unit))
      if (qp?.eventDeath) setScenario(qp.eventDeath as 'maladie' | 'accident')

      // revenu si stocké
      if (typeof qp?.annualIncome === 'number') setAnnualIncome(qp.annualIncome)

      // enfants / âges si stockés
      if (Array.isArray(qp?.childrenBirthYYYYMM)) setChildren(qp.childrenBirthYYYYMM as string[])
      if (typeof qp?.currentAge === 'number') setCurrentAge(qp.currentAge as number)
      if (typeof qp?.retirementStartAge === 'number') setRetirementStartAge(qp.retirementStartAge as number)

      // cibles (accepte {deathPctTarget} ou {death})
      if (qp?.targets && typeof qp.targets === 'object') {
        const inv = Number(qp.targets.invalidityPctTarget ?? qp.targets.invalidity ?? targetsPct.invalidity)
        const dee = Number(qp.targets.deathPctTarget ?? qp.targets.death ?? targetsPct.death)
        const ret = Number(qp.targets.retirementPctTarget ?? qp.targets.retirement ?? targetsPct.retirement)
        setTargetsPct({ invalidity: inv, death: dee, retirement: ret })
      }
    },
  })

  // Synchronisation automatique (unit/scénario)
  useQuickParamsSync({
    clientDocPath: base.clientDocPath,
    enabled: true,
    payload: { unit: fromUnit(unit), eventDeath: scenario },
  })

  // Fenêtre temporelle : aujourd’hui → +30 ans
  const start = React.useMemo(() => new Date(), [])
  const end = React.useMemo(
    () => new Date(new Date().getFullYear() + 30, new Date().getMonth(), 1),
    []
  )

  // Timeline (cible = % * revenu)
  const { data, markers } = useTimeline({
    theme: 'deces',
    start,
    end,
    unit,
    scenario,
    annualIncome,
    targetsPct,
    avs,
    lpp,
    laa,
    thirdPillarMonthly: third,
    childrenBirthYYYYMM: children,
    retirementStartAge,
    currentAge,
    laaSurvivorsPerOrphans: base.laaSurvivorsPerOrphans,
    spouseHasRight: base.spouseHasRight,
    initialOrphans: base.initialOrphans,
  })

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Décès — Détails dans le temps</h1>
        <div className="flex items-center gap-2">
          <UISegmented
            value={scenario}
            onValueChange={(v) => setScenario((v as 'maladie' | 'accident') ?? 'maladie')}
            items={[
              { value: 'maladie', label: 'Maladie', icon: <HeartPulse className="h-4 w-4" /> },
              { value: 'accident', label: 'Accident', icon: <Activity className="h-4 w-4" /> },
            ]}
            className="bg-muted/40 p-0.5 border-transparent shadow-none"
          />
          <Link href={`/analyse/${id}`} className="text-primary hover:underline">
            ← Retour
          </Link>
        </div>
      </div>

      <AreaInteractive
        title="Prestations survivants vs Cible dans le temps"
        subtitle="Conjoint + orphelins (AVS/LPP et LAA si Accident) + ligne de cible (% du revenu)"
        unit={unit}
        onUnitChange={setUnit}
        data={data}
        markers={markers}
        showGap
      />
    </div>
  )
}
