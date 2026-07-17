// app/api/couple/revoke/route.ts
//
// L'un des deux conjoints rompt le lien (invitation en attente OU lien accepté).
// Après révocation, chacun retombe sur la saisie manuelle du salaire conjoint.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { findActiveLinkForUid, revokeLink } from "@/lib/server/coupleLinks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const link = await findActiveLinkForUid(uid);
    if (!link) {
      return NextResponse.json({ status: "none" });
    }
    await revokeLink(link.id, uid);
    return NextResponse.json({ status: "revoked" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
