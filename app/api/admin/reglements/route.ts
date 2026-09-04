// app/api/admin/reglements/route.ts
//
// BACK-OFFICE : la bibliothèque de règlements, vue et alimentée par CreditX.
//
// POURQUOI CETTE PORTE
// Attendre qu'un client scanne le règlement de sa caisse, c'est lui faire faire
// notre travail — et n'obtenir le document que le jour où quelqu'un y pense. Un
// collaborateur qui dépose un PDF enrichit la bibliothèque pour TOUS les
// assurés de cette caisse, présents et à venir.
//
// L'ingestion passe par la même fonction que le scan client : le dédoublonnage,
// la comparaison de millésimes et l'analyse s'y appliquent à l'identique.

import { NextRequest, NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { requireInternal } from "app/lib/server/requireInternal";
import { ingererReglement } from "app/lib/server/ingererReglement";
import type { FichierIA } from "app/lib/server/analyseIA";

export const maxDuration = 300;

/** État de la bibliothèque + dernières ingestions. */
export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const [regs, journal] = await Promise.all([
    db.collection("reglements").get(),
    db.collection("reglements_journal").orderBy("le", "desc").limit(30).get(),
  ]);

  const reglements = regs.docs.map((d) => {
    const r = d.data();
    return {
      cle: d.id,
      caisse: r.caisse ?? "",
      enVigueurAu: r.enVigueurAu ?? null,
      annexes: (r.annexes ?? []).length,
      // Nombre de clients concernés, pas leur identité : le back-office n'a pas
      // besoin de savoir QUI a scanné pour juger de la couverture.
      clients: (r.scannePar ?? []).length,
      misAJourLe: r.misAJourLe?.toDate?.()?.toISOString() ?? null,
      capitalDeces: r.general?.capitalDeces?.verse ?? null,
      // Renseignés par un collaborateur — c'est ce qui rend le règlement
      // surveillable. Sans `pageUrl`, l'agent ne fait rien.
      caisseNomComplet: r.caisseNomComplet ?? null,
      pageUrl: r.pageUrl ?? null,
      dateEdition: r.dateEdition ?? null,
      dernierPassage: r.dernierPassage?.toDate?.()?.toISOString() ?? null,
      derniereErreur: r.derniereErreur ?? null,
    };
  }).sort((a, b) => a.caisse.localeCompare(b.caisse));

  return NextResponse.json({
    reglements,
    journal: journal.docs.map((d) => {
      const j = d.data();
      return { cle: j.cle, statut: j.statut, source: j.source, le: j.le?.toDate?.()?.toISOString() ?? null };
    }),
  });
}

/** Dépôt d'un règlement par un collaborateur. */
export async function POST(req: NextRequest) {
  let interne: { uid: string };
  try {
    interne = await requireInternal(req);
  } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });

    // Page d'où le document a été téléchargé : c'est elle que l'agent
    // reviendra consulter. Un collaborateur qui la note une fois évite à la
    // machine de chercher — et d'aller chercher n'importe où.
    const pageUrl = String(form.get("pageUrl") ?? "").trim();
    if (pageUrl && !/^https?:\/\//i.test(pageUrl)) {
      return NextResponse.json({ error: "L'adresse doit commencer par http:// ou https://" }, { status: 400 });
    }

    const fichiers: FichierIA[] = await Promise.all(files.map(async (f) => ({
      mimeType: f.type || "application/pdf",
      base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
    })));

    // Aucun `clientUid` : un dépôt de back-office alimente la bibliothèque sans
    // toucher au dossier de qui que ce soit. Les plans des clients concernés
    // seront qualifiés à leur prochain scan de certificat.
    const r = await ingererReglement(fichiers, { source: "admin", auteur: interne.uid });

    if (pageUrl && r.cle) {
      await db.collection("reglements").doc(r.cle).set({ pageUrl }, { merge: true });
    }

    if (r.statut === "PAS_UN_REGLEMENT") {
      return NextResponse.json(
        { error: "Ce document ne ressemble pas à un règlement de prévoyance." },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[admin/reglements] échec", e);
    return NextResponse.json({ error: "L'analyse a échoué" }, { status: 500 });
  }
}

/**
 * Complète la fiche d'un règlement : nom complet de la caisse, page d'origine,
 * date d'édition.
 *
 * Ces champs ne s'extraient pas du document de façon fiable — la page d'origine
 * n'y figure pas du tout — et ce sont eux qui rendent le règlement surveillable.
 * C'est donc un travail humain, fait une fois par caisse.
 */
export async function PATCH(req: NextRequest) {
  try { await requireInternal(req); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const cle = String(body?.cle ?? "").trim();
  if (!cle) return NextResponse.json({ error: "Clé manquante" }, { status: 400 });

  const maj: Record<string, unknown> = {};
  if (typeof body.caisseNomComplet === "string") maj.caisseNomComplet = body.caisseNomComplet.trim();
  if (typeof body.dateEdition === "string") maj.dateEdition = body.dateEdition.trim();

  if (typeof body.pageUrl === "string") {
    const url = body.pageUrl.trim();
    // Uniquement http(s) : l'agent ira sur cette adresse, une saisie
    // malheureuse ne doit pas l'envoyer vers un schéma exotique.
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "L'adresse doit commencer par http:// ou https://" }, { status: 400 });
    }
    maj.pageUrl = url || null;
    // Nouvelle adresse : on remet le règlement en tête de file de la veille.
    maj.dernierPassage = admin.firestore.FieldValue.delete();
    maj.derniereErreur = admin.firestore.FieldValue.delete();
  }

  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });
  }

  await db.collection("reglements").doc(cle).set(maj, { merge: true });
  return NextResponse.json({ ok: true });
}
