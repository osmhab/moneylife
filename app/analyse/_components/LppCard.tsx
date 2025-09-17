'use client';
import type { ReactNode, CSSProperties } from 'react';

type Coord = {
  annualSalaryCapped: number;
  coordinationDeductionUsed: number;
  coordinatedSalary: number;
  rule: 'standard' | 'adaptive';
};

type Savings = {
  bandPercent: number; // 7 | 10 | 15 | 18
  annualCredit: number; // CHF/an
};

type SurvivorEligibility = {
  spouseEligible: boolean;
  spouseMode: 'pension' | 'lump_sum' | 'none';
  concubinEligible: boolean;
  orphanEligible: boolean;
};

type SurvivorAmounts = {
  widowWidowerMonthly?: number;
  orphanMonthly?: number;
  lumpSumIfNotEligible?: number;
};

type Props = {
  year?: number;
  currency?: string;
  coordinatedSalary: Coord;
  savingsCredit: Savings;
  survivor: {
    eligibility: SurvivorEligibility;
    amounts: SurvivorAmounts;
  };
  meta: {
    convMinPct: number;
    interestMinPct: number;
  };

  // Valeurs issues du certificat (affichées en priorité si présentes)
  certWidowWidowerMonthly?: number;
  certOrphanMonthly?: number;
  certDeathCapital?: number;
};

type TagTone = 'neutral' | 'primary' | 'success' | 'warning';

export default function LppCard(props: Props) {
  const {
    year = 2025,
    currency = 'CHF',
    coordinatedSalary,
    savingsCredit,
    survivor,
    meta,
    certWidowWidowerMonthly,
    certOrphanMonthly,
    certDeathCapital,
  } = props;

  const COLORS = {
    primary: '#0030A8',
    success: '#4fd1c5',
    warning: '#F59E0B',
  };

  const fmtCHF0 = (n: number) =>
    n.toLocaleString('fr-CH', { style: 'currency', currency, maximumFractionDigits: 0 });
  const fmtMonthly = (n: number) => `${fmtCHF0(n)}/mois`;
  const fmtAnnual = (n: number) => `${fmtCHF0(n)}/an`;

  const Tag = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: TagTone }) => {
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

  // Survivants — affichage (priorité au certificat)
  const spouseHasPension = survivor.eligibility.spouseEligible && survivor.eligibility.spouseMode === 'pension';
  const spouseLabel =
    survivor.eligibility.spouseMode === 'pension'
      ? 'Éligible (pension)'
      : survivor.eligibility.spouseMode === 'lump_sum'
      ? 'Non éligible (capital unique)'
      : 'Non éligible';

  const widowMonthlyDisplay =
    typeof certWidowWidowerMonthly === 'number'
      ? { label: 'Rente conjoint(e) — Certificat', val: fmtMonthly(certWidowWidowerMonthly) }
      : spouseHasPension && typeof survivor.amounts.widowWidowerMonthly === 'number'
      ? { label: 'Rente conjoint(e) — Minimum LPP', val: fmtMonthly(survivor.amounts.widowWidowerMonthly) }
      : undefined;

  const orphanMonthlyDisplay =
    typeof certOrphanMonthly === 'number'
      ? { label: 'Rente orphelin (par enfant) — Certificat', val: fmtMonthly(certOrphanMonthly) }
      : survivor.eligibility.orphanEligible && typeof survivor.amounts.orphanMonthly === 'number'
      ? { label: 'Rente orphelin (par enfant) — Minimum LPP', val: fmtMonthly(survivor.amounts.orphanMonthly) }
      : undefined;

  const lumpSumDisplay =
    survivor.eligibility.spouseMode === 'lump_sum' && typeof survivor.amounts.lumpSumIfNotEligible === 'number'
      ? { label: 'Capital unique estimé (3× rente annuelle)', val: fmtCHF0(survivor.amounts.lumpSumIfNotEligible) }
      : undefined;

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      {/* Header chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <Tag tone="primary">LPP/BVG • {year}</Tag>
        <Tag>Conversion min {meta.convMinPct}%</Tag>
        <Tag>Intérêt min {meta.interestMinPct}%</Tag>
        <Tag tone={coordinatedSalary.rule === 'adaptive' ? 'warning' : 'neutral'}>
          Règle {coordinatedSalary.rule === 'adaptive' ? 'adaptative' : 'standard'}
        </Tag>
      </div>

      {/* Salaire coordonné */}
      <div className="mb-3">
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Salaire coordonné
        </h3>
        <Row
          label="Salaire soumis (plafonné)"
          value={fmtCHF0(coordinatedSalary.annualSalaryCapped)}
          hint="Salaire pris en compte jusqu’au plafond LPP"
        />
        <Row
          label="Déduction de coordination"
          value={fmtCHF0(coordinatedSalary.coordinationDeductionUsed)}
          hint={
            coordinatedSalary.rule === 'adaptive'
              ? "Déduction adaptative: min(30% salaire, 87.5% AVS max) × taux d'occupation"
              : 'Déduction fixe LPP'
          }
        />
        <Row
          label="Salaire coordonné"
          value={fmtCHF0(coordinatedSalary.coordinatedSalary)}
          hint="Après déduction, borné par les min/max LPP"
        />
      </div>

      {/* Bonification vieillesse */}
      <div className="mb-3">
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Bonification vieillesse (part obligatoire)
        </h3>
        <Row label="Taux de bande" value={`${savingsCredit.bandPercent}%`} hint="7% (25–34), 10% (35–44), 15% (45–54), 18% (55–65)" />
        <Row label="Montant annuel" value={fmtAnnual(savingsCredit.annualCredit)} hint="Bonification calculée sur le salaire coordonné" />
      </div>

      {/* Survivants */}
      <div>
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Prestations de survivants
        </h3>

        {/* Conjoint / partenaire enregistré */}
        <div className="mb-2 rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Conjoint / Partenaire enregistré</span>
            <Tag tone={spouseHasPension ? 'success' : survivor.eligibility.spouseMode === 'lump_sum' ? 'warning' : 'neutral'}>
              {spouseLabel}
            </Tag>
          </div>
          {widowMonthlyDisplay ? (
            <Row label={widowMonthlyDisplay.label} value={widowMonthlyDisplay.val} />
          ) : (
            <div className="text-xs text-gray-500">Montant exact indisponible — affiché selon éligibilité.</div>
          )}
          {lumpSumDisplay && <Row label={lumpSumDisplay.label} value={lumpSumDisplay.val} />}
        </div>

        {/* Partenaire de vie (concubin) */}
        <div className="mb-2 rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Partenaire de vie (concubin)</span>
            <Tag tone={survivor.eligibility.concubinEligible ? 'success' : 'neutral'}>
              {survivor.eligibility.concubinEligible ? 'Potentiellement couvert (règlement)' : 'Plan-dépendant'}
            </Tag>
          </div>
          <div className="text-xs text-gray-500">
            Prestations possibles si le règlement le prévoit et si les conditions (ménage commun, désignation, etc.) sont remplies.
          </div>
        </div>

        {/* Orphelin */}
        <div className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Orphelin</span>
            <Tag tone={survivor.eligibility.orphanEligible ? 'success' : 'neutral'}>
              {survivor.eligibility.orphanEligible ? 'Éligible (selon âge/formation)' : 'Non éligible'}
            </Tag>
          </div>
          {orphanMonthlyDisplay ? (
            <Row label={orphanMonthlyDisplay.label} value={orphanMonthlyDisplay.val} />
          ) : (
            <div className="text-xs text-gray-500">Montant exact indisponible — affiché selon éligibilité.</div>
          )}
        </div>
      </div>

      {/* Capital décès */}
      <div className="mt-3">
        <h3 className="mb-1 text-sm font-semibold" style={{ color: COLORS.primary }}>
          Capital décès
        </h3>
        {typeof certDeathCapital === 'number' ? (
          <Row label="Capital décès — Certificat" value={fmtCHF0(certDeathCapital)} />
        ) : (
          <div className="text-xs text-gray-500">
            Sur la part <b>obligatoire</b> LPP, pas de capital décès minimal légal. Un capital peut exister sur la part
            surobligatoire selon le règlement de la caisse.
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] text-gray-500">
        Paramètres: LPP {year} (part obligatoire). Les montants <b>certificat</b> priment sur les minima calculés.
      </div>
    </div>
  );
}
