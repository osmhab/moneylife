// app/api/cron/veille-reglements/route.ts
//
// AGENT DE VEILLE : va chercher les règlements sur le site des caisses.
//
// Attendre qu'un client scanne le règlement de sa caisse, c'est n'obtenir le
// document que le jour où quelqu'un y pense. Cet agent prend les devants :
// il visite les sites du registre, repère les règlements de prévoyance et
// n'analyse que ce qui est nouveau.
//
// TROIS PRINCIPES
// ---------------
// · SOURCE OFFICIELLE. On ne va que sur le site de la caisse elle-même, jamais
//   chez un agrégateur : un règlement périmé ou tronqué fausserait des analyses.
// · SOBRIÉTÉ. Une caisse est revue au plus une fois par mois — un règlement
//   change au plus une fois l'an. On se limite à quelques caisses par passage,
//   avec une pause entre deux sites : ce sont des serveurs qui ne nous doivent
//   rien.
// · LE DOUTE EXCLUT. Le tri des liens (cf. `veille.ts`) préfère manquer un
//   règlement qu'en ingérer un mauvais.

import { NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { reglementsCandidats, aRevisiter } from "app/lib/core/veille";
import { ingererReglement } from "app/lib/server/ingererReglement";

export const maxDuration = 300;

/** Caisses visitées par passage — le temps d'exécution est borné à 300 s. */
const CAISSES_PAR_PASSAGE = 4;
/** Règlements analysés par caisse : au-delà, c'est que le tri a laissé passer. */
const CANDIDATS_PAR_CAISSE = 2;
/** Un PDF de règlement dépasse rarement 20 Mo ; au-delà, c'est autre chose. */
const TAILLE_MAX = 20 * 1024 * 1024;

const UA = "CreditX-Veille/1.0 (+https://creditx.ch ; veille des reglements de prevoyance)";

export async function GET(req: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu || req.headers.get("authorization") !== `Bearer ${attendu}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const registre = await db.collection("caisses_registre").where("actif", "==", true).get();
  const aFaire = registre.docs
    .filter((d) => aRevisiter(d.data().dernierPassage?.toMillis?.() ?? null))
    .slice(0, CAISSES_PAR_PASSAGE);

  const rapport: Record<string, unknown>[] = [];

  for (const doc of aFaire) {
    const caisse = doc.data() as { nom?: string; site?: string };
    const ligne: Record<string, unknown> = { caisse: caisse.nom ?? doc.id, trouves: 0, ingeres: [] };

    try {
      if (!caisse.site) throw new Error("aucun site renseigné");

      const page = await fetch(caisse.site, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!page.ok) throw new Error(`site HTTP ${page.status}`);

      const candidats = reglementsCandidats(await page.text(), caisse.site).slice(0, CANDIDATS_PAR_CAISSE);
      ligne.trouves = candidats.length;

      for (const c of candidats) {
        const pdf = await fetch(c.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
        if (!pdf.ok) continue;

        const octets = Buffer.from(await pdf.arrayBuffer());
        // Un fichier hors gabarit n'est pas un règlement : on ne le passe pas à
        // l'analyse, qui coûterait pour rien.
        if (octets.length > TAILLE_MAX || octets.length < 10_000) continue;

        const r = await ingererReglement(
          [{ mimeType: "application/pdf", base64: octets.toString("base64") }],
          { source: "veille", auteur: c.url },
        );
        (ligne.ingeres as unknown[]).push({ url: c.url, statut: r.statut, caisse: r.caisse });
      }

      await doc.ref.update({
        dernierPassage: admin.firestore.FieldValue.serverTimestamp(),
        dernierResultat: `${candidats.length} candidat(s)`,
        derniereErreur: admin.firestore.FieldValue.delete(),
      });
    } catch (e) {
      ligne.erreur = (e as Error).message;
      // On horodate MÊME en cas d'échec : sans cela, un site en panne serait
      // retenté à chaque passage et bloquerait les autres caisses de la file.
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
    inscrites: registre.size,
    visitees: aFaire.length,
    rapport,
  });
}
