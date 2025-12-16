// app/api/health/ai-block/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import {
  HealthQuestionnaire3e,
  HealthAIQuestionAnswer,
  HealthAIBlocKind,
} from "@/lib/core/types";

export const runtime = "nodejs";

/* ============================================================
   TYPES ET CONTRAT
   ============================================================ */

type HealthAIBlockRequest = {
  clientUid: string;
  blockKind: HealthAIBlocKind;
  blockId: string;
  questionnaire: HealthQuestionnaire3e;
  conversation: HealthAIQuestionAnswer[];
  lastUserMessage: string;
};

type HealthAIPatch = {
  casesToAdd?: any[];
  riskSportsToAdd?: any[];
  travelRisksToAdd?: any[];
  substanceUsesToAdd?: any[];
  insuranceHistoryToAdd?: any[];
};

type AskNextResponse = {
  status: "ask_next";
  nextQuestion: string;
};

type CompletedResponse = {
  status: "completed";
  summaryMarkdown?: string;
  genericSummary?: string;
  axaAuraSummary?: string;
  swisslifeSummary?: string;
  patch: HealthAIPatch;
};

type HealthAIBlockResponse = AskNextResponse | CompletedResponse;

/* ============================================================
   OPENAI CLIENT
   ============================================================ */

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

/* ============================================================
   JSON SCHEMA POUR STRUCTURED OUTPUT
   ============================================================ */

/**
 * ⚠️ IMPORTANT :
 * On NE met PAS strict: true ici, sinon OpenAI exige additionalProperties:false
 * sur tous les objets imbriqués. On laisse strict à false (ou omis) pour
 * garder de la souplesse et éviter les erreurs 400.
 */
const HEALTH_AI_RESPONSE_SCHEMA = {
  name: "HealthAIBlockResponse",
  // strict: false, // on peut l'omettre, strict=false par défaut
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["ask_next", "completed"],
        description:
          "Si tu as besoin de plus d'informations: 'ask_next'. Si tu as assez d'informations pour souscrire: 'completed'.",
      },
      nextQuestion: {
        type: "string",
        description:
          "Si status = 'ask_next', une question claire, en français, à poser au client.",
      },
      summaryMarkdown: {
        type: "string",
        description:
          "Résumé en français, format Markdown, pour les collaborateurs MoneyLife.",
      },
      genericSummary: {
        type: "string",
        description:
          "Résumé neutre du bloc (utilisable pour n'importe quel assureur).",
      },
      axaAuraSummary: {
        type: "string",
        description:
          "Résumé adapté au ton / format des formulaires AXA Aura (facultatif).",
      },
      swisslifeSummary: {
        type: "string",
        description:
          "Résumé adapté au ton / format Swiss Life (facultatif).",
      },
      patch: {
        type: "object",
        description:
          "Patch JSON à appliquer au questionnaire Santé MoneyLife. Ajoute des cas médicaux, des sports à risques, des voyages, etc.",
        properties: {
          casesToAdd: {
            type: "array",
            description:
              "Liste de nouveaux dossiers médicaux (HealthCase) à ajouter.",
            items: {
              type: "object",
            },
          },
          riskSportsToAdd: {
            type: "array",
            description:
              "Liste de nouveaux sports à risques (RiskSport) à ajouter.",
            items: {
              type: "object",
            },
          },
          travelRisksToAdd: {
            type: "array",
            description:
              "Liste de nouveaux voyages/séjours à risques (TravelRisk) à ajouter.",
            items: {
              type: "object",
            },
          },
          substanceUsesToAdd: {
            type: "array",
            description:
              "Liste de consommations de drogues/stupéfiants (SubstanceUse) à ajouter.",
            items: {
              type: "object",
            },
          },
          insuranceHistoryToAdd: {
            type: "array",
            description:
              "Liste d'antécédents d'assurance (refus, ajournement, surprime) à ajouter (InsuranceHistoryItem).",
            items: {
              type: "object",
            },
          },
        },
      },
    },
    required: ["status"],
  },
};

/* ============================================================
   HELPERS
   ============================================================ */

function safeString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function buildQuestionnairePreview(q: HealthQuestionnaire3e) {
  return {
    id: q.id,
    hasCases: q.cases?.length > 0,
    casesCount: q.cases?.length ?? 0,
    riskSportsCount: q.riskSports?.length ?? 0,
    travelRisksCount: q.travelRisks?.length ?? 0,
    substanceUsesCount: q.substanceUses?.length ?? 0,
    insuranceHistoryCount: q.insuranceHistory?.length ?? 0,
    globalFlags: q.globalFlags,
  };
}

/* ============================================================
   ROUTE POST
   ============================================================ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[health/ai-block] Missing OPENAI_API_KEY");
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: HealthAIBlockRequest;

  try {
    body = (await req.json()) as HealthAIBlockRequest;
  } catch (err) {
    console.error("[health/ai-block] Invalid JSON:", err);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    clientUid,
    blockKind,
    blockId,
    questionnaire,
    conversation,
    lastUserMessage,
  } = body;

  if (!clientUid || !blockKind || !questionnaire) {
    return NextResponse.json(
      {
        error:
          "Missing required fields (clientUid, blockKind, questionnaire)",
      },
      { status: 400 }
    );
  }

  const preview = buildQuestionnairePreview(questionnaire);

  const model = process.env.HEALTH_AI_MODEL || "gpt-4.1-mini";

  const systemPrompt = `
Tu es un assistant de souscription pour MoneyLife en Suisse.
Ton rôle : poser les bonnes questions au client et construire un "patch" structuré
pour compléter un questionnaire santé & lifestyle utilisé pour des offres de 3e pilier (3a/3b).

IMPORTANT :

1) Tu travailles BLOC PAR BLOC (blockKind) :
   - "risk_sport" : sports / loisirs à risques (parapente, plongée, moto de course, ski hors-piste, etc.).
   - "travel" : voyages ou séjours en zones de guerre / crise ou à l'étranger >12 mois.
   - "smoking" : tabac / vape / nicotine (profil fumeur).
   - "cholesterol" : cholestérol élevé / traitement.
   - "general_condition" : problème de santé (maladie, atteinte, anomalie congénitale…).
   - "planned_surgery" : opération / intervention prévue ou recommandée.
   - "drug_use" : drogues / stupéfiants (cannabis, cocaïne, MDMA, héroïne, etc.).
   - "completeness_missing_condition" : problème oublié à la question de complétude.
   - "past_insurance_decision" : proposition d'assurance refusée, ajournée ou acceptée avec conditions aggravées.
   - "degree" : diplôme / formation supérieure (plutôt informatif).
   - "manual_work" : travail manuel ou physique important.

2) Sortie STRICTE via JSON Schema (json_schema) :
   - Si tu as encore besoin d'informations → status = "ask_next" + nextQuestion non vide.
   - Si tu as assez d'informations pour ce bloc → status = "completed" + patch rempli.
   - Jamais d’autre champ que ceux définis dans le schema.
   - Toujours du texte en FRANÇAIS, clair, poli, orienté souscription.

3) patch :
   - casesToAdd : dossiers médicaux (HealthCase) pour ce bloc uniquement.
   - riskSportsToAdd : sports à risques (RiskSport).
       • category : "mountaineering" | "ski_freeride" | "paragliding" | "scuba_diving" | "motor_sport" | "aviation" | "martial_arts" | "horse_riding" | "other"
       • facts.level : "leisure" | "advanced" | "competition" | "pro"
       • facts.hasAccidentHistory : boolean
   - travelRisksToAdd : voyages/séjours à risques (TravelRisk).
   - substanceUsesToAdd : drogues/stupéfiants (SubstanceUse).
   - insuranceHistoryToAdd : décisions d'assurance défavorables (InsuranceHistoryItem).

4) nextQuestion :
   - Si status = "ask_next", ta question doit être très concrète, ciblée sur ce bloc et utile pour un souscripteur vie.
   - Une question à la fois, pas une liste.

5) completed :
   - Quand tu passes à "completed", le patch doit décrire TOUT ce que tu as compris de ce bloc.
   - Tu peux créer plusieurs éléments (plusieurs sports, plusieurs voyages, plusieurs cas médicaux) si la conversation le mentionne, dans le même patch.
`;

  const userPayload = {
    blockKind,
    blockId,
    questionnairePreview: preview,
    conversation,
    lastUserMessage,
  };

  let aiJson: HealthAIBlockResponse | null = null;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: HEALTH_AI_RESPONSE_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty content from OpenAI");
    }

    aiJson = JSON.parse(content) as HealthAIBlockResponse;
  } catch (err) {
    console.error("[health/ai-block] OpenAI error or JSON parse error:", err);

    const fallback: AskNextResponse = {
      status: "ask_next",
      nextQuestion:
        "Pourriez-vous préciser encore un peu cette situation (dates approximatives, traitements, impact sur votre travail, etc.) ?",
    };
    return NextResponse.json(fallback);
  }

  // Validation minimale
  if (!aiJson || (aiJson.status !== "ask_next" && aiJson.status !== "completed")) {
    const fallback: AskNextResponse = {
      status: "ask_next",
      nextQuestion:
        "Pourriez-vous apporter quelques précisions supplémentaires utiles pour l'assurance (durée, traitements, gravité, etc.) ?",
    };
    return NextResponse.json(fallback);
  }

  if (aiJson.status === "ask_next") {
    if (!aiJson.nextQuestion || !aiJson.nextQuestion.trim()) {
      aiJson.nextQuestion =
        "Pouvez-vous préciser un peu plus ce point important pour l'assurance (période, fréquence, contexte) ?";
    }
    return NextResponse.json(aiJson);
  }

  // status === "completed"
  if (!aiJson.patch) {
    aiJson.patch = {};
  }

  return NextResponse.json(aiJson);
}