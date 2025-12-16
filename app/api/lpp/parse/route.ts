// app/api/lpp/parse/route.ts
import { NextResponse } from "next/server";
import { db, bucket, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { aiExtractLpp } from "@/lib/legacy/aiExtract";
import { v4 as uuidv4 } from "uuid";
import { ImageAnnotatorClient } from "@google-cloud/vision";

const vision = new ImageAnnotatorClient();


/**
 * Attendu:
 *  { filePath: "clients/{uid}/lpp_raw/{fileId}.pdf|jpg|jpeg|png|webp" }
 *
 * Retour:
 *  { docId: string }
 */
export async function POST(req: Request) {
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY || OPENAI_KEY.trim() === "") {
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquant côté serveur" },
        { status: 400 }
      );
    }

    const { filePath } = await req.json();


    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "filePath manquant" }, { status: 400 });
    }

    // filePath attendu
    const m = filePath.match(
      /^clients\/([^/]+)\/lpp_raw\/([^/.]+)\.(pdf|jpg|jpeg|png|webp)$/i
    );
    if (!m) {
      return NextResponse.json(
        { error: "filePath invalide. Attendu: clients/{uid}/lpp_raw/{id}.{ext}" },
        { status: 400 }
      );
    }
    const [, uid, fileId, ext] = m;

    // Vérif Bearer (si présent)
    const authz = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authz?.startsWith("Bearer ")) {
      const token = authz.slice("Bearer ".length).trim();
      try {
        const decoded = await authAdmin.verifyIdToken(token);
        if (decoded.uid !== uid) {
          return NextResponse.json(
            { error: "UID du token ≠ UID du chemin" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json({ error: "Token invalide" }, { status: 401 });
      }
    }

    // Téléchargement du fichier
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }
    const [buf] = await file.download();

    // Extraction LPP
    const mime =
      ext.toLowerCase() === "pdf"
        ? "application/pdf"
        : `image/${ext.toLowerCase() === "jpg" ? "jpeg" : ext.toLowerCase()}`;

    // --- OCR Google Vision ---
let rawText = "";
if (ext.toLowerCase() === "pdf") {
  // PDFs -> async batch Vision (source/destination GCS)
  const gcsSourceUri = `gs://${bucket.name}/${filePath}`;
  const outPrefix = `tmp/vision/${uid}/${fileId}/`;
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

  // Récupère le premier JSON de sortie
  const [outFiles] = await bucket.getFiles({ prefix: outPrefix });
  const jsonFile = outFiles.find(f => f.name.endsWith(".json"));
  if (!jsonFile) {
    return NextResponse.json({ error: "OCR: aucun fichier JSON Vision" }, { status: 422 });
  }
  const [jsonBuf] = await jsonFile.download();
  const o = JSON.parse(jsonBuf.toString("utf8"));
  // Vision écrit un tableau de responses; on concatène le fullTextAnnotation
  const responses = Array.isArray(o?.responses) ? o.responses : (Array.isArray(o?.[0]?.responses) ? o[0].responses : []);
rawText = responses
  .map((r: any) => r?.fullTextAnnotation?.text || "")
  .filter(Boolean)
  .join("\n\n")
  .trim();


} else {
  // Images (jpg/png/webp) -> annotateImage direct depuis GCS
  const gcsUri = `gs://${bucket.name}/${filePath}`;
  const [result] = await vision.annotateImage({
    image: { source: { imageUri: gcsUri } },
    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
  });
  rawText = result?.fullTextAnnotation?.text || "";
  
}

// Sécurité : évite d’appeler l’IA sans texte
if (!rawText || rawText.trim().length < 10) {
  return NextResponse.json(
    { error: "OCR vide: impossible d’extraire du texte du certificat." },
    { status: 422 }
  );
}

// --- Appel IA avec TEXTE OCR (pas le binaire) ---
// Pas de lignes de mise en page pour l’instant → tableau vide
const parsed = await aiExtractLpp(rawText, [], OPENAI_KEY);






    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "Extraction LPP impossible (résultat vide)" },
        { status: 422 }
      );
    }

    // Sauvegarde sous clients/{uid}/lpp_parsed/{docId}
    const docId = uuidv4();
    await db
      .collection("clients")
      .doc(uid)
      .collection("lpp_parsed")
      .doc(docId)
      .set({
        ...parsed,
        sourceFile: filePath,
        extractedAt: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({ docId }, { status: 200 });
  } catch (e: any) {
    console.error("[/api/lpp/parse] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
