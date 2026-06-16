// app/api/assistant/route.ts
//
// Assistant IA (Claude) contextualisé sur la proposition 3a du client.
// Sécurisé par jeton Firebase. Consommé par l'app iOS (écran de chat).
// La clé reste côté serveur (ANTHROPIC_API_KEY dans .env.local).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";

const MODEL = "claude-sonnet-4-6";

type Msg = { role: "user" | "assistant"; content: string };

// Faits de RÉASSURANCE sur CreditX — uniquement du vérifiable/défendable.
// ⚠️ Ne jamais y mettre de claim réglementaire non confirmé (FINMA, agrément…).
// Compléter avec les éléments officiels fournis par CreditX (cf. TODO ci-dessous).
const CREDITX_FACTS = [
  "CreditX est une entreprise suisse spécialisée dans la prévoyance (2e et 3e pilier) ; son application s'appelle MoneyLife.",
  "Les solutions proposées s'appuient sur des assureurs établis et reconnus en Suisse (par exemple AXA, Swiss Life, Baloise, PAX).",
  "La proposition affichée est gratuite et SANS ENGAGEMENT : rien n'est signé tant que le client n'a pas validé, et il peut tout arrêter à tout moment.",
  "Un conseiller humain accompagne et valide chaque souscription — aucun contrat n'est conclu automatiquement.",
  "Les montants sont indicatifs et personnalisés selon les réponses du client ; une offre formelle confirme les chiffres.",
  // TODO CreditX (à confirmer pour renforcer la réassurance) :
  //  - Raison sociale exacte + siège + année de création
  //  - Statut/registre d'intermédiaire (ex. FINMA / registre cantonal), n° d'agrément
  //  - Sécurité des données (hébergement, conformité nLPD/RGPD)
  //  - Certifications / partenaires bancaires
].join("\n- ");

function buildSystemPrompt(context: any): string {
  const ctx = context ? JSON.stringify(context, null, 2) : "(non fournie)";
  return [
    "Tu es l'assistant prévoyance de CreditX (fintech suisse, 3e pilier).",
    "Rôle : aider le client à COMPRENDRE sa proposition 3a (couvertures : épargne retraite, protection du revenu/invalidité, décès, libération des primes ; pilier 3a/3b, fiscalité, capital projeté) ET le RASSURER sur le sérieux de CreditX s'il est hésitant.",
    "Style : français, chaleureux, clair, TRÈS concis (2 à 5 phrases). Vouvoie poliment. Pour un client frileux : empathie, transparence, jamais de pression.",
    "Format : texte simple et conversationnel. PAS de titres markdown (#, ##, ###) ni de listes lourdes. Quelques mots clés en **gras**. Au plus un emoji.",
    "RÈGLE ANTI-INVENTION (capitale) : ne JAMAIS inventer de faits sur CreditX (statut réglementaire, agréments, chiffres, garanties, partenaires non listés). Utilise UNIQUEMENT les faits ci-dessous. Si on te demande une info que tu n'as pas (ex. agrément précis, sécurité des données), dis-le honnêtement et invite à « Demander un appel d'un spécialiste » qui donnera les détails officiels.",
    "Tu ne donnes pas de conseil financier contraignant ni de garantie de rendement. Pour une recommandation personnalisée ou un engagement → bouton « Demander un appel d'un spécialiste ».",
    "Reste sur la prévoyance, la proposition, ou la confiance en CreditX. Pour tout sujet hors de ce périmètre, recentre poliment.",
    "",
    "FAITS DE RÉASSURANCE CreditX (les seuls autorisés) :",
    "- " + CREDITX_FACTS,
    "",
    "PROPOSITION actuelle du client (contexte) :",
    ctx,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Assistant indisponible (clé Anthropic manquante côté serveur)." },
      { status: 503 }
    );
  }

  let messages: Msg[] = [];
  let context: any = null;
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
    context = body?.context ?? null;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  // Nettoyage : on ne garde que des messages valides, et on borne l'historique.
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    return NextResponse.json({ error: "Le dernier message doit être celui de l'utilisateur." }, { status: 400 });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: buildSystemPrompt(context),
        messages: clean,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ error: `Erreur IA ${upstream.status}`, detail: detail.slice(0, 300) }, { status: 502 });
    }

    // Ré-émet uniquement les deltas de texte (SSE Anthropic) en flux brut UTF-8.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const evt = JSON.parse(payload);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  controller.enqueue(encoder.encode(evt.delta.text));
                }
              } catch {
                /* ligne SSE non-JSON ignorée */
              }
            }
          }
        } catch {
          /* flux interrompu */
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
