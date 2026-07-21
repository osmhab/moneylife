import { NextResponse } from "next/server";
import { db, authAdmin } from "@/lib/firebase/admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { TransferTemplate } from "lib/pdf/TransferTemplate";
import { sendTransferSignatureRequestEmail } from "lib/email/sendgrid";
import { nanoid } from "nanoid";

async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");
  return await authAdmin.verifyIdToken(token);
}

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);
    const body = await req.json();
    
    const { 
      clientUid, oldInstitution, oldAddress, contractNumber, 
      transferDate, sendEmail, clientAddress, clientNPA, clientCity 
    } = body;

    const personalDoc = await db.collection("clients").doc(clientUid).collection("DonneePersonnelles").doc("current").get();
    const clientData = personalDoc.data();
    const cleanStr = (val: any) => (typeof val === "string" ? val.replace(/!/g, "").trim() : "");

    const client = {
      firstName: cleanStr(clientData?.Enter_prenom || "Prénom"),
      lastName: cleanStr(clientData?.Enter_nom || "Nom"),
      address: cleanStr(clientData?.Enter_adresse || clientAddress || ""),
      zip: cleanStr(clientData?.Enter_npa || clientNPA || ""),
      city: cleanStr(clientData?.Enter_localite || clientCity || ""),
    };

    const details = { oldInstitution, oldAddress, contractNumber, transferDate };

    if (sendEmail) {
      const token = nanoid(32);
      
      await db.collection("signing_requests").doc(token).set({
        clientUid,
        details,
        pillarType: "3a", // ✅ Ajouté pour la cohérence
        status: "pending",
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
        createdAt: Date.now(),
      });

      const clientMainDoc = await db.collection("clients").doc(clientUid).get();
      const targetEmail = clientMainDoc.data()?.email;

      if (!targetEmail) throw new Error("L'adresse email du client est introuvable.");

      await sendTransferSignatureRequestEmail({
        to: targetEmail,
        clientName: `${client.firstName} ${client.lastName}`,
        oldInstitution: oldInstitution,
        contractNumber: contractNumber,
        token: token,
      });

      return NextResponse.json({ ok: true });
    }

    const buffer = await renderToBuffer(createElement(TransferTemplate, { client, details }));

    // ✅ Correction Type Error: Conversion Buffer -> Uint8Array
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Resiliation_${client.lastName}.pdf"`,
      },
    });

  } catch (e: any) {
    console.error("Erreur API Transfert:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}