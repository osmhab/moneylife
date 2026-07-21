// app/api/send-conseil-closed/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXConseilClosedEmail } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {   
  try {
    const body = await request.json();
    const { email, firstName, nextRdvDate, nextRdvObjectif, referralCode, locale } = body;

    // L'email et le code de parrainage sont les seuls champs strictement obligatoires ici
    if (!email || !referralCode) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    await sendCreditXConseilClosedEmail({
      to: email,
      firstName: firstName || "Client",
      nextRdvDate,
      nextRdvObjectif,
      referralCode,
      locale // Transfert de la locale pour la langue
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Conseil Closed:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email" }, { status: 500 });
  }
}