import type { ClientData } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

export type EventText = { lead: string; paragraphs: string[] };

const chf = (n: number) =>
  new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n));

export function textsInvaliditeMaladie(client: ClientData, opts: { hasIJ: boolean }): EventText {
  const p: string[] = [];
  if (opts.hasIJ) {
    p.push(
      "Lorsque vous tombez malades, votre employeur doit légalement continuer à vous verser un salaire au minimum selon les échelles (Bernoise, Zurichoise, etc.). Il est fréquent qu’il se couvre via un assureur, permettant de verser environ 80% du salaire jusqu’à 2 ans. Ce sont les indemnités journalières en cas de maladie."
    );
  }
  p.push(
    "Après les indemnités journalières, votre employeur arrête de vous payer. Les assurances prennent alors le relais : l’AI et la LPP versent des rentes mensuelles jusqu’à 65 ans. Ces rentes sont généralement insuffisantes pour maintenir votre dernier niveau de vie.",
    "Obligations financières et dette hypothécaire : une baisse de revenu peut amener la banque à réévaluer votre capacité de remboursement, pouvant aller jusqu’à saisir le bien.",
    "Protégez votre niveau de vie : il est possible de compléter via un 3e pilier pour maintenir votre niveau de vie quoi qu’il arrive."
  );
  return {
    lead: "C’est la diminution de votre revenu si vous tombez malade à long terme.",
    paragraphs: p,
  };
}

export function textsInvaliditeAccident(client: ClientData, opts: { hasIJ: boolean }): EventText {
  const p: string[] = [];
  if (opts.hasIJ) {
    p.push(
      "Lorsque vous avez un accident, votre employeur doit continuer de vous verser un salaire au minimum selon les échelles. La couverture via un assureur permet généralement de poursuivre environ 80% du salaire jusqu’à 2 ans : ce sont les indemnités journalières accident."
    );
  }
  p.push(
    "Après les indemnités journalières, les assurances prennent le relais. La LAA, l’AI et la LPP versent des rentes tant que l’incapacité persiste. L’ensemble coordonné ne peut pas excéder 90% de votre dernier revenu.",
    "Obligations financières et dette hypothécaire : une baisse de revenu peut amener la banque à réévaluer votre capacité de remboursement, pouvant aller jusqu’à saisir le bien.",
    "Protégez votre niveau de vie : un 3e pilier peut compléter pour maintenir votre niveau de vie."
  );
  return {
    lead: "C’est la diminution de votre revenu si vous devenez invalide suite à un accident.",
    paragraphs: p,
  };
}

export function textsDecesMaladie(client: ClientData, opts: { capital: number }): EventText {
  const p: string[] = [];
  p.push(
    "En cas de décès à la suite d’une maladie, la famille subit une baisse de niveau de vie. L’AI et la LPP versent des rentes mensuelles, souvent insuffisantes pour maintenir le niveau de vie.",
    "Obligations financières et dette hypothécaire : Une diminution de votre revenu peut entraîner une réévaluation de votre situation financière de la part de votre banque, pouvant aller jusqu’à la saisie de votre bien.",
    "Protégez votre niveau de vie : via un 3e pilier, votre famille peut maintenir un niveau de vie décent et faire face à des paiements élevés rapidement."
  );
  return {
    lead: `C’est la perte financière que subirait votre famille si vous décédiez des suites d’une maladie. Un capital de ${chf(
      opts.capital || 0
    )} serait versé en plus des rentes.`,
    paragraphs: p,
  };
}

export function textsDecesAccident(client: ClientData, opts: { capital: number }): EventText {
  const p: string[] = [];
  p.push(
    "En cas de décès à la suite d’un accident, la LAA, l’AI et la LPP versent des rentes mensuelles. Elles restent souvent insuffisantes pour maintenir le niveau de vie.",
    "Obligations financières et dette hypothécaire : Une diminution de votre revenu peut entraîner une réévaluation de votre situation financière de la part de votre banque, pouvant aller jusqu’à la saisie de votre bien.",
    "Protégez votre niveau de vie : via un 3e pilier, votre famille peut maintenir un niveau de vie décent et faire face à des paiements élevés rapidement."
  );
  return {
    lead: `C’est la perte financière que subirait votre famille si vous décédiez des suites d’un accident. Un capital de ${chf(
      opts.capital || 0
    )} serait versé en plus des rentes.`,
    paragraphs: p,
  };
}


export function textsRetraite(client: ClientData, opts: { capital: number }): EventText {
  const p: string[] = [];
  p.push(
    (() => {
  const avsMax = Math.max(
    ...Legal_Echelle44_2025.rows.map(r => r.Legal_OldAgeInvalidity || 0)
  );
  return `À votre retraite, votre revenu subira une diminution importante car, en termes de rentes régulières, vous comptez sur l’AVS (plafond à ${chf(avsMax)} CHF/mois) et sur les rentes de votre 2e pilier.`;
})(),
    `Votre lacune mensuelle cumulée jusqu’à vos 87 ans représente un capital d’environ ${chf(opts.capital || 0)} CHF.`,
    "Obligations financières et dettes : crédit hypothécaire, engagements privés, assurance-maladie… les charges restent, alors que le revenu baisse fortement.",
    "Optimisez votre situation de prévoyance : une solution 3e pilier adaptée avec MoneyLife vous aide à sécuriser durablement votre niveau de vie à la retraite."
  );
  return {
    lead: "À la retraite, le niveau de vie dépend surtout de l’AVS et de la LPP : anticipez la baisse de revenu.",
    paragraphs: p,
  };
}