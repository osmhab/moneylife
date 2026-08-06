// app/api/referral/summary/route.ts
// Tout ce dont l'écran « Recommandation » iOS a besoin : code + lien, montant en vigueur,
// coordonnées de versement (pré-remplies), et la liste des filleuls (inscrits via le lien).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db } from "@/lib/firebase/admin";
import { ensureReferralCode, referralLink, DEFAULT_REWARD_CHF } from "@/lib/server/referral";

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const code = await ensureReferralCode(uid);

    const [clientSnap, dpSnap, settingsSnap] = await Promise.all([
      db.collection("clients").doc(uid).get(),
      db.doc(`clients/${uid}/DonneePersonnelles/current`).get(),
      db.doc("referralSettings/current").get(),
    ]);
    const c = clientSnap.data() || {};
    const dp = dpSnap.data() || {};

    // Barème + promo (pour le compte à rebours « Termine dans X jours » façon Revolut).
    const s = settingsSnap.data() || {};
    const base = Number(s.amountCHF) || DEFAULT_REWARD_CHF;
    const promoAmt = Number(s.promoAmountCHF) || 0;
    const promoUntil = Number(s.promoUntil) || 0;
    const promoActive = promoAmt > 0 && promoUntil > Date.now();
    const amountCHF = promoActive ? promoAmt : base;
    const promoDaysLeft = promoActive ? Math.max(1, Math.ceil((promoUntil - Date.now()) / 86400000)) : null;

    // Filleuls : comptes inscrits avec CE code (invitedBy). Statut affiné en Phase 3 (récompense).
    const refereesSnap = await db.collection("clients").where("invitedBy", "==", code).get();
    const referees = refereesSnap.docs.map((d) => {
      const r = d.data() || {};
      const name =
        [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
        (r.displayName as string) ||
        (r.email as string) ||
        "Filleul";
      return {
        name,
        status: "REGISTERED",
        createdAt: Number(r.createdAt) || null,
      };
    });

    return NextResponse.json({
      code,
      link: referralLink(code),
      amountCHF,
      promoDaysLeft,
      payout: {
        // Pré-remplissage : valeur déjà saisie pour le versement, sinon le profil.
        prenom: (c.referralPrenom as string) || (dp.Enter_prenom as string) || (c.firstName as string) || "",
        nom: (c.referralNom as string) || (dp.Enter_nom as string) || (c.lastName as string) || "",
        iban: (c.referralIban as string) || "",
        npa: (c.referralNpa as string) || (dp.Enter_npa != null ? String(dp.Enter_npa) : ""),
        localite: (c.referralLocalite as string) || (dp.Enter_localite as string) || "",
      },
      referees,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
