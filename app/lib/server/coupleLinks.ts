// app/lib/server/coupleLinks.ts
//
// Fondation du LIEN CONJOINT (couple) : modèle de données + helpers serveur.
// Accès UNIQUEMENT côté serveur (admin SDK) → aucune règle Firestore cliente à
// gérer, la donnée du conjoint ne transite jamais en clair vers l'autre client.
//
// Collection `spouseLinks/{id}` : un lien de consentement entre deux comptes.
// Cycle de vie : pending (invitation créée) → accepted (code saisi par B) ;
// revoked par l'un ou l'autre à tout moment. Portée `full` (prévoyance complète).

import { randomInt } from "crypto";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type SpouseLinkStatus = "pending" | "accepted" | "revoked";

export interface SpouseLink {
  id: string;
  inviterUid: string;
  inviteeUid: string | null;
  code: string;
  status: SpouseLinkStatus;
  scope: "full";
  createdAt?: FirebaseFirestore.Timestamp;
  acceptedAt?: FirebaseFirestore.Timestamp;
  revokedAt?: FirebaseFirestore.Timestamp;
  revokedBy?: string;
}

const COL = "spouseLinks";

/** Un lien est « actif » tant qu'il n'est pas révoqué. */
function isActive(l: SpouseLink): boolean {
  return l.status === "pending" || l.status === "accepted";
}

/** Génère un code lisible « ABCD-EF » (sans I/O/0/1, non ambigu). */
export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick(4)}-${pick(2)}`;
}

/** Génère un code garanti non utilisé par un lien ACTIF. */
export async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = generateCode();
    const snap = await db.collection(COL).where("code", "==", code).get();
    const clash = snap.docs.some((d) => isActive({ id: d.id, ...(d.data() as any) }));
    if (!clash) return code;
  }
  // Extrêmement improbable ; suffixe aléatoire de secours.
  return `${generateCode()}${randomInt(10)}`;
}

/** Requête mono-champ (pas d'index composite requis) + filtre en mémoire. */
async function queryByField(field: "inviterUid" | "inviteeUid", uid: string): Promise<SpouseLink[]> {
  const snap = await db.collection(COL).where(field, "==", uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as SpouseLink);
}

/** Lien ACTIF (pending/accepted) impliquant `uid` comme inviter OU invitee, ou null. */
export async function findActiveLinkForUid(uid: string): Promise<SpouseLink | null> {
  const [asInviter, asInvitee] = await Promise.all([
    queryByField("inviterUid", uid),
    queryByField("inviteeUid", uid),
  ]);
  return [...asInviter, ...asInvitee].find(isActive) ?? null;
}

/** Lien pending correspondant à un code (ou null). */
export async function findPendingByCode(code: string): Promise<SpouseLink | null> {
  const snap = await db.collection(COL).where("code", "==", code.trim().toUpperCase()).get();
  const links = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as SpouseLink);
  return links.find((l) => l.status === "pending") ?? null;
}

/** L'autre uid du lien vu depuis `uid` (le conjoint), ou null si non résolu. */
export function spouseUidOf(link: SpouseLink, uid: string): string | null {
  if (link.inviterUid === uid) return link.inviteeUid;
  if (link.inviteeUid === uid) return link.inviterUid;
  return null;
}

/** Crée une invitation (lien pending) portée par l'inviteur. */
export async function createInvite(inviterUid: string, code: string): Promise<SpouseLink> {
  const ref = db.collection(COL).doc();
  const data = {
    inviterUid,
    inviteeUid: null,
    code,
    status: "pending" as const,
    scope: "full" as const,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return { id: ref.id, ...(data as any) };
}

/** Marque un lien accepté par l'invitee. */
export async function acceptLink(linkId: string, inviteeUid: string): Promise<void> {
  await db.collection(COL).doc(linkId).update({
    inviteeUid,
    status: "accepted",
    acceptedAt: FieldValue.serverTimestamp(),
  });
}

/** Révoque un lien (par l'un des deux conjoints). */
export async function revokeLink(linkId: string, byUid: string): Promise<void> {
  await db.collection(COL).doc(linkId).update({
    status: "revoked",
    revokedAt: FieldValue.serverTimestamp(),
    revokedBy: byUid,
  });
}

/** Prénom du conjoint (DonneePersonnelles) pour l'affichage, ou "" si absent. */
export async function spousePrenom(spouseUid: string): Promise<string> {
  const snap = await db.doc(`clients/${spouseUid}/DonneePersonnelles/current`).get();
  return (snap.data()?.Enter_prenom as string) ?? "";
}
