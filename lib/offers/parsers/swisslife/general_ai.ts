// lib/offers/parsers/swisslife/general_ai.ts

import OpenAI from "openai";
import {
  ManualOfferPayload,
  OfferCoverageRow,
  ContractForm,
  OfferParseContext,
} from "../types";

import {
  extractAllTextFromResponse,
  extractJsonFromModelOutput,
  fixDeathCapitalFromText,
} from "./utils";

function normalizeOfferNumber(v: string | null): string | null {
  if (!v) return null;

  // Cherche 3 blocs de chiffres XXX.XXX.XXX
  const m = v.match(/\b\d{3}\.\d{3}\.\d{3}\b/);
  return m ? m[0] : null;
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface AiSwissLifeMeta {
  meta: {
    insurer: "Swiss Life";
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
      privilegeOption: number | null;
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

const PROMPT_META = `
Tu es un expert Swiss Life.

Tu reçois le TEXTE OCR COMPLET d'une offre Swiss Life 3a/3b (plusieurs pages).

Tu dois renvoyer UN UNIQUE objet JSON strict avec la structure suivante :

{
  "meta": {
    "insurer": "Swiss Life",
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
      "premiumWaiver": number|null,
      "privilegeOption": number|null
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
- Renvoie UNIQUEMENT cet objet JSON, pas de markdown, pas de texte autour.
- Si une information n'est pas clairement présente dans le texte, mets null.
- NE PAS inclure les tableaux de valeurs de rachat (ni normal, ni EPL).

MAPPING ATTENDU DANS L'OFFRE :

meta :
- "insurer" = "Swiss Life"
- "productName" = nom complet du produit (ex: "Swiss Life Dynamic Elements Duo")
- "offerNumber" = référence complète (ex: "Offre 106.784.147/WP822525/2025.11.20")
- "offerDate" = date principale (ex: "3.12.2025")
- "currency" = "CHF"

offerNumber : se trouve toujours en bas de page à droite.
  Exemple exact dans le PDF : "Offre 106.784.147/WP822525/2025.11.20".
  Tu dois extraire **uniquement la partie numérique avant le premier slash**.
  Exemple → "106.784.147".

contract :
- "pillar" = "3a" ou "3b" selon "Solution de prévoyance pilier 3a/3b"
- "startDate" = valeur affichée à "Début de l'assurance"
- "endDate" = valeur affichée à "Fin du contrat"

person :
- "fullName" = personne assurée (ex: "Monsieur Habib Osmani" → "Habib Osmani")
- "birthdate" = date de naissance
- "profession" = "Profession exercée"
- "activityType" = "Type d'activité"
- "education" = "Formation"

premiums :
Dans la section "Primes", avec les lignes :
- "Elément de sécurité et de rendement CHF 4 928.40"
- "Assurance en cas de décès à capital constant ... CHF 1 701.60"
- "Rente en cas d’incapacité de gain ... CHF 175.20"
- "Exonération du paiement des primes ... CHF 452.40"
- "Total annuel CHF 7 257.60"
- phrase avec la prime mensuelle (ex: "... CHF 604.80")

Tu dois remplir :
- "annualTotal" = montant du "Total annuel"
- "monthlyTotal" = montant de la prime mensuelle

"premiums.components.savings" = montant de "Elément de sécurité et de rendement"
"premiums.components.death" = montant de "Assurance en cas de décès ..."
"premiums.components.disabilityAnnuity" = montant de "Rente en cas d’incapacité de gain ..."
"premiums.components.premiumWaiver" = montant de "Exonération du paiement des primes ..."
"premiums.components.privilegeOption" = montant annuel de l’option "Privilege" (CHF 18.00)

benefits :
Dans la section "Prestations" :

Cas de vie :
- "Valeur de l’avoir de sécurité et de l’avoir en parts de fonds le 1.2.2055"
  avec 3 scénarios (bas/moyen/élevé) → "lifeMaturity.low/medium/high"

Cas de décès :
- "Capital supplémentaire avant le 1.2.2055 CHF 250 000.00"
  → "death.extraCapital" = 250000

Cas d’incapacité de gain :
- "Rente annuelle par suite de maladie ou d’accident CHF 6 000.00"
  → "disability.annuityAnnual" = 6000
- "… après 24 mois de délai d'attente"
  → "disability.waitingMonths" = 24

Exonération des primes :
- "Exonération du paiement des primes ... après 3 mois de délai d’attente"
  → "premiumWaiver.waitingMonths" = 3

scenarios :
Dans la section "Hypothèse de l’exemple de calcul" :
- "Taux d’intérêt de l’avoir de sécurité" (bas/moyen/élevé) → "rateSecurityLow/Medium/High"
- "Performance du portefeuille de fonds" (bas/moyen/élevé) → "perfFundsLow/Medium/High"
- "Rendement net p.a." du scénario moyen → "projectedModerateRatePct"
`;

export async function parseSwissLifeMeta(
  context: OfferParseContext
): Promise<AiSwissLifeMeta> {
  const { ocrText } = context;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_META },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonFromModelOutput(raw);

    let ai = JSON.parse(cleaned) as AiSwissLifeMeta;
    ai = fixDeathCapitalFromText(ai, ocrText);

    // Normalisation du numéro d'offre (extrait le 106.784.147)
    ai.meta.offerNumber = normalizeOfferNumber(ai.meta.offerNumber);



  return ai;
}

/* -------------------------------------------------------------------------- */
/* Mapping AiSwissLifeMeta → coverages (décès, IG, exonération)              */
/* -------------------------------------------------------------------------- */

export function buildCoveragesFromMeta(meta: AiSwissLifeMeta): OfferCoverageRow[] {
  const comp = meta.premiums?.components ?? {};
  const ben = meta.benefits ?? ({} as any);

  const coverages: OfferCoverageRow[] = [];

  // Capital décès fixe
  if (ben.death?.extraCapital != null) {
    coverages.push({
      id: "cov_death",
      label: "Capital décès fixe",
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

  // Exonération des primes
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