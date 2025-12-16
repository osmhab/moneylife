// lib/offers/parsers/baloise/general_ai.ts

import OpenAI from "openai";
import {
  OfferCoverageRow,
  OfferParseContext,
} from "../types";

import {
  extractAllTextFromResponse,
  extractJsonFromModelOutput,
} from "../swisslife/utils";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface AiBaloiseMeta {
  meta: {
    insurer: "Bâloise";
    productName: string | null;
    offerNumber: string | null;
    offerDate: string | null;
    currency: string | null;
  };
  contract: {
    pillar: "3a" | "3b" | null;
    startDate: string | null;
    endDate: string | null;
  };
  person: {
    fullName: string | null;
    birthdate: string | null;
    profession: string | null;
    activityType: string | null;
    education: string | null;
  };
  premiums: {
    annualTotal: number | null;
    monthlyTotal: number | null;
    components: {
      savings: number | null;
      death: number | null;
      disabilityAnnuity: number | null;
      premiumWaiver: number | null;
    };
  };
  benefits: {
    lifeMaturity: { low: number | null; medium: number | null; high: number | null };
    death: { extraCapital: number | null };
    disability: { annuityAnnual: number | null; waitingMonths: number | null };
    premiumWaiver: { waitingMonths: number | null };
  };
  scenarios: {
    rateSecurityLow: number | null;
    rateSecurityMedium: number | null;
    rateSecurityHigh: number | null;
    perfFundsLow: number | null;
    perfFundsMedium: number | null;
    perfFundsHigh: number | null;
    projectedModerateRatePct: number | null;
  };
}

const PROMPT_BALOISE_META = `
Tu es un expert des offres de prévoyance Bâloise (pilier 3a / 3b).

Tu reçois le TEXTE OCR COMPLET d'une offre Baloise Vie (PDF Offre, pas la page VR).

Tu dois renvoyer UN SEUL objet JSON strict avec la structure suivante :

{
  "meta": {
    "insurer": "Bâloise",
    "productName": string|null,
    "offerNumber": string|null,
    "offerDate": string|null,
    "currency": "CHF"
  },
  "contract": {
    "pillar": "3a"|"3b"|null,
    "startDate": string|null,
    "endDate": string|null
  },
  "person": {
    "fullName": string|null,
    "birthdate": string|null,
    "profession": string|null,
    "activityType": string|null,
    "education": string|null
  },
  "premiums": {
    "annualTotal": number|null,
    "monthlyTotal": number|null,
    "components": {
      "savings": number|null,
      "death": number|null,
      "disabilityAnnuity": number|null,
      "premiumWaiver": number|null
    }
  },
  "benefits": {
    "lifeMaturity": {
      "low": number|null,
      "medium": number|null,
      "high": number|null
    },
    "death": { "extraCapital": number|null },
    "disability": { "annuityAnnual": number|null, "waitingMonths": number|null },
    "premiumWaiver": { "waitingMonths": number|null }
  },
  "scenarios": {
    "rateSecurityLow": number|null,
    "rateSecurityMedium": number|null,
    "rateSecurityHigh": number|null,
    "perfFundsLow": number|null,
    "perfFundsMedium": number|null,
    "perfFundsHigh": number|null,
    "projectedModerateRatePct": number|null
  }
}

CONTRAINTES GÉNÉRALES :
- Renvoie UNIQUEMENT cet objet JSON, pas de texte autour, pas de markdown.
- Si une information n'apparaît pas clairement, mets null.
- NE PAS inclure de tableaux de valeurs de rachat (la page VR sera traitée séparément).

=========================
1) meta
=========================

- "insurer" = "Bâloise"
- "productName" = nom du produit (ex: "Baloise Fonds Plan (3a)").
- "offerNumber" = numéro d'offre, par ex. "550961521" apparaissant après "Numéro d’offre".
- "offerDate" = date de l'offre (ex: "9 décembre 2025").
- "currency" = "CHF".

=========================
2) contract
=========================

- "pillar" = "3a" ou "3b" d'après la mention du produit (p. ex. "Baloise Fonds Plan (3a)").
- "startDate" = "Début du contrat" (ex: 01.01.2026).
- "endDate"   = "Échéance du contrat" (ex: 01.01.2055).

=========================
3) person
=========================

Les données personnelles se trouvent dans la section "Données personnelles".

- "fullName"  = nom complet de la personne assurée (ex: "Habib Osmani").
- "birthdate" = "Date de naissance".
- "profession" = profession / activité (si mentionnée).
- "activityType" = employé, indépendant, etc. (si mentionnée).
- "education" = niveau de formation (si mentionné).

=========================
4) PREMIUMS
=========================

Les primes se trouvent dans la partie "Aperçu des primes" avec les lignes:

Prime Montant
  annuelle à partir du 01.01.2026 3'599.40
  annuelle à partir du 01.01.2046 ...
  resp. mensuelle à partir du 01.01.2026 300.00
  ...

RÈGLES :
- "annualTotal" = la prime annuelle principale utilisée au début du contrat,
  c'est la première ligne "annuelle à partir du ...".
- "monthlyTotal" = la prime mensuelle principale au début du contrat,
  c'est la première ligne "resp. mensuelle à partir du ...".

Si la prime mensuelle n'est pas indiquée mais que la prime annuelle est connue :
- "monthlyTotal" = annualTotal / 12 (arrondi à 2 décimales).

components (section "Couverture d'assurance / Détails Prestation Prime") :

En cas de vie:
- la prime associée à la prestation en cas de vie (par ex. contre-valeur des parts le 01.01.2055)
  doit être mise dans "premiums.components.savings".

En cas de décès:
- toutes les primes liées au décès (capital décès, couverture décès complémentaire, etc.)
  doivent être agrégées dans "premiums.components.death".

En cas d'incapacité de gain:
- prime pour la rente annuelle d'incapacité de gain → "premiums.components.disabilityAnnuity".
- prime pour la libération du paiement des primes → "premiums.components.premiumWaiver".

Si tu ne peux pas séparer précisément, laisse certains composants à null plutôt que d'inventer.

=========================
5) BENEFITS (PRESTATIONS)
=========================

Cas de vie :
- Si une prestation en cas de vie à l'échéance est affichée (par ex. valeur des parts au 01.01.2055),
  et que des scénarios bas/moyen/haut existent (dans l'exemple de calcul),
  tu peux attribuer:
    - "lifeMaturity.low"    = valeur du scénario bas,
    - "lifeMaturity.medium" = valeur du scénario moyen,
    - "lifeMaturity.high"   = valeur du scénario haut.

Cas de décès :
- Tu dois repérer toutes les prestations décès fixes, par ex:
  - "avant le 01.01.2055 40'000.00"
  - "avant le 01.01.2055 la contre-valeur des parts, au minimum 85'275.00"
- Additionne ces montants pour obtenir un capital décès minimal total
  (ex: 40'000 + 85'275 = 125'275) et mets ce total dans "death.extraCapital".

Cas d’incapacité de gain :
- "disability.annuityAnnual" = montant annuel de la rente en cas d'incapacité de gain
  (ex: 8'000.00).
- "disability.waitingMonths" = délai d'attente correspondant (ex: 24 mois).

Exonération des primes :
- Pour la prestation du type "après un délai d’attente de 3 mois, libération du paiement des primes ...",
  mets "premiumWaiver.waitingMonths" = 3.

=========================
6) SCÉNARIOS
=========================

Dans la page "Exemple de calcul", tu as un tableau avec:

Scénario / Développement annuel des parts (rendement brut en %) /
Paiement en cas de vie le / Valeur des parts / Valeur des parts excédents inclus.

- "rateSecurityLow/Medium/High" peuvent être remplis avec les rendements bruts des scénarios
  bas / moyen / haut (ex: 0.50 / 4.10 / 5.10).

Dans la section "Informations complémentaires concernant les coûts" :
- "Rendement annuel brut en % 4.10"
- "Réduction annuelle du rendement (RIY) en % 2.60"
- "Rendement annuel net en % 1.50"

Pour "projectedModerateRatePct" :
- tu dois utiliser le rendement ANNUEL BRUT du scénario moyen (par ex. 4.10).

=========================
7) CONTRAINTES FINALES
=========================

- Un seul objet JSON conforme au schéma.
- Aucun texte autour, aucun markdown.
- Si tu n'es pas sûr, utilise null.
`;

function normalizeBaloiseOfferNumber(v: string | null): string | null {
  if (!v) return null;

  // ex: "Numéro d’offre 550961521" → "550961521"
  const m = v.match(/\b[0-9]{6,}\b/);
  return m ? m[0] : v.trim();
}

export async function parseBaloiseMeta(
  context: OfferParseContext
): Promise<AiBaloiseMeta> {
  const { ocrText } = context;

  if (!ocrText || ocrText.length < 20) {
    throw new Error("Texte OCR Bâloise vide pour parseBaloiseMeta");
  }

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_BALOISE_META },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonFromModelOutput(raw);

  const ai = JSON.parse(cleaned) as AiBaloiseMeta;

  // Normalise le numéro d'offre
  ai.meta.offerNumber = normalizeBaloiseOfferNumber(ai.meta.offerNumber);

  // Fallback prime mensuelle: annualTotal / 12 si nécessaire
  if (
    ai.premiums &&
    typeof ai.premiums.annualTotal === "number" &&
    (ai.premiums.monthlyTotal === null || ai.premiums.monthlyTotal === undefined)
  ) {
    ai.premiums.monthlyTotal = Number(
      (ai.premiums.annualTotal / 12).toFixed(2)
    );
  }

  return ai;
}

/* -------------------------------------------------------------------------- */
/* Mapping AiBaloiseMeta → coverages (décès, IG, exonération)                 */
/* -------------------------------------------------------------------------- */

export function buildCoveragesFromBaloiseMeta(
  meta: AiBaloiseMeta
): OfferCoverageRow[] {
  const comp = meta.premiums?.components ?? {};
  const ben = meta.benefits ?? ({} as any);

  const coverages: OfferCoverageRow[] = [];

  // Capital décès fixe (somme minimale garantie, déjà agrégée dans extraCapital)
  if (ben.death?.extraCapital != null) {
    coverages.push({
      id: "cov_death",
      label: "Capital décès fixe", // aligné avec COVERAGE_OPTIONS
      sumInsured: ben.death.extraCapital,
      premium: comp.death ?? null,
    });
  }

  // Rente IG principale
  if (ben.disability?.annuityAnnual != null) {
    coverages.push({
      id: "cov_ig",
      label: "Rente incapacité de gain (principale)",
      sumInsured: ben.disability.annuityAnnual,
      premium: comp.disabilityAnnuity ?? null,
    });
  }

  // Libération du paiement des primes
  if (ben.premiumWaiver?.waitingMonths != null) {
    coverages.push({
      id: "cov_waiver",
      label: "Libération du paiement des primes",
      sumInsured: null,
      premium: comp.premiumWaiver ?? null,
      waitingPeriodMonths: ben.premiumWaiver.waitingMonths as any,
    });
  }

  return coverages;
}