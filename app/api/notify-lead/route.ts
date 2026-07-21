import { NextResponse } from 'next/server';
import { sendCreditXLeadCallbackAlert } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, phone, type, date } = body;

    // Petite sécurité basique
    if (!firstName || !phone) {
      return NextResponse.json({ error: "Prénom ou téléphone manquant" }, { status: 400 });
    }

    // On appelle ta machine à emails
    await sendCreditXLeadCallbackAlert({
      firstName,
      phone,
      type,
      date
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Notify Lead:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'alerte" }, { status: 500 });
  }
}