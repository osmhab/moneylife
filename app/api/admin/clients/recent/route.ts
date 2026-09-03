// app/api/admin/clients/recent/route.ts
//
// Historique des fiches client CONSULTÉES par un conseiller.
//
// POURQUOI UN DOCUMENT PAR CLIENT, ET NON UN JOURNAL D'ÉVÉNEMENTS
// ---------------------------------------------------------------
// Le stockage est `staff/{conseiller}/recentClients/{clientUid}` : une entrée
// par client, réécrite à chaque ouverture. La déduplication est donc STRUCTURELLE.
// Un journal append-only aurait rempli les « 5 derniers » avec cinq visites de la
// même fiche pendant un entretien — exactement l'inverse de ce qu'on veut d'une
// liste de reprise rapide. Ici, rouvrir une fiche la remonte en tête sans créer
// de doublon, et la collection reste bornée au nombre de clients suivis.
//
// À NE PAS CONFONDRE AVEC LA PISTE D'AUDIT
// ----------------------------------------
// `auditTrail/` est une preuve FINMA : append-only, inaltérable, conservée après
// suppression du compte. Ceci est un confort de navigation, écrasable et attaché
// au conseiller. Les deux ne doivent pas se mélanger — ni en stockage, ni en
// durée de vie.
//
// L'identité du conseiller vient TOUJOURS du jeton, jamais du corps de la requête :
// personne ne doit pouvoir écrire dans l'historique d'un collègue.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plafond de l'historique rendu (le « voir plus » du tableau de bord). */
const MAX = 30;

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

const str = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);

/** Enregistre l'ouverture d'une fiche par le conseiller courant. */
export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const clientUid = req.nextUrl.searchParams.get("uid");
  if (!clientUid) {
    return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* le nom est un confort d'affichage, pas une condition */ }

  try {
    await db
      .doc(`staff/${decoded.uid}/recentClients/${clientUid}`)
      .set(
        {
          clientUid,
          // Nom dénormalisé : la liste s'affiche sans 30 lectures supplémentaires.
          // Réécrit à chaque visite, donc il suit les renommages.
          clientNom: str(body?.nom),
          viewedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[clients/recent] écriture:", e?.message || e);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}

/** Les fiches consultées par le conseiller courant, de la plus récente à la plus ancienne. */
export async function GET(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const snap = await db
      .collection(`staff/${decoded.uid}/recentClients`)
      .orderBy("viewedAt", "desc")
      .limit(MAX)
      .get();

    const clients = snap.docs.map((d) => {
      const x = d.data();
      return {
        clientUid: x.clientUid || d.id,
        clientNom: x.clientNom || "",
        viewedAt: x.viewedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ clients });
  } catch (e: any) {
    console.error("[clients/recent] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}
