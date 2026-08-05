// app/lib/server/referral.ts
//
// Parrainage (« Recommandation »), côté serveur. SOURCE UNIQUE de la logique de code /
// barème / résolution parrain↔filleul. Étend l'existant : le champ `referralCode` sur
// clients/{uid} (déjà écrit par l'entretien conseil) et `invitedBy` (posé à l'inscription).
//
// Règles métier validées :
//  - Un client peut recommander depuis l'app (code perso, généré ICI côté serveur → unique).
//  - Le filleul a 20 jours pour CRÉER SON COMPTE via le lien, sinon la reco expire (ré-invitable).
//  - La RÉCOMPENSE (80 CHF, ou promo 120/180) se débloque quand le filleul signe un 3a accepté.
//  - Montant figé à la signature du filleul.

import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const REFERRAL_EXPIRY_DAYS = 20;
export const DEFAULT_REWARD_CHF = 80;

/** Statuts d'une recommandation (enregistrement `referrals`). */
export type ReferralStatus =
  | "INVITED"      // invité nommément, en attente d'inscription (expire à +20 j)
  | "REGISTERED"   // filleul inscrit via le lien
  | "REWARD_DUE"   // filleul a signé un 3a accepté → récompense à verser
  | "PAID"         // récompense versée par CreditX
  | "EXPIRED"      // pas d'inscription dans les 20 j → ré-invitable
  | "CANCELLED";

// Caractères sans ambiguïté (pas de 0/O/1/I) pour un code lisible/dictable.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `REF-${s}`;
}

/** Génère un code de parrainage GLOBALEMENT UNIQUE (collision vérifiée contre clients.referralCode). */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randomCode();
    const snap = await db.collection("clients").where("referralCode", "==", code).limit(1).get();
    if (snap.empty) return code;
  }
  return randomCode(9); // repli quasi impossible
}

/** Renvoie le code de parrainage du client, en le CRÉANT (unique) s'il n'existe pas encore. */
export async function ensureReferralCode(uid: string): Promise<string> {
  const ref = db.collection("clients").doc(uid);
  const snap = await ref.get();
  const existing = snap.data()?.referralCode as string | undefined;
  if (existing && typeof existing === "string" && existing.trim()) return existing;
  const code = await generateUniqueReferralCode();
  await ref.set({ referralCode: code, updatedAt: Date.now() }, { merge: true });
  return code;
}

/** Résout un code de parrainage → uid du parrain (ou null). */
export async function resolveReferrerUid(code: string): Promise<string | null> {
  if (!code) return null;
  const snap = await db.collection("clients").where("referralCode", "==", code).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Barème de récompense EN VIGUEUR (CHF). Lit `referralSettings/current` :
 *   { amountCHF: 80, promoAmountCHF?: 120|180, promoUntil?: <ms epoch> }.
 * Renvoie le montant promo s'il est actif (promoUntil dans le futur), sinon le montant de base.
 */
export async function getReferralAmountCHF(atMs: number = Date.now()): Promise<number> {
  const s = (await db.doc("referralSettings/current").get()).data() || {};
  const base = Number(s.amountCHF) || DEFAULT_REWARD_CHF;
  const promo = Number(s.promoAmountCHF) || 0;
  const until = Number(s.promoUntil) || 0;
  return promo > 0 && until > atMs ? promo : base;
}

/** URL d'invitation partageable (landing existante /invite/[code] → /signup?ref=CODE). */
export function referralLink(code: string): string {
  return `https://creditx.ch/invite/${code}`;
}

/* =========================================================
 * Enregistrement `referrals` (collection racine) — forme canonique :
 *   { referrerUid, referrerCode, refereeUid, refereeName,
 *     status: REGISTERED|REWARD_DUE|PAID|EXPIRED|CANCELLED,
 *     amountCHF?, createdAt, updatedAt, expiresAt, rewardDueAt?, signedPlanId?, paidAt? }
 * Créé à l'inscription du filleul (trigger moteur onReferralSignup). Mis à jour ici (signature)
 * et par le cron d'expiration (moteur). expiresAt = createdAt + 20 j.
 * =======================================================*/

/**
 * Passe la reco d'un filleul en RÉCOMPENSE DUE (il vient de signer un nouveau 3a). Montant FIGÉ
 * à la signature (barème en vigueur). Idempotent : ne fait rien si pas de reco REGISTERED.
 * Renvoie { referrerUid, refereeName, amountCHF, referralId } pour que l'appelant notifie, ou null.
 */
export async function markReferralRewardDue(
  refereeUid: string,
  signedPlanId?: string
): Promise<{ referrerUid: string; refereeName: string | null; amountCHF: number; referralId: string } | null> {
  const snap = await db
    .collection("referrals")
    .where("refereeUid", "==", refereeUid)
    .where("status", "==", "REGISTERED")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  const amountCHF = await getReferralAmountCHF();
  await doc.ref.set(
    {
      status: "REWARD_DUE",
      amountCHF,
      signedPlanId: signedPlanId ?? null,
      rewardDueAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return {
    referrerUid: data.referrerUid,
    refereeName: (data.refereeName as string) ?? null,
    amountCHF,
    referralId: doc.id,
  };
}
