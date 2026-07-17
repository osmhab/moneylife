// app/api/calculs/avs-couple/route.ts
//
// Expose le plafonnement des rentes AVS de couple (150 %) en API.
// Source unique : web ET iOS appellent ce même endpoint → aucune logique
// actuarielle dupliquée côté client.
//
// Lit DonneePersonnelles/current par uid (comme /api/analysis/situation) si aucun
// `data` n'est fourni → l'appelant iOS poste `{}`. Un `data` explicite reste
// accepté (test/web). Utilise LEGAL_2025 + l'échelle 44 (source unique) ; le
// plafond n'est PAS codé en dur : il dérive du haut de l'échelle 44.
//
// TODO sécurité (avant prod) : App Check (cf. CLAUDE.md §4/§5).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeAvsCoupleForClient } from "@/lib/calculs/avsAi";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025_Rows } from "@/lib/registry/echelle44";
import { findActiveLinkForUid, spouseUidOf } from "@/lib/server/coupleLinks";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // La `data` du client (champs Enter_*). Optionnel : si absent, lu par uid.
  // Champs pertinents : Enter_etatCivil, Enter_salaireAnnuel, Enter_spouseSalaireAnnuel…
  data: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    // Corps vide toléré (l'iOS poste `{}`).
    const text = await req.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // `data` explicite prioritaire ; sinon lecture des données perso par uid.
  let data: Record<string, any> = parsed.data.data ?? {};
  if (Object.keys(data).length === 0) {
    try {
      const snap = await db.doc(`clients/${uid}/DonneePersonnelles/current`).get();
      data = snap.data() || {};
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
    }
  }

  // Lien conjoint accepté → on injecte le salaire RÉEL du conjoint (lu côté serveur)
  // à la place de la saisie manuelle. La donnée brute ne transite jamais vers le client.
  let conjointLie = false;
  try {
    const link = await findActiveLinkForUid(uid);
    if (link?.status === "accepted") {
      const spouseUid = spouseUidOf(link, uid);
      if (spouseUid) {
        const snap = await db.doc(`clients/${spouseUid}/DonneePersonnelles/current`).get();
        const salaire = snap.data()?.Enter_salaireAnnuel;
        if (typeof salaire === "number" && salaire > 0) {
          data = { ...data, Enter_spouseSalaireAnnuel: salaire };
          conjointLie = true;
        }
      }
    }
  } catch {
    // Lien indisponible → repli silencieux sur la saisie manuelle.
  }

  const couple = computeAvsCoupleForClient(data as never, LEGAL_2025, Legal_Echelle44_2025_Rows);

  return NextResponse.json({ couple, conjointLie });
}
