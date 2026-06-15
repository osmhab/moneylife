// app/api/analysis/solution/route.ts
//
// Renvoie la SOLUTION proposée (« Améliorer ma prévoyance ») pour l'utilisateur connecté :
// prime mensuelle CreditX (retraite / invalidité / décès / exonération), meilleurs providers,
// split 3a/3b et gain fiscal. Lit Analyse/current + DonneePersonnelles + plans (admin SDK),
// calcule l'analyse des lacunes puis le pricing à partir des modèles ML (learner_models_3a).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { computeSolution } from "@/lib/analysis/solution";
import type { ProviderModelDoc } from "lib/engines/threeA-engine";

export const dynamic = "force-dynamic";

/** Âge à partir d'une date "jj.mm.aaaa". */
function ageFromDateNaissance(s: any): number {
  if (!s) return 0;
  const parts = String(s).split(".").map(Number);
  const year = parts[2] || parts[0]; // tolère "aaaa" seul
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

    const benchmarks = modelsSnap.docs
      .map((d) => ({ provider: d.id, ...d.data() }) as ProviderModelDoc)
      .filter((m) => m.deathUnit && m.disabilityUnit && m.waiverRate);

    // Comme le hook : Enter_age en priorité, sinon dérivé de la date de naissance.
    const clientAge = Number(cloudData.Enter_age) || ageFromDateNaissance(cloudData.Enter_dateNaissance);
    const genderF = cloudData.Enter_civilite === "Mme" ? 1 : 0;

    const solution = computeSolution({ situation, clientAge, genderF, benchmarks });

    return NextResponse.json({
      solution,
      meta: { nbModels: benchmarks.length, clientAge },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
