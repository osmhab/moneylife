//app/api/send-welcome/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXWelcomeEmail } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, firstName, locale } = body;

    if (!email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    await sendCreditXWelcomeEmail({
      to: email,
      firstName: firstName, // On passe ce qu'on reçoit ("Client" ou le vrai prénom)
      locale: locale || "fr"
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Welcome Email:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email" }, { status: 500 });
  }
}