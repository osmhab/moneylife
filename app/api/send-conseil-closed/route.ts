// app/api/send-conseil-closed/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXConseilClosedEmail } from 'lib/mail/creditx-mailer';
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