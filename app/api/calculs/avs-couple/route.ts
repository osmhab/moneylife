// app/api/calculs/avs-couple/route.ts
//
// Expose le plafonnement des rentes AVS de couple (150 %) en API.
// Source unique : web ET iOS appellent ce même endpoint → aucune logique
// actuarielle dupliquée côté client.
//
// Utilise LEGAL_2025 + l'échelle 44 (source unique des paramètres légaux).
// Le plafond n'est PAS codé en dur : il dérive du haut de l'échelle 44.
//
// TODO sécurité (avant prod) : App Check (cf. CLAUDE.md §4/§5).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/server/requireAuth";
import { computeAvsCoupleForClient } from "@/lib/calculs/avsAi";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025_Rows } from "@/lib/registry/echelle44";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // La `data` du client (champs Enter_*, lus défensivement par le moteur) : objet libre.
  // Champs pertinents : Enter_etatCivil, Enter_salaireAnnuel,
  // Enter_spouseRenteAvsMensuelle, Enter_spouseSalaireAnnuel, Enter_spouseDateNaissance…
  data: z.record(z.string(), z.any()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
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

  const c = parsed.data.data as never;

  const couple = computeAvsCoupleForClient(c, LEGAL_2025, Legal_Echelle44_2025_Rows);

  return NextResponse.json({ couple });
}
