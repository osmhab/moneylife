// app/lib/server/push.ts
//
// Notification push vers les appareils d'un client.
//
// Les jetons sont écrits par l'app iOS dans `clients/{uid}/devices/{token}`
// (PushManager). Un même client peut avoir plusieurs appareils : on envoie à
// tous, et on nettoie ceux que Firebase déclare périmés — sinon la liste enfle
// indéfiniment avec chaque réinstallation.
//
// L'envoi est TOUJOURS best-effort : une notification qui échoue ne doit jamais
// faire échouer le travail qu'elle annonce. L'analyse d'un règlement est écrite
// en base avant tout envoi ; au pire, le client la découvre en ouvrant l'app.

import { db } from "app/lib/firebase/admin";
import admin from "firebase-admin";

/** Codes signalant un jeton définitivement invalide (appareil réinitialisé, app désinstallée). */
const JETONS_MORTS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export async function envoyerPush(
  clientUid: string,
  titre: string,
  corps: string,
  donnees: Record<string, string> = {},
): Promise<{ envoyes: number; nettoyes: number }> {
  try {
    const snap = await db.collection("clients").doc(clientUid).collection("devices").get();
    const jetons = snap.docs.map((d) => d.id).filter(Boolean);
    if (jetons.length === 0) return { envoyes: 0, nettoyes: 0 };

    const rep = await admin.messaging().sendEachForMulticast({
      tokens: jetons,
      notification: { title: titre, body: corps },
      data: donnees,
      apns: { payload: { aps: { sound: "default" } } },
    });

    let nettoyes = 0;
    await Promise.all(rep.responses.map(async (r, i) => {
      const code = (r.error as { code?: string } | undefined)?.code;
      if (!r.success && code && JETONS_MORTS.has(code)) {
        nettoyes++;
        await snap.docs[i].ref.delete().catch(() => {});
      }
    }));

    return { envoyes: rep.successCount, nettoyes };
  } catch (e) {
    // Volontairement avalé : voir l'en-tête de fichier.
    console.error("[push] envoi impossible", e);
    return { envoyes: 0, nettoyes: 0 };
  }
}
