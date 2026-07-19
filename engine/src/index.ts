//engine/src/index.ts
import { onDocumentUpdated, onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Utilisation de l'alias configuré pour le moteur partagé
import { ClientData, Legal_Settings } from "../../lib/shared/core/types";
// Importation de l'échelle de référence partagée (Mapping correct: Legal_Income, etc.)
import { Legal_Echelle44_2025_Rows } from "../../lib/shared/registry/echelle44";

import { 
  buildInvaliditeAccidentMatrix,
  buildInvaliditeMaladieMatrix,
  buildDecesAccidentMatrix,
  buildDecesMaladieMatrix,
  buildRetraiteMatrix 
} from "../../lib/shared/calculs/matrices";

// Initialisation globale de l'admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

/**
 * Trigger : onClientDataUpdate
 * Se déclenche à chaque modification des données personnelles.
 */
export const onClientDataUpdate = onDocumentUpdated({
  document: "clients/{uid}/DonneePersonnelles/current",
  region: "europe-west1" 
}, async (event) => {
  console.log("--- SIGNAL REÇU (RÉGION EUROPE) ---");
  const uid = event.params.uid;
  
  const newData = event.data?.after.data() as ClientData;
  if (!newData) {
    console.log("Aucune donnée reçue après mise à jour.");
    return;
  }

  try {
    // 1. Récupération des paramètres légaux et des plans
    const [snapAvs, snapLpp, snapLaa, snapPlans] = await Promise.all([
      db.doc("regs/regs_avs_ai").get(),
      db.doc("regs/regs_lpp").get(),
      db.doc("regs/regs_laa").get(),
      db.collection(`clients/${uid}/plans`).get()
    ]);

    const regsAvs = snapAvs.data() || {};
    const regsLpp = snapLpp.data() || {};
    const regsLaa = snapLaa.data() || {};
    
    // Transformation du snapshot des plans en tableau (AVEC LE FILTRE)
    const plans = snapPlans.docs
      .map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }))
      .filter((plan: any) => {
        // Le serveur ne doit prendre en compte QUE les contrats actifs 
        // (ou les anciens plans sans statut comme les vieux certificats LPP)
        return plan.status === "ACTIVE" || !plan.status;
      });

    console.log(`Plans récupérés pour ${uid} : ${plans.length}`);

    // 2. Construction de l'objet Legal_Settings (Constantes)
    const legal: Legal_Settings = {
      Legal_SalaireAssureMaxLAA: regsLaa.Legal_SalaireAssureMaxLAA ?? 148200,
      Legal_MultiplicateurCapitalSiPasRenteLAA: regsLaa.Legal_MultiplicateurCapitalSiPasRenteLAA ?? 3,
      Legal_DeductionCoordinationMinLPP: regsLpp.Legal_DeductionCoordinationMinLPP ?? 26460,
      Legal_SeuilEntreeLPP: regsLpp.Legal_SeuilEntreeLPP ?? 22680,
      Legal_SalaireMaxLPP: regsLpp.Legal_SalaireMaxLPP ?? 90720,
      Legal_SalaireAssureMaxLPP: regsLpp.Legal_SalaireAssureMaxLPP ?? 64260,
      Legal_SalaireAssureMinLPP: regsLpp.Legal_SalaireAssureMinLPP ?? 3780,
      Legal_MultiplicateurCapitalSiPasRenteLPP: regsLpp.Legal_MultiplicateurCapitalSiPasRenteLPP ?? 3,
      Legal_CotisationsMinLPP: regsLpp.Legal_CotisationsMinLPP ?? {},
      Legal_AgeRetraiteAVS: regsAvs.Legal_AgeRetraiteAVS ?? 65,
      Legal_AgeLegalCotisationsAVS: regsAvs.Legal_AgeLegalCotisationsAVS ?? 21,
      Legal_BTE_AnnualCredit: regsAvs.Legal_BTE_AnnualCredit ?? 45360,
      Legal_BTA_AnnualCredit: regsAvs.Legal_BTA_AnnualCredit ?? 45360,
      Legal_BTE_SplitMarried: regsAvs.Legal_BTE_SplitMarried ?? 0.5,
      Legal_ijAccidentTaux: regsLaa.Legal_ijAccidentTaux ?? 80,
    };

    // 3. SELECTION DE L'ECHELLE (On force l'usage du fichier Shared)
    // Cela évite les bugs de mapping 'income' vs 'Legal_Income' de Firestore
    const echelleSource = Legal_Echelle44_2025_Rows;

    // 4. Calcul des matrices consolidées
    const analysisPayload = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        clientName: `${newData.Enter_prenom || ''} ${newData.Enter_nom || ''}`,
        salaireRef: newData.Enter_salaireAnnuel || 0,
        calculationEngine: "CloudEngine_v1_Fixed_Mapping_Sync"
      },
      projections: {
        invalidite_accident: buildInvaliditeAccidentMatrix(newData, legal, echelleSource, plans),
        invalidite_maladie: buildInvaliditeMaladieMatrix(newData, legal, echelleSource, plans),
        deces_accident: buildDecesAccidentMatrix(newData, legal, echelleSource, plans),
        deces_maladie: buildDecesMaladieMatrix(newData, legal, echelleSource, plans),
        retraite: buildRetraiteMatrix(newData, legal, echelleSource, plans),
      }
    };

    // 5. Enregistrement final dans Firestore
    await db.doc(`clients/${uid}/Analyse/current`).set(analysisPayload);
    
    console.log(`✅ Analyse mise à jour avec succès pour ${uid} (Mapping Echelle 2025 OK)`);

  } catch (error) {
    console.error("❌ Erreur Engine critique :", error);
  }
});

/**
 * Trigger : onPlanUpdate
 * Force le recalcul de l'analyse quand un plan (LPP, 3e pilier) est modifié.
 */
export const onPlanUpdate = onDocumentWritten({
  document: "clients/{uid}/plans/{planId}",
  region: "europe-west1"
}, async (event) => {
  const uid = event.params.uid;
  console.log(`--- PLAN MODIFIÉ/CRÉÉ/SUPPRIMÉ POUR L'UTILISATEUR ${uid} ---`);

  try {
    // On écrit un timestamp pour forcer le déclenchement de onClientDataUpdate
    await db.doc(`clients/${uid}/DonneePersonnelles/current`).set({
      _lastEngineTrigger: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Recalcul forcé pour l'analyse de ${uid}`);
  } catch (error) {
    console.error("Erreur lors du trigger de plan :", error);
  }
});
/**
 * Trigger : onNotificationCreated
 *
 * Transforme TOUTE notification in-app en PUSH sur les appareils du client.
 *
 * Pourquoi ici et pas dans chaque route : les notifications naissent déjà en un
 * seul point (`app/lib/server/notify.ts` → `clients/{uid}/notifications`). En
 * s'accrochant à la création du document, tout nouvel événement devient
 * automatiquement un push, sans retoucher le moindre site d'appel.
 *
 * Les jetons d'appareil sont écrits par l'app iOS dans `clients/{uid}/devices`.
 * Un jeton refusé par FCM (app désinstallée) est supprimé au passage : sans ce
 * ménage, la liste grossit indéfiniment et chaque envoi paie des échecs.
 */
export const onNotificationCreated = onDocumentCreated({
  document: "clients/{uid}/notifications/{notifId}",
  region: "europe-west1"
}, async (event) => {
  const uid = event.params.uid;
  const notif = event.data?.data();
  if (!notif) return;

  try {
    const devices = await db.collection(`clients/${uid}/devices`).get();
    const tokens = devices.docs
      .map((d) => d.get("token") as string | undefined)
      .filter((t): t is string => typeof t === "string" && t.length > 0);

    if (tokens.length === 0) {
      console.log(`[push] aucun appareil enregistré pour ${uid} — ignoré`);
      return;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: String(notif.title ?? "CreditX"),
        body: String(notif.content ?? ""),
      },
      data: {
        // Permet à l'app d'ouvrir le bon écran au tap.
        category: String(notif.category ?? ""),
        actionUrl: String(notif.actionUrl ?? ""),
        notifId: event.params.notifId,
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    });

    // Journalise la CAUSE de chaque echec. Sans ca, un « 0/1 envoye » ne dit pas
    // s'il s'agit d'un jeton mort, d'une cle APNs manquante cote console
    // (messaging/third-party-auth-error) ou d'un incident transitoire — et le
    // diagnostic se fait a l'aveugle.
    response.responses.forEach((r, i) => {
      if (!r.success) {
        console.error(
          `[push] echec jeton ${tokens[i].slice(0, 12)}… : ${r.error?.code} — ${r.error?.message}`
        );
      }
    });

    // Purge des jetons devenus invalides.
    const stale: string[] = [];
    response.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        stale.push(tokens[i]);
      }
    });

    if (stale.length > 0) {
      const batch = db.batch();
      devices.docs
        .filter((d) => stale.includes(d.get("token")))
        .forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[push] ${stale.length} jeton(s) périmé(s) purgé(s) pour ${uid}`);
    }

    console.log(`[push] ${uid} : ${response.successCount}/${tokens.length} envoyé(s)`);
  } catch (error) {
    // Non bloquant : un push raté ne doit pas faire échouer le trigger.
    console.error("[push] échec d'envoi :", error);
  }
});
