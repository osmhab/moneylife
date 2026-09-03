import { NextResponse } from "next/server";
import { db as adminDb } from "@/lib/firebase/admin";
import { sendCreditXOfferReminderEmail } from "lib/mail/creditx-mailer";
import { requireInternal } from "@/lib/server/requireInternal";

export async function POST(req: Request) {
// ⚠️ Cette route était ENTIÈREMENT OUVERTE : aucun contrôle de jeton. En
// production, un POST anonyme atteignait la logique métier (vérifié : HTTP 400
// « paramètres manquants » au lieu de 401). N'importe qui connaissant l'URL
// pouvait donc s'en servir. La garde est désormais la première instruction.
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  try {
    const { clientUid, planId } = await req.json();

    if (!clientUid || !planId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Récupérer le document principal du client
    const clientSnap = await adminDb.doc(`clients/${clientUid}`).get();
    const clientData = clientSnap.data();

    // 2. Récupérer le sous-document de données personnelles (s'il existe)
    const profileSnap = await adminDb.doc(`clients/${clientUid}/DonneePersonnelles/current`).get();
    const profileData = profileSnap.data();

    // 3. Le super-détecteur d'e-mail et de prénom (Priorité au sous-dossier, puis au document principal)
    const email = profileData?.Enter_email || clientData?.email;
    const firstName = profileData?.Enter_prenom || clientData?.firstName || "Client";

    // Si vraiment on ne trouve rien dans les deux, on bloque.
    if (!email) {
      return NextResponse.json({ error: "Email client introuvable" }, { status: 404 });
    }

    // 4. Envoyer l'email de relance
    await sendCreditXOfferReminderEmail({
      to: email,
      firstName: firstName,
      locale: "fr" 
    });

    // 5. Mettre à jour le plan dans Firestore
    await adminDb.doc(`clients/${clientUid}/plans/${planId}`).update({
      reminderSent: true,
      reminderSentAt: new Date()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la relance manuelle:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}