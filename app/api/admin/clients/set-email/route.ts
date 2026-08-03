import { NextResponse } from "next/server";
import { authAdmin, db } from "app/lib/firebase/admin";
import { writeAdminAudit } from "app/lib/audit/adminAudit";

// Convertit un PROSPECT (compte Auth sans email) en compte connectable : on ajoute
// l'email + un mot de passe au MÊME compte Auth (même uid) → aucune donnée déplacée,
// tout le dossier préparé est conservé.

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

function isInternalDecoded(decoded: any) {
  const email = (decoded?.email || "").toLowerCase();
  return (
    INTERNAL_UIDS.has(decoded?.uid) ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  );
}

async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await authAdmin.verifyIdToken(token);
  if (!isInternalDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}

function randomPassword() {
  return "ML!" + Math.random().toString(36).slice(2) + "9A";
}

type Body = { uid: string; email: string; tempPassword?: string };

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);
    const body = (await req.json()) as Body;

    const uid = (body?.uid || "").trim();
    const email = (body?.email || "").trim().toLowerCase();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const tempPassword = (body?.tempPassword || randomPassword()).trim();

    // Ajoute l'email + un mot de passe au compte Auth EXISTANT (le prospect devient
    // connectable). Même uid → le dossier reste intact.
    await authAdmin.updateUser(uid, {
      email,
      password: tempPassword,
      emailVerified: false,
    });

    const now = Date.now();
    await db.collection("clients").doc(uid).set(
      { email, status: "active", updatedAt: now },
      { merge: true }
    );

    await writeAdminAudit({
      action: "client.set_email",
      actor: { uid: decoded.uid, email: decoded.email || null },
      target: { clientUid: uid, clientEmail: email },
      meta: { source: "admin_prospect_convert" },
    });

    return NextResponse.json({ ok: true, uid, email, tempPassword });
  } catch (e: any) {
    // ex. auth/email-already-exists
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
