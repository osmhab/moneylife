import { NextResponse } from "next/server";
import { db, authAdmin } from "@/lib/firebase/admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { Termination3bTemplate } from "lib/pdf/Termination3bTemplate";
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
      transferDate, iban, sendEmail, clientAddress, clientNPA, clientCity 
    } = body;

    const personalDoc = await db.collection("clients").doc(clientUid).collection("DonneePersonnelles").doc("current").get();
    const clientData = personalDoc.data();
    const clean = (s: any) => (typeof s === "string" ? s.replace(/!/g, "").trim() : "");

    const client = {
      firstName: clean(clientData?.Enter_prenom || "Prénom"),
      lastName: clean(clientData?.Enter_nom || "Nom"),
      address: clean(clientAddress || clientData?.Enter_adresse),
      zip: clean(clientNPA || clientData?.Enter_npa),
      city: clean(clientCity || clientData?.Enter_localite),
    };

    const details = { oldInstitution, oldAddress, contractNumber, transferDate, iban };

    if (sendEmail) {
      const token = nanoid(32);
      await db.collection("signing_requests").doc(token).set({
        clientUid,
        details,
        pillarType: "3b",
        status: "pending",
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
        createdAt: Date.now(),
      });

      const clientMainDoc = await db.collection("clients").doc(clientUid).get();
      const targetEmail = clientMainDoc.data()?.email;

      if (!targetEmail) throw new Error("Email client introuvable");

      await sendTransferSignatureRequestEmail({
        to: targetEmail,
        clientName: `${client.firstName} ${client.lastName}`,
        oldInstitution,
        contractNumber,
        token,
      });

      return NextResponse.json({ ok: true });
    }

    const buffer = await renderToBuffer(createElement(Termination3bTemplate, { client, details }));

    // ✅ Correction Type Error: Conversion Buffer -> Uint8Array
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Resiliation_3b_${client.lastName}.pdf"`,
      },
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}