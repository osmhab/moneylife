//app/api/send-contract-activated/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXContractActivatedEmail } from 'lib/mail/creditx-mailer';
import { authAdmin } from '@/lib/firebase/admin';
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
    // 👈 NOUVEAU : On récupère la locale
    let { email, firstName, institutionName, numeroPolice, locale, clientUid, notificationHtml } = body;

    if (!institutionName || !numeroPolice) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    // Email robuste : si absent/inconnu en base, on le récupère depuis Firebase Auth.
    if ((!email || email === "Email inconnu") && clientUid) {
      try {
        const user = await authAdmin.getUser(clientUid);
        if (user.email) email = user.email;
      } catch (e) {
        console.warn("Lookup email via Auth échoué :", e);
      }
    }

    // Notification AVANT l'e-mail, et AVANT le garde 404 : `notifyClient` n'échoue
    // jamais, et l'e-mail est best-effort côté appelant. Notifier après ferait perdre
    // la notification dès que SendGrid tombe, ou dès qu'un client n'a pas d'e-mail
    // en base — alors qu'on connaît son uid et qu'il peut très bien lire son espace.
    await notifyClient({
      uid: clientUid,
      email,
      title: "Contrat activé !",
      content: `Votre contrat ${institutionName} est actif. Numéro de police : ${numeroPolice}.`,
      html: notificationHtml,
      category: "SOUSCRIPTION",
      actionUrl: "/dashboard/prevoyance?tab=prive",
    });

    if (!email) {
      return NextResponse.json({ error: "Email client introuvable" }, { status: 404 });
    }

    await sendCreditXContractActivatedEmail({
      to: email,
      firstName: firstName || "Client",
      institutionName,
      numeroPolice,
      locale // 👈 NOUVEAU : On passe la locale
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Contract Activated:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email" }, { status: 500 });
  }
}