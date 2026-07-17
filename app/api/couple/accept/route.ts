// app/api/couple/accept/route.ts
//
// B saisit le code reçu → accepte le lien conjoint (consentement explicite).
// Refuse : code inconnu/expiré, auto-liaison, ou si B est déjà relié.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/server/requireAuth";
import {
  findActiveLinkForUid,
  findPendingByCode,
  acceptLink,
  spousePrenom,
} from "@/lib/server/coupleLinks";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  code: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
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
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  try {
    // B déjà relié → on bloque (un seul conjoint actif à la fois).
    const mine = await findActiveLinkForUid(uid);
    if (mine) {
      return NextResponse.json(
        { error: "Vous êtes déjà relié à un conjoint.", status: mine.status },
        { status: 409 }
      );
    }

    const link = await findPendingByCode(parsed.data.code);
    if (!link) {
      return NextResponse.json({ error: "Code invalide ou expiré." }, { status: 404 });
    }
    if (link.inviterUid === uid) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas vous relier à vous-même." },
        { status: 400 }
      );
    }

    await acceptLink(link.id, uid);
    const prenom = await spousePrenom(link.inviterUid);
    return NextResponse.json({ status: "accepted", spousePrenom: prenom });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
