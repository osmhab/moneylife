// lib/shared/core/audit.ts
//
// PISTE D'AUDIT — modèle partagé (web + moteur Cloud Functions).
//
// Objectif FINMA : tracer TOUT ce que fait un client (création de compte, ajout/
// scan/saisie de document, modification d'information, signature, suppression…)
// de façon INALTÉRABLE et EXPORTABLE en PDF à tout moment.
//
// Deux exigences structurantes, encodées ailleurs mais à garder en tête ici :
//   1. INALTÉRABILITÉ : les événements ne s'écrivent que côté serveur (Admin SDK),
//      jamais de update/delete (cf. firestore.rules → auditTrail).
//   2. RÉTENTION : la piste vit dans la collection racine `auditTrail/{uid}`,
//      HORS de `clients/{uid}` — elle SURVIT donc à la suppression du compte
//      (self-service ou cascade). C'est la preuve que la FINMA peut exiger même
//      après qu'un client a exercé son droit à l'effacement.
//
// Ce fichier est PUR (aucune dépendance Firebase) pour être importable des deux
// côtés. L'écriture réelle se fait via app/lib/server/audit.ts (web) et
// directement dans engine/src/index.ts (moteur), avec leur propre Admin SDK.

/**
 * Durée de conservation légale : 10 ans (CO art. 958f — documents commerciaux ;
 * aligné avec LSFin/FIDLEG et LBA). Au-delà, la nLPD impose de NE PLUS conserver.
 * Chaque événement porte donc un `retainUntil` = date + 10 ans, et une purge
 * planifiée efface ce qui a dépassé ce terme (événement + document archivé).
 */
export const AUDIT_RETENTION_YEARS = 10;

export type AuditEventType =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_DELETED"
  | "PROFILE_UPDATED"
  | "PLAN_ADDED"
  | "PLAN_UPDATED"
  | "PLAN_REPLACED"
  | "PLAN_DELETED"
  | "DOCUMENT_ADDED"
  | "OFFER_SIGNED"
  | "OFFER_REJECTED";

/** Qui est à l'origine de l'événement. */
export type AuditActorType = "client" | "admin" | "system";

/** Un changement de champ (avant → après), pour les modifications de profil. */
export interface AuditFieldChange {
  field: string;
  label: string; // libellé lisible (ex. "Salaire annuel")
  before: unknown;
  after: unknown;
}

/** Référence à un document justificatif, conservé en Storage (chemin de rétention). */
export interface AuditDocumentRef {
  fileName?: string;
  storagePath?: string; // chemin Storage de RÉTENTION (auditArchive/…, hors clients/{uid})
  sourceUrl?: string; // lien d'origine (sous clients/{uid}, PURGÉ à la suppression)
  docType?: string; // ex. "Certificat LPP", "Police 3a"
  method?: "scan" | "import" | "manuel"; // comment le document est entré dans l'app
  // Le document a-t-il été COPIÉ dans l'archive de rétention ? Si false, seul le
  // lien d'origine existe — il disparaîtra à la suppression du compte. Sert à
  // repérer les pièces non sécurisées (best-effort côté copie).
  retained?: boolean;
}

export interface AuditEvent {
  uid: string; // client concerné
  type: AuditEventType;
  at: number; // epoch ms (l'écriture serveur pose aussi un serverTimestamp faisant foi)
  actorType: AuditActorType;
  actorUid?: string | null; // uid de l'acteur (client lui-même, admin, ou null=system)
  summary: string; // phrase FR prête à afficher/exporter
  changes?: AuditFieldChange[]; // pour PROFILE_UPDATED
  document?: AuditDocumentRef | null; // pour DOCUMENT_ADDED
  meta?: Record<string, unknown>; // divers (institution, planId, montant…)
}

/** Libellé FR d'un type d'événement — pour l'en-tête de ligne et le PDF. */
export const AUDIT_LABELS: Record<AuditEventType, string> = {
  ACCOUNT_CREATED: "Création du compte",
  ACCOUNT_DELETED: "Suppression du compte",
  PROFILE_UPDATED: "Modification des informations",
  PLAN_ADDED: "Ajout d'un plan",
  PLAN_UPDATED: "Modification d'un plan",
  PLAN_REPLACED: "Remplacement d'un document",
  PLAN_DELETED: "Suppression d'un plan",
  DOCUMENT_ADDED: "Ajout d'un document",
  OFFER_SIGNED: "Signature d'une offre",
  OFFER_REJECTED: "Refus d'une offre",
};

/**
 * Champs à IGNORER dans le diff de profil : déclencheurs internes et horodatages
 * techniques, qui n'ont aucune valeur de preuve et pollueraient la piste.
 */
export const AUDIT_IGNORED_FIELDS = new Set([
  "_lastEngineTrigger",
  "_lastPlanUpdateTrigger",
  "updatedAt",
  "createdAt",
  "photoURL",
]);

/** Libellés lisibles des champs profil les plus courants (extensible). */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  Enter_prenom: "Prénom",
  Enter_nom: "Nom",
  Enter_dateNaissance: "Date de naissance",
  Enter_sexe: "Sexe",
  Enter_etatCivil: "État civil",
  Enter_nationalite: "Nationalité",
  Enter_telephone: "Téléphone",
  Enter_adresse: "Adresse",
  Enter_npa: "NPA",
  Enter_localite: "Localité",
  Enter_profession: "Profession",
  Enter_statutProfessionnel: "Statut professionnel",
  Enter_salaireAnnuel: "Salaire annuel",
  Enter_permisSejour: "Permis de séjour",
  Enter_enfants: "Enfants",
  Enter_spousePrenom: "Prénom du conjoint",
  Enter_spouseNom: "Nom du conjoint",
  Enter_spouseDateNaissance: "Date de naissance du conjoint",
};

export function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? field;
}

/**
 * Calcule le diff entre deux versions d'un objet profil.
 * Ne retient que les champs réellement modifiés et pertinents (hors ignorés).
 * Sert de source unique côté moteur (onClientDataUpdate) ET web.
 */
export function diffProfile(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): AuditFieldChange[] {
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: AuditFieldChange[] = [];

  for (const field of keys) {
    if (AUDIT_IGNORED_FIELDS.has(field)) continue;
    const bv = a[field];
    const av = b[field];
    // Comparaison structurelle simple (les valeurs profil sont scalaires ou
    // petits tableaux/objets sérialisables).
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    changes.push({ field, label: auditFieldLabel(field), before: bv ?? null, after: av ?? null });
  }
  return changes;
}
