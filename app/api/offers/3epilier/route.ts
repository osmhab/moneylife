// app/api/offers/3epilier/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { sendNew3eOfferEmail } from "lib/email/sendNew3eOfferRequestEmail";

/**
 * Réception d'une demande d'offres 3e pilier.
 * - Sauvegarde de la configuration dans Firestore
 * - Création d'une entrée "offers_requests_3e"
 * - Envoi d'un mail à offers@moneylife.ch
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      config,
      offerName,
      pricingContext,
      totalRiskPremium,
      netSavingsPremium,
      profession,
      heightCm,
      weightKg,
      offerStartDate,
      requiresHealthQuestionnaire,
      contact,
    } = body ?? {};

    // État civil envoyé par le front ? sinon null
    const etatCivilLabel = contact?.etatCivilLabel ?? null;

    if (!config || !config.id || !config.clientUid) {
      return NextResponse.json(
        { ok: false, error: "Missing config, config.id or config.clientUid" },
        { status: 400 }
      );
    }

    const configId: string = config.id;
    const clientUid: string = config.clientUid;
    const now = Date.now();

    // Normalisation minimale côté backend
    const snapshot = {
      ...config,
      clientUid,
      id: configId,
      offerName: offerName ?? config?.offerName ?? "Offre 1",
      profession: profession ?? null,
      heightCm: heightCm ?? null,
      weightKg: weightKg ?? null,
      pricingContext: pricingContext ?? null,
      totalRiskPremium: totalRiskPremium ?? 0,
      netSavingsPremium: netSavingsPremium ?? 0,
      offersRequestedAt: now,
      source: "configurateur-3epilier",
      // 🟢 on ajoute la date choisie par le client dans le snapshot
      offerStartDate: offerStartDate ?? config.offerStartDate ?? null,
      contact: {
        ...contact,
        etatCivilLabel: etatCivilLabel ?? null,
        requiresHealthQuestionnaire: Boolean(requiresHealthQuestionnaire),
      },
    };

    // 1) Sauvegarde dans le sous-dossier du client
    const clientConfigRef = db
      .collection("clients")
      .doc(clientUid)
      .collection("configs3e")
      .doc(configId);

    await clientConfigRef.set(snapshot, { merge: true });

    // 2) Vue globale des demandes d'offres 3e pilier
    const contactFirstName = contact?.firstName ?? null;
    const contactLastName = contact?.lastName ?? null;
    const clientName =
      [contactFirstName, contactLastName].filter(Boolean).join(" ") || null;

    // On réutilise configId comme ID du document => cohérent avec /admin/dashboard/[requestId]
    const offersRef = db.collection("offers_requests_3e").doc(configId);

    // Extraction (optionnelle) des couvertures de risques depuis config
    const riskInvalidityRente =
      (config as any).riskInvalidityRente ??
      (config as any).invalidityMonthlyRente ??
      null;

    const riskInvalidityCapital =
      (config as any).riskInvalidityCapital ??
      (config as any).invalidityCapital ??
      null;

    const riskDeathCapital =
      (config as any).riskDeathCapital ??
      (config as any).deathCapital ??
      null;

    const riskPremiumWaiver =
      (config as any).riskPremiumWaiver ??
      (config as any).waiverOfPremium ??
      null;

    await offersRef.set(
      {
        configId,
        clientUid,
        offerName: offerName ?? config?.offerName ?? "Offre 1",
        type: config.type,
        status: "nouvelle",
        premiumAmount: config.premiumAmount,
        premiumFrequency: config.premiumFrequency,
        totalRiskPremium: totalRiskPremium ?? 0,
        netSavingsPremium: netSavingsPremium ?? 0,
        profession: profession ?? null,
        offerStartDate: offerStartDate ?? null,
        requiresHealthQuestionnaire: Boolean(requiresHealthQuestionnaire),
        createdAt: now,
        updatedAt: now,
        source: "configurator-3epilier",
        clientName,
        contact: {
          ...contact,
          etatCivilLabel: etatCivilLabel ?? null,
        },
        riskInvalidityRente,
        riskInvalidityCapital,
        riskDeathCapital,
        riskPremiumWaiver,

        // 🧩 snapshot complet de la config pour le backoffice
        configSnapshot: snapshot,
      },
      { merge: true }
    );

    // 3) Envoi de l'email à l'équipe MoneyLife via le helper
    await sendNew3eOfferEmail({
      configId,
      clientUid,
      config: {
        type: config.type,
        premiumAmount: config.premiumAmount,
        premiumFrequency: config.premiumFrequency,
        offerName: offerName ?? config?.offerName ?? "Offre 1",
        offerStartDate: offerStartDate ?? config.offerStartDate ?? null,
      },
      contact: {
        ...contact,
        etatCivilLabel,
      },
      pricingContext: pricingContext ?? null,
      totalRiskPremium: totalRiskPremium ?? null,
      netSavingsPremium: netSavingsPremium ?? null,
      requiresHealthQuestionnaire: Boolean(requiresHealthQuestionnaire),
    });

    // 4) Réponse au front
    // ⚠️ on renvoie `id` ET `configId` pour compatibilité avec le front
    return NextResponse.json({ ok: true, id: configId, configId });
  } catch (err) {
    console.error("[3e pilier] Erreur POST /api/offers/3epilier:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}