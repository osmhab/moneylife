// app/api/analysis/situation/route.ts
//
// Renvoie l'analyse des lacunes de prévoyance (les 5 cartes) pour l'utilisateur connecté.
// Lit Analyse/current (projections) + DonneePersonnelles + plans côté serveur (admin SDK),
// puis calcule via computeSituationAnalysis. Source unique consommée par l'iOS.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { computePremierPilierSnapshot } from "@/lib/analysis/premierPilier";
import { computeAvsCoupleForClient, isCoupleEtatCivil } from "@/lib/calculs/avsAi";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Override d'allocation retraite par plan (preview live des sliders, avant sauvegarde).
  let allocations: Record<string, number> | undefined;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text);
      if (body && typeof body.allocations === "object") allocations = body.allocations;
    }
  } catch {
    // Corps invalide → on ignore (analyse avec les allocations stockées).
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

    // ── PLAFOND COUPLE AVS (retraite) — AFFICHAGE SEUL ───────────────────────
    // Pour un client marié/partenariat, la rente AVS de MÉNAGE (les deux conjoints)
    // est plafonnée à 150 % du max individuel. On la projette pour l'AFFICHER en note
    // sous la rente individuelle (« Plafond couple * »). Elle N'entre PAS dans la
    // lacune : la personne ne touche PAS ce total à elle seule. La rente conjoint vient
    // de son salaire s'il est saisi, sinon on suppose des carrières comparables (salaire
    // conjoint = salaire du client → le ménage atteint le plafond réaliste, cohérent avec
    // le splitting AVS). Dès qu'un vrai salaire conjoint est enregistré, ce fallback s'efface.
    let avsCouplePlafondMensuel: number | undefined;
    try {
      const perso = (persoSnap.data() || {}) as any;
      if (isCoupleEtatCivil(perso.Enter_etatCivil)) {
        const clientForCouple = {
          ...perso,
          Enter_spouseSalaireAnnuel:
            Number(perso.Enter_spouseSalaireAnnuel) > 0
              ? perso.Enter_spouseSalaireAnnuel
              : perso.Enter_salaireAnnuel,
        };
        const couple = computeAvsCoupleForClient(
          clientForCouple,
          LEGAL_2025,
          Legal_Echelle44_2025.rows
        );
        if (couple.renteCoupleMensuelle > 0) {
          avsCouplePlafondMensuel = couple.renteCoupleMensuelle;
        }
      }
    } catch {
      /* profil incomplet → pas de plafond affiché */
    }

    const analysis = computeSituationAnalysis({
      cloudData,
      plans,
      allocations,
      avsCouplePlafondMensuel,
    });
    if (!analysis) {
      return NextResponse.json(
        { error: "Analyse indisponible (profil ou projections incomplets)" },
        { status: 404 }
      );
    }

    // Snapshot 1er pilier (AVS/AI + LAA) « photo d'aujourd'hui » — calculé via le moteur
    // sur les données perso brutes. Non bloquant : si le profil est incomplet, on laisse
    // premierPilier absent (l'app affiche son empty state).
    try {
      analysis.premierPilier = computePremierPilierSnapshot(
        (persoSnap.data() || {}) as any,
        LEGAL_2025,
        Legal_Echelle44_2025.rows,
        new Date()
      );
    } catch {
      /* profil incomplet → premierPilier absent */
    }

    return NextResponse.json({ analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
