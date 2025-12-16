// lib/offers/parsers/axa.ts

import {
  ManualOfferPayload,
  OfferParseContext,
  SurrenderValueRow,
  InsurerCode,
  ContractForm,
} from "./types";

/**
 * Normalise un nombre "suisse" (ex: 10'587, 7 258, 1’200, 0) en number.
 */
function parseChNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[’'\u00A0\s]/g, "")      // retire apostrophes et espaces (y compris insécables)
    .replace(/\u200B|\u200C|\u200D/g, "") // zero-width chars
    .replace(/,(?=\d{2}\b)/, ".");    // virgule décimale -> point

  // Cas particulier : ligne remplie uniquement de zéros, même si parasitée
  const onlyZeros = cleaned.replace(/0/g, "").length === 0;
  if (onlyZeros) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Détecte l'assureur à partir du texte OCR.
 */
function detectInsurer(text: string): InsurerCode {
  const t = text.toLowerCase();
  if (t.includes("axa")) return "AXA";
  if (t.includes("swiss life")) return "Swiss Life";
  if (t.includes("bâloise") || t.includes("baloise")) return "Bâloise";
  if (t.includes("pax")) return "PAX";
  return "AXA";
}

/**
 * Détecte grossièrement la forme du contrat (3a / 3b) à partir du texte OCR.
 */
function detectContractForm(text: string): ContractForm {
  const t = text.toLowerCase();
  if (t.includes("pilier 3b") || t.includes("3b") || t.includes("prévoyance libre")) {
    return "3b";
  }
  // Par défaut, on considère que c’est du 3a (prévoyance liée)
  return "3a";
}

/**
 * Extrait les valeurs de rachat AXA à partir du texte OCR.
 *
 * Cas VR AXA (format réel sur VR.pdf) :
 *
 * Date Pessimiste Modéré Optimiste
 * 01.01.2027  1'352  1'399  1'414  463
 * 01.01.2028  2'606  2'797  2'864  893
 * ...
 *
 * → Une date + 4 chiffres sur une seule ligne.
 *
 * On garde aussi, à titre de fallback, l’ancien mode
 * (date seule sur une ligne, chiffres sur les lignes suivantes).
 */
function extractSurrenderValuesFromText(ocrText: string): SurrenderValueRow[] {
  const lines = ocrText.split(/\r?\n/);
  const rows: SurrenderValueRow[] = [];

  const dateOnlyRe = /^\d{2}\.\d{2}\.\d{4}$/;
  const dateWithValuesRe =
    /^(\d{2}\.\d{2}\.\d{4})\s+([\d’' \u00A0]+)\s+([\d’' \u00A0]+)\s+([\d’' \u00A0]+)\s+([\d’' \u00A0]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // 1) Cas principal VR AXA : date + 4 valeurs sur la même ligne
    const m = line.match(dateWithValuesRe);
    if (m) {
      const [, dateLabel, v1, v2, v3, v4] = m;
      const pess = parseChNumber(v1);
      const mid = parseChNumber(v2);
      const opt = parseChNumber(v3);
      const guaranteed = parseChNumber(v4) ?? 0;

      rows.push({
        id: `sv_${dateLabel.replace(/\./g, "")}`,
        dateLabel,
        guaranteed,
        pess,
        mid,
        opt,
      });
      continue;
    }

    // 2) Fallback : ancien mode (date seule sur une ligne, chiffres ensuite)
    if (!dateOnlyRe.test(line)) continue;

    const dateLabel = line;
    const values: number[] = [];
    let j = i + 1;

    while (j < lines.length && !dateOnlyRe.test(lines[j].trim()) && values.length < 4) {
      const candidate = lines[j].trim();
      j++;

      if (!candidate) continue;

      const v = parseChNumber(candidate);
      if (v !== null) {
        values.push(v);
      }
    }

    if (values.length === 3 || values.length === 4) {
      const pess = values[0] ?? null;
      const mid = values[1] ?? null;
      const opt = values[2] ?? null;
      const guaranteed = values.length === 4 ? values[3]! : 0;

      rows.push({
        id: `sv_${dateLabel.replace(/\./g, "")}`,
        dateLabel,
        guaranteed,
        pess,
        mid,
        opt,
      });
    }
  }

  return rows;
}

/**
 * Parser principal pour les offres AXA (VR).
 *
 * ➜ Ne fait PAS d’appel à l’IA.
 * ➜ Suppose que le PDF fourni est la page de "Valeurs de rachat" (VR).
 * ➜ Remplit uniquement :
 *    - insurer
 *    - contractForm
 *    - surrenderValues (toutes les années)
 *    - le reste est laissé à null / vide pour saisie manuelle côté backoffice.
 */
export async function parseAxaOffer(
  context: OfferParseContext
): Promise<ManualOfferPayload> {
  const ocrText = (context.ocrText || "").trim();

  if (!ocrText) {
    console.warn("[AXA] parseAxaOffer: OCR vide, retour minimal.");
    const insurer: InsurerCode =
      (context.insurerHint as InsurerCode) || "AXA";

    const empty: ManualOfferPayload = {
      insurer,
      contractForm: "3a",
      startDateLabel: "",
      endDateLabel: "",
      premiumAnnual: null,
      premiumMonthly: null,
      coverages: [],
      projectedModerateAmount: null,
      projectedModerateRatePct: null,
      pessRatePct: null,
      midRatePct: null,
      optRatePct: null,
      surrenderValues: [],
    };

    return empty;
  }

  const insurer = detectInsurer(ocrText);
  const contractForm = detectContractForm(ocrText);

  const surrenderValues = extractSurrenderValuesFromText(ocrText);
  console.log(
    "[AXA parseAxaOffer] Surrender rows extraites =",
    surrenderValues.length
  );

  const offer: ManualOfferPayload = {
    insurer,
    contractForm,
    // Ces champs seront renseignés par le collaborateur dans le backoffice :
    startDateLabel: "",
    endDateLabel: "",
    premiumAnnual: null,
    premiumMonthly: null,
    coverages: [],
    projectedModerateAmount: null,
    projectedModerateRatePct: null,
    pessRatePct: null,
    midRatePct: null,
    optRatePct: null,
    surrenderValues,
  };

  return offer;
}