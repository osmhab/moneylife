import { NextResponse } from 'next/server';
import { sendCreditXOfferModifiedEmail } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // 👈 NOUVEAU : ajout de locale
    const { email, firstName, institutionName, newPrice, explanation, locale } = body;

    if (!email || !institutionName) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    await sendCreditXOfferModifiedEmail({
      to: email,
      firstName: firstName || "Client",
      institutionName,
      newPrice: Number(newPrice) || 0,
      explanation: explanation || "Une modification a été apportée à votre contrat.",
      locale // 👈 NOUVEAU
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Email Modified:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }
}