// app/api/stripe/checkout-lpp/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { authAdmin } from "app/lib/firebase/admin"; 

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia", 
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const decodedToken = await authAdmin.verifyIdToken(token);
    const clientUid = decodedToken.uid;
    const clientEmail = decodedToken.email;

    const { planId, institutionName } = await req.json();

    if (!planId) {
      return NextResponse.json({ error: "ID du plan manquant" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      // ✅ C'est ici la magie : on ne met AUCUN paramètre de paiement.
      // Stripe va automatiquement proposer les cartes et TWINT si activés sur ton Dashboard.
      mode: "payment",
      customer_email: clientEmail,
      submit_type: "pay", 
      invoice_creation: {
        enabled: true,
      },
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: "Contrôle Expert CreditX",
              description: `Certification pour : ${institutionName || "Prévoyance"}\n• Vérification Humaine\n• Calculs Garantis\n• Support Dédié`,
              images: [`${process.env.NEXT_PUBLIC_APP_URL}/images/expert.jpg`],
            },
            unit_amount: 1900, 
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        description: `Contrôle Expert CreditX - ${institutionName}`,
      },
      metadata: {
        clientUid: clientUid,
        planId: planId,
        serviceType: "LPP_EXPERT_REVIEW",
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/prevoyance?checkout=success&planId=${planId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/prevoyance?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });

  } catch (error: any) {
    console.error("Erreur Stripe Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}