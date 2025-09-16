'use client';

export default function AvsAiCard(props: {
  oldAge65: number; invalidity: number; widowWidower: number; orphan: number; child: number;
  matchedIncome: number; coeff: number;
}) {
  const Item = ({ label, value }: { label: string; value: number }) => (
    <div className="flex justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="font-semibold">{value.toLocaleString('fr-CH')} CHF/mois</span>
    </div>
  );
  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="mb-2 text-xs text-gray-500">
        Base: revenu {props.matchedIncome.toLocaleString('fr-CH')} CHF • Coeff carrière {props.coeff}
      </div>
      <Item label="Rente vieillesse (65)" value={props.oldAge65} />
      <Item label="Rente invalidité" value={props.invalidity} />
      <Item label="Rente veuf/veuve" value={props.widowWidower} />
      <Item label="Rente orphelin (60%)" value={props.orphan} />
      <Item label="Rente par enfant (40%)" value={props.child} />
    </div>
  );
}
