// app/lib/server/rappelRdv.ts
//
// Rappel SMS d'un rendez-vous : le texte, le numéro, et le MOMENT d'envoi.
//
// POURQUOI CE MODULE EXISTE
// -------------------------
// Le rappel partait uniquement d'un passage quotidien à 10:00 traitant les
// rendez-vous du lendemain. Ça laissait un trou permanent : un rendez-vous fixé
// pour demain APRÈS 10:00 n'était vu par aucun passage — celui du jour même
// était déjà terminé, et celui du lendemain regarde le surlendemain. Or prendre
// un rendez-vous en fin d'après-midi pour le lendemain matin est le cas le plus
// courant du métier. Le client ne recevait rien, sans que personne ne s'en
// aperçoive.
//
// La règle est donc exprimée par un INSTANT plutôt que par un passage :
// le rappel est dû à 10:00 la veille ; si cet instant est déjà passé au moment
// où l'on pose le rendez-vous, il part immédiatement. Le cron et la prise de
// rendez-vous partagent le même code, donc la même règle.

import { instantSuisse, jourSuisse, decoupeDate, TZ } from "@/lib/core/tempsSuisse";

/** Heure du passage quotidien (doit rester alignée sur la tâche Cloud Scheduler). */
export const HEURE_RAPPEL = 10;

/**
 * Numéro suisse → E.164, seul format accepté par Twilio.
 * « 079 123 45 67 », « 0041 79 … », « +41 79 … » désignent le même abonné ;
 * saisis tels quels, seuls les deux derniers partiraient.
 */
export function versE164(brut: string): string | null {
  const s = String(brut || "").replace(/[\s.\-()/]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (s.startsWith("00")) { const e = "+" + s.slice(2); return /^\+\d{8,15}$/.test(e) ? e : null; }
  // 0XXXXXXXXX → indicatif suisse. C'est le format saisi dans les fiches ;
  // un numéro étranger doit être saisi avec son + ou son 00.
  if (/^0\d{9}$/.test(s)) return "+41" + s.slice(1);
  return null;
}

/** Heure murale suisse « HH:MM » d'un instant. */
export function heureDe(d: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

/**
 * « demain » ou « aujourd'hui », selon la date du rendez-vous vue de maintenant.
 * Un rappel envoyé le jour même ne peut pas dire « demain » — c'est le cas quand
 * le rendez-vous est pris tardivement pour le lendemain… ou pour le jour même.
 */
export function motDuJour(debut: Date, maintenant = new Date()): "demain" | "aujourd'hui" {
  return jourSuisse(debut) === jourSuisse(maintenant) ? "aujourd'hui" : "demain";
}

/** Le message, au mot près, avec le bloc documents en option. */
export function messageRappel(
  heure: string,
  rappelDocuments: boolean,
  quand: "demain" | "aujourd'hui" = "demain",
): string {
  const base =
    "Bonjour,\n" +
    "Nous vous rappelons votre rendez-vous de prévoyance avec votre Conseiller CreditX\n\n" +
    `${quand} à ${heure}\n`;

  const documents = rappelDocuments
    ? "\nN'oubliez pas de prendre vos documents de prévoyance avec vous.\n\n" +
      "- Certificat de prévoyance\n" +
      "- Polices / comptes de 3e pilier\n" +
      "- tout autre document qui vous semble pertinent\n"
    : "";

  return base + documents + "\nà bientôt.\nCreditX";
}

/**
 * Instant auquel le rappel est dû : 10:00 (heure suisse) la veille du rendez-vous.
 */
export function momentDuRappel(debut: Date): Date {
  const [a, m, j] = decoupeDate(jourSuisse(debut));
  return instantSuisse(a, m, j - 1, HEURE_RAPPEL, 0);
}

/**
 * Le passage quotidien qui aurait dû envoyer ce rappel est-il déjà passé ?
 * Si oui, l'attendre reviendrait à ne jamais l'envoyer : il faut partir tout de
 * suite. On n'envoie évidemment rien pour un rendez-vous déjà commencé.
 */
export function rappelARattraper(debut: Date, maintenant = new Date()): boolean {
  return maintenant > momentDuRappel(debut) && debut > maintenant;
}
