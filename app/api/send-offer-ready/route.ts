import { NextResponse } from 'next/server';
import { sendCreditXOfferReadyEmail } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // 👈 NOUVEAU : ajout de locale
    const { email, firstName, plans, locale } = body;

    if (!email || !plans || plans.length === 0) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

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