//app/lib/data/donneesPersonnelles.ts

import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const PATH = (uid: string) => doc(db, "clients", uid, "DonneePersonnelles", "current");

/** Observe le doc pour préremplir les formulaires */
export function subscribeDonneesPersonnelles(
  uid: string,
  cb: (data: any | null) => void
) {
  return onSnapshot(PATH(uid), (snap) => cb(snap.exists() ? snap.data() : null));
}

/** Merge (upsert) : clientData et certificat écrivent dans le MÊME doc */
export async function upsertDonneesPersonnelles(
  partial: Record<string, any>
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Non authentifié");
  await setDoc(PATH(user.uid), partial, { merge: true });
}

/** Charge le snapshot (optionnel) */
export async function loadDonneesPersonnellesOnce(uid: string) {
  const snap = await getDoc(PATH(uid));
  return snap.exists() ? snap.data() : null;
}