'use client';

type Props = {
  oldAge65: number;
  invalidity: number;
  widowWidower: number; // 80% (survivant veuf/veuve)
  orphan: number;       // 60%
  child: number;        // 40%
  matchedIncome: number;
  coeff: number;

  // Nouveaux champs (facultatifs) si disponibles depuis computeAvsAiMonthly
  forWidowWidower120?: number; // 120% AVS/AI pour veuves/veufs (info)
  supplementary30?: number;    // 30% Rente complémentaire (info)
  year?: number;               // ex: 2025
};

export default function AvsAiCard(props: Props) {
  const {
    oldAge65,
    invalidity,
    widowWidower,
    orphan,
    child,
    matchedIncome,
    coeff,
    forWidowWidower120,
    supplementary30,
    year = 2025,
  } = props;

  const fmt = (n: number) => `${n.toLocaleString('fr-CH')} CHF/mois`;

  const Row = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
    <div className="flex justify-between py-1">
      <span className="text-sm text-gray-600" title={hint}>{label}</span>
      <span className="font-semibold">{fmt(value)}</span>
    </div>
  );

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
          <span className="font-medium">Échelle 44</span> • {year}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
          Revenu de référence&nbsp;<span className="font-medium">{matchedIncome.toLocaleString('fr-CH')} CHF</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
          Coeff. carrière&nbsp;<span className="font-medium">{coeff}</span>
        </span>
      </div>

      <Row label="Rente vieillesse (65)" value={oldAge65} hint="Rente AVS complète, mensuelle" />
      <Row label="Rente invalidité" value={invalidity} hint="Base AVS/AI identique à la rente vieillesse" />

      {/* Info additionnelle 120% si disponible */}
      {typeof forWidowWidower120 === 'number' && (
        <Row
          label="AVS/AI pour veuves/veufs (120%)"
          value={forWidowWidower120}
          hint="Colonne officielle 120% (rente de vieillesse/invalidité pour veuves/veufs)"
        />
      )}

      {/* Survivant veuf/veuve = 80% (toujours affiché) */}
      <Row
        label="Rente veuf/veuve (80%)"
        value={widowWidower}
        hint="Rente de survivant (veuvage) — 80% de la base"
      />

      {/* Info additionnelle 30% si disponible */}
      {typeof supplementary30 === 'number' && (
        <Row
          label="Rente complémentaire (30%)"
          value={supplementary30}
          hint="Zusatzrente / rente complémentaire (30%)"
        />
      )}

      <Row label="Rente orphelin (60%)" value={orphan} hint="Rente d’orphelin" />
      <Row label="Rente par enfant (40%)" value={child} hint="Kinderrente (par enfant)" />

      <div className="mt-3 text-[11px] text-gray-500">
        Source&nbsp;: OFAS — Échelle 44 {year}. Montants mensuels, arrondis au franc selon le barème officiel.
      </div>
    </div>
  );
}
