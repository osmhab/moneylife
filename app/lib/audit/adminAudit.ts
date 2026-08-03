// app/lib/audit/adminAudit.ts
import { db } from "app/lib/firebase/admin";

export type AuditAction =
  | "client.create"
  | "client.set_email"
  | "client.status_update"
  | "client.reset_link_generated"
  | "client.reset_email_sent"
  | "client.welcome_email_sent"
  | "client.notes_update";

export type AuditActor = {
  uid: string;
  email?: string | null;
};

export type AuditTarget = {
  clientUid?: string | null;
  clientEmail?: string | null;
  requestId?: string | null; // si un jour tu logs par demande d'offre
};

export async function writeAdminAudit(args: {
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  meta?: Record<string, unknown>;
}) {
  const now = Date.now();

  const doc = {
    action: args.action,
    actor: {
      uid: args.actor.uid,
      email: args.actor.email ?? null,
    },
    target: {
      clientUid: args.target?.clientUid ?? null,
      clientEmail: args.target?.clientEmail ?? null,
      requestId: args.target?.requestId ?? null,
    },
    meta: args.meta ?? {},
    createdAt: now,
  };

  // Collection globale (simple, indexable)
  await db.collection("admin_audit").add(doc);
}