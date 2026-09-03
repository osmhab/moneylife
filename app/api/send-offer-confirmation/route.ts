// app/api/send-offer-confirmation/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXConfirmationEmail, sendCreditXAdminAlert } from 'lib/mail/creditx-mailer';
import { notifyClient, notifyAdmin } from '@/lib/server/notify';
import { requireAuth } from "@/lib/server/requireAuth";

export async function POST(request: Request) {
  // ⚠️ DESTINATAIRE ET IDENTITÉ VIENNENT DU JETON.
  // La route acceptait `email` et `clientUid` dans le corps, sans
  // authentification : n'importe qui pouvait expédier une confirmation de
  // souscription à l'adresse de son choix depuis un domaine authentifié
  // SendGrid, et déposer une notification dans l'espace d'un autre client.
  // Un client ne peut désormais souscrire que pour lui-même.
  let compte: { uid: string; email: string | null };
  try {
    compte = await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Extraction de toutes les données envoyées par le Wizard
    const {
      firstName,
      lastName, 
      phone, 
      profession, 
      address, 
      recommendation, 
      monthlyTotal, 
      requestId, 
      riskProfile,
      sante,      // L'objet avec isSmoker, height, weight, healthOk
      benchmarks,
      details, // L'objet avec deces, ia, lf, company
      notification // { title, content, html } — déjà traduits par le composant
    } = body;

    // `email` et `clientUid` ne sont plus lus dans le corps : ils viennent du
    // compte authentifié, seule source qu'un appelant ne peut pas falsifier.
    const email = compte.email;
    const clientUid = compte.uid;

    if (!email) {
      return NextResponse.json({ error: "Compte sans adresse e-mail" }, { status: 400 });
    }

    // 1. Envoi de l'email de confirmation au Client
    await sendCreditXConfirmationEmail({
      to: email,
      firstName,
      recommendation,
      monthlyTotal,
      details // 👈 AJOUT ICI : On transmet les détails pour construire le tableau des garanties !
    });

    // 2. Envoi de l'alerte détaillée à l'Admin CreditX (info@creditx.ch)
    await sendCreditXAdminAlert({
      client: { 
        firstName, 
        lastName, 
        phone, 
        profession, 
        address, 
        email 
      },
      selection: { 
        recommendation, 
        total: monthlyTotal, 
        riskProfile,
        details
      },
      sante,      // Transmis au mailer pour les blocs orange
      benchmarks, // Transmis au mailer pour le tableau des gagnants
      requestId
    });

    // 3. Notification in-app au client.
    // Le TEXTE arrive déjà traduit du composant (next-intl vit côté client) ; c'est
    // la CRÉATION qui est ici, pour qu'elle soit indissociable de l'e-mail.
    await notifyClient({
      uid: clientUid,
      email,
      title: notification?.title ?? "Demande de souscription reçue",
      content:
        notification?.content ??
        `Votre demande pour ${recommendation ?? "votre plan"} a bien été enregistrée. Nous revenons vers vous rapidement.`,
      html: notification?.html,
      category: "SOUSCRIPTION",
      actionUrl: "/dashboard/prevoyance?tab=prive",
    });

    // 4. Alerte back-office. L'e-mail admin (sendCreditXAdminAlert ci-dessus) part
    // déjà, mais rien n'était persisté : l'inbox admin garde désormais une trace.
    await notifyAdmin("NEW_SUBSCRIPTION_REQUEST", {
      clientUid,
      clientName: [firstName, lastName].filter(Boolean).join(" ") || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Email CreditX:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des emails transactionnels" }, 
      { status: 500 }
    );
  }
}