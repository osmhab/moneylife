// app/api/cron/reminders/route.ts
//
// Balayage QUOTIDIEN des échéances. Deux volets indépendants :
//
//   1. OFFRES en attente de signature — rappels à J-30/15/7/3/1, puis passage
//      en EXPIRED quand la date est dépassée.
//   2. CONTRATS actifs — rappels d'échéance à J-180/90/30/7, avec le montant
//      versé et, le cas échéant, la mention de l'imposition du capital.
//
// IDEMPOTENCE — le point critique.
// Chaque jalon pose SON PROPRE drapeau (`metadata.reminders.offer_J7 = true`).
// Sans ça, deux exécutions le même jour enverraient deux fois le même message.
// À l'inverse, un drapeau unique pour tous les jalons — l'erreur du cron
// `agent-profile`, dont le `missingProfileSent` n'est jamais réinitialisé et qui
// n'envoie donc QU'UN SEUL rappel par client à vie — étoufferait les suivants.
//
// Les notifications passent par `notifyClient`, donc deviennent automatiquement
// des push (cf. Cloud Function `onNotificationCreated`). Rien à câbler ici.

import { NextResponse } from "next/server";
import { db, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyClient } from "@/lib/server/notify";
import {
  sendCreditXOfferExpiringEmail,
  sendCreditXOfferExpiredEmail,
  sendCreditXContractMaturityEmail,
  sendCreditXLppCertificateEmail,
} from "lib/mail/creditx-mailer";
import {
  isOfferExpired,
  daysUntilExpiry,
  reachedMilestone,
  reachedContractMilestone,
  reachedLppCertMilestone,
} from "@/lib/core/offerExpiry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/** Formate une date stockée ("aaaa-mm-jj" ou "jj.mm.aaaa") en "jj.mm.aaaa". */
function displayDate(raw: string | undefined): string {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[3].padStart(2, "0")}.${iso[2].padStart(2, "0")}.${iso[1]}`;
  return raw;
}

const chf = (n: number) => new Intl.NumberFormat("fr-CH").format(Math.round(n)).replace(/\s/g, "'");

interface Destinataire {
  email: string | null;
  firstName: string;
  locale: string;
}

/**
 * Coordonnées du client, avec CACHE pour la durée du balayage.
 * Un même client peut avoir plusieurs plans concernés le même jour ; sans cache,
 * on relirait son profil autant de fois.
 */
function makeClientLookup() {
  const cache = new Map<string, Destinataire>();
  return async function lookup(uid: string): Promise<Destinataire> {
    const hit = cache.get(uid);
    if (hit) return hit;

    let out: Destinataire = { email: null, firstName: "Client", locale: "fr" };
    try {
      const snap = await db.doc(`clients/${uid}/DonneePersonnelles/current`).get();
      const d = snap.data() ?? {};
      out = {
        email: d.Enter_email ?? null,
        firstName: d.Enter_prenom || "Client",
        locale: d.locale || d.Enter_langue || "fr",
      };
      // Repli sur Auth : l'e-mail manque souvent dans DonneePersonnelles alors
      // que le compte en a forcément un (cf. send-contract-activated).
      if (!out.email) {
        const user = await authAdmin.getUser(uid).catch(() => null);
        if (user?.email) out.email = user.email;
      }
    } catch (e) {
      console.warn(`[cron/reminders] profil illisible pour ${uid}`, e);
    }
    cache.set(uid, out);
    return out;
  };
}

/**
 * Envoie un e-mail sans jamais faire échouer le balayage.
 * Un client dont l'adresse est invalide ne doit pas priver les suivants de leur
 * rappel — et la notification in-app, elle, est déjà partie.
 */
async function safeMail(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[cron/reminders] e-mail ${label} échoué :`, e);
  }
}

/** Texte du rappel d'offre : le ton monte à mesure que l'échéance approche. */
function offerReminderText(days: number, institution: string) {
  if (days <= 1) {
    return {
      title: "Dernier jour pour signer",
      content: `Votre offre ${institution} expire demain. Passé ce délai, elle ne pourra plus être signée.`,
    };
  }
  if (days <= 3) {
    return {
      title: `Plus que ${days} jours pour signer`,
      content: `Votre offre ${institution} expire bientôt. Signez-la depuis votre espace pour l'activer.`,
    };
  }
  return {
    title: `Il vous reste ${days} jours`,
    content: `Votre offre ${institution} vous attend. Elle reste signable encore ${days} jours.`,
  };
}

/**
 * Texte du rappel d'échéance de contrat.
 *
 * Volet fiscal : on informe SANS calculer. Le barème du versement en capital
 * dépend du canton, du montant et de la situation familiale — annoncer un
 * montant d'impôt dans un e-mail automatique reviendrait à donner un conseil
 * fiscal chiffré, ce qui n'est pas notre métier et se retourne à la moindre
 * erreur de barème. On mentionne le principe et on propose un rendez-vous.
 */
function contractReminderText(days: number, institution: string, dateStr: string, capital: number) {
  const quand = days >= 180 ? "dans six mois" : days >= 90 ? "dans trois mois" : days >= 30 ? "dans un mois" : "dans une semaine";

  if (capital > 0) {
    return {
      title: `Votre contrat ${institution} arrive à échéance`,
      content:
        `Échéance le ${dateStr}, soit ${quand}. Un capital d'environ CHF ${chf(capital)} vous sera versé. ` +
        `Ce versement est imposé séparément de vos autres revenus, à un taux réduit qui varie selon votre canton. ` +
        `Nous restons à disposition pour en parler par téléphone.`,
    };
  }
  return {
    title: `Votre couverture ${institution} arrive à échéance`,
    content:
      `Votre contrat prend fin le ${dateStr}, soit ${quand}. Aucun capital n'est prévu à cette date : ` +
      `c'est votre COUVERTURE d'assurance qui s'arrête. Parlons-en pour étudier la suite.`,
  };
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const report = { offersExpired: 0, offerReminders: 0, contractReminders: 0, lppCertReminders: 0, emails: 0, errors: 0 };
  const lookupClient = makeClientLookup();

  try {
    /* ---------------------------------------------------------------- */
    /* 1. OFFRES en attente de signature                                 */
    /* ---------------------------------------------------------------- */
    const offers = await db.collectionGroup("plans").where("status", "==", "PENDING_CLIENT").get();

    for (const docSnap of offers.docs) {
      try {
        const plan = docSnap.data() as any;
        const uid = docSnap.ref.parent.parent?.id;
        if (!uid) continue;

        const expiresAt: string | undefined = plan.metadata?.offerExpiresAt;
        if (!expiresAt) continue; // offres antérieures à ce champ : on ne touche à rien

        const institution = plan.institutionName || "votre assureur";

        // a) Dépassée → état terminal + information du client.
        if (isOfferExpired(expiresAt)) {
          await docSnap.ref.update({
            status: "EXPIRED",
            "metadata.expiredAt": FieldValue.serverTimestamp(),
          });
          await notifyClient({
            uid,
            title: "Votre offre a expiré",
            content: `L'offre ${institution} n'a pas été signée dans le délai imparti. Contactez votre conseiller pour en obtenir une nouvelle.`,
            category: "OFFRE",
            type: "error",
            actionUrl: "/dashboard/prevoyance?tab=prive",
          });
          const dest = await lookupClient(uid);
          if (dest.email) {
            await safeMail("offre expirée", () =>
              sendCreditXOfferExpiredEmail({
                to: dest.email!,
                firstName: dest.firstName,
                institutionName: institution,
                expiryDate: displayDate(expiresAt),
                locale: dest.locale,
              })
            );
            report.emails++;
          }
          report.offersExpired++;
          continue;
        }

        // b) Jalon atteint → rappel, une seule fois par jalon.
        const milestone = reachedMilestone(expiresAt);
        if (milestone === null) continue;

        const flag = `offer_J${milestone}`;
        if (plan.metadata?.reminders?.[flag]) continue;

        const { title, content } = offerReminderText(milestone, institution);
        await notifyClient({
          uid,
          title,
          content,
          category: "OFFRE",
          actionUrl: "/dashboard/prevoyance?tab=prive",
        });
        const dest = await lookupClient(uid);
        if (dest.email) {
          await safeMail(`offre J-${milestone}`, () =>
            sendCreditXOfferExpiringEmail({
              to: dest.email!,
              firstName: dest.firstName,
              institutionName: institution,
              daysLeft: milestone,
              expiryDate: displayDate(expiresAt),
              locale: dest.locale,
            })
          );
          report.emails++;
        }

        // Le drapeau n'est pose qu'APRES les envois : si le processus meurt
        // avant, le jalon sera retente demain plutot que perdu en silence.
        await docSnap.ref.update({ [`metadata.reminders.${flag}`]: true });
        report.offerReminders++;
      } catch (e) {
        console.error("[cron/reminders] offre:", docSnap.ref.path, e);
        report.errors++;
      }
    }

    /* ---------------------------------------------------------------- */
    /* 2. CONTRATS actifs                                                */
    /* ---------------------------------------------------------------- */
    const actifs = await db.collectionGroup("plans").where("status", "==", "ACTIVE").get();

    for (const docSnap of actifs.docs) {
      try {
        const plan = docSnap.data() as any;
        const uid = docSnap.ref.parent.parent?.id;
        if (!uid) continue;

        const dateEcheance: string | undefined = plan.data?.dateEcheance;
        if (!dateEcheance) continue; // pas d'échéance connue → rien à annoncer

        const milestone = reachedContractMilestone(dateEcheance);
        if (milestone === null) continue;

        const flag = `contract_J${milestone}`;
        if (plan.metadata?.reminders?.[flag]) continue;

        const institution = plan.institutionName || "votre assureur";
        // Capital attendu : la projection de l'assureur fait foi si elle existe
        // (règle §2.3 de CLAUDE.md), sinon la valeur de rachat actuelle.
        const capital =
          Number(plan.data?.projectionAssureur) > 0
            ? Number(plan.data.projectionAssureur)
            : Number(plan.data?.valeurRachatActuelle) || 0;

        const { title, content } = contractReminderText(
          milestone,
          institution,
          displayDate(dateEcheance),
          capital
        );
        await notifyClient({
          uid,
          title,
          content,
          category: "PREVOYANCE",
          actionUrl: "/dashboard/prevoyance?tab=prive",
        });
        const dest = await lookupClient(uid);
        if (dest.email) {
          await safeMail(`contrat J-${milestone}`, () =>
            sendCreditXContractMaturityEmail({
              to: dest.email!,
              firstName: dest.firstName,
              institutionName: institution,
              maturityDate: displayDate(dateEcheance),
              capital,
              locale: dest.locale,
            })
          );
          report.emails++;
        }

        await docSnap.ref.update({ [`metadata.reminders.${flag}`]: true });
        report.contractReminders++;
      } catch (e) {
        console.error("[cron/reminders] contrat:", docSnap.ref.path, e);
        report.errors++;
      }
    }

    /* ---------------------------------------------------------------- */
    /* 3. CERTIFICATS LPP — campagne annuelle a partir du 31 mars        */
    /* ---------------------------------------------------------------- */
    // Requete sur le TYPE et non le statut : les certificats LPP scannes n'ont
    // souvent aucun statut en base (27 plans dans ce cas), un filtre sur ACTIVE
    // en manquerait la majorite.
    const lppPlans = await db.collectionGroup("plans").where("type", "==", "LPP_BASE").get();

    for (const docSnap of lppPlans.docs) {
      try {
        const plan = docSnap.data() as any;
        const uid = docSnap.ref.parent.parent?.id;
        if (!uid) continue;

        const certYear = plan.data?.Enter_anneeCertificat;
        const milestone = reachedLppCertMilestone(certYear);
        if (milestone === null) continue;

        // Drapeau par ANNEE et par jalon : la campagne doit repartir a zero
        // chaque annee, ce qu'un drapeau unique interdirait a jamais.
        const flag = `lppCert_${new Date().getFullYear()}_J${milestone}`;
        if (plan.metadata?.reminders?.[flag]) continue;

        const caisse = plan.institutionName || "votre caisse de pension";
        const annee = new Date().getFullYear();
        const relance = milestone > 0;

        await notifyClient({
          uid,
          title: relance ? "Certificat LPP toujours attendu" : "Votre certificat LPP de l'année",
          content: relance
            ? `Nous n'avons pas encore votre certificat ${annee} de ${caisse}. Sans lui, votre analyse repose sur des chiffres de l'an dernier.`
            : `${caisse} a normalement émis votre certificat ${annee}. Remplacez l'ancien depuis votre espace pour que votre analyse reste juste.`,
          category: "LPP",
          actionUrl: "/dashboard/prevoyance",
        });

        const dest = await lookupClient(uid);
        if (dest.email) {
          await safeMail(`certificat LPP J+${milestone}`, () =>
            sendCreditXLppCertificateEmail({
              to: dest.email!,
              firstName: dest.firstName,
              institutionName: caisse,
              year: annee,
              previousYear: Number(certYear) || null,
              isFollowUp: relance,
              locale: dest.locale,
            })
          );
          report.emails++;
        }

        await docSnap.ref.update({ [`metadata.reminders.${flag}`]: true });
        report.lppCertReminders++;
      } catch (e) {
        console.error("[cron/reminders] certificat LPP:", docSnap.ref.path, e);
        report.errors++;
      }
    }

    console.log("[cron/reminders]", JSON.stringify(report));
    return NextResponse.json({ ok: true, ...report });
  } catch (e: any) {
    console.error("[cron/reminders] échec global:", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
