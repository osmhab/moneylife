// app/api/auth/set-uid/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Ce petit endpoint pose un cookie "uid" après un login Firebase côté client.
 * Il permet aux pages Server Components (comme /analyse/certificat-lpp)
 * de connaître quel utilisateur est connecté.
 *
 * Utilisation côté client :
 *   const uid = auth.currentUser?.uid;
 *   await fetch("/api/auth/set-uid", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ uid }),
 *   });
 */

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "uid manquant" }, { status: 400 });
    }

    // Crée le cookie sécurisé
    const jar = await cookies();
    jar.set("uid", uid, {
      httpOnly: true, // invisible au JS client
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", // disponible sur tout le site
      maxAge: 60 * 60 * 24 * 7, // 7 jours
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/auth/set-uid] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
