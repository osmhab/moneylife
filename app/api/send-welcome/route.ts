//app/api/send-welcome/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXWelcomeEmail } from 'lib/mail/creditx-mailer';
import { requireAuth } from "@/lib/server/requireAuth";

export async function POST(request: Request) {
  // ⚠️ LE DESTINATAIRE VIENT DU JETON, PAS DU CORPS DE LA REQUÊTE.
  // La route acceptait auparavant n'importe quelle adresse sans authentification :
  // un « Bienvenue chez CreditX » pouvait donc être expédié à qui que ce soit,
  // depuis un domaine authentifié SendGrid. Un nouvel inscrit ne peut désormais
  // déclencher ce message que vers SA propre adresse, celle que Google confirme.
  let compte: { uid: string; email: string | null };
  try {
    compte = await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { firstName, locale } = body;

    if (!compte.email) {
      return NextResponse.json({ error: "Compte sans adresse e-mail" }, { status: 400 });
    }

    await sendCreditXWelcomeEmail({
      to: compte.email,
      firstName: firstName, // On passe ce qu'on reçoit ("Client" ou le vrai prénom)
      locale: locale || "fr"
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Welcome Email:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email" }, { status: 500 });
  }
}