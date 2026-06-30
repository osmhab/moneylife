// app/api/sign-offer/route.ts
//
// Signature d'une offre par le client (depuis l'app iOS). Reçoit l'image de
// signature (PNG base64), l'incruste sur les PDF de l'offre via la MÊME fonction
// que le web (flattenSignatureOnPdf / pdf-lib), uploade les PDF signés dans le
// Storage, puis passe l'offre en PENDING_INSURANCE. Mirror de PlanDetailsView.processSignature.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db, bucket } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { flattenSignatureOnPdf } from "@/lib/core/signature";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { planId, signatureBase64 } = await req.json().catch(() => ({}));
  if (!planId || !signatureBase64) {
    return NextResponse.json({ error: "Paramètres manquants (planId, signatureBase64)" }, { status: 400 });
  }

  try {
    const planRef = db.collection("clients").doc(uid).collection("plans").doc(planId);
    const snap = await planRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });

    const plan = snap.data() as any;
    if (plan.status !== "PENDING_CLIENT") {
      return NextResponse.json({ error: "Cette offre n'est pas en attente de signature." }, { status: 409 });
    }

    const documents: any[] = plan.documents || [];
    const newSignedDocs: any[] = [];

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      if (d.isSigned) continue;

      const sigAreas =
        d.signatureAreas && d.signatureAreas.length > 0 ? d.signatureAreas : d.signatureArea ? [d.signatureArea] : [];
      if (sigAreas.length === 0) continue;
      const dateAreas = d.dateAreas || (d.dateArea ? [d.dateArea] : []);

      const signedBytes = await flattenSignatureOnPdf(d.url, signatureBase64, sigAreas, dateAreas);

      const path = `clients/${uid}/documents/plans_propositions/Signe_${i}_${Date.now()}.pdf`;
      const token = randomUUID();
      await bucket.file(path).save(Buffer.from(signedBytes), {
        contentType: "application/pdf",
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

      newSignedDocs.push({ name: `Signé - ${d.name}`, url, path, uploadedAt: new Date(), isSigned: true });
    }

    if (newSignedDocs.length === 0) {
      return NextResponse.json({ error: "Aucun document à signer dans cette offre." }, { status: 422 });
    }

    await planRef.update({
      status: "PENDING_INSURANCE",
      documents: [...documents, ...newSignedDocs],
      "metadata.acceptedAt": FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, signed: newSignedDocs.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur lors de la signature" }, { status: 500 });
  }
}
