// lib/offers/parsers/swisslife_ai.ts

import OpenAI from "openai";
import {
  ManualOfferPayload,
  OfferParseContext,
  OfferCoverageRow,
  ContractForm,
  SurrenderValueRow,
} from "./types";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* -------------------------------------------------------------------------- */
/* Helper : extraction texte depuis Responses API                             */
/* -------------------------------------------------------------------------- */

function extractAllTextFromResponse(response: any): string {
  let out = "";

  for (const item of response.output ?? []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.type === "output_text" && typeof block.text === "string") {
          out += block.text;
        }
      }
    }
    if (typeof item.text === "string") {
      out += item.text;
    }
  }

  return out.trim();
}

function extractJsonFromModelOutput(text: string): string {
  const mJson = text.match(/```json([\s\S]*?)```/i);
  if (mJson) return mJson[1].trim();

  const mCode = text.match(/```([\s\S]*?)```/);
  if (mCode) return mCode[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    return text.slice(first, last + 1).trim();
  }
  return text.trim();
}

function extractJsonArray(text: string): string {
  // Cas markdown ```json [...] ```
  const mJson = text.match(/```json([\s\S]*?)```/i);
  if (mJson) {
    const inner = mJson[1].trim();
    const firstBracket = inner.indexOf("[");
    const lastBracket = inner.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1) {
      return inner.slice(firstBracket, lastBracket + 1).trim();
    }
    return inner;
  }

  // Cas markdown ``` [...] ```
  const mCode = text.match(/```([\s\S]*?)```/);
  if (mCode) {
    const inner = mCode[1].trim();
    const firstBracket = inner.indexOf("[");
    const lastBracket = inner.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1) {
      return inner.slice(firstBracket, lastBracket + 1).trim();
    }
    return inner;
  }

  // Cas réponse brute avec [...] et éventuellement du texte autour
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last !== -1) {
    return text.slice(first, last + 1).trim();
  }

  // Dernier recours
  return text.trim();
}

/* -------------------------------------------------------------------------- */
/* Correction capital décès si l'IA met 6000 au lieu de 250000                */
/* -------------------------------------------------------------------------- */

function fixDeathCapitalFromText(
  ai: AiSwissLifeMeta,
  ocrText: string
): AiSwissLifeMeta {
  const current = ai.benefits?.death?.extraCapital ?? null;
  if (current != null && current >= 50000) return ai;

  const match = ocrText.replace(/\u00A0/g, " ").match(
    /Capital supplémentaire[^0-9]*CHF\s*([0-9'’\s]+)/i
  );
  if (match) {
    const val = Number(match[1].replace(/[’'\s]/g, ""));
    if (val >= 50000) {
      ai.benefits ??= {} as any;
      ai.benefits.death ??= {} as any;
      ai.benefits.death.extraCapital = val;
    }
  }
  return ai;
}

/* -------------------------------------------------------------------------- */
/* Interfaces IA (meta+primes+scénarios) + lignes de tableau                  */
/* -------------------------------------------------------------------------- */

interface AiSwissLifeMeta {
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

interface AiRachatRow {
  date: string;
  pess: number | null;
  mid: number | null;
  opt: number | null;
}

/* -------------------------------------------------------------------------- */
/* PROMPT 1 : META / PRIMES / PRESTATIONS / SCÉNARIOS                         */
/* -------------------------------------------------------------------------- */

const PROMPT_META = `
Tu es un expert en offres Swiss Life 3a/3b.

Tu reçois le TEXTE OCR COMPLET d'une offre Swiss Life (plusieurs pages).
Tu dois renvoyer UN SEUL JSON du type :

{
  "meta": {...},
  "contract": {...},
  "person": {...},
  "premiums": {...},
  "benefits": {...},
  "scenarios": {...}
}

Les tableaux de valeurs de rachat (valeur de rachat normale et EPL) NE doivent PAS être inclus ici.

============================================================
1) meta
============================================================

- insurer = "Swiss Life"
- productName = nom du produit (ex "Swiss Life Dynamic Elements Duo")
- offerNumber = ligne "Offre 106.784.147/WP822525/2025.11.20"
- offerDate = date principale (ex "3.12.2025")
- currency = "CHF"

============================================================
2) contract
============================================================

- pillar = "3a" ou "3b" d'après "Solution de prévoyance pilier 3a/3b"
- startDate = "Début de l’assurance"
- endDate   = "Fin du contrat"

============================================================
3) person
============================================================

- fullName  = personne assurée ("Monsieur Habib Osmani" → "Habib Osmani")
- birthdate = date de naissance
- profession = "Profession exercée"
- activityType = "Type d’activité" (employé, indépendant, etc.)
- education = "Formation" (ex "université / EPF / HES")

============================================================
4) PRIMES
============================================================

Section "Primes" (libellé à gauche, montant à droite) :

- "Elément de sécurité et de rendement CHF 4 928.40"
- "Assurance en cas de décès à capital constant ... CHF 1 701.60"
- "Rente en cas d’incapacité de gain ... CHF 175.20"
- "Exonération du paiement des primes ... CHF 452.40"
- "Total annuel CHF 7 257.60"
- phrase avec la prime mensuelle (ex "... CHF 604.80").

Tu dois remplir :

premiums.annualTotal = total annuel  
premiums.monthlyTotal = prime mensuelle  

components.savings          = montant "Elément de sécurité et de rendement"  
components.death            = montant "Assurance en cas de décès ..."  
components.disabilityAnnuity = montant "Rente en cas d’incapacité de gain ..."  
components.premiumWaiver    = montant "Exonération du paiement des primes ..."  
components.privilegeOption  = montant annuel de l’option "Privilege" (CHF 18.00 dans les prestations).

NE CONFONDS JAMAIS :
- disabilityAnnuity  = prime IG
- premiumWaiver      = prime d’exonération des primes

============================================================
5) PRESTATIONS (Cas de vie, décès, IG)
============================================================

Cas de vie :
- Valeur de l’avoir de sécurité et de l’avoir en parts de fonds le 1.2.2055,
  avec "scénario bas / moyen / élevé".
  → benefits.lifeMaturity.low/medium/high

Cas de décès :
- "Capital supplémentaire avant le 1.2.2055 CHF 250 000.00"
  → benefits.death.extraCapital = 250000

Cas d’incapacité de gain :
- "Rente annuelle par suite de maladie ou d’accident CHF 6 000.00"
  → benefits.disability.annuityAnnual = 6000
- "... après 24 mois de délai d’attente"
  → benefits.disability.waitingMonths = 24

Exonération primes :
- "Exonération du paiement des primes ... après 3 mois de délai d’attente"
  → benefits.premiumWaiver.waitingMonths = 3

============================================================
6) SCÉNARIOS (Hypothèse de l’exemple de calcul)
============================================================

Section "Hypothèse de l’exemple de calcul" :
- taux de l’avoir de sécurité (scénario bas/moyen/élevé)
- performance du portefeuille de fonds (bas/moyen/élevé)
- "Rendement net p.a." du scénario moyen → projectedModerateRatePct

============================================================
CONTRAINTES DE SORTIE
============================================================

- Renvoie UN SEUL objet JSON conforme au schéma.
- PAS de markdown, PAS de texte autour.
- PAS de tableaux de rachat.
`;

/* -------------------------------------------------------------------------- */
/* PROMPT 2 : TABLEAU NORMAL (surrenderNormal)                                */
/* -------------------------------------------------------------------------- */

const PROMPT_NORMAL_TABLE = `
Tu reçois le TEXTE OCR COMPLET d'une offre Swiss Life.

Tu dois extraire UNIQUEMENT le tableau "Exemple d’évolution des valeurs de rachat de votre solution de prévoyance".

Ce tableau contient les colonnes :
- Date
- Scénario bas
- Scénario moyen
- Scénario élevé

Tu dois renvoyer un JSON strict de la forme :

[
  { "date": "31.1.2027", "pess": 3380, "mid": 3502, "opt": 3538 },
  ...
]

RÈGLES :
- Ne prends que les lignes du tableau normal (pas EPL).
- Chaque ligne doit commencer par une date (jj.mm.aaaa) suivie de 3 montants.
- Inclure toutes les lignes, de la première date (31.1.2027) jusqu’à la dernière (31.1.2055).
- PAS de texte autour, PAS de markdown.
`;

/* -------------------------------------------------------------------------- */
/* PROMPT 3 : TABLEAU EPL (surrenderEpl)                                      */
/* -------------------------------------------------------------------------- */

const PROMPT_EPL_TABLE = `
Tu reçois le TEXTE OCR COMPLET d'une offre Swiss Life.

Tu dois extraire UNIQUEMENT le tableau EPL :
"Exemple d’évolution des valeurs de rachat partiel maximales privilégiées de votre solution de prévoyance".

Colonnes :
- Date
- Scénario bas
- Scénario moyen
- Scénario élevé

PROBLÈME IMPORTANT :
- Ce tableau EPL commence sur une page, puis continue sur la page suivante.
- SwissLife répète un en-tête du tableau sur la nouvelle page, mais il s'agit de la SUITE du même tableau.
- Tu dois donc retrouver TOUTES les lignes EPL dans tout le texte, même si elles sont sur plusieurs pages.

RÈGLES POUR EPL :
- Cherche la section avec le titre EPL.
- Récupère toutes les lignes qui appartiennent à ce tableau EPL (dates + 3 montants).
- N'hésite pas à passer à la page suivante pour voir si une suite est reportée sur la page suivante.
- Si tu trouves seulement quelques lignes (par ex 31.1.2027 → 31.1.2031), tu dois continuer à parcourir tout le texte pour trouver la suite EPL (par ex 31.1.2032 → 31.1.2049) plus loin.
- Continue tant que tu vois des dates qui suivent (31.1.2032, 31.1.2033, …, 31.1.2049) avec des colonnes bas/moyen/élevé.
- Ne prends PAS les lignes du tableau normal.

Tu dois renvoyer un JSON strict de la forme :

[
  { "date": "31.1.2027", "pess": 4929, "mid": 5112, "opt": 5166 },
  ...
]

CONTRAINTES :
- JSON UNIQUEMENT, pas de texte autour.
- Toutes les dates EPL doivent être incluses, jusqu’à la dernière visible dans le texte.
`;

/* -------------------------------------------------------------------------- */
/* Fonctions d'appel IA pour chaque prompt                                    */
/* -------------------------------------------------------------------------- */

async function callMetaPrompt(ocrText: string): Promise<AiSwissLifeMeta> {
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

  const ai = JSON.parse(cleaned) as AiSwissLifeMeta;
  return fixDeathCapitalFromText(ai, ocrText);
}

async function callNormalTablePrompt(ocrText: string): Promise<AiRachatRow[]> {
  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_NORMAL_TABLE },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonArray(raw);

  try {
    const arr = JSON.parse(cleaned) as AiRachatRow[];
    return arr;
  } catch (err) {
    console.error("[SwissLife AI] NORMAL TABLE JSON parse error:", err);
    console.error("[NORMAL RAW]", raw);
    console.error("[NORMAL CLEANED]", cleaned);
    throw err;
  }
}

async function callEplTablePrompt(ocrText: string): Promise<AiRachatRow[]> {
  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_EPL_TABLE },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonArray(raw);

  try {
    const arr = JSON.parse(cleaned) as AiRachatRow[];
    return arr;
  } catch (err) {
    console.error("[SwissLife AI] EPL TABLE JSON parse error:", err);
    console.error("[EPL RAW]", raw);
    console.error("[EPL CLEANED]", cleaned);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping IA (meta + tableaux) → ManualOfferPayload                          */
/* -------------------------------------------------------------------------- */

function mapToManualOffer(
  meta: AiSwissLifeMeta,
  normalRows: AiRachatRow[],
  eplRows: AiRachatRow[]
): ManualOfferPayload {
  const comp = meta.premiums?.components ?? {};
  const ben = meta.benefits ?? ({} as any);

  const coverages: OfferCoverageRow[] = [];

  if (ben.death?.extraCapital != null) {
    coverages.push({
      id: "cov_death",
      label: "Capital décès fixe",
      sumInsured: ben.death.extraCapital,
      premium: comp.death ?? null,
    });
  }

  if (ben.disability?.annuityAnnual != null) {
    coverages.push({
      id: "cov_ig",
      label: "Rente incapacité de gain (principale)",
      sumInsured: ben.disability.annuityAnnual,
      premium: comp.disabilityAnnuity ?? null,
    });
  }

  if (ben.premiumWaiver?.waitingMonths != null) {
    coverages.push({
      id: "cov_waiver",
      label: "Libération du paiement des primes",
      sumInsured: null,
      premium: comp.premiumWaiver ?? null,
      waitingPeriodMonths: ben.premiumWaiver.waitingMonths as any,
    });
  }

  const surrenderValues: SurrenderValueRow[] = normalRows.map((r, idx) => ({
    id: `sv_${idx}`,
    dateLabel: r.date,
    guaranteed: 0,
    pess: r.pess,
    mid: r.mid,
    opt: r.opt,
  }));

  const surrenderValuesEpl: SurrenderValueRow[] | null = eplRows.length
    ? eplRows.map((r, idx) => ({
        id: `sv_epl_${idx}`,
        dateLabel: r.date,
        guaranteed: 0,
        pess: r.pess,
        mid: r.mid,
        opt: r.opt,
      }))
    : null;

  return {
    insurer: "Swiss Life",
    contractForm: (meta.contract?.pillar ?? "3a") as ContractForm,
    startDateLabel: meta.contract?.startDate ?? "",
    endDateLabel: meta.contract?.endDate ?? "",
    premiumAnnual: meta.premiums?.annualTotal ?? null,
    premiumMonthly: meta.premiums?.monthlyTotal ?? null,
    coverages,
    projectedModerateAmount: meta.benefits?.lifeMaturity?.medium ?? null,
    projectedModerateRatePct: meta.scenarios?.projectedModerateRatePct ?? null,
    pessRatePct: null,
    midRatePct: null,
    optRatePct: null,
    surrenderValues,
    surrenderValuesEpl,
  };
}

/* -------------------------------------------------------------------------- */
/*                        Fonction principale IA SwissLife                    */
/* -------------------------------------------------------------------------- */

export async function parseSwissLifeOfferAI(
  context: OfferParseContext
): Promise<ManualOfferPayload> {
  const { ocrText } = context;
  if (!ocrText || ocrText.length < 20) {
    throw new Error("Texte OCR SwissLife vide");
  }

  // PROMPT 1 : meta / primes / scénarios
  const meta = await callMetaPrompt(ocrText);

  // PROMPT 2 : tableau normal
  const normalRows = await callNormalTablePrompt(ocrText);

  // PROMPT 3 : tableau EPL
  const eplRows = await callEplTablePrompt(ocrText);

  return mapToManualOffer(meta, normalRows, eplRows);
}