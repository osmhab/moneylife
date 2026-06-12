// app/api/calculs/lpp-capitaux/route.ts
//
// Expose les capitaux décès LPP/LAA en API.
// Utilise LEGAL_2025 (source unique des paramètres légaux) côté serveur.
//
// TODO sécurité (avant prod) : vérif jeton Firebase + App Check (cf. CLAUDE.md).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calcCapitalDecesMaladieAucuneRenteLPP,
  calcCapitalDecesAccidentAucuneRenteLAA,
  calcCapitalDecesMaladiePlusRenteLPP,
  calcCapitalDecesAccidentPlusRenteLPP,
} from "@/lib/calculs/lpp";
import { LEGAL_2025 } from "@/lib/core/legal";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
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

  const c = parsed.data.data as never;

  const capitaux = {
    maladieAucune: calcCapitalDecesMaladieAucuneRenteLPP(c, LEGAL_2025),
    accidentAucune: calcCapitalDecesAccidentAucuneRenteLAA(c, LEGAL_2025),
    maladiePlus: calcCapitalDecesMaladiePlusRenteLPP(c),
    accidentPlus: calcCapitalDecesAccidentPlusRenteLPP(c),
  };

  return NextResponse.json({ capitaux });
}
