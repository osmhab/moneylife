// lib/offers/parseOfferPdf.ts

import { ManualOfferPayload, InsurerCode, OfferParseContext } from "./parsers/types";
import { parseAxaOffer } from "./parsers/axa";

/**
 * Détecte l'assureur dans le texte OCR.
 * Ici utilisé simplement pour logger / fallback.
 */
function detectInsurerFromText(text: string): InsurerCode | null {
  if (/AXA/i.test(text)) return "AXA";
  if (/Swiss\s*Life/i.test(text)) return "Swiss Life";
  if (/Bâloise|Baloise/i.test(text)) return "Bâloise";
  if (/\bPAX\b/i.test(text)) return "PAX";
  return null;
}

/**
 * Fallback parseur générique basé sur texte OCR.
 * Actuellement : ne gère que AXA via parseAxaOffer.
 *
 * Utilisé quand :
 *  - assureur ≠ SwissLife
 *  - ou parseur IA SwissLife échoue
 */
export async function parseOfferPdf(params: {
  pdfBuffer: Buffer;         // gardé pour compatibilité future (si on fait un IA générique)
  ocrText?: string;          // texte OCR, fourni par la route
  insurerHint?: InsurerCode | "";
  requestId?: string;
  clientUid?: string;
}): Promise<ManualOfferPayload> {
  const { ocrText = "", insurerHint, requestId, clientUid } = params;

  const auto = detectInsurerFromText(ocrText);
  const insurer: InsurerCode =
    (insurerHint as InsurerCode) || auto || "AXA";

  console.log("[parseOfferPdf] fallback insurer =", insurer);

  const context: OfferParseContext = {
    insurerHint: insurer,
    requestId,
    clientUid,
    ocrText,
  };

  // Pour l'instant : on ne gère que AXA en fallback
  const offer = await parseAxaOffer(context);
  offer.insurer = insurer;

  return offer;
}