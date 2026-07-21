import { NextResponse } from "next/server";
import { db as adminDb } from "@/lib/firebase/admin";
import { sendCreditXOfferReminderEmail } from "lib/mail/creditx-mailer";

export async function POST(req: Request) {
  try {
    const { clientUid, requestId } = await req.json();

    if (!clientUid || !requestId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Récupérer le document principal du client
    const clientSnap = await adminDb.doc(`clients/${clientUid}`).get();
    const clientData = clientSnap.data();

    // 2. Récupérer le sous-document de données personnelles
    const profileSnap = await adminDb.doc(`clients/${clientUid}/DonneePersonnelles/current`).get();
    const profileData = profileSnap.data();

    // 3. Extraire l'email et le prénom (Super-détecteur)
    const email = profileData?.Enter_email || clientData?.email;
    const firstName = profileData?.Enter_prenom || clientData?.firstName || "Client";

    if (!email) {
      return NextResponse.json({ error: "Email client introuvable" }, { status: 404 });
    }

    // 4. Envoyer l'email
    await sendCreditXOfferReminderEmail({
      to: email,
      firstName: firstName,
      locale: "fr" 
    });

    // 5. Mettre à jour la demande dans Firestore pour marquer la relance
    await adminDb.doc(`offers_requests_3e/${requestId}`).update({
      reminderSent: true,
      reminderSentAt: new Date()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la relance de la demande:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}