// app/api/admin/rdv/route.ts
//
// Rendez-vous d'un client : création, liste, annulation.
//
// TROIS ÉCRITURES, UNE SEULE QUI FAIT FOI
// ---------------------------------------
// Poser un rendez-vous touche trois systèmes : Google Agenda (le conseiller doit
// le voir dans son planning), Firestore (l'aperçu du dossier et le rappel SMS le
// lisent), et SendGrid (le client reçoit sa confirmation). Ils ne peuvent pas
// être transactionnels ensemble, alors l'ordre porte la garantie :
//
//   1. Google d'abord. S'il échoue, rien n'a eu lieu — on renvoie l'erreur et le
//      conseiller retente. C'est le seul système où un doublon serait pénible à
//      rattraper à la main.
//   2. Firestore ensuite. C'est la source du rappel SMS et de l'aperçu : sans
//      elle, le rendez-vous existerait dans l'agenda mais aucun rappel ne
//      partirait. Si elle échoue, on RETIRE l'événement Google pour ne pas
//      laisser un rendez-vous fantôme, invisible du CRM.
//   3. L'e-mail en dernier, NON BLOQUANT. Un envoi raté ne doit pas annuler un
//      rendez-vous bien réel : on le signale dans la réponse (`emailEnvoye`)
//      pour que le conseiller puisse prévenir autrement.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";
import {
  creerEvenement,
  supprimerEvenement,
  AGENDA_NON_PARTAGE,
} from "@/lib/server/agendaConseiller";
import { TZ } from "@/lib/core/tempsSuisse";
import { sendCreditXRendezVousEmail } from "lib/mail/creditx-mailer";
import { sendSms, twilioConfigured } from "@/lib/server/twilio";
import { versE164, messageRappel, heureDe, motDuJour, rappelARattraper } from "@/lib/server/rappelRdv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

/** « jeudi 4 septembre 2026 à 14:30 » — utilisé dans l'e-mail et le SMS. */
export function quandLisible(d: Date): string {
  const jour = new Intl.DateTimeFormat("fr-CH", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d);
  const heure = new Intl.DateTimeFormat("fr-CH", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${jour} à ${heure}`;
}

async function fiche(uid: string) {
  const [racine, dp] = await Promise.all([
    db.doc(`clients/${uid}`).get(),
    db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
  ]);
  const c = racine.data() || {};
  const d = dp.data() || {};
  return {
    prenom: d.Enter_prenom || c.firstName || "",
    nom: d.Enter_nom || c.lastName || "",
    email: c.email || d.Enter_email || "",
    telephone: d.Enter_telephone || "",
  };
}

/** Carte de visite du conseiller (même source que le dossier PDF). */
async function conseillerDe(decoded: any) {
  const snap = await db.doc(`staff/${decoded.uid}`).get();
  const s = snap.data() || {};
  return {
    email: decoded?.email || "",
    nom: str(s.nom) || decoded?.email || "Votre conseiller",
    fonction: str(s.fonction),
    agence: str(s.agence),
  };
}

/* -------------------------------------------------------------------------- */

/** Rendez-vous d'un client, du plus proche au plus lointain. */
export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  // `avenir=1` : seulement ceux qui restent à venir (carte de l'aperçu).
  const seulementAVenir = req.nextUrl.searchParams.get("avenir") === "1";

  try {
    // Tri en mémoire : la collection compte quelques documents par client, et
    // un `where` + `orderBy` exigerait un index composite pour rien.
    const snap = await db.collection(`clients/${uid}/rendezvous`).get();
    const maintenant = Date.now();

    const rendezvous = snap.docs
      .map((d) => {
        const x = d.data();
        const debut = x.debut?.toDate?.() || null;
        return {
          id: d.id,
          debut: debut ? debut.toISOString() : null,
          fin: x.fin?.toDate?.()?.toISOString() || null,
          objectif: x.objectif || "",
          lieu: x.lieu || "",
          conseiller: x.conseiller || null,
          rappelSms: !!x.rappelSms,
          rappelDocuments: !!x.rappelDocuments,
          smsEnvoyeLe: x.smsEnvoyeLe?.toDate?.()?.toISOString() || null,
          annule: !!x.annule,
        };
      })
      .filter((r) => r.debut && !r.annule)
      .filter((r) => (seulementAVenir ? new Date(r.debut!).getTime() > maintenant : true))
      .sort((a, b) => String(a.debut).localeCompare(String(b.debut)));

    return NextResponse.json({ rendezvous });
  } catch (e: any) {
    console.error("[rdv] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

/** Pose un rendez-vous : agenda, fiche client, e-mail. */
export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const debut = new Date(body?.debut);
  const fin = new Date(body?.fin);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) {
    return NextResponse.json({ error: "Créneau invalide" }, { status: 400 });
  }
  if (debut.getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce créneau est déjà passé" }, { status: 400 });
  }

  const objectif = str(body?.objectif, 120);
  const lieu = str(body?.lieu, 200);
  // Les deux rappels sont ACTIVÉS PAR DÉFAUT : `!== false` et non `=== true`,
  // pour qu'un champ absent vaille « activé » et non « désactivé ».
  const rappelSms = body?.rappelSms !== false;
  const rappelDocuments = body?.rappelDocuments !== false;

  const [client, conseiller] = await Promise.all([fiche(uid), conseillerDe(decoded)]);
  if (!conseiller.email) {
    return NextResponse.json({ error: "Compte conseiller sans e-mail" }, { status: 400 });
  }

  const nomComplet = `${client.prenom} ${client.nom}`.trim() || "Client";

  // 1. Google Agenda — si ça échoue, rien n'a eu lieu.
  let eventId: string;
  try {
    eventId = await creerEvenement(conseiller.email, {
      titre: `Prévoyance — ${nomComplet}`,
      description: [
        objectif ? `Objet : ${objectif}` : "",
        client.email ? `E-mail : ${client.email}` : "",
        client.telephone ? `Téléphone : ${client.telephone}` : "",
        `Fiche : /admin/clients/${uid}`,
      ].filter(Boolean).join("\n"),
      debut,
      fin,
      lieu,
      invites: client.email ? [client.email] : [],
    });
  } catch (e: any) {
    if (e?.message === AGENDA_NON_PARTAGE) {
      return NextResponse.json(
        {
          error: "AGENDA_NON_PARTAGE",
          message: "Accès à votre agenda refusé. La délégation au niveau du domaine doit être autorisée dans la console d'administration Google (Sécurité → Accès aux données → Délégation), avec le champ d'application Calendar.",
        },
        { status: 409 },
      );
    }
    console.error("[rdv] agenda:", e?.message || e);
    return NextResponse.json({ error: "Création dans l'agenda impossible" }, { status: 502 });
  }

  // 2. Firestore — source du rappel SMS et de l'aperçu. En cas d'échec on
  //    retire l'événement, sinon le rendez-vous n'existerait que dans l'agenda.
  const ref = db.collection(`clients/${uid}/rendezvous`).doc();
  try {
    await ref.set({
      debut,
      fin,
      objectif,
      lieu,
      eventId,
      conseiller,
      client: { nom: nomComplet, email: client.email, telephone: client.telephone },
      rappelSms,
      rappelDocuments,
      smsEnvoyeLe: null,
      annule: false,
      creePar: decoded?.email || decoded?.uid || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    console.error("[rdv] firestore:", e?.message || e);
    await supprimerEvenement(conseiller.email, eventId).catch(() => {});
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }

  // 3. E-mail — non bloquant : le rendez-vous existe déjà.
  let emailEnvoye = false;
  if (client.email) {
    try {
      await sendCreditXRendezVousEmail({
        to: client.email,
        prenom: client.prenom || "Madame, Monsieur",
        debut,
        fin,
        quandLisible: quandLisible(debut),
        conseiller: {
          nom: conseiller.nom, fonction: conseiller.fonction,
          agence: conseiller.agence,
          // L'e-mail vient du JETON du conseiller connecté : le message part donc
          // de l'adresse avec laquelle il s'est authentifié, jamais d'une saisie.
          email: conseiller.email,
        },
        lieu,
        objectif,
        rappelDocuments,
      });
      emailEnvoye = true;
    } catch (e: any) {
      console.error("[rdv] e-mail:", e?.message || e);
    }
  }

  // 4. Rappel SMS À RATTRAPER — non bloquant, comme l'e-mail.
  //    Le passage quotidien traite les rendez-vous du lendemain à 10:00. Un
  //    rendez-vous posé pour demain APRÈS cette heure ne serait vu par aucun
  //    passage : ni celui d'aujourd'hui (terminé), ni celui de demain (qui
  //    regarde le surlendemain). On l'envoie donc tout de suite.
  let smsEnvoye = false;
  if (rappelSms && rappelARattraper(debut)) {
    const numero = versE164(client.telephone);
    if (numero && twilioConfigured()) {
      try {
        await sendSms(numero, messageRappel(heureDe(debut), rappelDocuments, motDuJour(debut)));
        // Marqué comme envoyé : le cron ne doit pas le renvoyer demain.
        await ref.set({ smsEnvoyeLe: FieldValue.serverTimestamp() }, { merge: true });
        smsEnvoye = true;
      } catch (e: any) {
        console.error("[rdv] SMS de rattrapage:", e?.message || e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    id: ref.id,
    emailEnvoye,
    // `true` : parti à l'instant. `false` : programmé pour la veille à 10:00.
    smsEnvoyeMaintenant: smsEnvoye,
    // Le conseiller doit savoir pourquoi le client ne recevra rien.
    motifSansEmail: client.email ? (emailEnvoye ? null : "envoi_echoue") : "client_sans_email",
    smsPossible: rappelSms ? !!client.telephone : null,
  });
}

/** Annule un rendez-vous : retire l'événement et marque la fiche. */
export async function DELETE(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  const id = req.nextUrl.searchParams.get("id");
  if (!uid || !id) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

  try {
    const ref = db.doc(`clients/${uid}/rendezvous/${id}`);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Rendez-vous introuvable" }, { status: 404 });

    const x = snap.data() || {};
    if (x.eventId && x.conseiller?.email) {
      await supprimerEvenement(x.conseiller.email, x.eventId).catch((e) =>
        console.error("[rdv] retrait agenda:", e?.message || e),
      );
    }

    // Marqué annulé plutôt que supprimé : on garde la trace du rendez-vous qui
    // a existé, et le rappel SMS l'ignore (il ne lit que les non-annulés).
    await ref.set({ annule: true, annuleLe: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[rdv] annulation:", e?.message || e);
    return NextResponse.json({ error: "Annulation impossible" }, { status: 500 });
  }
}
