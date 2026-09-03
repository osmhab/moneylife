// app/api/admin/analyse/touch/route.ts
//
// Rafraîchit la date d'une analyse DÉJÀ déclarée en cours.
//
// ⚠️ NE CRÉE JAMAIS D'ENTRÉE — c'est tout l'intérêt de cette route.
// Avant, lancer l'analyse suffisait à faire apparaître un « en cours » : la
// liste se remplissait d'analyses que personne n'avait décidé de commencer.
// L'ouverture est désormais un geste explicite (`/api/admin/analyse/en-cours`,
// via le modal). Ici on se contente de dire « ce travail a bougé aujourd'hui »,
// pour que « Reprenez où vous en étiez » affiche une date juste.
//
// D'où `update()` et non `set({ merge: true })` : si le document n'existe pas,
// l'écriture échoue — et c'est le comportement voulu, silencieusement ignoré.
//
// `/api/admin/analyse` reste SANS ÉTAT : on lui envoie un client et des plans,
// elle renvoie une analyse, elle n'écrit rien. C'est ce qui permet de la rejouer,
// de la tester, et à terme de l'utiliser sur un prospect sans fiche.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    await db.doc(`clients/${uid}/Analyse/analyseEnCours`).update({
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decoded?.email || decoded?.uid || null,
    });
    return NextResponse.json({ ok: true, touched: true });
  } catch {
    // Aucune analyse déclarée en cours : il n'y a rien à rafraîchir, et surtout
    // rien à créer. Ce n'est pas une erreur.
    return NextResponse.json({ ok: true, touched: false });
  }
}
