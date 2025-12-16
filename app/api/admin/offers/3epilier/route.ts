// app/api/admin/offers/3epilier/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import "@/lib/firebase/admin"; // s'assure que l'admin SDK est initialisé
import type { ManualOfferPayload } from "lib/offers/parsers/types";

type Mode = "save" | "send";

interface SaveOffersBody {
  requestId: string;
  mode: Mode;
  offers: (ManualOfferPayload & { id?: string })[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveOffersBody;
    const { requestId, mode, offers } = body;

    if (!requestId || !mode || !Array.isArray(offers)) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

    // Normalisation/sécurisation des champs "optionnels" (sinon tu te retrouves avec des undefined/valeurs bizarres)
    const normalizedOffers = (offers ?? []).map((o) => {
      const anyO = o as any;

      const healthQuestionnaireRequired =
        typeof anyO.healthQuestionnaireRequired === "boolean"
          ? anyO.healthQuestionnaireRequired
          : null;

      const healthQuestionnaireUrl =
        typeof anyO.healthQuestionnaireUrl === "string" && anyO.healthQuestionnaireUrl.trim()
          ? anyO.healthQuestionnaireUrl.trim()
          : null;

      // TAN: on garde uniquement digits, max 4, sinon null
      const healthQuestionnaireTanRaw =
        typeof anyO.healthQuestionnaireTan === "string" ? anyO.healthQuestionnaireTan : "";
      const healthQuestionnaireTanDigits = healthQuestionnaireTanRaw.replace(/\D/g, "").slice(0, 4);
      const healthQuestionnaireTan = healthQuestionnaireTanDigits ? healthQuestionnaireTanDigits : null;

      const signingDocsUrl =
        typeof anyO.signingDocsUrl === "string" && anyO.signingDocsUrl.trim()
          ? anyO.signingDocsUrl.trim()
          : null;

      // PIN: digits only, max 4, sinon null
      const signingDocsPinRaw = typeof anyO.signingDocsPin === "string" ? anyO.signingDocsPin : "";
      const signingDocsPinDigits = signingDocsPinRaw.replace(/\D/g, "").slice(0, 4);
      const signingDocsPin = signingDocsPinDigits ? signingDocsPinDigits : null;

      return {
        ...o,
        healthQuestionnaireRequired,
        healthQuestionnaireUrl,
        healthQuestionnaireTan,
        signingDocsUrl,
        signingDocsPin,
      };
    });

    // Logs debug (pour confirmer si ton front envoie bien TAN/URL)
    console.log("[admin/offers/3epilier] mode =", mode, "requestId =", requestId);
    console.log("[admin/offers/3epilier] offers count =", normalizedOffers.length);

    if (normalizedOffers[0]) {
      const a: any = normalizedOffers[0];
      console.log("[admin/offers/3epilier] sample normalized offer =", {
        id: a.id,
        insurer: a.insurer,
        healthQuestionnaireRequired: a.healthQuestionnaireRequired,
        healthQuestionnaireUrl: a.healthQuestionnaireUrl,
        healthQuestionnaireTan: a.healthQuestionnaireTan,
        signingDocsUrl: a.signingDocsUrl,
        signingDocsPin: a.signingDocsPin,
      });
    }

    const db = getFirestore();
    const ref = db.collection("offers_requests_3e").doc(requestId);

    const update: Record<string, any> = {
      adminOffers: normalizedOffers,
      adminOffersStatus: mode === "save" ? "saved" : "sent",
      adminOffersUpdatedAt: new Date(),
    };

    // Si tu veux marquer explicitement que le client peut voir les offres quand mode = "send"
    if (mode === "send") {
      update.adminOffersVisibleToClient = true;
    }

    await ref.set(update, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API admin/offers/3epilier] Erreur:", e);
    return NextResponse.json({ error: "Erreur interne serveur" }, { status: 500 });
  }
}