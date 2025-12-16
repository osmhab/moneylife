// lib/offers/parsers/swisslife/vr_ai.ts

import OpenAI from "openai";
import { SurrenderValueRow, OfferParseContext } from "../types";
import {
  extractAllTextFromResponse,
  extractJsonFromModelOutput,
  parseSwissNumber,
} from "./utils";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface AiRachatRow {
  date: string;
  pess: number | null;
  mid: number | null;
  opt: number | null;
}

const PROMPT_VR = `
Tu reçois un texte OCR qui ne contient QUE les pages valeurs de rachat d'une offre Swiss Life.

Deux tableaux :

1) Tableau normal :
"Exemple d’évolution des valeurs de rachat de votre solution de prévoyance"

2) Tableau EPL :
"Exemple d’évolution des valeurs de rachat partiel maximales privilégiées ..."

RÈGLES IMPORTANTES :
- Les tableaux peuvent être coupés entre deux pages.
- Tu dois rechercher TOUTES les lignes pour les deux tableaux.
- Chaque ligne : date jj.mm.aaaa + scénario bas/moyen/élevé.

TU DOIS RENVOYER UN UNIQUE JSON STRICT :

{
  "surrenderNormal": [
    { "date": "...", "pess": ..., "mid": ..., "opt": ... },
    ...
  ],
  "surrenderEpl": [
    { "date": "...", "pess": ..., "mid": ..., "opt": ... },
    ...
  ]
}

NE PAS inclure d'autres champs.
NE PAS mettre de markdown.
NE PAS mettre de commentaires.
`;

export async function parseSwissLifeVRTables(
  context: OfferParseContext
): Promise<{
  surrenderValues: SurrenderValueRow[];
  surrenderValuesEpl: SurrenderValueRow[];
}> {
  const { ocrText } = context;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_VR },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonFromModelOutput(raw);

  let ai: {
    surrenderNormal: AiRachatRow[];
    surrenderEpl: AiRachatRow[];
  };

  try {
    ai = JSON.parse(cleaned);
  } catch (err) {
    console.error("[SwissLife VR] JSON parse ERR", err);
    console.error("[RAW VR JSON]", cleaned);
    throw err;
  }

  const surrenderValues: SurrenderValueRow[] = ai.surrenderNormal.map(
    (r, idx) => ({
      id: `sv_${idx}`,
      dateLabel: r.date,
      guaranteed: 0,
      pess: r.pess,
      mid: r.mid,
      opt: r.opt,
    })
  );

  const surrenderValuesEpl: SurrenderValueRow[] = ai.surrenderEpl.map(
    (r, idx) => ({
      id: `sv_epl_${idx}`,
      dateLabel: r.date,
      guaranteed: 0,
      pess: r.pess,
      mid: r.mid,
      opt: r.opt,
    })
  );

  return { surrenderValues, surrenderValuesEpl };
}