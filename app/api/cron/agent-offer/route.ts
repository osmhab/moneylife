// app/api/cron/agent-offer/route.ts
//
// Relance « votre prévoyance présente des lacunes ».
//
// HISTORIQUE — à lire avant de modifier.
// Une version précédente de cette route existait, appelée quotidiennement par le
// job Cloud Scheduler `agent-offer-11h`. Elle a disparu lors de la migration i18n
// (absente du disque ET de l'historique git) ; le job, lui, a survécu et renvoyait
// 404 depuis au moins 30 jours. Son texte disait « Vos informations sont complètes »
// puis « comblez vos lacunes » — une confirmation et une relance commerciale dans
// le même souffle, sans logique de ciblage apparente : tout client au profil
// complet était relancé, indéfiniment.
//
// Cette réécriture corrige les deux défauts : un message univoque, et surtout
// des EXCLUSIONS explicites. La règle de fond : on ne relance que les clients qui
// n'ont RIEN entrepris. Quiconque a déjà agi — souscrit chez nous, reçu une offre,
// ou refusé — doit être laissé tranquille.

import { NextResponse } from "next/server";
import { db, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { getTranslations } from "next-intl/server";
import { notifyClient } from "@/lib/server/notify";
import { sendCreditXAgentOfferEmail } from "lib/mail/creditx-mailer";
import { computeSituationAnalysis } from "@/lib/analysis/situation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/** Score global en dessous duquel on considère la lacune significative (0-100). */
const SCORE_THRESHOLD = 80;
/** Délai entre deux relances. */
const COOLDOWN_DAYS = 90;
/** Nombre total de relances par client, sur toute sa vie. */
const MAX_NUDGES = 3;
/** Fenêtre pendant laquelle un refus d'offre protège le client. */
const REJECTION_SHIELD_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Un plan « en cours » : le client a déjà quelque chose sur la table. */
const IN_PROGRESS = ["PENDING_CLIENT", "PENDING_INSURANCE", "PROPOSITION"];

function toMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Décide si un client doit être relancé, et pourquoi pas le cas échéant.
 * Renvoyer le MOTIF permet d'auditer le ciblage dans les logs plutôt que de
 * constater après coup qu'on a écrit à quelqu'un qu'il fallait épargner.
 */
function evaluate(plans: any[], nudge: any, now: number): { send: boolean; reason: string } {
  // 1. A souscrit CHEZ CREDITX → il a fait affaire avec nous, on le laisse.
  //    Un contrat SCANNÉ (origin "external") ne compte pas : le client a un 3a
  //    ailleurs, il peut tout à fait avoir encore des lacunes — c'est même la
  //    cible la plus légitime.
  //    `!status` = plans hérités sans statut, traités comme actifs (comme l'iOS).
  const creditxContract = plans.some(
    (p) => p.origin === "creditx" && (p.status === "ACTIVE" || !p.status)
  );
  if (creditxContract) return { send: false, reason: "contrat souscrit chez CreditX" };

  // 2. Une offre l'attend déjà → le cron d'échéances s'en occupe.
  if (plans.some((p) => IN_PROGRESS.includes(p.status))) {
    return { send: false, reason: "offre en cours" };
  }

  // 3. Refus récent → le relancer juste après est le meilleur moyen de le perdre.
  const recentlyRejected = plans.some((p) => {
    if (p.status !== "REJECTED_CLIENT") return false;
    const at = toMillis(p.metadata?.rejectedAt);
    return at === null || now - at < REJECTION_SHIELD_DAYS * DAY_MS;
  });
  if (recentlyRejected) return { send: false, reason: "refus récent" };

  // 4. Quota de vie atteint.
  if ((nudge?.count ?? 0) >= MAX_NUDGES) return { send: false, reason: "quota atteint" };

  // 5. Délai de carence.
  const last = toMillis(nudge?.lastSentAt);
  if (last !== null && now - last < COOLDOWN_DAYS * DAY_MS) {
    return { send: false, reason: "carence" };
  }

  return { send: true, reason: "" };
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Mode SIMULATION (?dryRun=1) : tout est calcule, RIEN n'est envoye ni ecrit.
  // Indispensable pour auditer le ciblage avant d'ecrire a de vrais clients —
  // une regle d'exclusion mal posee ne se rattrape pas apres l'envoi.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  const now = Date.now();
  const report = {
    dryRun,
    scanned: 0,
    sent: 0,
    skipped: {} as Record<string, number>,
    wouldSend: [] as string[],
    errors: 0,
  };
  const skip = (r: string) => { report.skipped[r] = (report.skipped[r] ?? 0) + 1; };

  try {
    const clients = await db.collection("clients").get();

    for (const clientDoc of clients.docs) {
      const uid = clientDoc.id;
      const client = clientDoc.data();
      report.scanned++;

      try {
        // Compte archivé ou supprimé : hors de question de le relancer.
        //
        // ATTENTION au champ `status` de `clients/{uid}` : il porte DEUX
        // vocabulaires qui se chevauchent. `/api/admin/clients/status` y écrit
        // active/archived/deleted (cycle de vie du compte), tandis que
        // `/api/admin/create-client` y écrit "Nouveau" (statut de LEAD).
        // Tester `!== "active"` excluait donc tous les clients créés par l'admin —
        // dont huit qui ont un contrat CreditX actif et que ce cron devait
        // justement épargner pour une TOUTE AUTRE raison. On ne teste donc que
        // les états d'archivage explicites.
        if (client.status === "archived" || client.status === "deleted") {
          skip("compte archivé");
          continue;
        }

        const [analyseSnap, persoSnap, plansSnap] = await Promise.all([
          db.doc(`clients/${uid}/Analyse/current`).get(),
          db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
          db.collection(`clients/${uid}/plans`).get(),
        ]);

        const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        const verdict = evaluate(plans, client.aiEmails?.offerNudge, now);
        if (!verdict.send) { skip(verdict.reason); continue; }

        // Lacune réelle ? Sans analyse exploitable, on s'abstient : mieux vaut
        // ne rien envoyer que relancer quelqu'un sur des chiffres qu'on n'a pas.
        const cloudData = { ...(analyseSnap.data() || {}), ...(persoSnap.data() || {}) };
        const analysis = computeSituationAnalysis({ cloudData, plans });
        if (!analysis) { skip("analyse indisponible"); continue; }
        if (analysis.totalScore >= SCORE_THRESHOLD) { skip("pas de lacune significative"); continue; }

        const perso = persoSnap.data() ?? {};
        let email: string | null = perso.Enter_email ?? null;
        if (!email) {
          const user = await authAdmin.getUser(uid).catch(() => null);
          email = user?.email ?? null;
        }
        if (!email) { skip("pas d'e-mail"); continue; }

        // Adresses INTERNES : comptes de test et collaborateurs. Ils ont de vraies
        // lacunes et un vrai profil, donc rien ne les distingue d'un client dans
        // les données — seul le domaine les trahit. Même liste que `isInternal()`
        // dans firestore.rules, pour ne pas avoir deux définitions du « nous ».
        if (/@(creditx|moneylife)\.ch$/i.test(email)) { skip("adresse interne"); continue; }

        const locale = perso.locale || perso.Enter_langue || "fr";
        const t = await getTranslations({ locale, namespace: "Emails.GapNudge" });

        const bodyHtml = `
          <p>${t("intro")}</p>
          <div style="background:#f8fafc; padding:20px; border-radius:12px; margin:24px 0; border:1px solid #e2e8f0;">
            <p style="margin:0 0 8px 0; font-size:12px; font-weight:bold; color:#475569; text-transform:uppercase; letter-spacing:0.05em;">${t("gap_title")}</p>
            <p style="margin:0; font-size:14px; color:#1A1A1A;">${t("gap_body")}</p>
          </div>
          <p>${t("action")}</p>
          <p>${t("outro")}</p>
          <p style="font-size:12px; color:#94a3b8; margin-top:28px;">${t("unsub_hint")}</p>
        `;

        if (dryRun) {
          report.wouldSend.push(`${email} (score ${analysis.totalScore})`);
          report.sent++;
          continue;
        }

        await sendCreditXAgentOfferEmail({
          to: email,
          firstName: perso.Enter_prenom || "",
          subject: t("subject"),
          bodyHtml,
          locale,
        });

        await notifyClient({
          uid,
          title: "Votre prévoyance présente des lacunes",
          content: "Générez une proposition personnalisée depuis votre espace pour voir comment les combler.",
          category: "PREVOYANCE",
          actionUrl: "/dashboard/prevoyance",
        });

        // Compteur ET date : le quota seul laisserait trois envois d'affilée,
        // la date seule ne plafonnerait jamais le total.
        await clientDoc.ref.set(
          {
            aiEmails: {
              offerNudge: {
                count: (client.aiEmails?.offerNudge?.count ?? 0) + 1,
                lastSentAt: FieldValue.serverTimestamp(),
              },
            },
          },
          { merge: true }
        );
        report.sent++;
      } catch (e) {
        console.error(`[cron/agent-offer] ${uid}`, e);
        report.errors++;
      }
    }

    console.log("[cron/agent-offer]", JSON.stringify(report));
    return NextResponse.json({ ok: true, ...report });
  } catch (e: any) {
    console.error("[cron/agent-offer] échec global:", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
