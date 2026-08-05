// app/lib/server/notify.ts
//
// SOURCE UNIQUE des notifications in-app, côté SERVEUR (firebase-admin).
//
// Pourquoi ce module existe
// -------------------------
// Historiquement, la notification était écrite depuis le NAVIGATEUR de l'admin
// (`addDoc` dans les composants du wizard), juste avant un `fetch` vers la route
// d'e-mail. Deux conséquences :
//   1. si l'onglet se fermait entre les deux, l'e-mail partait sans notification
//      (ou l'inverse) → les deux canaux divergeaient, en silence ;
//   2. la règle « tel événement notifie » était dispersée dans l'UI.
//
// Désormais, la notification est créée PAR LA ROUTE QUI ENVOIE L'E-MAIL. Les deux
// canaux naissent au même endroit, côté serveur : ils ne peuvent plus diverger.
//
// Règle : ne JAMAIS faire échouer un envoi d'e-mail parce que la notification a
// échoué. `notifyClient` avale ses erreurs et les logue — l'e-mail reste le canal
// contractuel, la notification est un confort.

import { db, authAdmin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/** Familles de notifications (pilotent l'icône/le classement côté clients). */
export type NotificationCategory =
  | "OFFRE"
  | "SOUSCRIPTION"
  | "COMPAGNIE"
  | "PAIEMENT"
  | "LPP"
  | "PREVOYANCE";

export type NotificationType = "success" | "error";

export interface NotifyClientInput {
  /** Identifiant du client. Si absent, il est résolu depuis `email`. */
  uid?: string | null;
  /** Utilisé pour retrouver l'uid quand l'appelant ne l'a pas (routes e-mail). */
  email?: string | null;
  title: string;
  content: string;
  /** Corps riche optionnel (affiché par le web ; l'iOS n'affiche que `content`). */
  html?: string;
  category: NotificationCategory;
  type?: NotificationType;
  /** Deep link web, ex. `/dashboard/prevoyance?tab=prive`. */
  actionUrl?: string;
}

/**
 * Résout l'uid d'un client à partir de son e-mail (Firebase Auth).
 * Renvoie `null` si le compte n'existe pas — cas réel : un prospect qui reçoit
 * une offre par e-mail avant d'avoir créé son espace.
 */
async function resolveUid(email: string): Promise<string | null> {
  try {
    const user = await authAdmin.getUserByEmail(email);
    return user.uid;
  } catch {
    return null;
  }
}

/**
 * Crée une notification in-app pour un client.
 * Sans destinataire résoluble, on ne fait rien (pas d'erreur) : l'e-mail suffit.
 */
export async function notifyClient(input: NotifyClientInput): Promise<void> {
  try {
    const uid = input.uid || (input.email ? await resolveUid(input.email) : null);
    if (!uid) {
      console.warn(
        `[notify] destinataire introuvable (email=${input.email ?? "?"}) — notification ignorée`
      );
      return;
    }

    const doc: Record<string, unknown> = {
      title: input.title,
      content: input.content,
      type: input.type ?? "success",
      category: input.category,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    };
    // Champs optionnels : ne pas écrire `undefined` (Firestore le refuse).
    if (input.html) doc.html = input.html;
    if (input.actionUrl) doc.actionUrl = input.actionUrl;

    await db.collection("clients").doc(uid).collection("notifications").add(doc);
  } catch (e) {
    // Volontairement non bloquant : cf. en-tête.
    console.error("[notify] échec de création de la notification :", e);
  }
}

/* ============================================================================
 * NOTIFICATIONS ADMIN — collection racine `admin_notifications`
 * ==========================================================================*/

/**
 * Événements qui réclament une action ou une vigilance côté back-office.
 * Le libellé est construit SERVEUR à partir de cet identifiant : une route
 * appelable par un client ne doit jamais pouvoir injecter un texte arbitraire
 * dans l'inbox admin.
 */
export type AdminEvent =
  | "NEW_SUBSCRIPTION_REQUEST"
  | "OFFER_SIGNED_BY_CLIENT"
  | "OFFER_REJECTED_BY_CLIENT"
  | "EXPERT_REVIEW_PAID"
  | "TRANSFER_LETTER_SIGNED"
  | "NEW_REFERRAL_SIGNUP"
  | "REFERRAL_REWARD_DUE";

interface AdminEventTemplate {
  title: string;
  content: (ctx: AdminNotifyContext) => string;
  category: NotificationCategory;
  type: NotificationType;
  /** Où l'admin doit se rendre pour traiter. */
  actionUrl: string;
}

const ADMIN_EVENTS: Record<AdminEvent, AdminEventTemplate> = {
  NEW_SUBSCRIPTION_REQUEST: {
    title: "Nouvelle demande de souscription",
    content: (c) => `${c.clientName ?? "Un client"} a soumis une demande 3e pilier.`,
    category: "SOUSCRIPTION",
    type: "success",
    actionUrl: "/admin/offres-wizard",
  },
  OFFER_SIGNED_BY_CLIENT: {
    title: "Offre signée par le client",
    content: (c) =>
      `${c.clientName ?? "Un client"} a signé son offre${c.institutionName ? ` ${c.institutionName}` : ""}. Dossier à transmettre à la compagnie.`,
    category: "SOUSCRIPTION",
    type: "success",
    actionUrl: "/admin/offres-wizard",
  },
  OFFER_REJECTED_BY_CLIENT: {
    title: "Offre refusée par le client",
    content: (c) =>
      `${c.clientName ?? "Un client"} a refusé son offre${c.institutionName ? ` ${c.institutionName}` : ""}.`,
    category: "OFFRE",
    type: "error",
    actionUrl: "/admin/offres-wizard",
  },
  EXPERT_REVIEW_PAID: {
    title: "Contrôle Expert payé",
    content: (c) =>
      `${c.clientName ?? "Un client"} a payé un contrôle expert. Un actuaire doit prendre le dossier.`,
    category: "PAIEMENT",
    type: "success",
    actionUrl: "/admin/offres-wizard",
  },
  TRANSFER_LETTER_SIGNED: {
    title: "Lettre de transfert signée",
    content: (c) =>
      `${c.clientName ?? "Un client"} a signé sa lettre de transfert. À transmettre à l'ancienne institution.`,
    category: "SOUSCRIPTION",
    type: "success",
    actionUrl: "/admin/clients",
  },
  NEW_REFERRAL_SIGNUP: {
    title: "Nouveau filleul inscrit",
    content: (c) =>
      `${c.clientName ?? "Un nouveau client"} s'est inscrit PAR RECOMMANDATION${c.referrerName ? ` (parrain : ${c.referrerName})` : ""}.`,
    category: "SOUSCRIPTION",
    type: "success",
    actionUrl: "/admin/clients",
  },
  REFERRAL_REWARD_DUE: {
    title: "Récompense parrainage à verser",
    content: (c) =>
      `${c.clientName ?? "Un filleul"} a signé un 3a par recommandation → ${c.amountCHF ?? 80} CHF à verser au parrain${c.referrerName ? ` ${c.referrerName}` : ""}.`,
    category: "PAIEMENT",
    type: "success",
    actionUrl: "/admin/clients",
  },
};

export interface AdminNotifyContext {
  /** Client concerné — permet à l'admin de rebondir sur le dossier. */
  clientUid?: string | null;
  clientName?: string | null;
  institutionName?: string | null;
  planId?: string | null;
  /** Parrainage : nom du parrain + montant de la récompense. */
  referrerName?: string | null;
  amountCHF?: number | null;
}

/**
 * Crée une notification pour le BACK-OFFICE.
 *
 * Pourquoi une collection racine et non une sous-collection : ces alertes ne
 * concernent pas un client mais l'équipe. Les lister par client obligerait le
 * back-office à balayer tous les comptes (collectionGroup) pour afficher un
 * simple compteur.
 *
 * Non bloquant, comme `notifyClient`.
 */
export async function notifyAdmin(
  event: AdminEvent,
  ctx: AdminNotifyContext = {}
): Promise<void> {
  try {
    const tpl = ADMIN_EVENTS[event];
    if (!tpl) {
      console.warn(`[notify] événement admin inconnu : ${event}`);
      return;
    }

    await db.collection("admin_notifications").add({
      event,
      title: tpl.title,
      content: tpl.content(ctx),
      category: tpl.category,
      type: tpl.type,
      actionUrl: tpl.actionUrl,
      clientUid: ctx.clientUid ?? null,
      clientName: ctx.clientName ?? null,
      institutionName: ctx.institutionName ?? null,
      planId: ctx.planId ?? null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[notify] échec de création de la notification admin :", e);
  }
}

/** Nom lisible d'un client, pour les libellés admin. Best-effort. */
export async function lookupClientName(uid: string): Promise<string | null> {
  try {
    const snap = await db
      .collection("clients").doc(uid)
      .collection("DonneePersonnelles").doc("current")
      .get();
    const d = snap.data() ?? {};
    const name = [d.Enter_prenom, d.Enter_nom].filter(Boolean).join(" ").trim();
    return name || null;
  } catch {
    return null;
  }
}
