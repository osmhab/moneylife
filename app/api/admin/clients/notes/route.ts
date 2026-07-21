import { NextResponse } from "next/server";
import { authAdmin, db } from "app/lib/firebase/admin";
import { writeAdminAudit } from "app/lib/audit/adminAudit";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

function isInternalDecoded(decoded: any) {
  const email = (decoded?.email || "").toLowerCase();
  const uid = decoded?.uid;

  return (
    INTERNAL_UIDS.has(uid) ||
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

type Body = {
  uid: string;
  internalNotes: string;
};

export async function PATCH(req: Request) {
  try {
    const decoded = await requireInternal(req);

    const body = (await req.json()) as Body;
    const uid = (body?.uid || "").trim();
    const internalNotes = typeof body?.internalNotes === "string" ? body.internalNotes : "";

    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    await db.collection("clients").doc(uid).set(
      {
        internalNotes,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    await writeAdminAudit({
    action: "client.notes_update",
    actor: { uid: decoded.uid, email: decoded.email || null },
    target: { clientUid: uid },
    meta: { length: internalNotes.length },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}