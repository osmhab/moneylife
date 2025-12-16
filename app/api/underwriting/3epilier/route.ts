// app/api/underwriting/3epilier/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { config, pricingContext, conversationHistory, profession } = body ?? {};

    if (!config || !pricingContext) {
      return NextResponse.json(
        { ok: false, error: "Missing config or pricingContext" },
        { status: 400 }
      );
    }

    // 1) Vérifier s'il y a une couverture de risque
    const hasAnyCover =
      config?.deathFixed?.enabled ||
      config?.deathDecreasing?.enabled ||
      (Array.isArray(config?.disabilityAnnuities) &&
        config.disabilityAnnuities.length > 0) ||
      config?.premiumWaiver?.enabled;

    // Si aucune couverture de risque => pas d'IA nécessaire.
    // Le frontend ne devrait normalement pas appeler cette route dans ce cas.
    if (!hasAnyCover) {
      return NextResponse.json({
        ok: true,
        mode: "no_risk_covers",
        underwriting: {
          done: true,
          nextQuestion: null,
          topic: null,
          decision: "standard",
          decisionMessage:
            "Aucune couverture de risque sélectionnée. Le contrat est uniquement orienté épargne.",
          occupationRiskClass: null,
          normalizedProfession: null,
          professionQuestion: null,
          professionConfirmed: false,
          notesForAdvisor:
            "Pas de couverture de risque. Normalement, l'IA métier n'est pas nécessaire dans ce cas.",
        },
      });
    }

    // 2) Il y a des couvertures de risque : on appelle l'IA OpenAI
    // (uniquement pour analyser la PROFESSION, pas pour calculer les primes)
    const messages = [
            {
        role: "system",
        content: `
Tu es un actuaire d'assurance vie (Suisse) spécialisé dans le 3e pilier (3a/3b).

CONTEXTE DONNÉ PAR L'APPLICATION:
- "config": configuration 3e pilier (capitaux décès, rentes invalidité, libération de primes, etc.).
- "pricingContext": infos santé simplifiées déjà saisies par le client (âge, fumeur, IMC, hypertension, etc.).
- "profession": texte libre saisi par le client.
- "conversationHistory": historique des questions/réponses précédentes dans ce chat.

TON OBJECTIF PRINCIPAL:
1) DÉTERMINER LE BON LIBELLÉ DE MÉTIER:
   - Si le texte ressemble à une faute de frappe ou d'orthographe ("Drirecteur", "Macon"), propose une correction:
     - Pose une question fermée du type: "Vous avez tapé 'Drirecteur'. Vous vouliez dire 'Directeur' ?"
     - Ne marque PAS le métier comme confirmé tant que le client n'a pas clairement dit oui.
   - Si le client répond "non", ou si le métier n'existe pas dans ta bibliothèque:
     - Dis que tu ne connais pas ce terme tel quel.
     - Demande en quoi consiste le métier (tâches principales, secteur, type de travail).
     - Propose ensuite un métier plausible ("Chef de projet en informatique", "Directeur d'entreprise de construction", etc.) et demande une confirmation.
   - Répète ce cycle (question -> proposition -> confirmation) jusqu'à ce que le client confirme un métier clair.
   - Quand le métier est confirmé, indique-le dans "normalizedProfession" et mets "professionConfirmed" à true.

2) CLASSER LE MÉTIER EN CLASSE DE RISQUE:
   - Attribue une classe de risque métier "occupationRiskClass" entre 1 et 4:
     - 1 = Métier de bureau, sans exposition particulière (p. ex. employé de commerce, comptable).
     - 2 = Métier mixte, partiellement physique mais sans danger marqué (p. ex. enseignant, infirmier non bloc opératoire).
     - 3 = Métier physique avec risques modérés (p. ex. maçon, installateur, infirmier en bloc opératoire).
     - 4 = Métier très physique ou dangereux (travaux en hauteur, machines lourdes, milieu à haut risque).
   - OccupationRiskClass doit rester stable: n'en change que si le client modifie réellement la description du métier.

Important:
- Ne donne jamais de diagnostic médical.
- NE POSE PAS de questions de santé et NE POSE PAS de questions sur les sports à risque: ces infos viennent déjà du pricingContext.
- Tu ne prends pas de décision juridique réelle, tu proposes juste une estimation technique (sous réserve de l'assureur).
- "done" = true uniquement quand le métier est clairement confirmé, la classe de risque métier est déterminée, et tu n'as plus de question utile à poser.

Tu dois respecter strictement ce schéma JSON:
{
  "done": boolean,
  "nextQuestion": string | null,
  "topic": "profession" | "summary" | null,
  "decision": "standard" | "surcharge" | "exclusion" | "decline" | "postpone",
  "decisionMessage": string,
  "occupationRiskClass": 1 | 2 | 3 | 4 | null,
  "normalizedProfession": string | null,
  "professionQuestion": string | null,
  "professionConfirmed": boolean,
  "notesForAdvisor": string
}

RÈGLES:
- "normalizedProfession": tu y mets le libellé de métier UNIQUEMENT quand le client a confirmé que c'est correct.
- "professionConfirmed": true uniquement après confirmation explicite du client.
- "occupationRiskClass": doit être 1, 2, 3 ou 4 dès que le métier est suffisamment clair. Si le métier n'est pas encore clair, tu peux temporairement mettre null.
- "professionQuestion": contient la prochaine question que l'application doit afficher au client (par ex. demande de confirmation, demande de description du métier, etc.). Sinon null.
- Si tu n'as plus de question à poser, "professionQuestion" et "nextQuestion" doivent être null, et "topic" peut être "summary".
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          config,
          pricingContext,
          profession: profession ?? null,
          conversationHistory: conversationHistory ?? [],
        }),
      },
    ];

    // c) Appel OpenAI (à adapter selon ton client)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // à adapter
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!completion.ok) {
      const txt = await completion.text();
      console.error("[underwriting] OpenAI error:", txt);
      return NextResponse.json(
        { ok: false, error: "OpenAI API error" },
        { status: 500 }
      );
    }

    const data = await completion.json();
    let underwriting: any;
    try {
      underwriting = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      console.error("[underwriting] JSON parse error:", e, data);
      return NextResponse.json(
        { ok: false, error: "Malformed JSON from OpenAI" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "risk_covers",
      underwriting,
    });
  } catch (err) {
    console.error("[underwriting] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}