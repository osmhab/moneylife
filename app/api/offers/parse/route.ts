// app/api/offers/parse/route.ts

import { NextResponse } from "next/server";
import { db, bucket, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { ImageAnnotatorClient } from "@google-cloud/vision";

import { parseOfferPdf } from "lib/offers/parseOfferPdf";
import {
  parseSwissLifeMeta,
  buildCoveragesFromMeta,
} from "lib/offers/parsers/swisslife/general_ai";
import {
  parseAxaMeta,
  buildCoveragesFromAxaMeta,
} from "lib/offers/parsers/axa/general_ai"; 
import {
  parseBaloiseMeta,
  buildCoveragesFromBaloiseMeta,
} from "lib/offers/parsers/baloise/general_ai";

import type {
  InsurerCode,
  OfferParseContext,
  ManualOfferPayload,
  ContractForm,
} from "lib/offers/parsers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const vision = new ImageAnnotatorClient();

/* -------------------------------------------------------------------------- */
/*                         UTILITAIRE : Normalisation                          */
/* -------------------------------------------------------------------------- */
function normalizeInsurer(raw: string): InsurerCode | "" {
  if (/swiss\s*life/i.test(raw)) return "Swiss Life";
  if (/axa/i.test(raw)) return "AXA";
  if (/bâloise|baloise/i.test(raw)) return "Bâloise";
  if (/\bpax\b/i.test(raw)) return "PAX";
  return "";
}

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { ok: false, error: "filePath manquant" },
        { status: 400 }
      );
    }

    const match = filePath.match(/^clients\/([^/]+)\/offers_raw\/([^/.]+)\.pdf$/i);
    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          error: "Format filePath invalide. Attendu: clients/{uid}/offers_raw/{id}.pdf",
        },
        { status: 400 }
      );
    }

    const [, uid, fileId] = match;

    /* -------------------------------------------------------------------------- */
    /*                         Authentification facultative                       */
    /* -------------------------------------------------------------------------- */

    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const decoded = await authAdmin.verifyIdToken(token);

      if (decoded.uid !== uid) {
        return NextResponse.json(
          { ok: false, error: "UID du token ≠ UID du chemin" },
          { status: 403 }
        );
      }
    }

    /* -------------------------------------------------------------------------- */
    /*                      Récupération PDF depuis Firebase Storage             */
    /* -------------------------------------------------------------------------- */

    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ ok: false, error: "Fichier introuvable" }, { status: 404 });
    }

    const [pdfBuffer] = await file.download();

    /* -------------------------------------------------------------------------- */
    /*                         OCR GOOGLE VISION (Batch PDF)                      */
    /* -------------------------------------------------------------------------- */

    const gcsSourceUri = `gs://${bucket.name}/${filePath}`;
    const outPrefix = `tmp/vision/${uid}/offers/${fileId}/`;
    const gcsOut = `gs://${bucket.name}/${outPrefix}`;

    const [operation] = await vision.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: "application/pdf" },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: { gcsDestination: { uri: gcsOut }, batchSize: 5 },
        },
      ],
    });

    await operation.promise();

    const [outFiles] = await bucket.getFiles({ prefix: outPrefix });
    const jsonFile = outFiles.find((f) => f.name.endsWith(".json"));

    if (!jsonFile) {
      return NextResponse.json(
        { ok: false, error: "OCR : aucun JSON généré" },
        { status: 422 }
      );
    }

    const [jsonBuf] = await jsonFile.download();
    const visionObj = JSON.parse(jsonBuf.toString("utf8"));

    const responses = Array.isArray(visionObj?.responses)
      ? visionObj.responses
      : Array.isArray(visionObj?.[0]?.responses)
      ? visionObj[0].responses
      : [];

    const rawText = responses
      .map((r: any) => r.fullTextAnnotation?.text || "")
      .join("\n")
      .trim();

    if (!rawText || rawText.length < 10) {
      return NextResponse.json(
        { ok: false, error: "OCR vide ou insuffisant" },
        { status: 422 }
      );
    }

    console.log("[OCR] Texte extrait (longueur) =", rawText.length);

    /* -------------------------------------------------------------------------- */
    /*                              Détection assureur                            */
    /* -------------------------------------------------------------------------- */

    const insurer = normalizeInsurer(rawText);
    console.log("[AI PARSER] Assureur détecté =", insurer || "(inconnu)");

    let offer = null;

/* -------------------------------------------------------------------------- */
/*                   Swiss Life → pipeline IA + extraction tableaux           */
/* -------------------------------------------------------------------------- */

if (insurer === "Swiss Life") {
  console.log("[AI PARSER] SwissLife : GPT-4.1 META (sans tableaux)");

  const context: OfferParseContext = {
    ocrText: rawText,
    insurerHint: insurer,
    clientUid: uid,
    requestId: fileId,
  };

  try {
    const meta = await parseSwissLifeMeta(context);

    offer = {
      insurer: "Swiss Life",
      contractForm: (meta.contract?.pillar ?? "3a") as ContractForm,
      offerNumber: meta.meta.offerNumber ?? null,
      startDateLabel: meta.contract?.startDate ?? "",
      endDateLabel: meta.contract?.endDate ?? "",
      premiumAnnual: meta.premiums?.annualTotal ?? null,
      premiumMonthly: meta.premiums?.monthlyTotal ?? null,
      coverages: buildCoveragesFromMeta(meta),
      projectedModerateAmount: meta.benefits?.lifeMaturity?.medium ?? null,
      projectedModerateRatePct: meta.scenarios?.projectedModerateRatePct ?? null,
      pessRatePct: null,
      midRatePct: null,
      optRatePct: null,
      surrenderValues: [],       // VR plus tard
      surrenderValuesEpl: null,
    } as ManualOfferPayload;
  } catch (err) {
    console.error("⚠️ SwissLife META AI FAILED → fallback parseOfferPdf:", err);

    offer = await parseOfferPdf({
      pdfBuffer,
      insurerHint: insurer,
      clientUid: uid,
      requestId: fileId,
      ocrText: rawText,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                         AXA → IA META (sans tableaux)                      */
/* -------------------------------------------------------------------------- */

if (!offer && insurer === "AXA") {
  console.log("[AI PARSER] AXA : GPT-4.1 META (sans tableaux)");

  const context: OfferParseContext = {
    ocrText: rawText,
    insurerHint: insurer,
    clientUid: uid,
    requestId: fileId,
  };

  try {
    const meta = await parseAxaMeta(context);

    offer = {
      insurer: "AXA",
      contractForm: (meta.contract?.pillar ?? "3a") as ContractForm,
      offerNumber: meta.meta.offerNumber ?? null,
      startDateLabel: meta.contract?.startDate ?? "",
      endDateLabel: meta.contract?.endDate ?? "",
      premiumAnnual: meta.premiums?.annualTotal ?? null,
      premiumMonthly: meta.premiums?.monthlyTotal ?? null,
      coverages: buildCoveragesFromAxaMeta(meta),
      projectedModerateAmount: meta.benefits?.lifeMaturity?.medium ?? null,
      projectedModerateRatePct: meta.scenarios?.projectedModerateRatePct ?? null,
      pessRatePct: null,
      midRatePct: null,
      optRatePct: null,
      surrenderValues: [],       // VR AXA sera géré ailleurs si besoin
      surrenderValuesEpl: null,
    } as ManualOfferPayload;
  } catch (err) {
    console.error("⚠️ AXA META AI FAILED → fallback parseOfferPdf:", err);

    offer = await parseOfferPdf({
      pdfBuffer,
      insurerHint: insurer,
      clientUid: uid,
      requestId: fileId,
      ocrText: rawText,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                   Bâloise → IA META (sans tableaux)                        */
/* -------------------------------------------------------------------------- */

if (!offer && insurer === "Bâloise") {
  console.log("[AI PARSER] Bâloise : GPT-4.1 META (sans tableaux)");

  const context: OfferParseContext = {
    ocrText: rawText,
    insurerHint: insurer,
    clientUid: uid,
    requestId: fileId,
  };

  try {
    const meta = await parseBaloiseMeta(context);

    offer = {
      insurer: "Bâloise",
      contractForm: (meta.contract?.pillar ?? "3a") as ContractForm,
      offerNumber: meta.meta.offerNumber ?? null,
      startDateLabel: meta.contract?.startDate ?? "",
      endDateLabel: meta.contract?.endDate ?? "",
      premiumAnnual: meta.premiums?.annualTotal ?? null,
      premiumMonthly: meta.premiums?.monthlyTotal ?? null,
      coverages: buildCoveragesFromBaloiseMeta(meta),
      projectedModerateAmount: meta.benefits?.lifeMaturity?.medium ?? null,
      projectedModerateRatePct: meta.scenarios?.projectedModerateRatePct ?? null,
      pessRatePct: null,
      midRatePct: null,
      optRatePct: null,
      surrenderValues: [],       // VR Bâloise plus tard si tu veux
      surrenderValuesEpl: null,
    } as ManualOfferPayload;
  } catch (err) {
    console.error("⚠️ Bâloise META AI FAILED → fallback parseOfferPdf:", err);

    offer = await parseOfferPdf({
      pdfBuffer,
      insurerHint: insurer,
      clientUid: uid,
      requestId: fileId,
      ocrText: rawText,
    });
  }
}

    /* -------------------------------------------------------------------------- */
    /*                     Autres assureurs → fallback AXA                        */
    /* -------------------------------------------------------------------------- */

    if (!offer) {
      console.log("[AI PARSER] Fallback → parseOfferPdf");

      offer = await parseOfferPdf({
        pdfBuffer,
        insurerHint: insurer || undefined,
        clientUid: uid,
        requestId: fileId,
      });
    }

    console.log("[AI PARSER] Offre extraite :", offer);

    /* -------------------------------------------------------------------------- */
    /*                         Sauvegarde Firestore (offers_parsed)               */
    /* -------------------------------------------------------------------------- */

    const docId = uuidv4();

    await db.collection("offers_parsed").doc(docId).set({
      offer,
      filePath,
      extractedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, offer }, { status: 200 });
  } catch (err: any) {
    console.error("[/api/offers/parse] ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erreur inattendue" },
      { status: 500 }
    );
  }
}