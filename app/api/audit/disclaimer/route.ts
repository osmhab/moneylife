// app/api/audit/disclaimer/route.ts
//
// Journalise dans la PISTE D'AUDIT l'acquittement par le CLIENT d'un avertissement
// (disclaimer) avant de générer une proposition — ex. « je continue sans mon certificat
// LPP, sous ma responsabilité » / « je confirme ne pas avoir de 3e pilier ». Écriture
// serveur (admin SDK, append-only) : le client ne peut PAS écrire l'audit directement.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { logAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide accepté */
  }

  const ackLPP = body?.ackLPP === true;
  const confirmNo3e = body?.confirmNo3e === true;
  const context = typeof body?.context === "string" ? body.context : "proposition 3a";

  if (!ackLPP && !confirmNo3e) {
    return NextResponse.json({ error: "Aucun acquittement à journaliser" }, { status: 400 });
  }

  const parts: string[] = [];
  if (ackLPP) parts.push("continuer sans certificat LPP (2e pilier estimé, sous sa responsabilité)");
  if (confirmNo3e) parts.push("confirmer ne pas avoir de 3e pilier existant");
  const summary = `Le client a acquitté avant ${context} : ${parts.join(" ; ")}.`;

  await logAudit({
    uid,
    type: "DISCLAIMER_ACK",
    actorType: "client",
    actorUid: uid,
    summary,
    meta: { context, ackLPP, confirmNo3e },
  });

  return NextResponse.json({ ok: true });
}
