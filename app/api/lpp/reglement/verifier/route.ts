// app/api/lpp/reglement/verifier/route.ts
//
// APPELÉE APRÈS UN SCAN DE CERTIFICAT.
//
// Deux choses, toujours, même quand aucun règlement n'est connu :
//
//   1. on évalue le DROIT du client à chaque prestation relevée sur son
//      certificat — un célibataire sans enfant n'a ni rente de conjoint ni
//      rente d'orphelin, quoi qu'imprime le document ;
//   2. si la caisse figure déjà dans la bibliothèque partagée, on applique son
//      règlement immédiatement : le client n'a rien scanné de plus, mais son
//      plan est qualifié parce qu'un autre assuré de la même caisse nous a
//      fourni le règlement. C'est ce qui rend le savoir de CreditX cumulatif.
//
// Rapide (aucun appel à l'IA) : elle peut être appelée à chaque création de plan.

import { NextRequest, NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin";
import { requireAuth } from "app/lib/server/requireAuth";
import { qualifierDepuisBibliotheque } from "app/lib/server/appliquerReglement";

export async function POST(req: NextRequest) {
  let uid: string;
  let email: string | null;
  try {
    ({ uid, email } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const planId = String(body?.planId ?? "").trim();
    if (!planId) return NextResponse.json({ error: "planId manquant" }, { status: 400 });

    // Un conseiller peut agir POUR un client ; un client, jamais pour un autre.
    const demande = String(body?.uid ?? "").trim();
    let clientUid = uid;
    if (demande && demande !== uid) {
      const estAdmin = !!email && (email.endsWith("@creditx.ch") || email.endsWith("@moneylife.ch"));
      if (!estAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      clientUid = demande;
    }

    const r = await qualifierDepuisBibliotheque(clientUid, planId);
    if (!r) {
      // Plan absent ou hors 2e pilier : ce n'est pas une erreur, il n'y a
      // simplement rien à qualifier.
      return NextResponse.json({ ok: true, applicable: false });
    }

    const doc = await db.collection("clients").doc(clientUid).collection("plans").doc(planId).get();
    const statut = (doc.data()?.metadata?.reglementStatut ?? "NON_VERIFIE") as string;

    return NextResponse.json({
      ok: true,
      applicable: true,
      reglementConnu: !!r.reglement,
      caisse: r.reglement?.caisse ?? null,
      enVigueurAu: r.reglement?.enVigueurAu ?? null,
      statut,
      notes: r.plansVerifies[0]?.notes ?? r.plansAVerifier[0]?.notes ?? [],
    });
  } catch (e) {
    console.error("[reglement/verifier] échec", e);
    return NextResponse.json({ error: "Vérification impossible" }, { status: 500 });
  }
}
