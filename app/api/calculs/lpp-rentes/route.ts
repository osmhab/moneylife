// app/api/calculs/lpp-rentes/route.ts
//
// Expose le tableau des rentes LPP (2e pilier) en API.
// Ces fonctions ne dépendent QUE de la `data` du plan + du mode (maladie/accident),
// pas de Legal_Settings → endpoint autonome, comme projection-retraite.
//
// TODO sécurité (avant prod) : vérif jeton Firebase + App Check (cf. CLAUDE.md).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calcRenteInvaliditeLPP,
  calcRenteEnfantInvaliditeLPP,
  calcRenteConjointLPP,
  calcRentePartenaireLPP,
  calcRenteOrphelinLPP,
  calcRenteVieillesseLPP,
} from "@/lib/calculs/lpp";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mode: z.enum(["maladie", "accident"]).default("maladie"),
  data: z.record(z.string(), z.any()).default({}),
});

export async function POST(req: NextRequest) {
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

  const { mode, data } = parsed.data;
  const c = data as never;

  const rentes = {
    invalidite: calcRenteInvaliditeLPP(c, mode),
    enfantInvalidite: calcRenteEnfantInvaliditeLPP(c, mode),
    conjoint: calcRenteConjointLPP(c, mode),
    partenaire: calcRentePartenaireLPP(c),
    orphelin: calcRenteOrphelinLPP(c, mode),
    vieillesse: calcRenteVieillesseLPP(c),
  };

  return NextResponse.json({ mode, rentes });
}
