import { NextResponse } from "next/server";
import { authAdmin } from "app/lib/firebase/admin";
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
  email: string;
  // optionnel: où rediriger après reset (ex: /login)
  continueUrl?: string;
};

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);

    const body = (await req.json()) as Body;
    const email = (body?.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const continueUrl = (body?.continueUrl || "").trim();

const link = continueUrl
  ? await authAdmin.generatePasswordResetLink(email, { url: continueUrl })
  : await authAdmin.generatePasswordResetLink(email);

    await writeAdminAudit({
  action: "client.reset_link_generated",
  actor: { uid: decoded.uid, email: decoded.email || null },
  target: { clientEmail: email },
});

return NextResponse.json({ ok: true, email, link });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code =
      msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}