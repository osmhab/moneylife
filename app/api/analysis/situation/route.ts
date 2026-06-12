// app/api/analysis/situation/route.ts
//
// Renvoie l'analyse des lacunes de prévoyance (les 5 cartes) pour l'utilisateur connecté.
// Lit Analyse/current (projections) + DonneePersonnelles + plans côté serveur (admin SDK),
// puis calcule via computeSituationAnalysis. Source unique consommée par l'iOS.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeSituationAnalysis } from "@/lib/analysis/situation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const [analyseSnap, persoSnap, plansSnap] = await Promise.all([
      db.doc(`clients/${uid}/Analyse/current`).get(),
      db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
      db.collection(`clients/${uid}/plans`).get(),
    ]);

    // Même fusion que le hook : projections (Analyse) + données perso (salaire, état civil…).
    const cloudData = { ...(analyseSnap.data() || {}), ...(persoSnap.data() || {}) };
    const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const analysis = computeSituationAnalysis({ cloudData, plans });
    if (!analysis) {
      return NextResponse.json(
        { error: "Analyse indisponible (profil ou projections incomplets)" },
        { status: 404 }
      );
    }

    return NextResponse.json({ analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
