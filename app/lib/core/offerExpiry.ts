// app/lib/core/offerExpiry.ts
//
// Expiration des OFFRES (à ne pas confondre avec l'échéance d'un CONTRAT).
//
//   • échéance de contrat  → `data.dateEcheance`, horizon 10-40 ans, pilote la
//     projection de capital (cf. `yearsToMaturity`) ;
//   • expiration d'offre   → `metadata.offerExpiresAt`, horizon quelques semaines,
//     au-delà de laquelle l'offre n'est PLUS SIGNABLE.
//
// Source unique consommée par : la route de signature (iOS), la signature web,
// le cron de rappels, et l'affichage du compte à rebours.

import { parseFlexibleDate } from "@/lib/core/dates";

/**
 * Instant précis d'expiration : la FIN du jour indiqué.
 *
 * Une offre marquée « valable jusqu'au 15.08 » doit rester signable pendant TOUTE
 * la journée du 15. Comparer à minuit la ferait expirer un jour trop tôt, et le
 * client verrait « expire aujourd'hui » sur une offre déjà refusée.
 *
 * `null` si aucune date exploitable — l'appelant décide quoi en faire.
 */
export function offerExpiryInstant(expiresAt: string | null | undefined): Date | null {
  const d = parseFlexibleDate(expiresAt);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * L'offre est-elle expirée ?
 *
 * Une offre SANS date n'est jamais considérée expirée : les offres créées avant
 * l'introduction de ce champ resteraient sinon toutes bloquées d'un coup.
 * C'est un choix assumé — le verrou ne s'applique qu'aux offres qui en portent une.
 */
export function isOfferExpired(
  expiresAt: string | null | undefined,
  at: Date = new Date()
): boolean {
  const end = offerExpiryInstant(expiresAt);
  if (!end) return false;
  return at.getTime() > end.getTime();
}

/**
 * Jours entiers restants avant expiration (0 = expire aujourd'hui).
 * Négatif si déjà passée, `null` si aucune date. Sert aux jalons de rappel
 * et au compte à rebours affiché.
 */
export function daysUntilExpiry(
  expiresAt: string | null | undefined,
  at: Date = new Date()
): number | null {
  const end = offerExpiryInstant(expiresAt);
  if (!end) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // On compare des FINS de journée de part et d'autre : sans ça, « demain 23:59 »
  // moins « aujourd'hui 08:00 » donnerait 1.6 jour, tronqué à 1 — correct ici,
  // mais faux dès que l'heure d'appel change. On neutralise l'heure.
  const today = new Date(at);
  today.setHours(23, 59, 59, 999);
  return Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Jalons de rappel d'OFFRE, en jours restants.
 *
 * Décroissants plutôt qu'à intervalle fixe : sur une offre de 30 jours, un rappel
 * tous les 5 jours produit six messages identiques dont cinq arrivent quand rien
 * ne presse — le client coupe les notifications avant la seule qui compte.
 */
export const OFFER_REMINDER_MILESTONES = [30, 15, 7, 3, 1] as const;

/**
 * Jalons de rappel d'ÉCHÉANCE DE CONTRAT, en jours restants.
 *
 * Horizon bien plus large que pour une offre : six mois avant, c'est le moment
 * utile pour organiser un rendez-vous et arbitrer le versement du capital.
 * La veille, il n'y a plus rien à décider.
 */
export const CONTRACT_REMINDER_MILESTONES = [180, 90, 30, 7] as const;

/** Jalon d'échéance de contrat atteint aujourd'hui, s'il y en a un. */
export function reachedContractMilestone(
  dateEcheance: string | null | undefined,
  at: Date = new Date()
): number | null {
  const days = daysUntilExpiry(dateEcheance, at);
  if (days === null) return null;
  return (CONTRACT_REMINDER_MILESTONES as readonly number[]).includes(days) ? days : null;
}

/**
 * Jalon atteint aujourd'hui, s'il y en a un.
 *
 * On renvoie le jalon EXACT (pas « <= »), pour qu'un cron quotidien n'envoie
 * qu'un rappel par jalon. Le drapeau d'envoi côté appelant reste néanmoins
 * indispensable : si le cron ne tourne pas un jour, le jalon est manqué, et
 * s'il tourne deux fois, il ne doit pas ré-envoyer.
 */
export function reachedMilestone(
  expiresAt: string | null | undefined,
  at: Date = new Date()
): number | null {
  const days = daysUntilExpiry(expiresAt, at);
  if (days === null) return null;
  return (OFFER_REMINDER_MILESTONES as readonly number[]).includes(days) ? days : null;
}
