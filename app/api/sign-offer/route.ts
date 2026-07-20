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
import { notifyAdmin, lookupClientName } from "@/lib/server/notify";
import { isOfferExpired } from "@/lib/core/offerExpiry";
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

    // Verrou d'EXPIRATION. Sans lui, une offre de mars serait signée aujourd'hui
    // aux conditions de mars — les primes et l'acceptation du risque ne valent
    // que pour une durée limitée.
    // Le contrôle est fait SERVEUR : l'app peut masquer le bouton, elle ne peut
    // pas garantir qu'aucune requête ne sera forgée.
    if (isOfferExpired(plan.metadata?.offerExpiresAt)) {
      // On pose l'état terminal au passage : le client qui tente de signer une
      // offre périmée doit voir son dossier refléter la réalité immédiatement,
      // sans attendre le passage du cron.
      await planRef.update({
        status: "EXPIRED",
        "metadata.expiredAt": FieldValue.serverTimestamp(),
      });
      return NextResponse.json(
        {
          error: "Cette offre a expiré et ne peut plus être signée. Contactez votre conseiller pour en obtenir une nouvelle.",
          expired: true,
        },
        { status: 410 } // 410 Gone : la ressource a existé, elle ne reviendra pas.
      );
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

    // Le dossier attend maintenant une transmission à la compagnie : sans cette
    // alerte, personne côté CreditX ne l'apprend (l'admin devait surveiller l'onglet).
    await notifyAdmin("OFFER_SIGNED_BY_CLIENT", {
      clientUid: uid,
      clientName: await lookupClientName(uid),
      institutionName: plan?.institutionName ?? null,
      planId,
    });

    return NextResponse.json({ ok: true, signed: newSignedDocs.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur lors de la signature" }, { status: 500 });
  }
}
