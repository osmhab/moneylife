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

    // On liste les docs (questionnaires) sous health_lifestyle_3epilier
    const col = db.collection(`clients/${uid}/health_lifestyle_3epilier`);
    const snap = await col.orderBy("updatedAt", "desc").limit(10).get().catch(async () => {
      // Si pas d’index / champ absent, fallback sans orderBy
      return await col.limit(10).get();
    });

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    return NextResponse.json({
      ok: true,
      uid,
      items,
    });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}