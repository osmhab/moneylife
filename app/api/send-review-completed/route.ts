import { NextResponse } from 'next/server';
import { sendCreditXReviewCompletedEmail } from 'lib/mail/creditx-mailer';
import { notifyClient } from '@/lib/server/notify';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 👈 NOUVEAU : ajout de locale
    const { email, firstName, institutionName, planType, locale, clientUid, notificationHtml } = body;

    const isLPP = planType === "LPP_BASE" || planType === "LPP_COMPL" || !planType;
    const typeLabel = isLPP ? "certificat LPP" : "contrat 3ème pilier";

    // Notification avant l'e-mail : un échec SendGrid ne doit pas l'emporter.
    await notifyClient({
      uid: clientUid,
      email,
      title: "Contrôle Expert terminé",
      content: `L'analyse de votre ${typeLabel} est disponible. Consultez le rapport dans votre espace.`,
      html: notificationHtml,
      category: isLPP ? "LPP" : "PREVOYANCE",
      actionUrl: "/dashboard/prevoyance",
    });

    // L'appelant n'a plus de garde sur l'e-mail : c'est ici qu'on l'assume.
    // Sans adresse, la notification a déjà été créée — on s'arrête là sans erreur.
    if (!email) {
      return NextResponse.json({ success: true, emailSkipped: true });
    }

    await sendCreditXReviewCompletedEmail({
      to: email,
      firstName: firstName || "Client",
      institutionName: institutionName || "Institution",
      typeLabel,
      locale // 👈 NOUVEAU
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Email Review Completed:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email de certification" }, 
      { status: 500 }
    );
  }
}