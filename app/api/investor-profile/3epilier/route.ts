// app/api/investor-profile/3epilier/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "@/lib/firebase/admin";

/**
 * Route IA — Profil d'investisseur pour le 3e pilier
 *
 * Le front envoie :
 *  - config           : configuration 3e pilier
 *  - pricingContext   : contexte de risque (âge, fumeur, etc.)
 *  - contact          : données perso de base (prénom, âge, état civil, etc.)
 *  - answers          : { [questionId]: string } (voir ci-dessous)
 *
 * On renvoie :
 *  {
 *    ok: true,
 *    profile: {
 *      equityMinPct: number | null,
 *      equityMaxPct: number | null,
 *      summary: string | null
 *    }
 *  }
 *
 * ⚠️ La fourchette d’actions est calculée **de façon déterministe**.
 * L’IA ne sert qu’à rédiger le texte de synthèse (summary).
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Answers = Record<string, string | undefined>;

type InvestorProfileCore = {
  equityMinPct: number;
  equityMaxPct: number;
  riskScore: number;
  capacityScore: number;
  horizonScore: number;
};

/* ------------------------------------------------------------------
 * Helpers génériques
 * ------------------------------------------------------------------ */

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function scoreFromMap(
  value: string | undefined,
  map: Record<string, number>,
  fallback: number
): number {
  if (!value) return fallback;
  if (Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  return fallback;
}

function avg(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return 50;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function roundToStep(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/* ------------------------------------------------------------------
 * Scoring des différentes dimensions
 * ------------------------------------------------------------------ */

/**
 * Score d’appétit pour le risque (0–100)
 * Basé sur :
 *  - experience_actions
 *  - but_investissement
 *  - choix_gain_perte
 *  - reaction_perte10
 */
function computeRiskScore(ans: Answers): number {
  const sGoal = scoreFromMap(
    ans["but_investissement"],
    {
      // But de l’investissement
      secure: 10,      // « risque min, gain pas prioritaire »
      moderate: 55,    // « risque modéré ok »
      aggressive: 90,  // « prêt à prendre un risque élevé »
    },
    50
  );

  const sExp = scoreFromMap(
    ans["experience_actions"],
    {
      yes: 70,
      no: 30,
    },
    50
  );

  const sGainLoss = scoreFromMap(
    ans["choix_gain_perte"],
    {
      p1: 10,  // -1% / +1%
      p2: 30,  // -3% / +5%
      p3: 50,  // -8% / +12%
      p4: 70,  // -13% / +19%
      p5: 90,  // -18% / +26%
    },
    50
  );

  const sReaction = scoreFromMap(
    ans["reaction_perte10"],
    {
      // Réaction à -10 % en quelques mois
      sell_all: 10,
      sell_some: 30,
      hold: 60,
      buy_more: 85,
    },
    50
  );

  // Pondération : but + réaction plus importants
  const num =
    sGoal * 0.35 +
    sReaction * 0.30 +
    sGainLoss * 0.20 +
    sExp * 0.15;

  return clamp(num, 0, 100);
}

/**
 * Score de capacité de risque (0–100)
 * Basé sur :
 *  - revenu_annuel
 *  - epargne_mensuelle
 *  - fortune_totale
 *  - dettes_totales
 *  - securite_reserve
 *  - dependants
 *  - depenses_importantes
 */
function computeCapacityScore(ans: Answers): number {
  const sIncome = scoreFromMap(
    ans["revenu_annuel"],
    {
      "0_30": 30,
      "30_75": 45,
      "75_149": 60,
      "150_250": 75,
      "240k": 85, // compat éventuel ancien code
      "250_plus": 90,
    },
    50
  );

  const sSaving = scoreFromMap(
    ans["epargne_mensuelle"],
    {
      none: 20,
      lt10: 45,
      "10_20": 65,
      gt20: 85,
    },
    50
  );

  const sWealth = scoreFromMap(
    ans["fortune_totale"],
    {
      none: 20,
      lt50: 35,
      "50_249": 55,
      "250_999": 70,
      "1_3m": 85,
      gt3m: 95,
    },
    50
  );

  const sDebt = scoreFromMap(
    ans["dettes_totales"],
    {
      none: 85,
      lt50: 70,
      "50_249": 55,
      "250_999": 35,
      "1_3m": 20,
      gt3m: 10,
    },
    50
  );

  const sReserve = scoreFromMap(
    ans["securite_reserve"],
    {
      lt3: 25,
      "3_6": 50,
      "7_12": 70,
      gt12: 90,
    },
    50
  );

  const sDependants = scoreFromMap(
    ans["dependants"],
    {
      "0": 70,
      "1": 60,
      "2_3": 45,
      "4_5": 30,
      gt5: 20,
    },
    50
  );

  const sBigSpends = scoreFromMap(
    ans["depenses_importantes"],
    {
      yes: 40,
      no: 70,
    },
    50
  );

  const scores = [sIncome, sSaving, sWealth, sDebt, sReserve, sDependants, sBigSpends];
  return clamp(avg(scores), 0, 100);
}

/**
 * Score d’horizon (0–100)
 * Basé sur :
 *  - horizon_placement
 * - age (plus on est proche de la retraite, plus on réduit la marge de manœuvre)
 */
function computeHorizonScore(ans: Answers, age: number | undefined): number {
  const sHorizon = scoreFromMap(
    ans["horizon_placement"],
    {
      lt15: 45,
      gte15: 80,
    },
    60
  );

  let agePenalty = 0;
  if (typeof age === "number") {
    if (age >= 60) {
      // très proche de la retraite
      agePenalty = 25;
    } else if (age >= 55) {
      agePenalty = 15;
    } else if (age >= 50) {
      agePenalty = 5;
    }
  }

  return clamp(sHorizon - agePenalty, 20, 90);
}

/**
 * Calcule une fourchette d’actions à partir :
 *  - age
 *  - riskScore (appétit pour le risque)
 *  - capacityScore (capacité à supporter des pertes)
 *  - horizonScore
 *  - réponses très prudentes / très agressives (override)
 */
function computeInvestorProfileFromAnswers(
  answers: Answers,
  age: number | undefined
): InvestorProfileCore {
  const riskScore = computeRiskScore(answers);
  const capacityScore = computeCapacityScore(answers);
  const horizonScore = computeHorizonScore(answers, age);

  // Score global 0–100
  const combined =
    0.55 * riskScore +
    0.30 * capacityScore +
    0.15 * horizonScore;

  // Target brut en % d’actions (max 80% par règle interne)
  let target = clamp((combined / 100) * 80, 0, 80);

  // Ajustements forts selon certains patterns de réponses
  const exp = answers["experience_actions"];
  const but = answers["but_investissement"];
  const choix = answers["choix_gain_perte"];
  const react = answers["reaction_perte10"];
  const horizon = answers["horizon_placement"];
  const epargne = answers["epargne_mensuelle"];
  const reserve = answers["securite_reserve"];
  const dettes = answers["dettes_totales"];

  // Cas ultra-prudent : on verrouille autour de 10–20%
  const ultraPrudent =
    exp === "no" &&
    but === "secure" &&
    choix === "p1" &&
    (react === "sell_all" || react === "sell_some") &&
    (horizon === "lt15" || !horizon) &&
    epargne === "none" &&
    (reserve === "lt3" || reserve === undefined) &&
    (dettes === "1_3m" || dettes === "gt3m");

  if (ultraPrudent) {
    return {
      equityMinPct: 0,
      equityMaxPct: 15,
      riskScore,
      capacityScore,
      horizonScore,
    };
  }

  // Cas très dynamique, mais avec garde-fous sur la capacité
  const veryAggressiveIntent =
    exp === "yes" &&
    but === "aggressive" &&
    (choix === "p4" || choix === "p5") &&
    (react === "hold" || react === "buy_more") &&
    horizon === "gte15";

  if (veryAggressiveIntent && capacityScore >= 60) {
    const min = 50;
    const max = 80; // limite réglementaire interne
    return {
      equityMinPct: min,
      equityMaxPct: max,
      riskScore,
      capacityScore,
      horizonScore,
    };
  }

  // Ajout d’une pénalité douce si capacité faible
  if (capacityScore < 40) {
    target -= 10;
  } else if (capacityScore > 70) {
    target += 5;
  }

  // Ajustement final lié à l’âge (déjà en partie pris en compte dans horizonScore, mais on resserre)
  if (typeof age === "number") {
    if (age >= 60) {
      target = Math.min(target, 45);
    } else if (age >= 55) {
      target = Math.min(target, 55);
    }
  }

  target = clamp(target, 0, 80);

  // On crée une fourchette autour du target
  let min = clamp(target - 15, 0, target);
  let max = clamp(target + 15, target, 80);

  // On arrondit à des pas de 5% pour plus de lisibilité
  min = clamp(roundToStep(min, 5), 0, 80);
  max = clamp(roundToStep(max, 5), min, 80);

  return {
    equityMinPct: min,
    equityMaxPct: max,
    riskScore,
    capacityScore,
    horizonScore,
  };
}

/* ------------------------------------------------------------------
 * IA : génération de la synthèse (summary) uniquement
 * ------------------------------------------------------------------ */

async function buildSummary(
  core: InvestorProfileCore,
  context: any,
  answers: Answers
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Pas de clé → on renvoie simplement null, mais le scoring reste utilisable
    return null;
  }


  const prompt = `
Tu es une IA MoneyLife, spécialiste de la prévoyance et des profils d’investisseur en Suisse.

On t’a déjà calculé un profil chiffré pour un client (fourchette d’actions).
Tu dois simplement rédiger un court résumé en français, pédagogique, basé sur :

- Le contexte du client (age, situation, type de contrat…)
- Les réponses au questionnaire (answers)
- Le profil chiffré (equityMinPct / equityMaxPct et scores)

Objectif du résumé :
- Expliquer en 3 à 6 phrases le profil d’investisseur du client (plutôt prudent / équilibré / dynamique).
- Justifier la fourchette d’actions proposée (ex. « entre 30% et 50% en actions »).
- Mentionner les éléments clés : horizon de placement, capacité d’épargne, stabilité du revenu, appétit pour le risque.
- Si le client est très prudent, rassurer (on peut augmenter plus tard).
- Si le client est plus dynamique, rappeler qu’il y a des fluctuations possibles à court terme.

Ne donne pas de conseils fiscaux ou juridiques détaillés.
Ne propose pas de produits précis, reste sur le principe général.
`;

  const userContent = {
    context,
    answers,
    profile: core,
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content:
          "Voici les données JSON (contexte + réponses + profil calculé) :\n" +
          JSON.stringify(userContent, null, 2) +
          "\nRédige un court résumé en français, sans salutation, sans puces, 3 à 6 phrases maximum.",
      },
    ],
  });

  const summary = completion.choices[0]?.message?.content?.trim();
  if (!summary) return null;
  return summary;
}

/* ------------------------------------------------------------------
 * Handler HTTP
 * ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

const {
  mode,
  config,
  pricingContext,
  contact,
  conversationHistory,
  answers,
  equityChosenPct,
  equityOverrideAck,
}: {
  mode?: "updateChoice";
  config?: any;
  pricingContext?: any;
  contact?: any;
  conversationHistory?: {
    role: "user" | "assistant";
    content: string;
  }[];
  answers?: Record<string, string>;
  equityChosenPct?: number;
  equityOverrideAck?: boolean;
} = body ?? {};

    const clientUid =
      config?.clientUid ||
      contact?.clientUid ||
      contact?.uid ||
      contact?.userId ||
      null;
    const configId = config?.id || contact?.configId || null;

// Mode spécial : mise à jour uniquement du choix d'allocation en actions
// (pas de recalcul du profil, pas d'appel OpenAI)
if (mode === "updateChoice") {
  if (!clientUid || !configId || typeof equityChosenPct !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing clientUid, configId or equityChosenPct" },
      { status: 400 }
    );
  }

  try {
    const ref = db
      .collection("clients")
      .doc(clientUid)
      .collection("investorProfiles")
      .doc(configId);

    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as any) : {};

    const existingProfile = existing.profile || {};

    await ref.set(
      {
        profile: {
          ...existingProfile,
          equityChosenPct,
          // on stocke le flag d'override si fourni,
          // sinon on le laisse tel quel
          ...(typeof equityOverrideAck === "boolean"
            ? { equityOverrideAck }
            : {}),
        },
        choiceUpdatedAt: new Date().toISOString(),  // 👈 timestamp du changement de choix
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, updated: true });
  } catch (e) {
    console.error("[investor-profile] updateChoice error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to update equityChosenPct" },
      { status: 500 }
    );
  }
}

    // Mode normal : on exige toutes les infos
    if (!config || !pricingContext || !contact) {
      return NextResponse.json(
        { ok: false, error: "Missing config, pricingContext or contact" },
        { status: 400 }
      );
    }

    const age: number | undefined = pricingContext?.age;

    // 1) Calcul déterministe du profil chiffré
    const core = computeInvestorProfileFromAnswers(answers ?? {}, age);

    // 2) Construire le contexte pour la synthèse IA
    const contextSummary = {
      age: pricingContext.age,
      type: pricingContext.type,
      isSmoker: pricingContext.isSmoker,
      bmi: pricingContext.bmi,
      hasHypertension: pricingContext.hasHypertension,
      hasHealthIssues: pricingContext.hasHealthIssues,
      occupationRiskClass: pricingContext.occupationRiskClass ?? null,
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        sex: contact.sex,
        birthdate: contact.birthdate,
        nationality: contact.nationality,
        etatCivil: contact.etatCivilLabel,
      },
      contract: {
        type: config.type,
        endAge: config.endAge,
        premiumAmount: config.premiumAmount,
        premiumFrequency: config.premiumFrequency,
        withFunds: config.savings?.withFunds ?? false,
      },
    };

    // 3) Appel IA pour la phrase de résumé (facultatif)
    let summary: string | null = null;
    try {
      summary = await buildSummary(core, contextSummary, answers ?? {});
    } catch (e) {
      console.error("[investor-profile] summary generation error:", e);
      // On ne bloque pas le flux : on renvoie juste summary = null
      summary = null;
    }

    // Valeur choisie par défaut si le front n'en fournit pas :
    // - equityChosenPct du body
    // - sinon borne haute
    // - sinon borne basse
const resolvedChosen =
  typeof equityChosenPct === "number"
    ? equityChosenPct
    : core.equityMaxPct ?? core.equityMinPct ?? null;

const resolvedOverrideAck =
  typeof equityOverrideAck === "boolean" ? equityOverrideAck : false;

const profile = {
  equityMinPct: core.equityMinPct,
  equityMaxPct: core.equityMaxPct,
  equityChosenPct: resolvedChosen,
  equityOverrideAck: resolvedOverrideAck,
  summary,
};

    // 4) Sauvegarde du profil et des réponses dans Firestore
    try {
      const clientUid = config?.clientUid;
      const clientId = config?.id;

      if (clientUid && clientId) {
        const ref = db
          .collection("clients")
          .doc(clientUid)
          .collection("investorProfiles")
          .doc(clientId);
            await ref.set(
              {
                configId: clientId,
                clientUid,
                answers: answers ?? null,
                profile,
                meta: {
                  riskScore: core.riskScore,
                  capacityScore: core.capacityScore,
                  horizonScore: core.horizonScore,
                },
                validatedAt: new Date().toISOString(),   // ← AJOUT
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
      }
    } catch (fireErr) {
      console.error("[investor-profile] Firestore save error:", fireErr);
      // On ne bloque pas la réponse même si la sauvegarde échoue
    }

    return NextResponse.json({ ok: true, profile });
  } catch (err: any) {
    console.error("[investor-profile] erreur route:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}