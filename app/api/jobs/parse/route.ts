// app/api/jobs/parse/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { bucket, db } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";

// IA LPP (GPT-5) + types de layout
import { aiExtractLpp } from "@/lib/aiExtract";
import type { Line as LayoutLine } from "@/lib/layoutTypes";

/* ===========================
   Version / Logs
   =========================== */
const PATCH_VERSION = "2025-09-15-logs-v4-lpp-extra";

/* ===========================
   Constantes
   =========================== */
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/* ===========================
   Utils généraux
   =========================== */
const filenameOf = (p: string) => p.split("/").pop() || p;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function normNumber(raw?: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[’'`_\u00A0 \s.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function splitLines(s: string): string[] {
  return (s || "").replace(/\r/g, "").split("\n").map((x) => x.trim());
}
function indexOfLine(lines: string[], re: RegExp): number {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

/* ===========================
   Détection LPP (FR/DE/IT + filename)
   =========================== */
function isLppCertificate(text: string, filename?: string) {
  const t = text || "";
  const inText = [
    /certificat\s+de\s+pr[ée]voyance/i,
    /pr[ée]voyance\s+professionnelle/i,
    /\bLPP\b/i,
    /\bBVG\b/i,
    /2e?\s*pilier/i,
    /2\.\s*s[äa]ule/i,
    /avoir\s+de\s+vieillesse|altersguthaben|avere\s+di\s+vecchiaia/i,
    /salaire\s+assur[ée]|versichertes?\s+(gehalt|lohn)|salario\s+assicurato/i,
    /rente\s+d'?invalidit[ée]|invalidenrente|rendita\s+d['’]?invalidit[àa]/i,
    /capital[-\s]?d[ée]c[èe]s|todesfallkapital|capitale\s+decesso/i,
  ].some((re) => re.test(t));
  const inName = filename ? /(lpp|bvg|vorsorge|certificat|previdenza|epl)/i.test(filename) : false;
  return inText || inName;
}

/* ===========================
   OCR: images & PDF (Vision async pour PDF)
   =========================== */
async function ocrExtractTextForFile(
  f: any,
  bucketName: string,
  visionClient: ImageAnnotatorClient
): Promise<string> {
  const name = filenameOf(f.name);
  const isPdf = /\.pdf$/i.test(name);

  if (!isPdf) {
    console.log("[parse] OCR image start:", name);
    const [buf] = await f.download();
    const [ocr] = await visionClient.documentTextDetection({ image: { content: buf } });
    const text = ocr.fullTextAnnotation?.text || "";
    console.log("[parse] OCR image done:", name, "chars=", text.length);
    return text;
  }

  console.log("[parse] OCR pdf start:", name);
  const gcsSourceUri = `gs://${bucketName}/${f.name}`;
  const destPrefix = `tmp/ocr/${uuidv4()}/`;
  const gcsDestinationUri = `gs://${bucketName}/${destPrefix}`;

  // Lance l'opération longue
  const [operation] = await visionClient.asyncBatchAnnotateFiles({
    requests: [
      {
        inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 2 },
      },
    ],
  });

  await operation.promise().catch((e: any) => {
    console.error("[parse] Vision operation error:", e?.message || e);
    throw e;
  });

  // Lire les sorties
  let outs: any[] = [];
  for (let i = 0; i < 60; i++) {
    const [files] = await bucket.getFiles({ prefix: destPrefix });
    outs = files || [];
    if (outs.length > 0) break;
    await sleep(500);
  }
  if (!outs.length) {
    console.warn("[parse] OCR pdf outputs not found:", name, "destPrefix=", destPrefix);
    return "";
  }

  let fullText = "";
  const pageTexts: string[] = [];
  const allResponses: any[] = [];

  for (const out of outs) {
    try {
      const [buf] = await out.download();
      const json = JSON.parse(buf.toString("utf8"));
      const responses = json?.responses || [];
      allResponses.push(...responses);
      for (const r of responses) {
        const t = r?.fullTextAnnotation?.text || "";
        if (t) {
          if (fullText) fullText += "\n\n";
          fullText += t;
          pageTexts.push(t);
        }
      }
    } catch { /* ignore */ }
  }
  (f as any).__pageTexts = pageTexts;
  (f as any).__responses = allResponses;

  // Nettoyage
  try {
    await Promise.all(outs.map((o) => o.delete()));
    await bucket.deleteFiles({ prefix: destPrefix });
  } catch {}
  console.log("[parse] OCR pdf done:", name, "pages=", pageTexts.length, "chars=", fullText.length);
  return fullText;
}

/* ===========================
   Layout helpers (bbox → lignes)
   =========================== */
type RawWord = { text: string; x1: number; y1: number; x2: number; y2: number; yMid: number; xMid: number };
type RawLine = { text: string; words: RawWord[]; yMid: number; x1: number; x2: number };

function toWordsFromPage(page: any): RawWord[] {
  const words: RawWord[] = [];
  const getText = (w: any) => (w?.symbols || []).map((s: any) => s.text || "").join("");
  const norm = (v: any) => ({ x: v?.x ?? 0, y: v?.y ?? 0 });

  for (const block of page?.blocks || []) {
    for (const para of block?.paragraphs || []) {
      for (const w of para?.words || []) {
        const t = getText(w).trim();
        if (!t) continue;
        const vs = (w?.boundingBox?.vertices || []).map(norm);
        const xs = vs.map((p: any) => p.x);
        const ys = vs.map((p: any) => p.y);
        const x1 = Math.min(...xs), x2 = Math.max(...xs);
        const y1 = Math.min(...ys), y2 = Math.max(...ys);
        words.push({ text: t, x1, y1, x2, y2, yMid: (y1 + y2) / 2, xMid: (x1 + x2) / 2 });
      }
    }
  }
  return words;
}
function clusterLines(words: RawWord[], yTolerance = 6): RawLine[] {
  const w = [...words].sort((a, b) => (a.yMid - b.yMid) || (a.x1 - b.x1));
  const lines: RawLine[] = [];
  let cur: RawWord[] = [];
  for (const wd of w) {
    if (!cur.length) { cur.push(wd); continue; }
    const sameLine = Math.abs(wd.yMid - cur[0].yMid) <= yTolerance;
    if (sameLine) cur.push(wd);
    else {
      const text = cur.map(x => x.text).join(" ");
      lines.push({ text, words: cur, yMid: cur[0].yMid, x1: Math.min(...cur.map(x=>x.x1)), x2: Math.max(...cur.map(x=>x.x2)) });
      cur = [wd];
    }
  }
  if (cur.length) {
    const text = cur.map(x => x.text).join(" ");
    lines.push({ text, words: cur, yMid: cur[0].yMid, x1: Math.min(...cur.map(x=>x.x1)), x2: Math.max(...cur.map(x=>x.x2)) });
  }
  return lines;
}
function buildLayoutFromResponses(responses: any[]): RawLine[] {
  const lines: RawLine[] = [];
  for (const r of responses || []) {
    for (const page of r?.fullTextAnnotation?.pages || []) {
      const words = toWordsFromPage(page);
      lines.push(...clusterLines(words));
    }
  }
  lines.sort((a, b) => a.yMid - b.yMid || a.x1 - b.x1);
  return lines;
}

// Valeur alignée à droite du label (même ligne), sinon dans la "colonne" à droite sur les N lignes suivantes
function findValueRightOrBelow(lines: RawLine[], labelRe: RegExp, belowLookahead = 3): number | null {
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!labelRe.test(L.text)) continue;
    const rightNums = L.words
      .filter(w => /\d/.test(w.text))
      .map(w => ({ n: normNumber(w.text), x: w.x1 }))
      .filter(z => z.n != null)
      .sort((a,b)=> b.x - a.x);
    if (rightNums.length) return rightNums[0].n!;
    const colLeft = L.x2;
    for (let k = 1; k <= belowLookahead && (i+k) < lines.length; k++) {
      const Ln = lines[i + k];
      const candidates = Ln.words
        .filter(w => w.x1 >= colLeft - 4 && /\d/.test(w.text))
        .map(w => normNumber(w.text))
        .filter(n => n != null);
      if (candidates.length) return candidates[candidates.length - 1] as number;
    }
  }
  return null;
}

/* ===========================
   Extraction regex "lite" (offres 3a)
   =========================== */
function lightOfferExtract(text: string) {
  const pickNum = (re: RegExp) => {
    const m = text.match(re);
    return m ? normNumber(m[1]) : null;
  };
  return {
    primeMensuelle: pickNum(/prime\s*(?:mensuelle|mois).*?(\d[\d’'`_\u00A0 \s.,]+)/i),
    primeAnnuelle:  pickNum(/prime\s*(?:annuelle|an).*?(\d[\d’'`_\u00A0 \s.,]+)/i),
    dureeAnnees:    pickNum(/dur[ée]e?.*?(\d{1,2})\s*ans?/i),
    capitalDeces:   pickNum(/capital\s+d[ée]c[èe]s.*?(\d[\d’'`_\u00A0 \s.,]+)/i),
  };
}

/* ===========================
   Appel GPT-5 pour OFFRES (JSON strict + fallback)
   =========================== */
async function extractOfferWithOpenAI(rawText: string, openaiKey?: string) {
  if (!openaiKey) return null;

  try {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        assureur: { type: ["string", "null"] },
        produit: { type: ["string", "null"] },
        primeMensuelle: { type: ["number", "null"] },
        primeAnnuelle: { type: ["number", "null"] },
        dureeAnnees: { type: ["number", "null"] },
        capitalDeces: { type: ["number", "null"] },
        participationBenefices: { type: ["string", "null"] },
        rendementProjete: { type: ["string", "null"] },
        remarques: { type: ["string", "null"] },
      },
      required: [],
    } as const;

    // === GPT-5 CALL START ===
    let bodyPrimary: any = {
      model: "gpt-5",
      response_format: {
        type: "json_schema",
        json_schema: { name: "offer3a_extract_v1", schema, strict: true },
      },
      messages: [
        {
          role: "system",
          content: "Extrait en JSON les champs clés d’une offre d’assurance 3a. Réponds en JSON valide uniquement.",
        },
        { role: "user", content: rawText.slice(0, 100_000) },
      ],
    };

    let res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify(bodyPrimary),
    });

    // Fallback si 400 lié au format (json_schema/verbosity/temperature non supportés)
    if (!res.ok) {
      const firstErr = await res.text().catch(() => "");
      if (
        res.status === 400 &&
        /response_format|json_schema|verbosity|temperature|unsupported/i.test(firstErr)
      ) {
        const bodyFallback: any = {
          model: "gpt-5",
          response_format: { type: "json_object" },
          messages: bodyPrimary.messages,
        };
        res = await fetch(OPENAI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify(bodyFallback),
        });
      }
      if (!res.ok) {
        return null;
      }
    }

    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    try {
      return content ? JSON.parse(content) : null;
    } catch {
      return null;
    }
    // === GPT-5 CALL END ===
  } catch {
    return null;
  }
}

/* ===========================
   Handler principal
   =========================== */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const clientToken = url.searchParams.get("token") || "";
  const prefix =
    url.searchParams.get("prefix") || (clientToken ? `offers/raw/${clientToken}` : "offers/raw/");

  console.log("[parse] start", PATCH_VERSION, "token=", clientToken, "prefix=", prefix);

  try {
    if (!clientToken) {
      console.warn("[parse] missing clientToken");
      return NextResponse.json({ ok: false, error: "Missing ?token=CLIENT_TOKEN" }, { status: 400 });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error("[parse] OPENAI_API_KEY missing — IA obligatoire");
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY manquant (IA obligatoire)" }, { status: 500 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const visionClient = new ImageAnnotatorClient();

    const [files] = await bucket.getFiles({ prefix, maxResults: 20 });
    console.log("[parse] files trouvés:", (files || []).map(f => f.name));

    if (!files?.length) {
      console.log("[parse] no files under prefix:", prefix);
      return NextResponse.json({
        ok: true,
        message: "Aucun fichier trouvé sous le prefix donné.",
        prefix,
        clientToken,
        createdOffers: 0,
        createdLpp: 0,
        offers: [],
        lpp: [],
      });
    }

    const createdOfferIds: string[] = [];
    const createdLppIds: string[] = [];
    const textsForAggregate: Array<{ filename: string; path: string; docType: "OFFER" | "LPP_CERT" }> = [];

    for (const f of files) {
      const filename = filenameOf(f.name);
      try {
        console.log("[parse:file] start:", filename);

        // OCR (texte + responses pour layout)
        const text = await ocrExtractTextForFile(f, bucket.name, visionClient);
        console.log("[parse:file] OCR done:", filename, "chars=", text.length);

        // Détection LPP (pages 2..5 privilégiées), sinon global
        const pages: string[] = (f as any).__pageTexts || [];
        const later = pages.length > 1 ? pages.slice(1, 5) : [];
        const lppLater = later.some((pt) => isLppCertificate(pt, filename));
        const isLpp = lppLater || isLppCertificate(text, filename);
        console.log("[parse:file] type détecté:", isLpp ? "LPP_CERT" : "OFFER", "filename=", filename);

        if (isLpp) {
          // Layout complet
          const responses = (f as any).__responses as any[] || [];
          const layoutRawLines = buildLayoutFromResponses(responses);
          const layoutLines = (layoutRawLines as unknown as LayoutLine[]) || [];
          console.log("[parse:file] LPP → IA start:", filename, "layoutLines=", layoutLines.length);

          // IA principale (GPT-5)
          const ai = await aiExtractLpp(text, layoutLines, openaiKey);
          console.log(
            "[parse:file] LPP → IA done:",
            filename,
            "confidence=",
            ai?.confidence,
            "proofs=",
            ai?.proofs ? Object.keys(ai.proofs).length : 0
          );

          // Sanity & journalisation
          const sanityIssues: string[] = ai?.issues || [];
          const aiConfidence = typeof ai?.confidence === "number" ? ai!.confidence! : 0.7;
          const layoutBonus = (ai?.proofs && Object.keys(ai.proofs).length >= 3) ? 0.1 : 0;
          const confidence = Math.max(0, Math.min(1, aiConfidence + layoutBonus - sanityIssues.length * 0.05));
          const needs_review = confidence < 0.6 || sanityIssues.length > 0;

          console.log("[parse:file] LPP merged:", filename, {
            caisse: ai.caisse,
            dateCertificat: ai.dateCertificat,
            prenom: ai.prenom,
            nom: ai.nom,
            dateNaissance: ai.dateNaissance,
            salaireDeterminant: ai.salaireDeterminant,
            salaireAssureRisque: ai.salaireAssureRisque,
            avoirVieillesse: ai.avoirVieillesse,
            invaliditeAn: ai.renteInvaliditeAnnuelle,
            enfantAIAn: ai.renteEnfantInvaliditeAnnuelle,
            conjointAn: ai.renteConjointAnnuelle,
            orphelinAn: ai.renteOrphelinAnnuelle,
            capitalRetraite65: ai.capitalRetraite65,
            renteRetraite65An: ai.renteRetraite65Annuelle,
            rachatPossible: ai.rachatPossible,
            eplDisponible: ai.eplDisponible,
            miseEnGage: ai.miseEnGage,
            capitalDeces: ai.capitalDeces,
            confidence, issues: sanityIssues
          });

          // Firestore : enregistrement complet LPP
          const lppDoc = {
            clientToken,
            sourcePath: f.name,
            filename,
            text,
            // Champs LPP étendus
            employeur: ai.employeur ?? null,
            caisse: ai.caisse ?? null,
            dateCertificat: ai.dateCertificat ?? null,
            prenom: ai.prenom ?? null,
            nom: ai.nom ?? null,
            dateNaissance: ai.dateNaissance ?? null,
            salaireDeterminant: ai.salaireDeterminant ?? null,
            deductionCoordination: ai.deductionCoordination ?? null,
            salaireAssureEpargne: ai.salaireAssureEpargne ?? null,
            salaireAssureRisque: ai.salaireAssureRisque ?? null,
            avoirVieillesse: ai.avoirVieillesse ?? null,
            avoirVieillesseSelonLpp: ai.avoirVieillesseSelonLpp ?? null,
            interetProjetePct: ai.interetProjetePct ?? null,
            renteInvaliditeAnnuelle: ai.renteInvaliditeAnnuelle ?? null,
            renteEnfantInvaliditeAnnuelle: ai.renteEnfantInvaliditeAnnuelle ?? null,
            renteConjointAnnuelle: ai.renteConjointAnnuelle ?? null,
            renteOrphelinAnnuelle: ai.renteOrphelinAnnuelle ?? null,
            capitalDeces: ai.capitalDeces ?? null,
            capitalRetraite65: ai.capitalRetraite65 ?? null,
            renteRetraite65Annuelle: ai.renteRetraite65Annuelle ?? null,
            rachatPossible: ai.rachatPossible ?? null,
            eplDisponible: ai.eplDisponible ?? null,
            miseEnGage: ai.miseEnGage ?? null,

            // Méta
            proofs: ai?.proofs ?? null,
            confidence,
            needs_review,
            extractedAt: now,
            docType: "LPP_CERT" as const,
          };

          const ref = await db.collection("lpp_parsed").add(lppDoc);
          console.log("[parse:file] Firestore saved LPP id=", ref.id);
          createdLppIds.push(ref.id);
          textsForAggregate.push({ filename, path: f.name, docType: "LPP_CERT" });

        } else {
          // OFFRE 3a
          console.log("[parse:file] OFFER → IA start:", filename);
          const lite = lightOfferExtract(text);
          const ai = await extractOfferWithOpenAI(text, openaiKey);
          const merged = { ...lite, ...(ai || {}) };

          console.log("[parse:file] OFFER merged:", filename, {
            assureur: (merged as any).assureur,
            produit: (merged as any).produit,
            primeMensuelle: (merged as any).primeMensuelle,
            primeAnnuelle: (merged as any).primeAnnuelle,
            dureeAnnees: (merged as any).dureeAnnees,
            capitalDeces: (merged as any).capitalDeces,
          });

          const offerDoc = {
            clientToken,
            sourcePath: f.name,
            filename,
            text,
            ...merged,
            extractedAt: now,
            docType: "OFFER" as const,
          };
          const ref = await db.collection("offers_parsed").add(offerDoc);
          console.log("[parse:file] Firestore saved OFFER id=", ref.id);
          createdOfferIds.push(ref.id);
          textsForAggregate.push({ filename, path: f.name, docType: "OFFER" });
        }

        console.log("[parse:file] done:", filename);
      } catch (e) {
        console.error("Parse error for file:", filename, e);
      }
    }

    // Agrégat analyses/{clientToken}
    try {
      const aggRef = db.collection("analyses").doc(clientToken);
      await aggRef.set(
        {
          clientToken,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          prefix,
          status: "PARSED",
          files: textsForAggregate.map((t) => ({ filename: t.filename, path: t.path })),
          offersParsedRefs: createdOfferIds,
          lppParsedRefs: createdLppIds,
          meta: {
            note: "OCR done; structured extraction attempted; ready for UI /analyse",
            docTypeDetected: textsForAggregate.map((t) => t.docType),
            version: PATCH_VERSION,
          },
        },
        { merge: true }
      );
      console.log("[parse] aggregate saved: analyses/", clientToken, {
        offers: createdOfferIds.length,
        lpp: createdLppIds.length
      });
    } catch (e) {
      console.error("Aggregate write error:", e);
    }

    console.log("[parse] end", PATCH_VERSION, "token=", clientToken);
    return NextResponse.json({
      ok: true,
      clientToken,
      prefix,
      createdOffers: createdOfferIds.length,
      createdLpp: createdLppIds.length,
      offerIds: createdOfferIds,
      lppIds: createdLppIds,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
