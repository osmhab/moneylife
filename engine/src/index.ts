//engine/src/index.ts
import { onDocumentUpdated, onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1";

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

import { diffProfile, AUDIT_RETENTION_YEARS } from "../../lib/shared/core/audit";
import type { AuditEventType, AuditFieldChange } from "../../lib/shared/core/audit";
import { computeAgeOn, hasEnfantOrphelinEligibleAt } from "../../lib/shared/rules/guards";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Initialisation globale de l'admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();
// Ignore les champs `undefined` a l'ecriture (recommandation Firebase) : sans ca,
// un seul champ optionnel absent (ex. document.fileName d'un evenement d'audit)
// fait echouer TOUT le document. A appeler avant toute operation.
db.settings({ ignoreUndefinedProperties: true });

/**
 * Écrit un événement dans la PISTE D'AUDIT FINMA (auditTrail/{uid}/events).
 * Racine, donc SURVIT à la suppression du compte ; append-only (cf. règles).
 * Capturé côté MOTEUR : le client ne peut pas empêcher l'enregistrement.
 * Non bloquant — mais un échec est loggué (un trou = risque de conformité).
 */
async function logAudit(uid: string, type: AuditEventType, fields: {
  actorType?: "client" | "admin" | "system";
  actorUid?: string | null;
  summary: string;
  changes?: AuditFieldChange[];
  document?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Terme de conservation = maintenant + 10 ans. La purge planifiée s'appuie
    // dessus. Timestamp Firestore pour rester comparable/indexable.
    const retainUntil = new Date();
    retainUntil.setFullYear(retainUntil.getFullYear() + AUDIT_RETENTION_YEARS);

    const doc: Record<string, unknown> = {
      type,
      actorType: fields.actorType ?? "client",
      actorUid: fields.actorUid ?? uid,
      summary: fields.summary,
      at: admin.firestore.FieldValue.serverTimestamp(),
      retainUntil: admin.firestore.Timestamp.fromDate(retainUntil),
    };
    if (fields.changes && fields.changes.length) doc.changes = fields.changes;
    if (fields.document) doc.document = fields.document;
    if (fields.meta) doc.meta = fields.meta;
    await db.collection("auditTrail").doc(uid).collection("events").add(doc);
  } catch (e) {
    console.error(`[audit] echec (uid=${uid}, type=${type}) :`, e);
  }
}

const AUDIT_BUCKET = "moneylife-c3b0b.firebasestorage.app";

/**
 * Copie un document justificatif dans l'ARCHIVE DE RÉTENTION (auditArchive/…),
 * hors clients/{uid} → il survit à la suppression du compte. Le lien d'origine,
 * lui, est sous clients/{uid} et sera purgé : sans cette copie, la piste d'audit
 * pointerait vers un fichier disparu.
 *
 * Best-effort : en cas d'échec (fichier absent, URL non parsable), on renvoie
 * `retained: false` — l'événement est quand même écrit, avec le lien d'origine.
 */
async function archiveDocument(uid: string, sourceUrl: string, key: string): Promise<{ storagePath?: string; retained: boolean }> {
  try {
    // Chemin de l'objet Storage extrait de l'URL de téléchargement Firebase :
    // https://…/o/<chemin-url-encodé>?alt=media&token=…
    const m = sourceUrl.match(/\/o\/([^?]+)/);
    if (!m) return { retained: false };
    const srcPath = decodeURIComponent(m[1]);
    const base = srcPath.split("/").pop() || "document";
    const destPath = `auditArchive/${uid}/${key}/${base}`;
    const bucket = admin.storage().bucket(AUDIT_BUCKET);
    await bucket.file(srcPath).copy(bucket.file(destPath));
    return { storagePath: destPath, retained: true };
  } catch (e) {
    console.error(`[audit] archivage document échoué (uid=${uid}) :`, e);
    return { retained: false };
  }
}

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

  // AUDIT : trace toute modification RÉELLE d'information (hors déclencheurs
  // techniques, filtrés par diffProfile). Capture serveur = aucune modif ne peut
  // échapper à la piste. Limite connue : le trigger ne connaît pas l'auteur exact
  // d'une écriture client-side — on attribue au client (propriétaire du profil).
  const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
  const changes = diffProfile(beforeData, newData as unknown as Record<string, unknown>);
  if (changes.length > 0) {
    const noms = changes.map((c) => c.label).join(", ");
    await logAudit(uid, "PROFILE_UPDATED", {
      summary: `Modification des informations : ${noms}.`,
      changes,
    });
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

  // AUDIT : ajout / modification / remplacement / suppression de plan.
  try {
    const before = event.data?.before?.data() as any;
    const after = event.data?.after?.data() as any;
    const plan = after || before || {};
    const inst = plan.institutionName || plan.data?.institutionName || "";
    const label = plan.type || "plan";
    const src = after?.metadata?.sourceFileUrl || after?.metadata?.sourceFile;
    // Comment le document est entré : scan/import laisse un sourceFile, sinon manuel.
    const method = after?.metadata?.isManualEntry
      ? "manuel"
      : src ? "scan" : undefined;

    let type: AuditEventType | null = null;
    let summary = "";
    if (!before && after) {
      type = "PLAN_ADDED";
      summary = `Ajout d'un plan ${label}${inst ? " (" + inst + ")" : ""}` +
        (method ? ` — saisie ${method}` : "") + ".";
    } else if (before && !after) {
      type = "PLAN_DELETED";
      summary = `Suppression du plan ${before.type || ""}${before.institutionName ? " (" + before.institutionName + ")" : ""}.`;
    } else if (before && after) {
      // Remplacement annuel (metadata.replacedAt fraîchement posé) vs simple édition.
      const replaced = after?.metadata?.replacedAt && after?.metadata?.replacedAt !== before?.metadata?.replacedAt;
      type = replaced ? "PLAN_REPLACED" : "PLAN_UPDATED";
      summary = replaced
        ? `Remplacement du document du plan ${label}${inst ? " (" + inst + ")" : ""}.`
        : `Modification du plan ${label}${inst ? " (" + inst + ")" : ""}.`;
    }

    if (type) {
      let doc: Record<string, unknown> | null = null;
      if (src) {
        // Copie le document dans l'archive de rétention (survit à la suppression).
        const archived = await archiveDocument(uid, src, `${event.params.planId}-${Date.now()}`);
        doc = {
          fileName: after?.metadata?.sourceDocTitle || undefined,
          sourceUrl: src,
          docType: after?.metadata?.sourceDocType || undefined,
          method,
          storagePath: archived.storagePath,
          retained: archived.retained,
        };
      }
      await logAudit(uid, type, {
        summary,
        document: doc,
        meta: { planId: event.params.planId, institutionName: inst, planType: label },
      });
    }
  } catch (e) {
    console.error("[audit] plan :", e);
  }

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

    // Badge = nombre REEL de notifications non lues (celle qui vient d'etre creee
    // comprise, elle est non lue par definition). Un badge fige a 1 sous-estimait
    // des qu'un client avait plusieurs messages en attente.
    // `count()` agrege cote serveur : on ne rapatrie pas les documents.
    let badge = 1;
    try {
      const agg = await db
        .collection(`clients/${uid}/notifications`)
        .where("read", "==", false)
        .count()
        .get();
      badge = agg.data().count;
    } catch (e) {
      // Index absent ou erreur d'agregation : on degrade sans bloquer l'envoi.
      console.warn("[push] comptage des non-lus impossible, badge=1 :", e);
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
        payload: { aps: { sound: "default", badge } },
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

/**
 * Trigger : onAuthUserDeleted (v1)
 *
 * Nettoyage EN CASCADE quand un compte Auth est supprimé (console ou code).
 * Firebase n'efface PAS les données Firestore/Storage d'un utilisateur supprimé :
 * sans cette fonction, chaque compte de test supprimé laisse un doc `clients/{uid}`
 * orphelin (+ plans, documents, fichiers), qui repollue le CRM — c'est l'origine
 * du bug de doublon corrigé côté admin.
 *
 * L'API Auth `onDelete` n'existe qu'en v1 (pas d'équivalent v2) ; v1 et v2
 * cohabitent dans le même codebase. Chaque étape est best-effort et isolée :
 * l'échec d'une (ex. aucun fichier Storage) ne doit pas empêcher les autres.
 */
export const onAuthUserDeleted = functionsV1
  .region("europe-west1")
  .auth.user()
  .onDelete(async (user) => {
    const uid = user.uid;
    console.log(`[cleanup] compte Auth supprimé : ${uid} — nettoyage en cascade`);

    // AUDIT AVANT le nettoyage : la piste vit dans auditTrail/{uid} (racine), qui
    // n'est PAS touchée par la cascade → la preuve de suppression est conservée.
    await logAudit(uid, "ACCOUNT_DELETED", {
      actorType: "system",
      actorUid: null,
      summary: `Suppression définitive du compte${user.email ? " (" + user.email + ")" : ""} et de ses données.`,
      meta: { email: user.email ?? null },
    });

    // 1. Firestore : clients/{uid} + toutes ses sous-collections (plans,
    //    documents, notifications, devices, DonneePersonnelles, Analyse…).
    try {
      await db.recursiveDelete(db.collection("clients").doc(uid));
      console.log(`[cleanup] Firestore clients/${uid} supprimé`);
    } catch (e) {
      console.error(`[cleanup] echec Firestore clients/${uid} :`, e);
    }

    // 2. Storage : tous les fichiers sous clients/{uid}/ (scans, photos de profil…).
    try {
      await admin
        .storage()
        .bucket("moneylife-c3b0b.firebasestorage.app")
        .deleteFiles({ prefix: `clients/${uid}/` });
      console.log(`[cleanup] Storage clients/${uid}/ purgé`);
    } catch (e) {
      console.error(`[cleanup] echec Storage clients/${uid}/ :`, e);
    }

    // 3. Demandes d'offres (collection racine, hors clients/{uid}) rattachées à ce client.
    try {
      const reqs = await db
        .collection("offers_requests_3e")
        .where("clientUid", "==", uid)
        .get();
      const batch = db.batch();
      reqs.docs.forEach((d) => batch.delete(d.ref));
      if (!reqs.empty) {
        await batch.commit();
        console.log(`[cleanup] ${reqs.size} demande(s) offers_requests_3e supprimée(s)`);
      }
    } catch (e) {
      console.error(`[cleanup] echec offers_requests_3e :`, e);
    }
  });

/**
 * Trigger : onAuthUserCreated (v1)
 *
 * Trace la CRÉATION de compte dans la piste d'audit FINMA, avec date/heure
 * (serverTimestamp), e-mail et fournisseur (mot de passe / Google / Apple).
 * Capture serveur = tout compte créé est trace, quelle que soit la voie.
 */
export const onAuthUserCreated = functionsV1
  .region("europe-west1")
  .auth.user()
  .onCreate(async (user) => {
    const providers = (user.providerData || []).map((p) => p.providerId).join(", ") || "inconnu";
    await logAudit(user.uid, "ACCOUNT_CREATED", {
      actorType: "client",
      actorUid: user.uid,
      summary: `Création du compte${user.email ? " (" + user.email + ")" : ""} — connexion : ${providers}.`,
      meta: { email: user.email ?? null, providers },
    });
    console.log(`[audit] ACCOUNT_CREATED ${user.uid} (${providers})`);
  });

/**
 * Trigger PLANIFIÉ : purgeExpiredAudit
 *
 * La conservation FINMA est de 10 ans — au-delà, la nLPD impose de NE PLUS garder.
 * Cette purge mensuelle efface les événements d'audit dont `retainUntil` est
 * dépassé, ET leurs documents archivés dans auditArchive/.
 *
 * Requête collectionGroup sur `retainUntil` (index simple auto-provisionné à la
 * 1re exécution ; le log donne le lien de création si besoin). Best-effort par
 * événement : un échec n'interrompt pas la purge des autres.
 */
export const purgeExpiredAudit = onSchedule(
  { schedule: "0 3 1 * *", timeZone: "Europe/Zurich", region: "europe-west1" },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const bucket = admin.storage().bucket(AUDIT_BUCKET);
    let purged = 0;

    const expired = await db
      .collectionGroup("events")
      .where("retainUntil", "<=", now)
      .limit(500)
      .get();

    for (const d of expired.docs) {
      try {
        const path = (d.data() as any)?.document?.storagePath;
        if (path) await bucket.file(path).delete().catch(() => undefined);
        await d.ref.delete();
        purged++;
      } catch (e) {
        console.error("[audit/purge] échec sur", d.ref.path, e);
      }
    }
    console.log(`[audit/purge] ${purged} événement(s) au-delà de 10 ans purgé(s).`);
  }
);

/**
 * Trigger PLANIFIÉ : notifyMariage5ans (quotidien, 08:00 Europe/Zurich)
 *
 * Notifie le client le jour où son mariage FRANCHIT 5 ans — mais UNIQUEMENT quand ce seuil
 * change réellement sa couverture décès (option « ciblée ») : conjoint ≥ 45 ans, AUCUN enfant
 * à charge, et affilié LPP (ou conjointe = femme, pour la rente de veuve AVS). Sinon le jalon
 * ne débloque aucune rente → pas de notification.
 *
 * - Fenêtre de 3 jours (rattrape un run manqué) : anniv5 ∈ [today - 3j, today].
 *   → Pas de « backfill » : les couples mariés depuis longtemps ont un anniv5 hors fenêtre.
 * - Dédup via le flag `_mariage5ansNotifie` posé sur le doc RACINE clients/{uid} (PAS sur
 *   DonneePersonnelles → n'entraîne pas de recalcul via onClientDataUpdate).
 */
export const notifyMariage5ans = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Europe/Zurich", region: "europe-west1" },
  async () => {
    const WINDOW_DAYS = 3;
    const today = new Date();
    let sent = 0;

    const snap = await db.collectionGroup("DonneePersonnelles").get();
    for (const doc of snap.docs) {
      if (doc.id !== "current") continue;
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      const d = doc.data() as any;

      // Couple + date de mariage renseignée
      if (![1, 3].includes(Number(d.Enter_etatCivil))) continue;
      const dm = d.Enter_dateMariage;
      if (!dm) continue;
      const [dd, mm, yy] = String(dm).split(".").map((v: string) => parseInt(v, 10));
      if (!yy || !mm || !dd) continue;

      // Franchissement des 5 ans dans la fenêtre [today - WINDOW, today] ?
      const anniv5 = new Date(yy + 5, mm - 1, dd);
      const diffDays = Math.floor((today.getTime() - anniv5.getTime()) / 86400000);
      if (diffDays < 0 || diffDays > WINDOW_DAYS) continue;

      // Le seuil des 5 ans change-t-il vraiment la couverture de survivant ?
      const spouseAge = computeAgeOn(d.Enter_spouseDateNaissance, today);
      const aEnfantACharge = hasEnfantOrphelinEligibleAt(d as ClientData, today);
      const spouseFemale = Number(d.Enter_spouseSexe) === 1;
      const affilieLPP = d.Enter_Affilie_LPP === true;
      const unlocks = spouseAge >= 45 && !aEnfantACharge && (affilieLPP || spouseFemale);
      if (!unlocks) continue;

      // Dédup : flag sur le doc RACINE (aucun trigger de recalcul).
      const rootRef = db.collection("clients").doc(uid);
      const root = await rootRef.get();
      if ((root.data() as any)?._mariage5ansNotifie === true) continue;

      await rootRef.collection("notifications").add({
        title: "Couverture décès améliorée",
        content:
          "Vos 5 ans de mariage sont atteints : en cas de décès, votre conjoint bénéficie désormais d'une rente de survivant à vie (AVS/LPP), même sans enfant à charge.",
        type: "success",
        category: "PREVOYANCE",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: "/dashboard/prevoyance",
      });
      await rootRef.set({ _mariage5ansNotifie: true }, { merge: true });
      sent++;
    }
    console.log(`[notifyMariage5ans] ${sent} notification(s) « 5 ans de mariage » envoyée(s).`);
  }
);

/**
 * Trigger : onReferralSignup
 * À la CRÉATION d'un clients/{uid} portant `invitedBy` (code de parrainage), on crée
 * l'enregistrement `referrals` (REGISTERED, expiresAt = +20 j), on pose `referredBy` (uid du
 * parrain résolu), et on notifie parrain + admin. Idempotent (1 reco max par filleul).
 */
export const onReferralSignup = onDocumentCreated(
  { document: "clients/{uid}", region: "europe-west1" },
  async (event) => {
    const uid = event.params.uid;
    const data = event.data?.data() as any;
    const code = String(data?.invitedBy || "").trim();
    if (!code) return;

    // Déjà une reco pour ce filleul ? (idempotence)
    const existing = await db.collection("referrals").where("refereeUid", "==", uid).limit(1).get();
    if (!existing.empty) return;

    // Résoudre le code → parrain
    const refSnap = await db.collection("clients").where("referralCode", "==", code).limit(1).get();
    if (refSnap.empty) return;
    const referrerUid = refSnap.docs[0].id;
    if (referrerUid === uid) return; // pas d'auto-parrainage

    const now = Date.now();
    const refereeName =
      [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim() ||
      data?.displayName || data?.email || "Filleul";

    await db.collection("referrals").add({
      referrerUid, referrerCode: code, refereeUid: uid, refereeName,
      status: "REGISTERED",
      createdAt: now, updatedAt: now,
      expiresAt: now + 20 * 24 * 3600 * 1000,
    });
    await db.collection("clients").doc(uid).set({ referredBy: referrerUid, updatedAt: now }, { merge: true });

    // Notif PARRAIN (fan-out FCM via onNotificationCreated)
    await db.collection("clients").doc(referrerUid).collection("notifications").add({
      title: "Votre invité s'est inscrit 🎉",
      content: `${refereeName} a rejoint CreditX grâce à votre recommandation. Récompense dès qu'il signe un nouveau 3e pilier.`,
      type: "success", category: "PREVOYANCE", read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Notif ADMIN
    const parrain = refSnap.docs[0].data() as any;
    const referrerName =
      [parrain?.firstName, parrain?.lastName].filter(Boolean).join(" ").trim() || parrain?.displayName || null;
    await db.collection("admin_notifications").add({
      event: "NEW_REFERRAL_SIGNUP",
      title: "Nouveau filleul inscrit",
      content: `${refereeName} s'est inscrit PAR RECOMMANDATION${referrerName ? ` (parrain : ${referrerName})` : ""}.`,
      category: "SOUSCRIPTION", type: "success", actionUrl: "/admin/clients",
      clientUid: uid, clientName: refereeName, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[referral] signup ${uid} ← parrain ${referrerUid}`);
  }
);

/**
 * Cron : expireReferrals (quotidien, 07:00) — une reco REGISTERED dont expiresAt (= inscription
 * +20 j) est dépassé SANS 3a signé passe à EXPIRED (le parrain peut réinviter). Ne touche jamais
 * REWARD_DUE / PAID. Filtre expiresAt en mémoire → pas d'index composite requis.
 */
export const expireReferrals = onSchedule(
  { schedule: "0 7 * * *", timeZone: "Europe/Zurich", region: "europe-west1" },
  async () => {
    const now = Date.now();
    const snap = await db.collection("referrals").where("status", "==", "REGISTERED").get();
    let n = 0;
    for (const d of snap.docs) {
      const r = d.data() as any;
      if (Number(r.expiresAt) && Number(r.expiresAt) < now) {
        await d.ref.set({ status: "EXPIRED", updatedAt: now }, { merge: true });
        n++;
      }
    }
    console.log(`[referral] ${n} reco(s) expirée(s).`);
  }
);
