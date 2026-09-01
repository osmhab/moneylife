// app/api/admin/analyse/context/route.ts
//
// Renvoie le CONTEXTE d'un client pour pré-remplir l'outil d'analyse conseiller :
// ses données personnelles (DonneePersonnelles/current), ses plans et les besoins
// forcés enregistrés lors d'un précédent entretien. Réservé aux collaborateurs
// (requireInternal). L'analyse elle-même se lance via POST /api/admin/analyse.
//
// Le PUT enregistre les besoins forcés. Ils sont volontairement stockés À PART de
// `Analyse/current` (écrit par la Cloud Function) : celle-ci écrase son document à
// chaque recalcul et emporterait les saisies du conseiller.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";
import type { BesoinKey, BesoinOverrides } from "@/lib/analysis/situation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });
  }

  try {
    const [persoSnap, plansSnap, besoinsSnap] = await Promise.all([
      db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
      db.collection(`clients/${uid}/plans`).get(),
      db.doc(`clients/${uid}/Analyse/besoinsOverrides`).get(),
    ]);

    const client = persoSnap.data() || {};
    const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const besoinOverrides = (besoinsSnap.data()?.besoins as BesoinOverrides) || {};

    return NextResponse.json({ client, plans, besoinOverrides });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}

/** Thèmes acceptés — tout autre clé du corps est ignorée. */
const BESOIN_KEYS: BesoinKey[] = ["retraite", "invaliditeMaladie", "invaliditeAccident", "deces"];

/** Enregistre les besoins forcés du conseiller pour ce client. */
export async function PUT(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  // Même assainissement que la route d'analyse : seuls les thèmes connus, un
  // montant fini et positif, un libellé borné.
  const besoins: BesoinOverrides = {};
  for (const key of BESOIN_KEYS) {
    const entry = body?.besoins?.[key];
    if (!entry || typeof entry !== "object") continue;
    const n = Number(entry.valeur);
    const valeur = Number.isFinite(n) && n > 0 ? n : null;
    const libelle = String(entry.libelle ?? "").trim().slice(0, 200);
    if (valeur === null && !libelle) continue;
    besoins[key] = { valeur, ...(libelle ? { libelle } : {}) };
  }

  try {
    await db.doc(`clients/${uid}/Analyse/besoinsOverrides`).set({
      besoins,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decoded?.email || decoded?.uid || null,
    });
    return NextResponse.json({ ok: true, besoinOverrides: besoins });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
