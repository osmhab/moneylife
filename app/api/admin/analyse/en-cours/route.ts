// app/api/admin/analyse/en-cours/route.ts
//
// Analyse EN COURS : une intention déclarée, pas une déduction.
//
// POURQUOI CE CHANGEMENT DE MODÈLE
// --------------------------------
// La liste « En cours » était DÉDUITE de traces laissées sur la fiche (besoins
// ajustés, notes, images, analyse lancée). Conséquence : retoucher un détail
// chez un client faisait apparaître une analyse en cours que personne n'avait
// commencée, et la liste se remplissait de faux positifs — au point de ne plus
// rien vouloir dire.
//
// Désormais le conseiller DIT s'il commence une analyse (modal à l'ouverture de
// l'écran), et peut la retirer de la liste. Une seule analyse ouverte par client :
// le document `clients/{uid}/Analyse/analyseEnCours` existe, ou il n'existe pas.
//
// La suppression retire de la LISTE, rien d'autre : ni les besoins ajustés, ni
// les notes, ni les dossiers déjà établis ne sont touchés. C'est un rangement,
// pas un effacement de travail.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

const ref = (uid: string) => db.doc(`clients/${uid}/Analyse/analyseEnCours`);

function uidDe(req: NextRequest) {
  return req.nextUrl.searchParams.get("uid");
}

/** L'écran d'analyse s'en sert pour savoir s'il doit proposer le modal. */
export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = uidDe(req);
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    const snap = await ref(uid).get();
    return NextResponse.json({ active: snap.exists });
  } catch (e: any) {
    console.error("[analyse/en-cours] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

/** « Oui » au modal : l'analyse rejoint la liste des analyses en cours. */
export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = uidDe(req);
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    await ref(uid).set(
      {
        ouvertePar: decoded?.email || decoded?.uid || null,
        ouverteLe: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, active: true });
  } catch (e: any) {
    console.error("[analyse/en-cours] ouverture:", e?.message || e);
    return NextResponse.json({ error: "Ouverture impossible" }, { status: 500 });
  }
}

/** Icône poubelle : retire l'analyse de la liste, sans rien effacer d'autre. */
export async function DELETE(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = uidDe(req);
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    await ref(uid).delete();
    return NextResponse.json({ ok: true, active: false });
  } catch (e: any) {
    console.error("[analyse/en-cours] retrait:", e?.message || e);
    return NextResponse.json({ error: "Retrait impossible" }, { status: 500 });
  }
}
