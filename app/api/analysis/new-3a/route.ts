// app/api/analysis/new-3a/route.ts
//
// Proposition 3a pilotée par le questionnaire (new-3a). Reçoit les réponses du
// wizard (objectifs / philosophie / profil de risque / fumeur / budget), lit
// l'analyse des lacunes + les modèles ML côté serveur, et renvoie l'offre chiffrée.
// Règle métier : on ne chiffre pas sans le questionnaire (memory new-3a-wizard-required).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { computeNew3aOffer, type New3aWizard } from "@/lib/analysis/new3a";

export const dynamic = "force-dynamic";

function ageFromDateNaissance(s: any): number {
  if (!s) return 0;
  const parts = String(s).split(".").map(Number);
  const year = parts[2] || parts[0];
  if (!year || year < 1900) return 0;
  return new Date().getFullYear() - year;
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let wizard: New3aWizard;
  try {
    const body = await req.json();
    wizard = body?.wizard ?? body;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  try {
    const [analyseSnap, persoSnap, plansSnap, modelsSnap] = await Promise.all([
      db.doc(`clients/${uid}/Analyse/current`).get(),
      db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
      db.collection(`clients/${uid}/plans`).get(),
      db.collection("learner_models_3a").get(),
    ]);

    const cloudData = { ...(analyseSnap.data() || {}), ...(persoSnap.data() || {}) };
    const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const situation = computeSituationAnalysis({ cloudData, plans });
    if (!situation) {
      return NextResponse.json(
        { error: "Analyse indisponible (profil ou projections incomplets)" },
        { status: 404 }
      );
    }

    const benchmarks = modelsSnap.docs.map((d) => ({ provider: d.id, ...d.data() }));
    const clientAge = Number(cloudData.Enter_age) || ageFromDateNaissance(cloudData.Enter_dateNaissance);
    const clientGender = cloudData.Enter_civilite === "Mme" ? "F" : "M";

    const offer = computeNew3aOffer({ wizard, situation, clientAge, clientGender, benchmarks });

    return NextResponse.json({ offer, meta: { nbModels: benchmarks.length, clientAge } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
