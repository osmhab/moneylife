import { NextResponse } from "next/server";
import { authAdmin, db } from "app/lib/firebase/admin";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2", // rules
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2", // RequireAdmin.tsx
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

type ClientRow = {
  uid: string;
  email?: string | null;

  firstName?: string;
  lastName?: string;
  birthdate?: string;

  status?: string;
  createdAt?: number;
  updatedAt?: number;
  referred?: boolean;

  hasDonneesPersonnelles: boolean;
};

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

export async function GET(req: Request) {
  try {
    await requireInternal(req);

    const url = new URL(req.url);
    const q = normalize(url.searchParams.get("q") || "");
    const status = normalize(url.searchParams.get("status") || "");
    const hasDP = normalize(url.searchParams.get("hasDP") || "all"); // all | yes | no

    const limitParam = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 50;

    // Source "stable": docs racine clients/{uid}
    const rootSnap = await db.collection("clients").limit(limit).get();

    const rows = await Promise.all(
      rootSnap.docs.map(async (d) => {
        const uid = d.id;
        const root = (d.data() || {}) as any;

        const dpRef = db.doc(`clients/${uid}/DonneePersonnelles/current`);
        const dpSnap = await dpRef.get();
        const dp = (dpSnap.exists ? dpSnap.data() : null) as any;

        const row: ClientRow = {
          uid,
          email: root?.email ?? null,

          firstName: dp?.Enter_prenom,
          lastName: dp?.Enter_nom,
          birthdate: dp?.Enter_dateNaissance,

          status: root?.status,
          createdAt: root?.createdAt,
          updatedAt: root?.updatedAt,

          // Parrainage : ce client est-il venu PAR RECOMMANDATION ? (badge liste)
          referred: !!root?.referredBy,

          hasDonneesPersonnelles: !!dpSnap.exists,
        };

        return row;
      })
    );

    let filtered = rows;

    // ✅ Nouveau filtre: avec / sans données personnelles
    if (hasDP === "yes") {
      filtered = filtered.filter((r) => r.hasDonneesPersonnelles);
    } else if (hasDP === "no") {
      filtered = filtered.filter((r) => !r.hasDonneesPersonnelles);
    }

    if (status) {
      filtered = filtered.filter((r) => normalize(r.status || "") === status);
    }

    if (q) {
      filtered = filtered.filter((r) => {
        const hay = normalize(
          [r.uid, r.email || "", r.firstName || "", r.lastName || "", r.birthdate || ""].join(" ")
        );
        return hay.includes(q);
      });
    }

    filtered.sort((a, b) => {
      if (a.hasDonneesPersonnelles !== b.hasDonneesPersonnelles) {
        return a.hasDonneesPersonnelles ? -1 : 1;
      }
      const an = normalize((a.lastName || "") + " " + (a.firstName || ""));
      const bn = normalize((b.lastName || "") + " " + (b.firstName || ""));
      return an.localeCompare(bn);
    });

    return NextResponse.json({ ok: true, items: filtered });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}