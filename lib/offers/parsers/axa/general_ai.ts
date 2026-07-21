// lib/offers/parsers/axa/general_ai.ts

import OpenAI from "openai";
import {
  OfferCoverageRow,
  OfferParseContext,
} from "../types";

import {
  extractAllTextFromResponse,
  extractJsonFromModelOutput,
} from "../swisslife/utils";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

export interface AiAxaMeta {
  meta: {
    insurer: "AXA";
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

const PROMPT_AXA_META = `
Tu es un expert des offres de prévoyance AXA (Pilier 3a / 3b).

Tu reçois le TEXTE OCR COMPLET d'une offre AXA (PDF Offre, pas la page VR).

Tu dois renvoyer UN SEUL objet JSON strict avec la structure suivante :

{
  "meta": {
    "insurer": "AXA",
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

- "insurer" = "AXA"
- "productName" = nom du produit (ex: "Plan de prévoyance SmartFlex").
- "offerNumber" = numéro d'offre, généralement après "Offre n°" ou similaire.
  Si la ligne est du type "Offre n° L50 1862602", mets "L50 1862602".
- "offerDate" = date de l'offre si identifiable.
- "currency" = "CHF".

=========================
2) contract
=========================

- "pillar" = "3a" ou "3b" d'après les mentions
  "Prévoyance liée (pilier 3a)" ou "Prévoyance libre (pilier 3b)".
- "startDate" = date de début du contrat (si affichée).
- "endDate"   = date de fin (si affichée).

=========================
3) person
=========================

- "fullName" = nom de la personne assurée.
- "birthdate" = date de naissance.
- "profession" = profession ou activité.
- "activityType" = employé, indépendant, etc.
- "education" = niveau de formation (si mentionné).

=========================
4) PREMIUMS (PRIMES)
=========================

Les montants se trouvent dans la section :
"Votre prime à partir du ..." et "Prime pour les assurances complémentaires"
avec libellé à gauche et montant à droite.

Tu dois :
- "annualTotal" = montant de la prime annuelle totale,
  en incluant toutes les assurances complémentaires (épargne + décès + IG + exonération, etc.).
- "monthlyTotal" = prime mensuelle.

Chez AXA, ces informations se trouvent dans la section "Détails concernant l'offre",
sous "Paiement des primes" :

- Il y a une ligne du type :
  "Modalités de paiement" / "Mode de paiement" : "Mensuel" ou "Annuel".

- Plus bas, une ligne du type :
  "Prime mensuelle à partir de ..."  OU  "Prime annuelle à partir de ...".

RÈGLES POUR "monthlyTotal" :
1) Si AXA affiche explicitement "Prime mensuelle à partir de CHF X",
   alors "monthlyTotal" = X.

2) Si AXA affiche "Prime annuelle à partir de CHF Y" (et pas de prime mensuelle),
   alors tu calcules :
     monthlyTotal = Y / 12
   (arrondi à 2 décimales).

3) Si tu ne trouves ni "Prime mensuelle" ni "Prime annuelle",
   alors mets "monthlyTotal" = null.

components :
- "savings" = part de prime liée à l’épargne / prévoyance vieillesse (plan d’épargne principal 3a).
- "death" = prime liée aux assurances décès (voir règles ci-dessous sur les prestations décès).
- "disabilityAnnuity" = prime pour les rentes d’incapacité de gain.
- "premiumWaiver" = prime pour la "Libération du paiement des primes en cas d’incapacité de gain".

Si tu n'es pas sûr de la part exacte, mets null plutôt que d'inventer.

=========================
5) BENEFITS (PRESTATIONS)
=========================

a) Capital décès fixe ("benefits.death.extraCapital")

Tu dois additionner toutes les prestations décès fixes assurées visibles sur l'offre.

Exemple typique :
- "Prestation en cas de décès de CHF 80 000.-" (minimum garanti / prestation principale)
- "Assurance en cas de décès complémentaire CHF 40 000.-"

Dans ce cas :
- "benefits.death.extraCapital" = 80 000 + 40 000 = 120 000.

Règles :
- Cherche toutes les lignes qui ressemblent à des prestations en cas de décès
  (y compris "Prestation en cas de décès de ...", "Assurance en cas de décès complémentaire", etc.).
- Additionne tous les montants de capital décès pour obtenir un capital décès total.
- Mets ce total dans "benefits.death.extraCapital".

b) Incapacité de gain ("benefits.disability")

- "annuityAnnual" = montant de la rente annuelle en cas d'incapacité de gain.
  (ex: "Rente annuelle en cas d'incapacité de gain CHF 8 000.-")
- "waitingMonths" = délai d'attente correspondant (en mois), souvent mentionné comme
  "après 24 mois de délai d'attente".

c) Libération du paiement des primes ("benefits.premiumWaiver")

Chez AXA, cette prestation s'appelle :
"Libération du paiement des primes en cas d'incapacité de gain".

Tu dois :
- "premiumWaiver.waitingMonths" = délai d'attente en mois pour cette libération
  (ex: 3 mois).

=========================
6) SCÉNARIOS (TABLEAU "SCÉNARIOS")
=========================

Si AXA affiche un tableau "Scénarios" avec des projections (pessimiste / modéré / optimiste)
et en dessous une phrase du type :

"Le rendement brut de votre plan de prévoyance pour le scénario modéré s'élève à 5.05%"

Alors :

- Tu peux remplir "lifeMaturity.low/medium/high" avec les valeurs
  de capital final selon les scénarios (si le tableau est lisible dans le texte).

- Surtout, tu dois remplir :
  "scenarios.projectedModerateRatePct" = 5.05 (dans l'exemple ci-dessus).

En résumé :
- repère la phrase contenant "rendement brut" et "scénario modéré",
- extrait la valeur en pourcentage (ex: 5.05%) et mets-la dans "projectedModerateRatePct"
  sous forme de nombre (5.05).

Si un tableau de scénarios contient aussi des taux et performances,
tu peux remplir "rateSecurityLow/Medium/High" et "perfFundsLow/Medium/High",
mais si ce n'est pas clairement lisible, laisse-les à null.

=========================
7) CONTRAINTES FINALES
=========================

- Renvoie UN SEUL objet JSON strictement conforme au schéma.
- Aucun texte autour, aucun markdown.
- Si tu n'es pas sûr d'une valeur, utilise null plutôt que d'inventer.
`;

function normalizeAxaOfferNumber(v: string | null): string | null {
  if (!v) return null;

  // ex: "Offre n° L50 1862602" → "L50 1862602"
  const m = v.match(/(L\d+\s*\d{6,}|[A-Z0-9]{2,}\s*\d{4,})/);
  return m ? m[0].trim() : v.trim();
}

export async function parseAxaMeta(
  context: OfferParseContext
): Promise<AiAxaMeta> {
  const { ocrText } = context;

  if (!ocrText || ocrText.length < 20) {
    throw new Error("Texte OCR AXA vide pour parseAxaMeta");
  }

  const response = await getOpenAI().responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_AXA_META },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonFromModelOutput(raw);

const ai = JSON.parse(cleaned) as AiAxaMeta;

// Normalisation numéro d'offre
ai.meta.offerNumber = normalizeAxaOfferNumber(ai.meta.offerNumber);

// Fallback sécurité pour la prime mensuelle
if (
  ai.premiums &&
  typeof ai.premiums.annualTotal === "number" &&
  (ai.premiums.monthlyTotal === null || ai.premiums.monthlyTotal === undefined)
) {
  ai.premiums.monthlyTotal = Number((ai.premiums.annualTotal / 12).toFixed(2));
}

return ai;
}

/* -------------------------------------------------------------------------- */
/* Mapping AiAxaMeta → coverages (décès, IG, exonération)                     */
/* -------------------------------------------------------------------------- */

export function buildCoveragesFromAxaMeta(meta: AiAxaMeta): OfferCoverageRow[] {
  const comp = meta.premiums?.components ?? {};
  const ben = meta.benefits ?? ({} as any);

  const coverages: OfferCoverageRow[] = [];

// Capital décès fixe (somme de toutes les prestations décès)
if (ben.death?.extraCapital != null) {
  coverages.push({
    id: "cov_death",
    label: "Capital décès fixe", // 👈 EXACTEMENT comme COVERAGE_OPTIONS
    sumInsured: ben.death.extraCapital,
    premium: comp.death ?? null,
  });
}

// Rente IG principale
if (ben.disability?.annuityAnnual != null) {
  coverages.push({
    id: "cov_ig",
    label: "Rente incapacité de gain (principale)", // 👈 idem
    sumInsured: ben.disability.annuityAnnual,
    premium: comp.disabilityAnnuity ?? null,
  });
}

// Libération du paiement des primes
if (ben.premiumWaiver?.waitingMonths != null) {
  coverages.push({
    id: "cov_waiver",
    label: "Libération du paiement des primes", // 👈 idem
    sumInsured: null,
    premium: comp.premiumWaiver ?? null,
    waitingPeriodMonths: ben.premiumWaiver.waitingMonths as any,
  });
}

  return coverages;
}