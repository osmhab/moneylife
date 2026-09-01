// app/api/admin/advisor-card/route.ts
//
// Carte de visite du conseiller, imprimée sur la couverture du dossier :
// prénom + nom, fonction, agence.
//
// Chaque collaborateur ne lit et n'écrit QUE SA PROPRE carte : l'identifiant
// vient du jeton (`decoded.uid`), jamais du corps de la requête. Il n'y a donc
// rien à autoriser au-delà de `requireInternal` — personne ne peut modifier la
// signature d'un collègue, et le jour où l'équipe s'agrandit, aucune règle
// supplémentaire n'est nécessaire.
//
// Le document affiche jusqu'à trois lignes ; une fonction ou une agence vide est
// simplement omise, ce qui évite une ligne fantôme sur la couverture.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdvisorCard = { nom: string; fonction: string; agence: string };

const doc = (uid: string) => `staff/${uid}`;
const clean = (v: any, max = 80) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

export async function GET(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const snap = await db.doc(doc(decoded.uid)).get();
    const d = snap.data() || {};
    return NextResponse.json({
      card: {
        // À défaut de carte enregistrée, on part du profil Firebase : le
        // conseiller n'a plus qu'à compléter fonction et agence.
        nom: clean(d.nom || decoded.name || decoded.email || ""),
        fonction: clean(d.fonction || ""),
        agence: clean(d.agence || ""),
      } as AdvisorCard,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const body = await req.json();
    const card: AdvisorCard = {
      nom: clean(body?.nom),
      fonction: clean(body?.fonction),
      agence: clean(body?.agence),
    };
    await db.doc(doc(decoded.uid)).set(
      { ...card, email: decoded.email || null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ ok: true, card });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
