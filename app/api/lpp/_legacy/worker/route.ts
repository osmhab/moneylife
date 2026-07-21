// app/api/lpp/worker/route.ts
import { NextResponse } from "next/server";
import { db, bucket } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { aiExtractLpp } from "@/lib/legacy/aiExtract";
import { v4 as uuidv4 } from "uuid";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import crypto from "crypto";
import * as pdfParse from "pdf-parse";

const vision = new ImageAnnotatorClient();

/* ===========================
   Helpers
=========================== */

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function normalizeText(s: string) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 250_000); // limite pour stabilité perf + coût LLM
}

function parseCHF(s: string) {
  const t = (s || "")
    .replace(/’/g, "'")
    .replace(/\s/g, "")
    .replace(/CHF/gi, "")
    .replace(/-/g, "")
    .trim();

  const cleaned = t
    .replace(/'/g, "")
    .replace(/’/g, "")
    .replace(/–/g, "")
    .replace(/-/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/\.?-/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pickDate(text: string) {
  const m = text.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function pickByLabel(text: string, labels: RegExp[]) {
  for (const re of labels) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function extractLppFastRegex(rawText: string) {
  const t = rawText || "";
  const out: any = {
    confidence: 0.55,
    issues: [],
    proofs: {},
  };

  const date = pickDate(t);
  if (date) out.dateCertificat = date;

  const salaireStr = pickByLabel(t, [
    /Salaire\s+(?:annuel|déterminant|assuré)\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
    /Salaire\s+coordonné\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
    /Jahreslohn\s*[:\-]?\s*([0-9'’.\s]+)\s*(?:CHF|Fr\.?)?/i,
  ]);
  const salaire = salaireStr ? parseCHF(salaireStr) : null;
  if (typeof salaire === "number" && salaire > 0) out.salaireDeterminant = salaire;

  const avoirStr = pickByLabel(t, [
    /Avoir\s+de\s+vieillesse\s+(?:total|épargne)\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
    /Capital\s+vieillesse\s+(?:total)?\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
    /Altersguthaben\s*[:\-]?\s*([0-9'’.\s]+)\s*(?:CHF|Fr\.?)?/i,
  ]);
  const avoir = avoirStr ? parseCHF(avoirStr) : null;
  if (typeof avoir === "number" && avoir > 0) out.avoirVieillesse = avoir;

  const riStr = pickByLabel(t, [
    /Rente\s+d['’]?invalidité\s*(?:annuelle)?\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
  ]);
  const ri = riStr ? parseCHF(riStr) : null;
  if (typeof ri === "number" && ri > 0) out.renteInvaliditeAnnuelle = ri;

  const rrStr = pickByLabel(t, [
    /Rente\s+de\s+vieillesse\s*(?:à\s*65\s*ans)?\s*(?:annuelle)?\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
  ]);
  const rr = rrStr ? parseCHF(rrStr) : null;
  if (typeof rr === "number" && rr > 0) out.renteRetraite65Annuelle = rr;

  const crStr = pickByLabel(t, [
    /Prestation\s+en\s+capital\s*(?:à\s*65\s*ans)?\s*[:\-]?\s*([0-9'’.\s]+)\s*CHF?/i,
  ]);
  const cr = crStr ? parseCHF(crStr) : null;
  if (typeof cr === "number" && cr > 0) out.capitalRetraite65 = cr;

  const score =
    (out.dateCertificat ? 1 : 0) +
    (out.salaireDeterminant ? 1 : 0) +
    (out.avoirVieillesse ? 1 : 0) +
    (out.renteInvaliditeAnnuelle ? 1 : 0) +
    (out.renteRetraite65Annuelle ? 1 : 0) +
    (out.capitalRetraite65 ? 1 : 0);

  out.confidence = Math.min(0.85, 0.45 + score * 0.08);
  if (score < 2) out.issues.push("FAST: champs clés manquants — analyse complète en cours");

  return out;
}

function coreFieldsScore(parsed: any) {
  // Score simple: plus il y a de champs clés, plus on considère "OK"
  let score = 0;

  const hasDate = !!parsed?.dateCertificat;
  const hasSalaire = typeof parsed?.salaireDeterminant === "number" && parsed.salaireDeterminant > 0;
  const hasAvoir = typeof parsed?.avoirVieillesse === "number" && parsed.avoirVieillesse > 0;
  const hasInvalidite = typeof parsed?.renteInvaliditeAnnuelle === "number" && parsed.renteInvaliditeAnnuelle > 0;
  const hasRetraite = typeof parsed?.renteRetraite65Annuelle === "number" && parsed.renteRetraite65Annuelle > 0;

  if (hasDate) score += 1;
  if (hasSalaire) score += 1;
  if (hasAvoir) score += 1;
  if (hasInvalidite) score += 1;
  if (hasRetraite) score += 1;

  return score;
}

function needsFullPass(parsedFast: any) {
  // Heuristique:
  // - confidence faible
  // - champs clés manquants
  // - issues présentes
  const c = Number(parsedFast?.confidence ?? 0);
  const issues = Array.isArray(parsedFast?.issues) ? parsedFast.issues : [];
  const score = coreFieldsScore(parsedFast);

  if (issues.length > 0) return true;
  if (c > 0 && c < 0.75) return true;
  if (score < 2) return true;

  return false;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  let t: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout ${label} (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * OCR PDF via Vision asyncBatchAnnotateFiles.
 * - pages: si défini, limite les pages traitées (FAST)
 */
async function ocrPdfVision(params: {
  gcsSourceUri: string;
  uid: string;
  fileId: string;
  pages?: number[];
  batchSize?: number;
}) {
  const { gcsSourceUri, uid, fileId, pages, batchSize } = params;

  // Vision écrit des JSON dans le bucket
  const outPrefix = `tmp/vision/${uid}/${fileId}/${Date.now()}/`;
  const gcsDestinationUri = `gs://${bucket.name}/${outPrefix}`;

  const [operation] = await vision.asyncBatchAnnotateFiles({
    requests: [
      {
        inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: batchSize ?? 5 },
        // @ts-ignore - pages existe dans AnnotateFileRequest (Vision)
        ...(pages && pages.length ? { pages } : {}),
      },
    ],
  });

  await operation.promise();

  const [outFiles] = await bucket.getFiles({ prefix: outPrefix });
  const jsonFiles = outFiles.filter((f) => f.name.endsWith(".json"));

  if (!jsonFiles.length) {
    throw new Error(`OCR PDF: aucun fichier JSON Vision pour ${gcsSourceUri}`);
  }

  // Concat tous les JSON (parfois plusieurs)
  let text = "";
  for (const jf of jsonFiles) {
    const [jsonBuf] = await jf.download();
    const o = JSON.parse(jsonBuf.toString("utf8"));

    const responses = Array.isArray(o?.responses)
      ? o.responses
      : Array.isArray(o?.[0]?.responses)
      ? o[0].responses
      : [];

    const chunk = responses
      .map((r: any) => r?.fullTextAnnotation?.text || "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (chunk) text += (text ? "\n\n" : "") + chunk;
  }

  return { text: text.trim(), outPrefix };
}

/**
 * OCR Image via Vision annotateImage
 */
async function ocrImageVision(gcsUri: string) {
  const [result] = await vision.annotateImage({
    image: { source: { imageUri: gcsUri } },
    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
  });
  return (result?.fullTextAnnotation?.text || "").trim();
}

async function extractPdfTextNative(buf: Buffer) {
  try {
    const res = await (pdfParse as any)(buf);
    const txt = (res?.text || "").trim();
    return txt;
  } catch {
    return "";
  }
}

async function syncQueue(jobId: string, patch: Record<string, any>) {
  try {
    await db.collection("lpp_jobs_queue").doc(jobId).set(
      { ...patch, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch {}
}

/* ===========================
   Worker
=========================== */

export async function POST(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const t0 = Date.now();
  const log = (step: string, extra?: Record<string, any>) =>
    console.log({ reqId, step, ms: Date.now() - t0, ...(extra ?? {}) });

  let bodyCache: any = null;

  try {
    // ✅ Secret header
    const secret = process.env.LPP_WORKER_SECRET;
    const got = req.headers.get("x-lpp-worker-secret") || "";
    if (!secret || got !== secret) {
      log("WORKER_FORBIDDEN");
      return NextResponse.json({ error: "Forbidden", reqId }, { status: 403 });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY || OPENAI_KEY.trim() === "") {
      log("WORKER_NO_OPENAI_KEY");
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquant côté serveur", reqId },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    bodyCache = body;

    const jobPath = body?.jobPath as string | undefined;

    // 1) Load job
    let jobSnap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (jobPath) {
      const snap = await db.doc(jobPath).get();
      if (snap.exists) jobSnap = snap;
    } else {
      // prend un job PENDING via la queue top-level (stable)
      const q = await db
        .collection("lpp_jobs_queue")
        .where("status", "==", "PENDING")
        .limit(1)
        .get();

      if (!q.empty) {
        const qdoc = q.docs[0];
        const qp = (qdoc.data() as any)?.jobPath as string | undefined;

        if (qp) {
          await qdoc.ref.set(
            { status: "RUNNING", updatedAt: FieldValue.serverTimestamp(), workerReqId: reqId },
            { merge: true }
          );

          const snap = await db.doc(qp).get();
          if (snap.exists) jobSnap = snap;
        }
      }
    }

    if (!jobSnap) {
      log("WORKER_NO_JOB", {
        projectId: (db as any)?.projectId ?? null,
        bucket: (bucket as any)?.name ?? null,
      });
      return NextResponse.json(
        {
          ok: true,
          message: "No job",
          reqId,
          projectId: (db as any)?.projectId ?? null,
          bucket: (bucket as any)?.name ?? null,
        },
        { status: 200 }
      );
    }

    const jobRef = jobSnap.ref;
    const jobData = jobSnap.data() as any;
    const force = jobData?.force === true;

    // path = clients/{uid}/lpp_jobs/{jobId}
    const parts = jobRef.path.split("/");
    const uid = parts[1];
    const realJobId = parts[3];

    const filePaths: string[] = Array.isArray(jobData?.filePaths) ? jobData.filePaths : [];

    if (!uid || !realJobId || filePaths.length === 0) {
      log("WORKER_BAD_JOB", { path: jobRef.path, filePathsLen: filePaths.length });
      await jobRef.set(
        { status: "ERROR", error: "Bad job payload", updatedAt: FieldValue.serverTimestamp(), workerReqId: reqId },
        { merge: true }
      );
      await syncQueue(realJobId, { status: "ERROR", error: "Bad job payload", workerReqId: reqId });
      return NextResponse.json({ error: "Bad job payload", reqId }, { status: 422 });
    }

    // 2) Claim job → RUNNING_FAST
    log("JOB_RUNNING_FAST", { uid, jobId: realJobId, n: filePaths.length });

    await jobRef.set(
      { status: "RUNNING_FAST", updatedAt: FieldValue.serverTimestamp(), workerReqId: reqId },
      { merge: true }
    );
    await syncQueue(realJobId, { status: "RUNNING_FAST", workerReqId: reqId });

    // 3) Cache check (fileHash aggregate)
    // On calcule un hash global (concat des fileHash)
    const fileHashes: string[] = [];
    const fileBufs: { path: string; ext: string; fileId: string; buf: Buffer }[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const path = filePaths[i];
      const m = path.match(/^clients\/[^/]+\/lpp_raw\/([^/.]+)\.(pdf|jpg|jpeg|png|webp)$/i);
      const fileId = m?.[1] ?? `f${i + 1}`;
      const ext = (m?.[2] ?? "").toLowerCase();

      const gcsFile = bucket.file(path);
      const [exists] = await gcsFile.exists();
      if (!exists) throw new Error(`Fichier introuvable: ${path}`);

      const [buf] = await gcsFile.download();
      fileBufs.push({ path, ext, fileId, buf });

      const h = sha256(buf);
      fileHashes.push(h);
    }

    const aggHash = sha256(Buffer.from(fileHashes.join("|"), "utf8"));
    const cacheRef = db.collection("lpp_parse_cache").doc(aggHash);
    const cacheSnap = await cacheRef.get();

    if (force) log("CACHE_BYPASS_FORCE", { aggHash });

    if (!force && cacheSnap.exists) {
      const cached = cacheSnap.data() as any;
      log("CACHE_HIT", { aggHash, docId: cached?.docId ?? null });

      await jobRef.set(
        {
          status: "DONE",
          docId: cached?.docId ?? null,
          parsed: cached?.parsed ?? null,
          parsedFast: cached?.parsedFast ?? cached?.parsed ?? null,
          cache: { hit: true, aggHash, fileHashes },
          finishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          workerReqId: reqId,
        },
        { merge: true }
      );

      await syncQueue(realJobId, { status: "DONE", docId: cached?.docId ?? null });

      return NextResponse.json(
        { ok: true, jobId: realJobId, docId: cached?.docId ?? null, cache: "HIT", reqId },
        { status: 200 }
      );
    }

    // 4) OCR FAST (limité)
    log("OCR_FAST_BEGIN", { n: filePaths.length });

    let rawTextFast = "";
    const visionTmpPrefixes: string[] = [];

    for (let i = 0; i < fileBufs.length; i++) {
      const { path, ext, fileId } = fileBufs[i];
      log("OCR_FAST_FILE_BEGIN", { i: i + 1, path, ext });

      let pageText = "";

      if (ext === "pdf") {
  // ⚡ FAST PATH : extraction texte native (PDF texte)
  const nativeTxt = await extractPdfTextNative(fileBufs[i].buf);

  if (nativeTxt && nativeTxt.trim().length > 200) {
    pageText = nativeTxt.trim();
    log("OCR_FAST_PDF_NATIVE_OK", { chars: pageText.length });
  } else {
    // 🐢 Fallback OCR Vision (PDF scanné)
    const gcsSourceUri = `gs://${bucket.name}/${path}`;
    const o = await ocrPdfVision({
      gcsSourceUri,
      uid,
      fileId: `${fileId}-fast`,
      pages: [1, 2], // FAST: max 2 pages
      batchSize: 2,
    });
    pageText = o.text;
    visionTmpPrefixes.push(o.outPrefix);
    log("OCR_FAST_PDF_VISION_OK", { chars: pageText.length });
  }
} else {
  // Image → OCR Vision direct
  const gcsUri = `gs://${bucket.name}/${path}`;
  pageText = await ocrImageVision(gcsUri);
}

      log("OCR_FAST_FILE_DONE", { i: i + 1, chars: pageText?.length ?? 0 });

      if (pageText && pageText.trim().length > 0) {
        rawTextFast += `\n\n===== PART ${i + 1} / ${fileBufs.length} (${ext.toUpperCase()}) =====\n\n${pageText.trim()}`;
      }
    }

    if (!rawTextFast || rawTextFast.trim().length < 10) {
      throw new Error("OCR FAST vide: impossible d’extraire du texte.");
    }

    const normFast = normalizeText(rawTextFast);
    const textHashFast = sha256(Buffer.from(normFast, "utf8"));

    // 5) FAST = regex (zéro LLM => pas de timeout)
    log("AI_FAST_BEGIN", { chars: rawTextFast.length, mode: "regex" });

    // debug: extrait autour de mots clés pour ajuster regex (à enlever après)
    const dbgKeys = ["Salaire", "Lohn", "Jahreslohn", "Altersguthaben", "Avoir", "Invalid", "Rente", "Vieillesse", "Kapital"];
    const lines = rawTextFast.split("\n").map((x) => x.trim()).filter(Boolean);
    const hits = lines.filter((ln) => dbgKeys.some((k) => ln.toLowerCase().includes(k.toLowerCase()))).slice(0, 40);
    log("FAST_TEXT_HINTS", { hits });

    const parsedFast: any = extractLppFastRegex(rawTextFast);

    log("AI_FAST_DONE", {
      confidence: parsedFast?.confidence ?? null,
      issues: Array.isArray(parsedFast?.issues) ? parsedFast.issues.length : null,
      score: coreFieldsScore(parsedFast),
    });

    // 6) Save FAST in job (client peut afficher immédiatement)
    await jobRef.set(
      {
        status: "DONE_FAST",
        parsedFast,
        fast: {
          textHash: textHashFast,
          aggHash,
          fileHashes,
        },
        updatedAt: FieldValue.serverTimestamp(),
        workerReqId: reqId,
      },
      { merge: true }
    );
    await syncQueue(realJobId, { status: "DONE_FAST" });

    // 7) Decide FULL
    const doFull = needsFullPass(parsedFast);
    if (!doFull) {
      // save final as DONE with parsedFast as parsed
      const docId = uuidv4();

      await db
        .collection("clients")
        .doc(uid)
        .collection("lpp_parsed")
        .doc(docId)
        .set({
          ...parsedFast,
          sourceFiles: filePaths,
          extractedAt: FieldValue.serverTimestamp(),
          mode: "fast_only",
          hashes: { aggHash, fileHashes, textHashFast },
        });

      await cacheRef.set(
        {
          docId,
          parsed: parsedFast,
          parsedFast,
          hashes: { aggHash, fileHashes, textHashFast },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await jobRef.set(
        {
          status: "DONE",
          docId,
          parsed: parsedFast,
          finishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          workerReqId: reqId,
          mode: "fast_only",
        },
        { merge: true }
      );
      await syncQueue(realJobId, { status: "DONE", docId });

      log("SUCCESS_FAST_ONLY", { uid, jobId: realJobId, docId });
      return NextResponse.json({ ok: true, jobId: realJobId, docId, reqId, mode: "fast_only" }, { status: 200 });
    }

    // 8) FULL pass
    log("JOB_RUNNING_FULL", { uid, jobId: realJobId });
    await jobRef.set(
      { status: "RUNNING_FULL", updatedAt: FieldValue.serverTimestamp(), workerReqId: reqId },
      { merge: true }
    );
    await syncQueue(realJobId, { status: "RUNNING_FULL" });

    log("OCR_FULL_BEGIN", { n: filePaths.length });

    let rawTextFull = "";
    for (let i = 0; i < fileBufs.length; i++) {
      const { path, ext, fileId } = fileBufs[i];
      log("OCR_FULL_FILE_BEGIN", { i: i + 1, path, ext });

      let pageText = "";

      if (ext === "pdf") {
        const gcsSourceUri = `gs://${bucket.name}/${path}`;
        // FULL: laisse Vision traiter davantage (batch 5, pages undefined)
        const o = await ocrPdfVision({
          gcsSourceUri,
          uid,
          fileId: `${fileId}-full`,
          batchSize: 5,
        });
        pageText = o.text;
        visionTmpPrefixes.push(o.outPrefix);
      } else {
        const gcsUri = `gs://${bucket.name}/${path}`;
        pageText = await ocrImageVision(gcsUri);
      }

      log("OCR_FULL_FILE_DONE", { i: i + 1, chars: pageText?.length ?? 0 });

      if (pageText && pageText.trim().length > 0) {
        rawTextFull += `\n\n===== PART ${i + 1} / ${fileBufs.length} (${ext.toUpperCase()}) =====\n\n${pageText.trim()}`;
      }
    }

    if (!rawTextFull || rawTextFull.trim().length < 10) {
      // fallback sur FAST si FULL échoue
      throw new Error("OCR FULL vide: impossible d’extraire du texte.");
    }

    const normFull = normalizeText(rawTextFull);
    const textHashFull = sha256(Buffer.from(normFull, "utf8"));

    log("AI_FULL_BEGIN", { chars: rawTextFull.length });

    let parsedFull: any = null;
    try {
      // FULL peut être plus long
      parsedFull = await withTimeout(aiExtractLpp(rawTextFull, [], OPENAI_KEY), 60_000, "AI_FULL");
    } catch (e: any) {
      log("AI_FULL_FAIL", { message: e?.message });
      parsedFull = null;
    }

    if (!parsedFull || typeof parsedFull !== "object") {
      // ✅ fallback: on termine avec FAST au lieu de ERROR
      const docId = uuidv4();

      await db
        .collection("clients")
        .doc(uid)
        .collection("lpp_parsed")
        .doc(docId)
        .set({
          ...parsedFast,
          sourceFiles: filePaths,
          extractedAt: FieldValue.serverTimestamp(),
          mode: "fast_only_full_failed",
          hashes: { aggHash, fileHashes, textHashFast, textHashFull },
          fastSnapshot: parsedFast,
        });

      await cacheRef.set(
        {
          docId,
          parsed: parsedFast,
          parsedFast,
          hashes: { aggHash, fileHashes, textHashFast, textHashFull },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await jobRef.set(
        {
          status: "DONE",
          docId,
          parsed: parsedFast,
          finishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          workerReqId: reqId,
          mode: "fast_only_full_failed",
        },
        { merge: true }
      );
      await syncQueue(realJobId, { status: "DONE", docId });

      log("SUCCESS_FULL_FAILED_FALLBACK", { uid, jobId: realJobId, docId });
      return NextResponse.json(
        { ok: true, jobId: realJobId, docId, reqId, mode: "fast_only_full_failed" },
        { status: 200 }
      );
    }

    log("AI_FULL_DONE", {
      confidence: parsedFull?.confidence ?? null,
      issues: Array.isArray(parsedFull?.issues) ? parsedFull.issues.length : null,
      score: coreFieldsScore(parsedFull),
    });

    // 9) Save parsed FULL
    const docId = uuidv4();
    await db
      .collection("clients")
      .doc(uid)
      .collection("lpp_parsed")
      .doc(docId)
      .set({
        ...parsedFull,
        sourceFiles: filePaths,
        extractedAt: FieldValue.serverTimestamp(),
        mode: "full",
        hashes: { aggHash, fileHashes, textHashFast, textHashFull },
        fastSnapshot: parsedFast,
      });

    // 10) Cache save
    await cacheRef.set(
      {
        docId,
        parsed: parsedFull,
        parsedFast,
        hashes: { aggHash, fileHashes, textHashFast, textHashFull },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 11) Mark job DONE
    await jobRef.set(
      {
        status: "DONE",
        docId,
        parsed: parsedFull,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        workerReqId: reqId,
        mode: "full",
      },
      { merge: true }
    );
    await syncQueue(realJobId, { status: "DONE", docId });

    log("SUCCESS_FULL", { uid, jobId: realJobId, docId });
    return NextResponse.json({ ok: true, jobId: realJobId, docId, reqId, mode: "full" }, { status: 200 });
  } catch (e: any) {
    console.error({
      reqId,
      step: "ERROR",
      ms: Date.now() - t0,
      message: e?.message,
      stack: e?.stack,
    });

    // best effort: mark job ERROR if we can
    try {
      const jobPath = bodyCache?.jobPath as string | undefined;

      if (jobPath) {
        await db.doc(jobPath).set(
          {
            status: "ERROR",
            error: (e as any)?.details || e?.message || "Unexpected error",
            updatedAt: FieldValue.serverTimestamp(),
            workerReqId: reqId,
          },
          { merge: true }
        );

        const parts = jobPath.split("/");
        const realJobId = parts[3];

        await syncQueue(realJobId, {
          status: "ERROR",
          error: (e as any)?.details || e?.message || "Unexpected error",
          workerReqId: reqId,
        });
      }
    } catch {}

    return NextResponse.json(
      { error: (e as any)?.details || e?.message || "Unexpected error", reqId },
      { status: 500 }
    );
  }
}