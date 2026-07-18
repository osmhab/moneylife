// app/api/account/delete/route.ts
//
// Suppression DÉFINITIVE du compte de l'utilisateur connecté et de TOUTES ses
// données. Ordre important : on efface les données AVANT le compte Auth, pour
// que l'utilisateur puisse réessayer (encore authentifié) si une étape échoue.
//
//   1. Liens conjoint (spouseLinks) impliquant l'utilisateur
//   2. Firestore : clients/{uid} en récursif (DonneePersonnelles, plans, Analyse, documents…)
//   3. Storage : tous les fichiers sous clients/{uid}/ (scans, documents, photos)
//   4. Le compte d'authentification Firebase
//
// Action IRRÉVERSIBLE.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db, bucket, authAdmin } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    // 1. Liens conjoint (inviteur OU invité) — requêtes mono-champ, pas d'index composite.
    const [asInviter, asInvitee] = await Promise.all([
      db.collection("spouseLinks").where("inviterUid", "==", uid).get(),
      db.collection("spouseLinks").where("inviteeUid", "==", uid).get(),
    ]);
    await Promise.all([...asInviter.docs, ...asInvitee.docs].map((d) => d.ref.delete()));

    // 2. Toutes les données Firestore du client (récursif).
    await db.recursiveDelete(db.collection("clients").doc(uid));

    // 3. Tous les fichiers Storage sous clients/{uid}/.
    await bucket.deleteFiles({ prefix: `clients/${uid}/` });

    // 4. Le compte d'authentification (en dernier).
    await authAdmin.deleteUser(uid);

    return NextResponse.json({ deleted: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
