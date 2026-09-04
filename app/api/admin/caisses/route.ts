// app/api/admin/caisses/route.ts
//
// LE REGISTRE DES CAISSES que l'agent de veille visite.
//
// Il n'y a aucun intérêt à ratisser les 1'300 institutions de prévoyance
// suisses : seules comptent celles où vos clients sont réellement affiliés.
// D'où l'amorçage — on lit les caisses déjà présentes sur les plans, et le
// registre se construit sur la demande réelle plutôt que sur une liste
// théorique qu'il faudrait entretenir.
//
// L'URL du site reste à renseigner à la main : deviner l'adresse officielle
// d'une caisse à partir de son nom mènerait l'agent sur un site tiers, et un
// règlement venu d'ailleurs fausserait des analyses.

import { NextRequest, NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { requireInternal } from "app/lib/server/requireInternal";
import { normaliserCaisse } from "app/lib/core/reglement";

const TYPES_CAISSE = ["LPP_BASE", "LPP_COMPL", "LPP"];

/**
 * Libellés qui ne désignent aucune caisse.
 *
 * Le scan retombe sur des valeurs génériques quand il n'a pas su lire le nom de
 * l'institution — « AUTRE », « Mon 2e pilier ». Les inscrire au registre
 * créerait des lignes qu'aucun collaborateur ne pourra jamais compléter, et qui
 * masqueraient les vraies caisses restant à renseigner.
 */
const GENERIQUES = new Set([
  "autre", "autres", "inconnue", "inconnu", "caisse de pension", "caisse",
  "mon 2e pilier", "mon 2eme pilier", "2e pilier", "lpp", "institution de prevoyance",
  "pensionskasse", "vorsorgeeinrichtung", "cassa pensioni", "n a", "na",
]);

function estGenerique(nom: string): boolean {
  return GENERIQUES.has(normaliserCaisse(nom)) || normaliserCaisse(nom).length < 3;
}

function cleDeCaisse(nom: string): string {
  return normaliserCaisse(nom).replace(/\s+/g, "-") || "inconnue";
}

export async function GET(req: NextRequest) {
  try { await requireInternal(req); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const snap = await db.collection("caisses_registre").get();
  const registre = snap.docs.map((d) => {
    const c = d.data();
    return {
      cle: d.id,
      nom: c.nom ?? "",
      site: c.site ?? null,
      actif: c.actif !== false,
      clients: c.clients ?? 0,
      dernierPassage: c.dernierPassage?.toDate?.()?.toISOString() ?? null,
      dernierResultat: c.dernierResultat ?? null,
      derniereErreur: c.derniereErreur ?? null,
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom));

  return NextResponse.json({ registre });
}

/** Ajoute ou met à jour une caisse. */
export async function POST(req: NextRequest) {
  try { await requireInternal(req); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nom = String(body?.nom ?? "").trim();
  const site = String(body?.site ?? "").trim();
  if (!nom) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });

  // Seules des adresses http(s) : l'agent ne doit pas être dirigé vers un
  // schéma exotique (file:, data:) par une saisie malheureuse.
  if (site && !/^https?:\/\//i.test(site)) {
    return NextResponse.json({ error: "L'adresse doit commencer par http:// ou https://" }, { status: 400 });
  }

  const cle = cleDeCaisse(nom);
  await db.collection("caisses_registre").doc(cle).set({
    nom, site: site || null,
    actif: body?.actif !== false,
    misAJourLe: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true, cle });
}

/**
 * Amorçage : inscrit les caisses réellement présentes chez les clients.
 *
 * On ne renseigne PAS le site — c'est le seul champ qu'il faut vérifier
 * humainement. Une caisse sans site est inscrite mais jamais visitée : elle
 * apparaît dans le registre comme « à compléter ».
 */
export async function PUT(req: NextRequest) {
  try { await requireInternal(req); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const plans = await db.collectionGroup("plans").get();
    const comptes = new Map<string, { nom: string; clients: number }>();

    for (const d of plans.docs) {
      const p = d.data();
      if (!TYPES_CAISSE.includes(String(p.type ?? "").toUpperCase())) continue;
      const nom = String(p.institutionName ?? "").trim();
      if (!nom || estGenerique(nom)) continue;
      const cle = cleDeCaisse(nom);
      const e = comptes.get(cle) ?? { nom, clients: 0 };
      e.clients += 1;
      comptes.set(cle, e);
    }

    let ajoutees = 0;
    for (const [cle, e] of comptes) {
      const ref = db.collection("caisses_registre").doc(cle);
      const existe = (await ref.get()).exists;
      // `merge` : on rafraîchit le compteur sans écraser un site déjà saisi ni
      // réactiver une caisse volontairement désactivée.
      await ref.set({
        nom: e.nom,
        clients: e.clients,
        ...(existe ? {} : { site: null, actif: true }),
        misAJourLe: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!existe) ajoutees++;
    }

    return NextResponse.json({ ok: true, caisses: comptes.size, ajoutees });
  } catch (e) {
    console.error("[caisses] amorçage impossible", e);
    return NextResponse.json({ error: "Amorçage impossible" }, { status: 500 });
  }
}
