// app/api/admin/parrainage/route.ts
// Back-office parrainage : GET = barème + récompenses à payer ; POST = régler le barème /
// marquer payé / annuler. Réservé interne (requireInternal).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/server/requireInternal";
import { db } from "@/lib/firebase/admin";
import { getReferralAmountCHF, DEFAULT_REWARD_CHF, ensureReferralCode } from "@/lib/server/referral";
import { notifyClient } from "@/lib/server/notify";
import { sendCreditXReferralPromoEmail, sendCreditXAppAvailableEmail } from "lib/mail/creditx-mailer";

async function clientBrief(uid: string) {
  const c = (await db.collection("clients").doc(uid).get()).data() || {};
  const dp = (await db.doc(`clients/${uid}/DonneePersonnelles/current`).get()).data() || {};
  const name =
    [dp.Enter_prenom || c.firstName, dp.Enter_nom || c.lastName].filter(Boolean).join(" ").trim() ||
    (c.displayName as string) || (c.email as string) || uid;
  return {
    uid, name,
    iban: (c.referralIban as string) || "",
    method: (c.referralPaymentMethod as string) || "IBAN",
    phone: (c.referralPhone as string) || "",
    email: (c.email as string) || "",
  };
}

export async function GET(req: NextRequest) {
  try { await requireInternal(req); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  try {
    const settingsDoc = (await db.doc("referralSettings/current").get()).data() || {};
    const currentAmount = await getReferralAmountCHF();

    const dueSnap = await db.collection("referrals").where("status", "==", "REWARD_DUE").get();
    const due = await Promise.all(
      dueSnap.docs.map(async (d) => {
        const r = d.data();
        return {
          id: d.id,
          amountCHF: Number(r.amountCHF) || currentAmount,
          refereeName: (r.refereeName as string) || "Filleul",
          refereeUid: r.refereeUid || null,
          rewardDueAt: Number(r.rewardDueAt) || null,
          parrain: await clientBrief(r.referrerUid),
        };
      })
    );
    due.sort((a, b) => (a.rewardDueAt || 0) - (b.rewardDueAt || 0));

    return NextResponse.json({
      settings: {
        amountCHF: Number(settingsDoc.amountCHF) || DEFAULT_REWARD_CHF,
        promoAmountCHF: Number(settingsDoc.promoAmountCHF) || 0,
        promoUntil: Number(settingsDoc.promoUntil) || 0,
      },
      currentAmount,
      due,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try { await requireInternal(req); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  try {
    const b = (await req.json()) as any;

    if (b.action === "settings") {
      await db.doc("referralSettings/current").set(
        {
          amountCHF: Number(b.amountCHF) || DEFAULT_REWARD_CHF,
          promoAmountCHF: Number(b.promoAmountCHF) || 0,
          promoUntil: Number(b.promoUntil) || 0,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if ((b.action === "pay" || b.action === "cancel") && b.id) {
      const ref = db.collection("referrals").doc(b.id);
      const r = (await ref.get()).data();
      if (!r) return NextResponse.json({ error: "introuvable" }, { status: 404 });
      if (b.action === "pay") {
        await ref.set({ status: "PAID", paidAt: Date.now(), updatedAt: Date.now() }, { merge: true });
        // Notif au parrain : récompense versée.
        await notifyClient({
          uid: r.referrerUid,
          title: "Récompense versée ✅",
          content: `Votre récompense de parrainage de ${Number(r.amountCHF) || ""} CHF a été versée. Merci !`,
          category: "PAIEMENT",
        });
      } else {
        await ref.set({ status: "CANCELLED", updatedAt: Date.now() }, { merge: true });
      }
      return NextResponse.json({ ok: true });
    }

    // ── Annoncer la promo à TOUS les clients (notification in-app + e-mail) ──
    // Déclenché manuellement depuis /admin/parrainage. Best-effort par client :
    // un échec (e-mail invalide, etc.) n'interrompt pas la diffusion.
    if (b.action === "announce") {
      const settings = (await db.doc("referralSettings/current").get()).data() || {};
      const amountCHF = await getReferralAmountCHF();
      const promoUntil = Number(settings.promoUntil) || 0;

      const clientsSnap = await db.collection("clients").get();
      let notified = 0;
      let emailed = 0;
      let skipped = 0;

      // Sériel (évite de saturer SendGrid / Firestore) — l'appel admin peut durer.
      for (const doc of clientsSnap.docs) {
        const uid = doc.id;
        const c = doc.data() || {};
        const email = (c.email as string) || "";

        // Notification in-app (non bloquante).
        await notifyClient({
          uid,
          title: `Parrainez un ami · ${Math.round(amountCHF)} CHF 🎁`,
          content:
            `Votre prime de recommandation passe à ${Math.round(amountCHF)} CHF par ami parrainé.` +
            (promoUntil > Date.now()
              ? ` Offre valable jusqu'au ${new Date(promoUntil).toLocaleDateString("fr-CH")}.`
              : "") +
            ` Partagez votre lien depuis « Recommandation ».`,
          category: "PAIEMENT",
          actionUrl: "/dashboard/prevoyance",
        });
        notified++;

        if (!email) { skipped++; continue; }

        // Prénom + code perso pour un e-mail personnalisé.
        let firstName = "";
        try {
          const dp = (await db.doc(`clients/${uid}/DonneePersonnelles/current`).get()).data() || {};
          firstName = (dp.Enter_prenom as string) || (c.firstName as string) || "";
        } catch { /* best-effort */ }

        let code = (c.referralCode as string) || "";
        if (!code) { try { code = await ensureReferralCode(uid); } catch { /* ignore */ } }

        try {
          await sendCreditXReferralPromoEmail({
            to: email,
            firstName,
            amountCHF,
            promoUntil,
            code: code || undefined,
          });
          emailed++;
        } catch (e) {
          console.error(`[parrainage/announce] e-mail échoué pour ${uid}:`, e);
        }
      }

      return NextResponse.json({ ok: true, total: clientsSnap.size, notified, emailed, skipped });
    }

    // ── Annoncer la DISPONIBILITÉ DE L'APP (e-mail localisé à tous les clients) ──
    // Mode test : { action: "announce-app", testEmail: "x@y.z" } → envoi unique.
    // Diffusion : { action: "announce-app" } → tous les clients.
    if (b.action === "announce-app") {
      // Envoi de test à une seule adresse (aperçu avant diffusion).
      if (b.testEmail) {
        await sendCreditXAppAvailableEmail({ to: String(b.testEmail), firstName: "", locale: String(b.locale || "fr") });
        return NextResponse.json({ ok: true, test: true, to: b.testEmail });
      }

      const clientsSnap = await db.collection("clients").get();
      let emailed = 0;
      let skipped = 0;

      for (const doc of clientsSnap.docs) {
        const uid = doc.id;
        const c = doc.data() || {};
        const email = (c.email as string) || "";
        if (!email) { skipped++; continue; }

        // Prénom + langue depuis les données perso (repli fr).
        let firstName = "";
        let locale = "fr";
        try {
          const dp = (await db.doc(`clients/${uid}/DonneePersonnelles/current`).get()).data() || {};
          firstName = (dp.Enter_prenom as string) || (c.firstName as string) || "";
          const lg = String(dp.Enter_langue || c.langue || "fr").toLowerCase().slice(0, 2);
          if (["fr", "de", "it", "en"].includes(lg)) locale = lg;
        } catch { /* best-effort */ }

        try {
          await sendCreditXAppAvailableEmail({ to: email, firstName, locale });
          emailed++;
        } catch (e) {
          console.error(`[announce-app] e-mail échoué pour ${uid}:`, e);
        }
      }

      return NextResponse.json({ ok: true, total: clientsSnap.size, emailed, skipped });
    }

    return NextResponse.json({ error: "action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}
