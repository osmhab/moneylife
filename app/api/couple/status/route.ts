// app/api/couple/status/route.ts
//
// État du lien conjoint pour l'utilisateur courant : aucun / pending / accepted,
// son rôle (inviteur/invité), le code (si en attente et émis par lui), et le
// prénom du conjoint (si lien accepté). Consommé par l'app pour l'écran de liaison.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import {
  findActiveLinkForUid,
  spouseUidOf,
  spouseIdentity,
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
    const link = await findActiveLinkForUid(uid);
    if (!link) {
      return NextResponse.json({ status: "none" });
    }

    const role = link.inviterUid === uid ? "inviter" : "invitee";
    const spouseUid = spouseUidOf(link, uid);
    // Identité minimale partagée seulement une fois le lien accepté.
    const id = link.status === "accepted" && spouseUid
      ? await spouseIdentity(spouseUid)
      : { prenom: "", nom: "", dateNaissance: "" };

    return NextResponse.json({
      status: link.status,                       // "pending" | "accepted"
      role,                                       // "inviter" | "invitee"
      // Code visible seulement par l'inviteur d'une invitation en attente.
      code: role === "inviter" && link.status === "pending" ? link.code : null,
      spousePrenom: id.prenom,
      spouseNom: id.nom,
      spouseDateNaissance: id.dateNaissance,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
