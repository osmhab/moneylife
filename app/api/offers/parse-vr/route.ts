// app/api/offers/parse-vr/route.ts

import { NextResponse } from "next/server";
import { db, bucket, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { ImageAnnotatorClient } from "@google-cloud/vision";

import { parseSwissLifeVRTables } from "lib/offers/parsers/swisslife/vr_ai";
import { parseAxaOffer } from "lib/offers/parsers/axa";
import { parseBaloiseVRTables } from "lib/offers/parsers/baloise/vr_ai"; // 👈 NOUVEAU
import type {
  OfferParseContext,
  SurrenderValueRow,
  InsurerCode,
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

/**
 * Endpoint dédié aux PDF "VR" (valeurs de rachat) Swiss Life, AXA, Bâloise.
 *
 * Attendu:
 *  { filePath: "clients/{uid}/offers_vr/{fileId}.pdf" }
 *
 * Retour:
 *  { ok: true, tables: { surrenderValues, surrenderValuesEpl } }
 */
export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { ok: false, error: "filePath manquant" },
        { status: 400 }
      );
    }

    // Format attendu: clients/{uid}/offers_vr/{id}.pdf
    const m = filePath.match(
      /^clients\/([^/]+)\/offers_vr\/([^/.]+)\.pdf$/i
    );
    if (!m) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "filePath invalide. Attendu: clients/{uid}/offers_vr/{id}.pdf",
        },
        { status: 400 }
      );
    }

    const [, uid, fileId] = m;

    // Auth facultative
    const authz =
      req.headers.get("authorization") ||
      req.headers.get("Authorization");

    if (authz?.startsWith("Bearer ")) {
      const token = authz.slice("Bearer ".length).trim();
      const decoded = await authAdmin.verifyIdToken(token);
      if (decoded.uid !== uid) {
        return NextResponse.json(
          { ok: false, error: "UID du token ≠ UID du chemin" },
          { status: 403 }
        );
      }
    }

    // Récupération du PDF VR depuis GCS
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { ok: false, error: "Fichier introuvable" },
        { status: 404 }
      );
    }

    const [buf] = await file.download();

    // ========== OCR GOOGLE VISION (PDF VR uniquement) ==========
    const gcsSourceUri = `gs://${bucket.name}/${filePath}`;
    const outPrefix = `tmp/vision/${uid}/offers_vr/${fileId}/`;
    const gcsDestinationUri = `gs://${bucket.name}/${outPrefix}`;

    const [operation] = await vision.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: gcsSourceUri },
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: {
            gcsDestination: { uri: gcsDestinationUri },
            batchSize: 5,
          },
        },
      ],
    });

    await operation.promise();

    const [outFiles] = await bucket.getFiles({ prefix: outPrefix });
    const jsonFile = outFiles.find((f) => f.name.endsWith(".json"));

    if (!jsonFile) {
      return NextResponse.json(
        { ok: false, error: "OCR VR: aucun JSON Vision généré" },
        { status: 422 }
      );
    }

    const [jsonBuf] = await jsonFile.download();
    const o = JSON.parse(jsonBuf.toString("utf8"));

    const responses = Array.isArray(o?.responses)
      ? o.responses
      : Array.isArray(o?.[0]?.responses)
      ? o[0].responses
      : [];

    const rawText = responses
      .map((r: any) => r?.fullTextAnnotation?.text || "")
      .join("\n")
      .trim();

    if (!rawText || rawText.length < 10) {
      return NextResponse.json(
        { ok: false, error: "OCR VR vide ou insuffisant" },
        { status: 422 }
      );
    }

    console.log("[OFFERS VR OCR] rawText length =", rawText.length);

    // Détection assureur
    const insurer = normalizeInsurer(rawText);
    console.log("[OFFERS VR] Assureur détecté =", insurer || "(inconnu)");

    // Structures unifiées pour la réponse
    let surrenderValues: SurrenderValueRow[] = [];
    let surrenderValuesEpl: SurrenderValueRow[] | null = null;

const context: OfferParseContext = {
  ocrText: rawText,
  clientUid: uid,
  requestId: fileId,
  insurerHint: insurer,
};

if (insurer === "Swiss Life") {
  // Swiss Life → IA VR (normal + EPL)
  const tables = await parseSwissLifeVRTables(context);
  surrenderValues = tables.surrenderValues ?? [];
  surrenderValuesEpl = tables.surrenderValuesEpl ?? null;
} else if (insurer === "AXA") {
  // AXA → parseur tabulaire VR existant (un seul tableau, pas d'EPL)
  const offer = await parseAxaOffer(context);
  surrenderValues = offer.surrenderValues ?? [];
  surrenderValuesEpl = null;
} else if (insurer === "Bâloise") {
  // Bâloise → parser VR dédié (un seul tableau, pas d'EPL)
  const tables = await parseBaloiseVRTables(context);
  surrenderValues = tables.surrenderValues ?? [];
  surrenderValuesEpl = null;
} else {
  console.warn("[OFFERS VR] Assureur VR non géré pour le moment:", insurer);
  return NextResponse.json(
    {
      ok: false,
      error:
        "Assureur VR non géré pour le moment (seulement Swiss Life, AXA et Bâloise sont supportés).",
    },
    { status: 422 }
  );
}

    console.log("[OFFERS VR] Tables extraites =", {
      normal: surrenderValues.length,
      epl: surrenderValuesEpl ? surrenderValuesEpl.length : 0,
    });

    // ========== Sauvegarde Firestore (facultative) ==========
    const docId = uuidv4();
    await db.collection("offers_parsed_vr").doc(docId).set({
      clientUid: uid,
      insurer,
      filePath,
      surrenderValues,
      surrenderValuesEpl,
      extractedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        ok: true,
        tables: { surrenderValues, surrenderValuesEpl },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[/api/offers/parse-vr] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}