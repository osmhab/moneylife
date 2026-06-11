// app/api/calculs/projection-retraite/route.ts
//
// Expose le moteur de projection retraite (LPP / 3a) en API HTTP.
// Source unique de vérité : web ET iOS appellent ce même endpoint
// → aucune logique actuarielle dupliquée côté client.
//
// TODO sécurité (avant prod) : vérifier le jeton Firebase (ID token) de l'appelant
// + App Check. Voir CLAUDE.md §4/§5.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeLPPProjectionRetraite } from "@/lib/calculs/lpp";
import {
  computeProjections3aAssurance,
  computeProjections3aBanque,
} from "@/lib/calculs/3epilier";

// Ces routes ne doivent pas être évaluées au build (logique dynamique).
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["lpp", "3a-assurance", "3a-banque"]),
  clientAge: z.number().int().min(0).max(120),
  // La `data` du plan (champs lus défensivement par le moteur) : objet libre.
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

  const { kind, clientAge, data } = parsed.data;

  let capital: number;
  switch (kind) {
    case "lpp":
      capital = computeLPPProjectionRetraite(data as never, clientAge);
      break;
    case "3a-assurance":
      capital = computeProjections3aAssurance(data as never, clientAge);
      break;
    case "3a-banque":
      capital = computeProjections3aBanque(data as never, clientAge);
      break;
    default:
      return NextResponse.json({ error: "kind inconnu" }, { status: 400 });
  }

  return NextResponse.json({ kind, clientAge, capital });
}
