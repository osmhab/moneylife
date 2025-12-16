import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import "@/lib/firebase/admin";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId manquant" }, { status: 400 });
    }

    const db = getFirestore();
    const bucket = getStorage().bucket();

    const sessionRef = db.collection("offers_signing_sessions").doc(sessionId);
    const snap = await sessionRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const session = snap.data() as any;
    const requestId: string = session.requestId;
    const offerId: string = session.offerId;
    const clientUid: string = session.clientUid;

    const signaturePath = session?.steps?.signature?.imagePath;
    if (!signaturePath) {
      return NextResponse.json(
        { error: "Signature manquante (imagePath)" },
        { status: 400 }
      );
    }

    // Date à écrire dans les PDFs (format jj.mm.aaaa)
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const dateText = `${dd}.${mm}.${yyyy}`;

    // 1) Charger la signature
    const [signatureImage] = await bucket.file(signaturePath).download();

    // 2) Charger la demande + toutes les offres
    const offerSnap = await db.collection("offers_requests_3e").doc(requestId).get();
    if (!offerSnap.exists) {
      return NextResponse.json(
        { error: "Demande offers_requests_3e introuvable" },
        { status: 404 }
      );
    }

    const adminOffers = (offerSnap.data()?.adminOffers ?? []) as any[];

    const allAttachments = adminOffers.flatMap((o: any) =>
      Array.isArray(o.attachments) ? o.attachments : []
    );

    // ✅ On cherche le "vrai dossier" offers_attachments/<FOLDER>/ à partir d'un attachment existant
    const anyAttachment = allAttachments.find((a: any) => {
      const p = String(a?.storagePath ?? "");
      return p.includes("/offers_attachments/");
    });

    if (!anyAttachment) {
      return NextResponse.json(
        { error: "Aucun fichier offers_attachments trouvé pour cette demande" },
        { status: 400 }
      );
    }

    // Exemple:
    // clients/UID/offers_attachments/offer_restored_0_176.../att_....pdf
    const p0 = String(anyAttachment.storagePath);

    // On récupère le folder réel après "/offers_attachments/"
    const idx = p0.indexOf("/offers_attachments/");
    const after = p0.slice(idx + "/offers_attachments/".length);
    const folder = after.split("/")[0]; // ex: offer_restored_0_1765450222382

    // Prefix exact du folder à matcher
    const folderPrefix = p0.slice(0, idx) + `/offers_attachments/${folder}/`;

    // ✅ On prend les PDFs en category "signature" dans ce folder exact
    const docsToSign = allAttachments.filter((a: any) => {
      const p = String(a?.storagePath ?? "");
      const cat = String(a?.category ?? "");
      const isPdf = p.toLowerCase().endsWith(".pdf");
      return cat === "signature" && isPdf && p.startsWith(folderPrefix);
    });

    console.log("[AXA SIGN] folderPrefix =", folderPrefix);
    console.log(
      "[AXA SIGN] docsToSign =",
      docsToSign.map((d: any) => d.storagePath)
    );

    if (docsToSign.length === 0) {
      console.warn("[AXA SIGN] No docsToSign", {
        requestId,
        offerId,
        totalOffers: adminOffers.length,
        sampleAttachments: allAttachments.slice(0, 8),
      });

      await sessionRef.set(
        {
          steps: {
            signedDocuments: {
              urls: [],
              error: "Aucun document category=signature trouvé dans le folder offers_attachments",
              signedAt: FieldValue.serverTimestamp(),
            },
          },
          status: "SIGNED_AXA_EMPTY",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({ ok: true, signedUrls: [], warning: "no_docs_to_sign" });
    }

    const signedUrls: string[] = [];

    for (const doc of docsToSign) {
      const srcPath = doc.storagePath as string;

      const [pdfBytes] = await bucket.file(srcPath).download();
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // police pour la date
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const { width, height } = lastPage.getSize();

      const png = await pdfDoc.embedPng(signatureImage);

      // defaults (fallback)
      let sigW = 150;
      let sigH = 55;
      let sigX = width - 200;
      let sigY = 80;

      // date defaults
      let dateX = width - 200;
      let dateY = 150;
      let dateSize = 10;

      // helper conversion (yTop = repère haut-gauche)
      const yFromTop = (yTop: number, boxH: number) => height - yTop - boxH;

      const fileName = String(doc?.name ?? "").toLowerCase();
      const filePathLower = String(doc?.storagePath ?? "").toLowerCase();

      // --- 1) Déclaration de consentement (1 page)
      // Place la signature juste au-dessus du trait "Habib Osmani"
      // + date sur le trait "Date" (colonne gauche)
      const isConsent =
        fileName.includes("consentement") ||
        fileName.includes("déclaration") ||
        fileName.includes("declaration") ||
        filePathLower.includes("consentement") ||
        filePathLower.includes("declaration");

      // --- 2) Feuille de signature (page 3/3)
      const isFeuilleSignature =
        fileName.includes("feuille_signature") ||
        fileName.includes("signature_offre") ||
        filePathLower.includes("feuille_signature");

      if (isConsent) {
        // Signature (coordonnées adaptées à ton PDF)
        sigX = 367.2;
        sigY = yFromTop(350.8, sigH); // 436.2

        // Date (à gauche, sur le trait "Date")
        // coord approx d'après ton doc : zone Date autour de x~130, yTop~405
        dateX = 250;
        dateY = yFromTop(402, 0); // baseline
        dateSize = 10;
      }

      if (isFeuilleSignature) {
        // Signature sur la dernière page, sous "Habib Osmani"
        sigX = 364.5;
        sigY = yFromTop(415.75, sigH); // 371.25

        // Date (trait "Date" à gauche de la signature)
        dateX = 250;
        dateY = yFromTop(470, 0); // baseline proche du champ Date
        dateSize = 10;
      }

      // 1) Dessiner la signature
      lastPage.drawImage(png, {
        x: sigX,
        y: sigY,
        width: sigW,
        height: sigH,
      });

      // 2) Écrire la date
      lastPage.drawText(dateText, {
        x: dateX,
        y: dateY,
        size: dateSize,
        font,
      });

      const signedPdf = await pdfDoc.save();

      const targetPath = `clients/${clientUid}/offers_signing/${requestId}/${offerId}/signed/${doc.id}_signed.pdf`;

      const token = randomUUID();

      await bucket.file(targetPath).save(signedPdf, {
        contentType: "application/pdf",
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      const bucketName = bucket.name; // ex: moneylife-c3b0b.firebasestorage.app
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
        targetPath
      )}?alt=media&token=${token}`;

      signedUrls.push(url);
    }

    // 3) Sauvegarde Firestore
    await sessionRef.set(
      {
        steps: {
          signedDocuments: {
            urls: signedUrls,
            signedAt: FieldValue.serverTimestamp(),
          },
        },
        status: "SIGNED_AXA",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, signedUrls });
  } catch (e) {
    console.error("[AXA SIGNING ERROR]", e);
    return NextResponse.json({ error: "Erreur signature PDF" }, { status: 500 });
  }
}