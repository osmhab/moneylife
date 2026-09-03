// app/api/send-offer-accepted/route.ts
//
// Acceptation du dossier par la compagnie (statut → ACTIVE) depuis l'édition
// d'un plan. Cette branche était TOTALEMENT muette : ni e-mail, ni notification.
//
// À ne pas confondre avec `send-contract-activated`, qui couvre l'émission de la
// POLICE (numéro de police connu, déclenchée par AdminSignedPlanProcessor).
// Ici on annonce la décision favorable ; la police suit.

import { NextResponse } from 'next/server';
import { sendCreditXOfferAcceptedEmail } from 'lib/mail/creditx-mailer';
import { notifyClient } from '@/lib/server/notify';
import { requireInternal } from "@/lib/server/requireInternal";

export async function POST(request: Request) {
  // Destinataire fourni dans le corps de la requête : sans garde, la route
  // servait de relais d'e-mail depuis un domaine authentifié SendGrid.
  try {
    await requireInternal(request);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  try {
    const body = await request.json();
    const { email, firstName, institutionName, locale, clientUid } = body;

    if (!institutionName || (!email && !clientUid)) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    if (email && email !== "Email inconnu") {
      await sendCreditXOfferAcceptedEmail({
        to: email,
        firstName: firstName || "Client",
        institutionName,
        locale,
      });
    }

    await notifyClient({
      uid: clientUid,
      email,
      title: "Votre dossier est accepté",
      content: `${institutionName} a accepté votre dossier. Votre contrat est désormais actif.`,
      category: "COMPAGNIE",
      actionUrl: "/dashboard/prevoyance?tab=prive",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Send Offer Accepted:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }
}
