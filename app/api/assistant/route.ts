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

// Faits de RÉASSURANCE sur CreditX — VÉRIFIÉS (site creditx.ch + registre FINMA).
// ⚠️ N'ajouter ici que du factuel confirmé : l'assistant les présente tels quels aux clients.
const CREDITX_FACTS = [
  "CreditX (raison sociale : CreditX Sàrl, UID CHE-203.347.547) est une entreprise suisse de prévoyance basée en Valais (siège à Conthey, contact à Sion). Son application s'appelle MoneyLife.",
  "CreditX Sàrl est un INTERMÉDIAIRE D'ASSURANCE NON LIÉ enregistré auprès de la FINMA (autorité fédérale de surveillance des marchés financiers) sous le numéro F01536084 — vérifiable sur le registre public de la FINMA. « Non lié » = indépendant : CreditX n'appartient à aucun assureur et compare pour le client.",
  "La plateforme centralise et analyse les documents de prévoyance (2e et 3e pilier), révèle les lacunes (retraite, invalidité, décès) et propose des plans 3a personnalisés. (Crédits hypothécaires et privés à venir.)",
  "Partenaires de prévoyance officiels : AXA, Swiss Life, Pax, Baloise, Helvetia. CreditX peut ajouter d'autres partenaires selon les produits utiles à ses clients.",
  "Le service est GRATUIT pour le client : CreditX est rémunéré par des commissions versées par les partenaires à la souscription, sans surcoût pour le client.",
  "Sécurité & données : chiffrement de bout en bout, hébergement sécurisé, audits réguliers ; conformité LPD (loi suisse sur la protection des données) et RGPD. CreditX ne revend jamais les données ; les données de santé sont supprimées après signature.",
  "La proposition affichée est SANS ENGAGEMENT : rien n'est signé tant que le client n'a pas validé ; un conseiller humain accompagne et valide chaque souscription ; le client peut tout arrêter à tout moment.",
  "Les montants sont indicatifs et personnalisés ; une offre formelle confirme les chiffres. Contact : formulaire sur creditx.ch/contact (réponse sous 24h ouvrées).",
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
