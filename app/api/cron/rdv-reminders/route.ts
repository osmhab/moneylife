// app/api/cron/rdv-reminders/route.ts
//
// Rappel SMS des rendez-vous du LENDEMAIN. Déclenché une fois par jour par
// Cloud Scheduler (même montage que `creditx-reminders`).
//
// POURQUOI UN PASSAGE QUOTIDIEN, ET NON « 24 H PILE AVANT »
// ---------------------------------------------------------
// Le message dit « demain à hh:mm ». Un envoi à 24 h pile d'un rendez-vous de
// 8 h partirait à 8 h la veille, celui d'un rendez-vous de 18 h à 18 h : deux
// clients recevraient « demain » à dix heures d'écart, et celui de 18 h aurait
// sa soirée déjà prise. Un passage quotidien en milieu de matinée envoie tous
// les rappels de la journée du lendemain au même moment — ce que « demain »
// veut dire pour un client.
//
// CE PASSAGE NE SUFFIT PAS À LUI SEUL
// -----------------------------------
// Un rendez-vous fixé pour demain APRÈS l'heure de ce passage ne serait vu par
// aucun autre : celui d'aujourd'hui est terminé, celui de demain regarde le
// surlendemain. La prise de rendez-vous envoie donc elle-même le rappel quand
// l'instant prévu est déjà passé (cf. `rappelARattraper`). Ce cron reste le
// chemin normal ; il n'est pas le seul.
//
// IDEMPOTENCE
// -----------
// `smsEnvoyeLe` est écrit après chaque envoi et relu au passage suivant : un
// double déclenchement (reprise après incident, Scheduler qui réessaie) ne
// renvoie donc jamais deux SMS au même client.

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendSms, twilioConfigured } from "@/lib/server/twilio";
import { instantSuisse, jourSuisse, decoupeDate } from "@/lib/core/tempsSuisse";
import { versE164, messageRappel, heureDe, motDuJour } from "@/lib/server/rappelRdv";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu || req.headers.get("authorization") !== `Bearer ${attendu}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!twilioConfigured()) {
    return NextResponse.json({ error: "Twilio non configuré" }, { status: 500 });
  }

  // Bornes du LENDEMAIN en heure suisse (et non en UTC : un rendez-vous à 00:30
  // ou 23:30 tomberait sinon du mauvais côté de la frontière de journée).
  const [a, m, j] = decoupeDate(jourSuisse(new Date()));
  const debutDemain = instantSuisse(a, m, j + 1, 0, 0);
  const finDemain = instantSuisse(a, m, j + 2, 0, 0);

  const resultats = { examines: 0, envoyes: 0, ignores: 0, echecs: 0 };
  const details: string[] = [];

  try {
    const snap = await db
      .collectionGroup("rendezvous")
      .where("debut", ">=", debutDemain)
      .where("debut", "<", finDemain)
      .get();

    for (const doc of snap.docs) {
      const r = doc.data();
      resultats.examines++;

      // Les autres conditions sont filtrées ICI plutôt que dans la requête :
      // les cumuler côté Firestore exigerait un index composite, pour un volume
      // qui tient dans une journée de rendez-vous.
      if (r.annule) { resultats.ignores++; continue; }
      if (!r.rappelSms) { resultats.ignores++; continue; }
      if (r.smsEnvoyeLe) { resultats.ignores++; continue; }

      // ⚠️ Le numéro est RELU sur la fiche du client, jamais pris dans le
      // document de rendez-vous. Les règles Firestore autorisent un client à
      // écrire sous `clients/{sonUid}/**` : sans cela, il pourrait fabriquer un
      // rendez-vous portant un numéro arbitraire et se servir de notre compte
      // Twilio comme relais. La fiche, elle, n'est modifiable que par lui-même
      // pour SON propre numéro. Effet de bord utile : un numéro corrigé après
      // la prise du rendez-vous est automatiquement pris en compte.
      const clientUid = doc.ref.parent.parent?.id;
      if (!clientUid) { resultats.ignores++; continue; }

      const dp = (await db.doc(`clients/${clientUid}/DonneePersonnelles/current`).get()).data();
      const numero = versE164(dp?.Enter_telephone || "");
      if (!numero) {
        resultats.ignores++;
        details.push(`${doc.ref.path} : numéro inutilisable (${dp?.Enter_telephone || "vide"})`);
        continue;
      }

      const debut = r.debut.toDate();
      try {
        await sendSms(numero, messageRappel(heureDe(debut), !!r.rappelDocuments, motDuJour(debut)));
        // Marqué APRÈS l'envoi : en cas d'incident on préfère un rappel
        // éventuellement manquant à un client qui n'en reçoit jamais.
        await doc.ref.set({ smsEnvoyeLe: FieldValue.serverTimestamp() }, { merge: true });
        resultats.envoyes++;
      } catch (e: any) {
        resultats.echecs++;
        details.push(`${doc.ref.path} : ${String(e?.message || e).slice(0, 160)}`);
      }
    }

    if (details.length) console.error("[cron/rdv-reminders]", details.join(" | "));
    return NextResponse.json({ ok: true, pour: jourSuisse(debutDemain), ...resultats, details });
  } catch (e: any) {
    console.error("[cron/rdv-reminders]", e?.message || e);
    return NextResponse.json({ error: "Échec du passage", detail: String(e?.message || e) }, { status: 500 });
  }
}
