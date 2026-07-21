import { NextResponse } from "next/server";
import { db, bucket } from "@/lib/firebase/admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { TransferTemplate } from "lib/pdf/TransferTemplate";

export async function POST(req: Request) {
  try {
    const { token, signature } = await req.json();

    // 1. Récupérer la demande de signature
    const requestRef = db.collection("signing_requests").doc(token);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    }

    const { clientUid, details, status } = requestDoc.data()!;
    if (status === "completed") {
      return NextResponse.json({ error: "Déjà signé" }, { status: 400 });
    }

    // 2. Récupérer les infos du client pour le PDF final
    const clientDoc = await db.collection("clients").doc(clientUid).get();
    const clientData = clientDoc.data();

    const client = {
      firstName: clientData?.Enter_prenom || "",
      lastName: clientData?.Enter_nom || "",
      address: clientData?.Enter_adresse || "",
      zip: clientData?.Enter_npa || "",
      city: clientData?.Enter_localite || "",
    };

    // 3. Générer le PDF avec l'image de la signature
    const buffer = await renderToBuffer(
      createElement(TransferTemplate, { 
        client, 
        details, 
        signatureUrl: signature // L'image base64 est acceptée par react-pdf
      })
    );

    // 4. Upload dans Firebase Storage
    const fileName = `clients/${clientUid}/transferts/resiliation_${Date.now()}.pdf`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: { contentType: "application/pdf" },
    });

    // 5. Mettre à jour le statut et enregistrer le chemin du fichier
    await requestRef.update({
      status: "completed",
      signedAt: Date.now(),
      pdfPath: fileName
    });

    // Optionnel: Ajouter une note ou une entrée dans le CRM du client
    await db.collection("clients").doc(clientUid).collection("documents").add({
      type: "TRANSFER_LETTER",
      name: `Résiliation ${details.oldInstitution}`,
      path: fileName,
      createdAt: Date.now()
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}