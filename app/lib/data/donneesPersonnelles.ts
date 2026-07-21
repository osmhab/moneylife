// app/lib/data/donneesPersonnelles.ts
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const PATH = (uid: string) =>
  doc(db, "clients", uid, "DonneePersonnelles", "current");

/** Observe le doc pour préremplir les formulaires */
export function subscribeDonneesPersonnelles(
  uid: string,
  cb: (data: any | null) => void
) {
  return onSnapshot(PATH(uid), (snap) => cb(snap.exists() ? snap.data() : null));
}

/**
 * Merge (upsert) : clientData et certificat écrivent dans le MÊME doc
 *
 * - Mode client: écrit sur son propre uid (Firestore direct)
 * - Mode admin: si targetUid != auth.uid, écrit via API Admin SDK
 */
export async function upsertDonneesPersonnelles(
  partial: Record<string, any>,
  opts?: { targetUid?: string }
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Non authentifié");

  const targetUid = opts?.targetUid;

  // ✅ Admin mode (édition d'un autre client)
  if (targetUid && targetUid !== user.uid) {
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/clients/donnees-personnelles", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid: targetUid, partial }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || "Échec modification admin");
    }
    return;
  }

  // ✅ Client mode (ou admin qui édite son propre compte)
  await setDoc(PATH(user.uid), partial, { merge: true });
}

/** Charge le snapshot (optionnel) */
export async function loadDonneesPersonnellesOnce(uid: string) {
  const snap = await getDoc(PATH(uid));
  return snap.exists() ? snap.data() : null;
}