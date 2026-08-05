// app/api/admin/clients/referral/route.ts
// Infos parrainage d'UN client (fiche CRM) : son code, qui l'a recommandé (referredBy),
// ses coordonnées bancaires, et ses filleuls. Réservé interne.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/server/requireInternal";
import { db } from "@/lib/firebase/admin";
import { ensureReferralCode } from "@/lib/server/referral";

async function nameOf(uid: string): Promise<string> {
  const c = (await db.collection("clients").doc(uid).get()).data() || {};
  const dp = (await db.doc(`clients/${uid}/DonneePersonnelles/current`).get()).data() || {};
  return (
    [dp.Enter_prenom || c.firstName, dp.Enter_nom || c.lastName].filter(Boolean).join(" ").trim() ||
    (c.displayName as string) || (c.email as string) || uid
  );
}

export async function GET(req: NextRequest) {
  try { await requireInternal(req); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  try {
    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    // GARANTIT un code unique (réutilise l'existant, en crée un sinon) → source unique app/conseil.
    const referralCode = await ensureReferralCode(uid);
    const c = (await db.collection("clients").doc(uid).get()).data() || {};

    // Recommandé par (parrain) ?
    let referredBy: { uid: string; name: string } | null = null;
    if (c.referredBy) referredBy = { uid: c.referredBy, name: await nameOf(c.referredBy) };

    // Ses filleuls (records referrals où il est parrain).
    const refSnap = await db.collection("referrals").where("referrerUid", "==", uid).get();
    const referees = refSnap.docs
      .map((d) => {
        const r = d.data();
        return {
          id: d.id,
          name: (r.refereeName as string) || "Filleul",
          status: (r.status as string) || "REGISTERED",
          amountCHF: Number(r.amountCHF) || null,
          createdAt: Number(r.createdAt) || null,
        };
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      referralCode,
      bank: {
        iban: (c.referralIban as string) || "",
        method: (c.referralPaymentMethod as string) || "",
        phone: (c.referralPhone as string) || "",
      },
      referredBy,
      referees,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}
