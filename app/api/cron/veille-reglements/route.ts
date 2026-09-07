// app/api/cron/veille-reglements/route.ts
//
// AGENT DE VEILLE : une nouvelle version est-elle parue ?
//
// L'agent ne CHERCHE rien. Il revient sur une page qu'un collaborateur a
// désignée — celle d'où le règlement a été téléchargé — et regarde si un
// document plus récent y figure.
//
// POURQUOI SI PEU D'AMBITION, ET POURQUOI C'EST LE BON CHOIX
// ----------------------------------------------------------
// Un agent qui part à la découverte ramène surtout du bruit : règlements de
// placement, d'organisation, d'assemblée des délégués — tous nommés
// « règlement », aucun ne disant à quelles conditions les prestations sont dues.
// Chacun coûte une analyse, et un mauvais document en bibliothèque fausserait
// les analyses de tous les assurés de la caisse.
//
// Une page validée par un humain supprime ce risque à la racine. Tant qu'un
// règlement n'a pas d'URL, l'agent le laisse tranquille : c'est au
// collaborateur de compléter la fiche, pas à la machine de deviner.

import { NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { reglementsCandidats, aRevisiter, estLienDirectPdf, empreinteFichier } from "app/lib/core/veille";
import { ingererReglement } from "app/lib/server/ingererReglement";

export const maxDuration = 300;

/** Règlements revus par passage — le temps d'exécution est borné à 300 s. */
const PAR_PASSAGE = 4;
/** Documents analysés par page : au-delà, c'est que la page n'est pas la bonne. */
const CANDIDATS_PAR_PAGE = 2;
/** Un règlement dépasse rarement 20 Mo ; en deçà de 10 Ko, ce n'est pas un PDF utile. */
const TAILLE_MAX = 20 * 1024 * 1024;
const TAILLE_MIN = 10 * 1024;

const UA = "CreditX-Veille/1.0 (+https://creditx.ch ; verification des mises a jour de reglements)";

export async function GET(req: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu || req.headers.get("authorization") !== `Bearer ${attendu}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const tous = await db.collection("reglements").get();

  // Seuls les règlements dont un collaborateur a renseigné la page d'origine.
  const surveillables = tous.docs.filter((d) => {
    const url = d.data().pageUrl;
    return typeof url === "string" && /^https?:\/\//i.test(url);
  });

  const aFaire = surveillables
    .filter((d) => aRevisiter(d.data().dernierPassage?.toMillis?.() ?? null))
    .slice(0, PAR_PASSAGE);

  const rapport: Record<string, unknown>[] = [];

  for (const doc of aFaire) {
    const r = doc.data() as { caisse?: string; pageUrl?: string; empreinte?: string };
    let nouvelleEmpreinte: string | null = null;
    const ligne: Record<string, unknown> = { cle: doc.id, caisse: r.caisse ?? "", trouves: 0, resultats: [] };

    try {
      let candidats: { url: string; texte: string }[];

      if (estLienDirectPdf(r.pageUrl!)) {
        // LIEN DIRECT. Le seul chemin qui fonctionne sur les sites rendus par
        // le navigateur — Aevum est en SvelteKit, sa page servie ne contient
        // aucun lien. Le collaborateur colle l'adresse du document lui-même.
        //
        // On demande d'abord les seuls en-têtes : si l'empreinte du fichier n'a
        // pas bougé, il n'y a rien à télécharger ni à réanalyser. Un règlement
        // change au plus une fois l'an, la plupart des passages doivent être
        // gratuits.
        const tete = await fetch(r.pageUrl!, {
          method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000),
        }).catch(() => null);

        const empreinte = tete?.ok ? empreinteFichier(tete.headers) : null;
        if (empreinte && empreinte === r.empreinte) {
          ligne.trouves = 0;
          (ligne as Record<string, unknown>).inchange = true;
          await doc.ref.update({
            dernierPassage: admin.firestore.FieldValue.serverTimestamp(),
            derniereErreur: admin.firestore.FieldValue.delete(),
          });
          rapport.push(ligne);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (empreinte) nouvelleEmpreinte = empreinte;
        candidats = [{ url: r.pageUrl!, texte: "lien direct" }];
      } else {
        const page = await fetch(r.pageUrl!, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20_000),
        });
        if (!page.ok) throw new Error(`page HTTP ${page.status}`);
        candidats = reglementsCandidats(await page.text(), r.pageUrl!).slice(0, CANDIDATS_PAR_PAGE);
      }
      ligne.trouves = candidats.length;

      for (const c of candidats) {
        const pdf = await fetch(c.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
        if (!pdf.ok) continue;

        const octets = Buffer.from(await pdf.arrayBuffer());
        if (octets.length > TAILLE_MAX || octets.length < TAILLE_MIN) continue;

        // `ingererReglement` identifie d'abord : un document déjà connu ou plus
        // ancien s'arrête là, sans analyse de fond. L'agent n'a donc pas à
        // comparer lui-même les versions.
        const res = await ingererReglement(
          [{ mimeType: "application/pdf", base64: octets.toString("base64") }],
          { source: "veille", auteur: c.url },
        );
        (ligne.resultats as unknown[]).push({ statut: res.statut, caisse: res.caisse, url: c.url });
      }

      await doc.ref.update({
        dernierPassage: admin.firestore.FieldValue.serverTimestamp(),
        derniereErreur: admin.firestore.FieldValue.delete(),
        ...(nouvelleEmpreinte ? { empreinte: nouvelleEmpreinte } : {}),
      });
    } catch (e) {
      ligne.erreur = (e as Error).message;
      // Horodaté MÊME en cas d'échec : sans cela, une page en panne serait
      // retentée à chaque passage et bloquerait la file.
      await doc.ref.update({
        dernierPassage: admin.firestore.FieldValue.serverTimestamp(),
        derniereErreur: (e as Error).message.slice(0, 200),
      }).catch(() => {});
    }

    rapport.push(ligne);
    // Courtoisie envers des serveurs qui ne nous doivent rien.
    await new Promise((r) => setTimeout(r, 2000));
  }

  return NextResponse.json({
    ok: true,
    enBibliotheque: tous.size,
    surveillables: surveillables.length,
    sansUrl: tous.size - surveillables.length,
    visites: aFaire.length,
    rapport,
  });
}
