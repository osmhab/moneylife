// app/api/auth/set-uid/route.ts
//
// Pose un cookie d'identité après une connexion Firebase, pour que les Server
// Components sachent qui est connecté.
//
// ⚠️ L'IDENTITÉ VIENT DU JETON, PAS DU CORPS DE LA REQUÊTE
// --------------------------------------------------------
// Cette route acceptait auparavant un `uid` fourni par l'appelant et le posait
// tel quel en cookie httpOnly. N'importe qui pouvait donc se faire délivrer un
// cookie portant l'identité d'un autre. Rien ne lisait ce cookie, donc rien
// n'était exploitable — mais sa docstring invitait explicitement les Server
// Components à s'y fier. C'était une arme chargée posée sur la table.
//
// Le jeton Firebase est désormais vérifié côté serveur, et le cookie porte
// l'uid QUE GOOGLE CONFIRME. Un cookie posé ici est donc digne de confiance,
// ce qui était la promesse implicite de son existence.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authAdmin } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Jeton manquant" }, { status: 401 });
    }

    const decoded = await authAdmin.verifyIdToken(token);

    const jar = await cookies();
    jar.set("uid", decoded.uid, {
      httpOnly: true,          // invisible au JS client
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/auth/set-uid]", e?.message || e);
    return NextResponse.json({ error: "Jeton invalide" }, { status: 401 });
  }
}
