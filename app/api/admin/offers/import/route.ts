// lib/offers/parseOfferPdf.ts

import vision from "@google-cloud/vision";
import { ManualOfferPayload, InsurerCode, OfferParseContext } from "lib/offers/parsers/types";
import { parseAxaOffer } from "lib/offers/parsers/axa";

const visionClient = new vision.ImageAnnotatorClient();

async function getOcrTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  const [result] = await visionClient.documentTextDetection({
    image: { content: pdfBuffer },
  });

  const fullText = result.fullTextAnnotation?.text;
  return fullText ?? "";
}

function detectInsurerFromText(text: string): InsurerCode | null {
  if (/AXA/i.test(text)) return "AXA";
  if (/Swiss Life/i.test(text)) return "Swiss Life";
  if (/Bâloise/i.test(text) || /Baloise/i.test(text)) return "Bâloise";
  if (/PAX/i.test(text)) return "PAX";
  return null;
}

export async function parseOfferPdf(params: {
  pdfBuffer: Buffer;
  insurerHint?: InsurerCode | "";
  requestId?: string;
  clientUid?: string;
}): Promise<ManualOfferPayload> {
  const { pdfBuffer, insurerHint, requestId, clientUid } = params;

  // 1) OCR via Google Vision
  const ocrText = await getOcrTextFromPdfBuffer(pdfBuffer);
  console.log("[parseOfferPdf] OCR snippet:", ocrText.slice(0, 400));

  // 2) Détection assureur
  const autoInsurer = detectInsurerFromText(ocrText);
  const insurer: InsurerCode =
    (insurerHint as InsurerCode) || autoInsurer || "AXA"; // fallback

  console.log("[parseOfferPdf] insurer detected =", insurer);

  const baseContext: OfferParseContext = {
    insurerHint: insurer,
    requestId,
    clientUid,
    ocrText,
  };

  // 3) Pour l'instant, on ne gère que AXA (mais la structure permet de rajouter les autres)
  const offer = await parseAxaOffer(baseContext);

  // on force le champ insurer dans l'offre
  offer.insurer = "AXA";

  return offer;
}