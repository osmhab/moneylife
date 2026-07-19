// app/api/signing/complete/route.ts
import { NextResponse } from "next/server";
import { db, bucket } from "@/lib/firebase/admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { TransferTemplate } from "lib/pdf/TransferTemplate";
import { Termination3bTemplate } from "lib/pdf/Termination3bTemplate";

export async function POST(req: Request) {
  try {
    // 1. Récupération des données (y compris l'IBAN optionnel)
    const { token, signature, iban } = await req.json();

    if (!token || !signature) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    // 2. Récupérer la demande
    const requestDoc = await db.collection("signing_requests").doc(token).get();
    if (!requestDoc.exists) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });

    const requestData = requestDoc.data()!;
    if (requestData.status === "signed") return NextResponse.json({ error: "Déjà signé" }, { status: 400 });

    // On utilise 'let' car on va peut-être modifier 'details'
    let { clientUid, details, pillarType } = requestData;

    // --- NOUVEAU : MISE À JOUR DE L'IBAN ---
    // Si c'est un 3b et que le client a envoyé un nouvel IBAN, on écrase l'ancien
    if (pillarType === "3b" && iban) {
      details = {
        ...details,
        iban: iban.trim() // On s'assure qu'il est propre
      };
    }
    // ---------------------------------------

    // 3. Récupérer les infos client
    const dpDoc = await db.collection("clients").doc(clientUid).collection("DonneePersonnelles").doc("current").get();
    const dpData = dpDoc.data();

    const client = {
      firstName: (dpData?.Enter_prenom || "Prénom").replace(/!/g, "").trim(),
      lastName: (dpData?.Enter_nom || "Nom").replace(/!/g, "").trim(),
      address: (dpData?.Enter_adresse || "").trim(),
      zip: (dpData?.Enter_npa || "").trim(),
      city: (dpData?.Enter_localite || "").trim(),
    };

    // 4. Sélection du Template avec les 'details' potentiellement mis à jour
    const templateElement = pillarType === "3b" 
      ? createElement(Termination3bTemplate, { client, details, signatureUrl: signature })
      : createElement(TransferTemplate, { client, details, signatureUrl: signature });

    const buffer = await renderToBuffer(templateElement);

    // 5. Sauvegarde
    const folder = pillarType === "3b" ? "resiliations_3b" : "transferts_3a";
    const fileName = `clients/${clientUid}/${folder}/Resiliation_${client.lastName}_Signee.pdf`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: { contentType: "application/pdf" },
    });

    // 6. Update Firestore
    // On prépare l'objet de mise à jour
    const updatePayload: any = {
      status: "signed",
      signedAt: Date.now(),
      pdfPath: fileName,
    };

    // Si l'IBAN a changé, on le sauvegarde aussi dans la base de données
    // pour que l'admin voie quel IBAN a été utilisé au final
    if (pillarType === "3b" && iban) {
      updatePayload["details.iban"] = iban.trim();
    }

    await db.collection("signing_requests").doc(token).update(updatePayload);

    // Log activité
    await db.collection("clients").doc(clientUid).collection("activity").add({
      type: pillarType === "3b" ? "3B_TERMINATION_SIGNED" : "3A_TRANSFER_SIGNED",
      label: pillarType === "3b" ? "Résiliation 3b signée" : "Lettre de transfert 3a signée",
      timestamp: Date.now(),
      fileName
    });

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    console.error("Erreur signature:", e.message);
    return NextResponse.json({ error: "Erreur technique" }, { status: 500 });
  }
}