// app/api/couple/invite/route.ts
//
// A génère une invitation à relier son conjoint : renvoie un CODE à partager
// librement (SMS, WhatsApp…). B le saisira via /api/couple/accept.
// Idempotent : si A a déjà une invitation en attente, on renvoie le même code.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import {
  findActiveLinkForUid,
  generateUniqueCode,
  createInvite,
} from "@/lib/server/coupleLinks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const existing = await findActiveLinkForUid(uid);
    if (existing) {
      // Déjà lié → on ne régénère pas ; on informe l'état courant.
      if (existing.status === "accepted") {
        return NextResponse.json(
          { error: "Vous êtes déjà relié à un conjoint.", status: "accepted" },
          { status: 409 }
        );
      }
      // Invitation en attente déjà émise (par cet utilisateur) → renvoie le code.
      if (existing.inviterUid === uid) {
        return NextResponse.json({ code: existing.code, status: "pending" });
      }
      // L'utilisateur est déjà invitee d'un autre lien en attente.
      return NextResponse.json(
        { error: "Une demande de liaison vous concerne déjà.", status: "pending" },
        { status: 409 }
      );
    }

    const code = await generateUniqueCode();
    await createInvite(uid, code);
    return NextResponse.json({ code, status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
