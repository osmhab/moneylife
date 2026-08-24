// app/api/admin/analyse/context/route.ts
//
// Renvoie le CONTEXTE d'un client pour pré-remplir l'outil d'analyse conseiller :
// ses données personnelles (DonneePersonnelles/current) + ses plans. Lecture seule,
// réservée aux collaborateurs (requireInternal). L'analyse elle-même se lance
// ensuite via POST /api/admin/analyse (sans état).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });
  }

  try {
    const [persoSnap, plansSnap] = await Promise.all([
      db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
      db.collection(`clients/${uid}/plans`).get(),
    ]);

    const client = persoSnap.data() || {};
    const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ client, plans });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
