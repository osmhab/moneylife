// app/lib/server/audit.ts
//
// Écriture de la PISTE D'AUDIT côté web (Admin SDK). Source unique appelée par
// les routes serveur (signature, remplacement, suppression…).
//
// Emplacement : `auditTrail/{uid}/events/{autoId}`.
//   • RACINE (pas sous clients/{uid}) → survit à la suppression du compte, ce qui
//     est exactement le but : une preuve conservable même après effacement client.
//   • Append-only garanti par firestore.rules (create/update/delete: false pour
//     tout le monde ; seul l'Admin SDK, qui contourne les règles, écrit).
//
// Non bloquant : une écriture d'audit qui échoue ne doit jamais faire échouer
// l'action métier. On logue l'échec — mais un trou dans la piste est un risque
// de conformité, donc on le rend VISIBLE dans les logs serveur.

import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type {
  AuditEventType,
  AuditActorType,
  AuditFieldChange,
  AuditDocumentRef,
} from "lib/shared/core/audit";

export interface LogAuditInput {
  uid: string;
  type: AuditEventType;
  actorType: AuditActorType;
  actorUid?: string | null;
  summary: string;
  changes?: AuditFieldChange[];
  document?: AuditDocumentRef | null;
  meta?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const doc: Record<string, unknown> = {
      type: input.type,
      actorType: input.actorType,
      actorUid: input.actorUid ?? null,
      summary: input.summary,
      // `at` serveur : l'horodatage qui fait foi, non falsifiable par un client.
      at: FieldValue.serverTimestamp(),
    };
    if (input.changes?.length) doc.changes = input.changes;
    if (input.document) doc.document = input.document;
    if (input.meta) doc.meta = input.meta;

    await db.collection("auditTrail").doc(input.uid).collection("events").add(doc);
  } catch (e) {
    // Volontairement non bloquant, mais RENDU VISIBLE : un trou dans la piste
    // d'audit est un risque FINMA, il ne doit pas passer inaperçu.
    console.error(`[audit] ÉCHEC d'écriture (uid=${input.uid}, type=${input.type}) :`, e);
  }
}
