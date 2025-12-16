// functions/src/index.ts
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
// Optionnel : fixe une région si tu veux
// import { setGlobalOptions } from "firebase-functions/v2";
// setGlobalOptions({ region: "europe-west6" });

admin.initializeApp();

/**
 * Copie les données de clients/{fromUid} (+ sous-collection prestations)
 * vers clients/{toUid}. Seul l'utilisateur authentifié {toUid} peut demander la migration.
 *
 * Appel côté client (web):
 *   const fn = httpsCallable(getFunctions(), "migrateClientData");
 *   await fn({ fromUid, toUid });
 */
export const migrateClientData = onCall(async (request) => {
  // ✅ V2: auth & data sont sur "request"
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const data = request.data as { fromUid?: string; toUid?: string };
  const fromUid = String(data?.fromUid ?? "");
  const toUid = String(data?.toUid ?? "");

  if (!fromUid || !toUid) {
    throw new HttpsError("invalid-argument", "fromUid and toUid are required.");
  }
  // sécurité: seul le user connecté peut migrer vers SON propre UID
  if (auth.uid !== toUid) {
    throw new HttpsError("permission-denied", "Only the target user can migrate.");
  }

  const db = admin.firestore();
  const fromRef = db.doc(`clients/${fromUid}`);
  const toRef = db.doc(`clients/${toUid}`);

  const batch = db.batch();

  // 1) Doc racine
  const fromSnap = await fromRef.get();
  if (fromSnap.exists) {
    batch.set(toRef, fromSnap.data()!, { merge: true });
  }

  // 2) Sous-collection prestations (si existe)
  const subSnap = await fromRef.collection("prestations").get();
  subSnap.docs.forEach((d) => {
    batch.set(toRef.collection("prestations").doc(d.id), d.data(), { merge: true });
  });

  await batch.commit();

  // Optionnel : supprimer l'ancien doc (souvent on garde en archive)
  // await fromRef.delete();

  return { ok: true };
});
