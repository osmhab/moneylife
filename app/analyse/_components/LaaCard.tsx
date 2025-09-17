'use client';
import type { ReactNode, CSSProperties } from 'react';

type DailyInfo = {
  amountPerDay: number;   // CHF/jour
  startsFromDay: number;  // ex: 3
};

type InvalidityInfo = {
  degreePct: number;      // p.ex. 60
  nominalMonthly: number; // LAA nominal (80% * degré)
  coordinatedMonthly: number; // LAA après coordination AI (AI+LAA ≤ 90%)
  aiMonthly: number;      // Rente AI mensuelle utilisée pour coordonner
  totalMonthly: number;   // AI + LAA coordonnée
  capMonthly: number;     // 90% du gain assuré / 12
};

type SurvivorsInfo = {
  // Totaux mensuels LAA (complémentaires) et AVS/AI déjà en place
  laaMonthlyTotal?: number;     // LAA payée après coordination
  avsMonthlyTotal?: number;     // AVS/AI survivants total
  overallCapMonthly?: number;   // 90% du gain assuré / 12 (cap global)
  // Décomposition utile (si calculée)
  spouseMonthly?: number;       // part LAA versée au conjoint (après prorata/cap)
  orphansMonthlyTotal?: number; // part LAA versée aux orphelins (total)
};

type MetaInfo = {
  weeklyHours?: number;                 // heures hebdo chez l'employeur
  nonOccupationalCovered?: boolean;     // AANP (≥ 8h/sem)
  accidentKind?: 'occupational' | 'non_occupational';
  notes?: string;
};

type Props = {
  year?: number;               // défaut 2025
  currency?: string;           // 'CHF'
  insuredAnnual: number;       // gain assuré LAA utilisé (plafonné au max LAA)
  daily?: DailyInfo;
  invalidity?: InvalidityInfo;
  survivors?: SurvivorsInfo;
  meta?: MetaInfo;
};

export default function LaaCard(props: Props) {
  const {
    year = 2025,
    currency = 'CHF',
    insuredAnnual,
    daily,
    invalidity,
    survivors,
    meta,
  } = props;

  const COLORS = {
    primary: '#0030A8',
    success: '#4fd1c5',
    warning: '#F59E0B',
  };

  const fmtCHF0 = (n: number) =>
    n.toLocaleString('fr-CH', { style: 'currency', currency, maximumFractionDigits: 0 });

  const fmtDaily = (n: number) => `${fmtCHF0(n)}/jour`;
  const fmtMonthly = (n: number) => `${fmtCHF0(n)}/mois`;
  const fmtAnnual = (n: number) => `${fmtCHF0(n)}/an`;

  const Tag = (
  { children, tone = 'neutral' }: { children: ReactNode; tone?: TagTone }
) => {
  const style: CSSProperties =
    tone === 'primary'
      ? { backgroundColor: '#eef3ff', color: COLORS.primary }
      : tone === 'success'
      ? { backgroundColor: '#ecfdf9', color: '#0b766e' }
      : tone === 'warning'
      ? { backgroundColor: '#fff7ed', color: '#92400e' }
      : { backgroundColor: '#f3f4f6', color: '#374151' };

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={style}>
      {children}
    </span>
  );
};


  const Row = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-sm text-gray-600" title={hint}>
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );

  const coverageTone: TagTone =
    meta?.nonOccupationalCovered === false ? 'warning' : meta?.nonOccupationalCovered ? 'success' : 'neutral';

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <Tag tone="primary">Accident (LAA/UVG) • {year}</Tag>
        <Tag>{`Gain assuré ${fmtAnnual(insuredAnnual)}`}</Tag>
        {typeof meta?.weeklyHours === 'number' && <Tag>{meta.weeklyHours} h/sem</Tag>}
        <Tag tone={coverageTone}>
          {meta?.nonOccupationalCovered === false
            ? 'AANP non couvert (< 8 h/sem)'
            : meta?.nonOccupationalCovered
            ? 'AANP couvert (≥ 8 h/sem)'
            : 'Couverture AANP: inconnu'}
        </Tag>
        {meta?.accidentKind && <Tag>{meta.accidentKind === 'occupational' ? 'Accident pro' : 'Accident non pro'}</Tag>}
      </div>

      {/* Indemnité journalière */}
      <div className="mb-3">
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Indemnité journalière
        </h3>
        {daily ? (
          <>
            <Row label="Montant" value={fmtDaily(daily.amountPerDay)} hint="IJ = 80% du gain assuré (quotité/jour)" />
            <Row
              label="Début de versement"
              value={`Dès J+${daily.startsFromDay}`}
              hint="IJ due à partir du 3e jour suivant l’accident"
            />
          </>
        ) : (
          <div className="text-xs text-gray-500">Indemnité journalière non calculée.</div>
        )}
      </div>

      {/* Invalidité (accident) */}
      <div className="mb-3">
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Invalidité (accident)
        </h3>
        {invalidity ? (
          <>
            <div className="mb-1">
              <Tag>Degré {invalidity.degreePct}%</Tag>{' '}
              <Tag>{`Cap global ${fmtMonthly(invalidity.capMonthly)} (90%)`}</Tag>
            </div>
            <Row label="Rente AI utilisée (coordination)" value={fmtMonthly(invalidity.aiMonthly)} />
            <Row label="LAA nominale" value={fmtMonthly(invalidity.nominalMonthly)} hint="80% * degré d’invalidité" />
            <Row
              label="LAA versée (après coordination)"
              value={fmtMonthly(invalidity.coordinatedMonthly)}
              hint="AI + LAA ≤ 90% du gain assuré"
            />
            <Row label="Total AI + LAA" value={fmtMonthly(invalidity.totalMonthly)} />
          </>
        ) : (
          <div className="text-xs text-gray-500">Rente d’invalidité accident non calculée.</div>
        )}
      </div>

      {/* Survivants (accident) */}
      <div>
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Survivants (accident)
        </h3>
        {survivors ? (
          <>
            {typeof survivors.overallCapMonthly === 'number' && (
              <div className="mb-1">
                <Tag>{`Cap global ${fmtMonthly(survivors.overallCapMonthly)} (90%)`}</Tag>
              </div>
            )}
            {typeof survivors.avsMonthlyTotal === 'number' && (
              <Row label="AVS/AI survivants (total)" value={fmtMonthly(survivors.avsMonthlyTotal)} />
            )}
            {typeof survivors.laaMonthlyTotal === 'number' && (
              <Row
                label="LAA survivants versée"
                value={fmtMonthly(survivors.laaMonthlyTotal)}
                hint="Complément jusqu’à 90% (plafond famille 70% respecté)"
              />
            )}
            {typeof survivors.spouseMonthly === 'number' && (
              <Row label="— Conjoint (part LAA)" value={fmtMonthly(survivors.spouseMonthly)} />
            )}
            {typeof survivors.orphansMonthlyTotal === 'number' && (
              <Row label="— Orphelins (part LAA, total)" value={fmtMonthly(survivors.orphansMonthlyTotal)} />
            )}
          </>
        ) : (
          <div className="text-xs text-gray-500">
            Prestations survivants accident non calculées (fournir AVS/AI survivants totaux et contexte familial).
          </div>
        )}
      </div>

      {meta?.notes && <div className="mt-3 text-xs text-gray-500">{meta.notes}</div>}

      <div className="mt-3 text-[11px] text-gray-500">
        Les montants « LAA versée » intègrent la coordination : plafonnement global à <b>90% du gain assuré</b>.
        Les chiffres exacts du certificat (s’il y en a) priment sur ces estimations.
      </div>
    </div>
  );
}

type TagTone = 'neutral' | 'primary' | 'success' | 'warning';
