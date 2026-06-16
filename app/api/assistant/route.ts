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

function buildSystemPrompt(context: any): string {
  const ctx = context ? JSON.stringify(context, null, 2) : "(non fournie)";
  return [
    "Tu es l'assistant prévoyance de CreditX (fintech suisse, 3e pilier).",
    "Tu aides le client à COMPRENDRE la proposition 3a qu'on lui a faite : tu vulgarises, tu expliques les couvertures (épargne retraite, protection du revenu/invalidité, décès, libération des primes), le pilier 3a/3b, la fiscalité, et le capital projeté.",
    "Style : français, chaleureux, clair, concis (réponses courtes, pas de pavés). Tutoie-vouvoie selon le client ; par défaut vouvoie poliment.",
    "IMPORTANT : tu ne donnes PAS de conseil financier contraignant ni de garantie. Les montants sont indicatifs. Pour une recommandation personnalisée ou un engagement, invite à utiliser le bouton « Demander un appel d'un spécialiste ».",
    "Ne parle que de prévoyance / de la proposition. Si on te demande autre chose, recentre poliment.",
    "",
    "Voici la PROPOSITION actuelle du client (contexte) :",
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: `Erreur IA ${res.status}`, detail: detail.slice(0, 300) }, { status: 502 });
    }

    const data = await res.json();
    const reply = data?.content?.[0]?.text ?? "";
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
