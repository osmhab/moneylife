// app/api/signing/creditx/mandate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import "@/lib/firebase/admin";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// =======================
// Réglages placement (repère HAUT -> converti en pdf-lib)
// Ajustés pour tomber dans les rectangles visibles sur ton template.
// =======================
const PAGE1_MANDANT = {
  x: 74,
  yTop: 551,   // ⬅️ beaucoup plus bas qu'avant (dans le cadre "1. Mandant")
  lineGap: 14,
  size: 11,
};

const PAGE2 = {
  // "Fait à Conthey, le ..."
  acceptDate: { x: 74, yTop: 431, size: 11 }, // 515 - 84

  // Nom du client sous "Signature du Mandant (client)"
  clientName: { x: 74, yTop: 640, size: 11 },

  // Signature client (box)
  clientSigBox: { x: 34, yTop: 502, w: 250, h: 70 }, // x: 74-40, yTop: 675-173

  // Signature Habib (box)
  habibSigBox: { x: -2, yTop: 643, w: 250, h: 70 },  // x: 74-76, yTop: 810-167
};

// =======================
function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}
function formatDateFrCHShort(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// yTop (depuis le haut) -> y pdf-lib (depuis le bas)
function yFromTop(page: any, yTop: number, h = 0) {
  const { height } = page.getSize();
  return height - yTop - h;
}

// Dessine une image en gardant le ratio (contain) dans une box
function drawImageContain(page: any, img: any, box: { x: number; yTop: number; w: number; h: number }) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.min(box.w / iw, box.h / ih);

  const w = iw * scale;
  const h = ih * scale;

  // centre dans la box
  const x = box.x + (box.w - w) / 2;
  const y = yFromTop(page, box.yTop, box.h) + (box.h - h) / 2;

  page.drawImage(img, { x, y, width: w, height: h });
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId manquant" }, { status: 400 });
    }

    const db = getFirestore();
    const bucket = getStorage().bucket();

    const sessionRef = db.collection("offers_signing_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const session = sessionSnap.data() as any;
    const requestId: string = session.requestId;
    const offerId: string = session.offerId;
    const clientUid: string = session.clientUid;

    // Signature client (pad Step 10)
    const clientSigPath = session?.steps?.signature?.imagePath;
    if (!clientSigPath) {
      return NextResponse.json(
        { error: "Signature client manquante (steps.signature.imagePath)" },
        { status: 400 }
      );
    }

    // Charger la demande pour récupérer les infos client
    const reqSnap = await db.collection("offers_requests_3e").doc(requestId).get();
    if (!reqSnap.exists) {
      return NextResponse.json({ error: "offers_requests_3e introuvable" }, { status: 404 });
    }
    const reqData = reqSnap.data() as any;
    const contact = reqData?.contact ?? {};

    const firstName = safeStr(contact.firstName);
    const lastName = safeStr(contact.lastName);
    const fullName = `${firstName} ${lastName}`.trim() || "Client";

    const street = safeStr(contact.street);
    const zip = safeStr(contact.zip);
    const city = safeStr(contact.city);
    const birthdate = safeStr(contact.birthdate);
    const email = safeStr(contact.email);

    // Template PDF
    const templatePath = path.join(process.cwd(), "public", "templates", "mandat_gestion_v092025.pdf");
    if (!fs.existsSync(templatePath)) {
      console.error("[CREDITX MANDATE] template missing", { templatePath });
      return NextResponse.json({ error: "template_missing", templatePath }, { status: 400 });
    }
    const templateBytes = fs.readFileSync(templatePath);

    // Signature Habib : recommandé = PNG transparent (pas de distorsion, embedPng direct)
    // -> place ton fichier ici : public/signatures/signatureHabib.png
    const habibPngPath = path.join(process.cwd(), "public", "signatures", "signatureHabib.png");
    if (!fs.existsSync(habibPngPath)) {
      return NextResponse.json(
        { error: "signature_habib_missing", hint: "Place public/signatures/signatureHabib.png" },
        { status: 400 }
      );
    }
    const habibSigBytes = fs.readFileSync(habibPngPath);

    // Télécharger signature client depuis Storage (png)
    const [clientSigBytes] = await bucket.file(clientSigPath).download();

    // Ouvrir PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Embed images
    const clientSigImg = await pdfDoc.embedPng(clientSigBytes);
    const habibSigImg = await pdfDoc.embedPng(habibSigBytes);

    const pages = pdfDoc.getPages();
    if (pages.length < 2) {
      return NextResponse.json({ error: "Le template doit contenir 2 pages" }, { status: 400 });
    }

    const p1 = pages[0];
    const p2 = pages[1];

    // =======================
    // Page 1 : Mandant (Client)
    // =======================
    const linesP1 = [
      fullName,
      `${street}${street && (zip || city) ? ", " : ""}${zip} ${city}`.trim(),
      birthdate ? `Date de naissance : ${birthdate}` : "",
      email ? `Email : ${email}` : "",
    ].filter(Boolean);

    linesP1.forEach((t, i) => {
      p1.drawText(String(t), {
        x: PAGE1_MANDANT.x,
        y: yFromTop(p1, PAGE1_MANDANT.yTop + i * PAGE1_MANDANT.lineGap, 0),
        size: PAGE1_MANDANT.size,
        font,
        color: rgb(0, 0, 0),
      });
    });

    // =======================
    // Page 2 : Acceptation + signatures
    // =======================
    const today = new Date();
    const dateLine = `Fait à Conthey, le ${formatDateFrCHShort(today)}`;

    // 2e rectangle : date
    p2.drawText(dateLine, {
      x: PAGE2.acceptDate.x,
      y: yFromTop(p2, PAGE2.acceptDate.yTop, 0),
      size: PAGE2.acceptDate.size,
      font,
      color: rgb(0, 0, 0),
    });

    // 3e rectangle : signature client (contain)
    drawImageContain(p2, clientSigImg, PAGE2.clientSigBox);

    // 4e rectangle : signature Habib (contain, donc pas étirée)
    drawImageContain(p2, habibSigImg, PAGE2.habibSigBox);

    const outBytes = await pdfDoc.save();

    // Sauver dans Storage + URL token
    const outPath = `clients/${clientUid}/offers_signing/${requestId}/${offerId}/mandate_creditx_signed.pdf`;
    const token = randomUUID();

    await bucket.file(outPath).save(outBytes, {
      contentType: "application/pdf",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      outPath
    )}?alt=media&token=${token}`;

    await sessionRef.set(
      {
        steps: {
          creditxMandatePdf: {
            url,
            path: outPath,
            generatedAt: FieldValue.serverTimestamp(),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error("[CREDITX MANDATE ERROR]", e);
    return NextResponse.json({ error: "Erreur génération mandat" }, { status: 500 });
  }
}