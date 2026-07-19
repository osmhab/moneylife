// app/api/notify-admin/route.ts
//
// Permet à une action CLIENT (signature, refus d'offre) de prévenir le back-office.
// Ces transitions se produisent dans le navigateur du client ou dans l'app iOS ;
// sans cette route, personne côté CreditX n'apprend qu'un dossier attend.
//
// SÉCURITÉ — deux verrous, parce que la route est ouverte à tout utilisateur connecté :
//   1. l'`uid` du client vient du JETON, jamais du corps : on ne peut pas déclarer
//      un événement au nom d'un autre ;
//   2. le corps ne transporte qu'un IDENTIFIANT d'événement dans une liste fermée ;
//      le libellé est construit serveur. Pas d'injection de texte dans l'inbox admin.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { notifyAdmin, lookupClientName, type AdminEvent } from "@/lib/server/notify";

/** Événements qu'un CLIENT a le droit de déclencher (sous-ensemble strict). */
const CLIENT_TRIGGERABLE: AdminEvent[] = [
  "OFFER_SIGNED_BY_CLIENT",
  "OFFER_REJECTED_BY_CLIENT",
  // Le parcours de souscription iOS écrit `offers_requests_3e` en direct (sans
  // passer par /api/send-offer-confirmation) : sans ceci, une demande déposée
  // depuis l'app n'alerte personne côté back-office.
  "NEW_SUBSCRIPTION_REQUEST",
];

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const event = body?.event as AdminEvent;

    if (!CLIENT_TRIGGERABLE.includes(event)) {
      return NextResponse.json({ error: "Événement non autorisé" }, { status: 400 });
    }

    await notifyAdmin(event, {
      clientUid: uid,                       // ← du jeton, pas du corps
      clientName: await lookupClientName(uid),
      institutionName: body?.institutionName ?? null,
      planId: body?.planId ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Erreur API notify-admin:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
