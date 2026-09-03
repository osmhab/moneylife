import { NextResponse } from 'next/server';
import { sendCreditXOfferReadyEmail } from 'lib/mail/creditx-mailer';
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
    // 👈 NOUVEAU : ajout de locale
    const { email, firstName, plans, locale, clientUid, notificationHtml } = body;

    if (!email || !plans || plans.length === 0) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    // Notification in-app créée ICI (et non plus dans le navigateur admin) :
    // e-mail et notification naissent du même appel, ils ne peuvent plus diverger.
    // Volontairement AVANT l'envoi : un échec SendGrid ne doit pas emporter la notif.
    await notifyClient({
      uid: clientUid,
      email,
      title: "Vos offres sont prêtes",
      content: "Vos plans personnalisés sont disponibles. Veuillez consulter les détails dans votre espace prévoyance.",
      html: notificationHtml,
      category: "OFFRE",
      actionUrl: "/dashboard/prevoyance?tab=prive",
    });

    await sendCreditXOfferReadyEmail({
      to: email,
      firstName,
      plans,
      locale // 👈 NOUVEAU
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Send Offer Ready:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" }, 
      { status: 500 }
    );
  }
}