// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { notifyClient, notifyAdmin, lookupClientName } from "@/lib/server/notify";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
  });
  
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    const body = await req.text();
    // En utilisant req.headers.get (car req est une NextRequest), on n'a plus l'erreur "headers() is async"
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`❌ Erreur de signature Webhook: ${err.message}`);
      return NextResponse.json({ error: `Erreur de signature: ${err.message}` }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const clientUid = session.metadata?.clientUid;
      const planId = session.metadata?.planId;
      const serviceType = session.metadata?.serviceType;

      if (clientUid && planId && serviceType === "LPP_EXPERT_REVIEW") {
        console.log(`✅ Paiement reçu pour le plan ${planId} du client ${clientUid}`);

        // On utilise 'db' importé de ton fichier admin
        await db.collection("clients").doc(clientUid).collection("plans").doc(planId).update({
          status: "ACTIVE", 
          reviewStatus: "PENDING", 
          "metadata.reviewPaidAt": admin.firestore.FieldValue.serverTimestamp(),
          "metadata.reviewPaymentId": session.payment_intent,
        });

        // Notification In-App (client)
        await notifyClient({
          uid: clientUid,
          title: "Paiement validé",
          content: "Votre demande de contrôle expert a bien été transmise à nos actuaires.",
          category: "PAIEMENT",
          actionUrl: "/dashboard/prevoyance",
        });

        // Alerte back-office : un actuaire doit prendre le dossier. Le paiement
        // arrive par webhook, donc AUCUN humain n'est devant un écran à ce moment.
        await notifyAdmin("EXPERT_REVIEW_PAID", {
          clientUid,
          clientName: await lookupClientName(clientUid),
          planId,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erreur Webhook:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}