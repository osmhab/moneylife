import { NextResponse } from "next/server";
import { authAdmin, db } from "app/lib/firebase/admin";

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

export async function GET(req: Request) {
  try {
    await requireInternal(req);

    const url = new URL(req.url);
    const uid = (url.searchParams.get("uid") || "").trim();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const snap = await db.collection("clients").doc(uid).get();
    const data = (snap.exists ? snap.data() : null) as any;

    return NextResponse.json({
      ok: true,
      uid,
      exists: snap.exists,
      email: data?.email ?? null,
      status: data?.status ?? "active",
      internalNotes: data?.internalNotes ?? "",
      createdAt: data?.createdAt ?? null,
      updatedAt: data?.updatedAt ?? null,
    });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}