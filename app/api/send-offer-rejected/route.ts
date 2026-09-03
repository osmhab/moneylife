// app/api/send-offer-rejected/route.ts
//
// Refus du dossier par la compagnie d'assurance (statut → REJECTED_INSURANCE).
// Avant : notification in-app SEULE, écrite depuis le navigateur admin — aucun
// e-mail (un TODO l'assumait dans AdminPlanGenerator). Un client qui n'ouvrait
// pas son espace n'apprenait donc jamais le refus.

import { NextResponse } from 'next/server';
import { sendCreditXOfferRejectedEmail } from 'lib/mail/creditx-mailer';
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
    const { email, firstName, institutionName, reason, locale, clientUid, notificationHtml } = body;

    if (!institutionName || (!email && !clientUid)) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    if (email && email !== "Email inconnu") {
      await sendCreditXOfferRejectedEmail({
        to: email,
        firstName: firstName || "Client",
        institutionName,
        reason: reason || "Aucune raison précisée par la compagnie.",
        locale,
      });
    }

    await notifyClient({
      uid: clientUid,
      email,
      title: "Dossier refusé par la compagnie",
      content: `La compagnie ${institutionName} a refusé votre dossier. Votre conseiller vous recontacte avec des alternatives.`,
      html: notificationHtml,
      category: "COMPAGNIE",
      type: "error",
      actionUrl: "/dashboard/prevoyance?tab=prive",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Send Offer Rejected:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }
}
