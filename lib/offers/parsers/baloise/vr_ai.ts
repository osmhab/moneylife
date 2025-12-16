// lib/offers/parsers/baloise/vr_ai.ts

import OpenAI from "openai";
import { SurrenderValueRow, OfferParseContext } from "../types";
import {
  extractAllTextFromResponse,
  extractJsonFromModelOutput,
  parseSwissNumber,
} from "../swisslife/utils";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface AiBaloiseRow {
  date: string;
  pess: number | null;
  mid: number | null;
  opt: number | null;
}

/**
 * Prompt IA pour extraire les valeurs de rachat Bâloise à partir
 * des pages "Exemple de calcul" / "Paiement excédents inclus".
 */
const PROMPT_BALOISE_VR = `
Tu reçois un texte OCR qui ne contient QUE les pages "Exemple de calcul" d'une offre Baloise (pilier 3a).

Structure typique :
- En haut : un petit tableau Scénario (Bas / Moyen / Haut) avec le rendement brut.
- Puis un grand tableau "Paiement excédents inclus" avec les colonnes :

  Date | en cas de décès | en cas de rachat | Scénario bas | Scénario moyen | Scénario haut | Valeurs de transformation

Exemple de ligne :
  01.01.2027 125'275 1'659 1'692 1'700 2'941
  ...
  01.01.2055 106'930 60'772 106'930 126'070 0

IMPORTANT – INTERPRÉTATION :
- Pour MoneyLife, les valeurs de rachat intéressantes sont les "valeurs en cas de rachat" :
  - Scénario bas
  - Scénario moyen
  - Scénario haut

- La colonne "en cas de décès" NE DOIT PAS être utilisée pour les valeurs de rachat.
- La colonne "Valeurs de transformation" correspond à un capital décès minimum
  et ne doit PAS être considérée comme une valeur de rachat.

Tu dois donc récupérer, pour chaque date de ce tableau :

  "pess" = valeur en cas de rachat – Scénario bas
  "mid"  = valeur en cas de rachat – Scénario moyen
  "opt"  = valeur en cas de rachat – Scénario haut

La colonne "Valeurs de transformation" doit être ignorée pour ces valeurs de rachat.

RÈGLES :
- Le tableau s'étend typiquement de 01.01.2027 à 01.01.2055, sur 2 pages.
- Les tableaux peuvent être coupés entre deux pages : tu dois donc parcourir
  tout le texte, repérer toutes les dates (jj.mm.aaaa) et reconstituer le tableau complet.

SORTIE ATTENDUE (UNIQUE JSON STRICT) :

{
  "rows": [
    { "date": "01.01.2027", "pess": 1659,   "mid": 1692,   "opt": 1700 },
    { "date": "01.01.2028", "pess": 3301,   "mid": 3426,   "opt": 3461 },
    ...
    { "date": "01.01.2055", "pess": 60772,  "mid": 106930, "opt": 126070 }
  ]
}

CONTRAINTES :
- Les dates doivent être dans l'ordre chronologique.
- Aucune date ne doit être manquante si elle apparaît dans le tableau OCR.
- Les montants doivent être des nombres (pas de chaînes), par ex. 1659, 60772, 106930, etc.
- Ne renvoie strictement que cet objet JSON, pas de texte autour, pas de markdown.
`;

/**
 * Parser IA pour VR Bâloise (un seul tableau, pas d'EPL).
 */
export async function parseBaloiseVRTables(
  context: OfferParseContext
): Promise<{ surrenderValues: SurrenderValueRow[]; surrenderValuesEpl: null }> {
  const { ocrText } = context;

  if (!ocrText || ocrText.length < 20) {
    return { surrenderValues: [], surrenderValuesEpl: null };
  }

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT_BALOISE_VR },
          { type: "input_text", text: ocrText },
        ],
      },
    ],
  });

  const raw = extractAllTextFromResponse(response);
  const cleaned = extractJsonFromModelOutput(raw);

  let ai: { rows: AiBaloiseRow[] };

  try {
    ai = JSON.parse(cleaned) as { rows: AiBaloiseRow[] };
  } catch (err) {
    console.error("[Baloise VR] JSON parse ERR", err);
    console.error("[RAW Baloise VR JSON]", cleaned);
    throw err;
  }

  // Convertit en SurrenderValueRow et déduplique par date (au cas où)
  const byDate = new Map<string, SurrenderValueRow>();

  for (let i = 0; i < ai.rows.length; i++) {
    const r = ai.rows[i];
    const dateLabel = r.date;

    const row: SurrenderValueRow = {
      id: `baloise_vr_${i}_${dateLabel.replace(/\./g, "")}`,
      dateLabel,
      guaranteed: 0,
      pess: r.pess,
      mid: r.mid,
      opt: r.opt,
    };

    // Si la date apparaît plusieurs fois, on garde la dernière version
    byDate.set(dateLabel, row);
  }

  const surrenderValues = Array.from(byDate.values());

  // Tri chronologique basique sur la date jj.mm.aaaa
  surrenderValues.sort((a, b) => {
    const [da, ma, ya] = a.dateLabel.split(".").map(Number);
    const [db, mb, yb] = b.dateLabel.split(".").map(Number);
    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
  });

  return {
    surrenderValues,
    surrenderValuesEpl: null,
  };
}