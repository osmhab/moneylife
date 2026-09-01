// app/api/admin/notes/improve/route.ts
//
// Reformulation des notes du conseiller par Gemini.
//
// CE QUE LA ROUTE NE FAIT PAS
// ---------------------------
// Elle ne remplace RIEN : elle renvoie une proposition, que l'écran affiche à
// côté de l'original pour que le conseiller accepte ou refuse. Des notes qui
// finissent dans un document remis au client ne se font pas réécrire en
// silence par un modèle.
//
// Le prompt interdit explicitement d'AJOUTER de l'information. Une note de
// rendez-vous est un compte rendu : un modèle qui « complète » une phrase
// elliptique inventerait un fait sur la situation d'un client. On reformule,
// on structure, on ne comble pas.

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/server/requireInternal";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `Tu es assistant de rédaction pour un conseiller en prévoyance suisse.
On te donne ses notes de rendez-vous, prises rapidement pendant l'entretien.

Ta tâche : les réécrire pour qu'elles soient présentables dans un dossier remis au client.
- Corrige l'orthographe, la grammaire et la ponctuation.
- Structure en paragraphes courts, ou en points s'il s'agit d'une liste d'actions.
- Adopte un ton professionnel, sobre et factuel. Vouvoiement si le client est interpellé.
- Emploie la terminologie suisse exacte : 1er/2e/3e pilier, AVS, AI, LPP, LAA, 3a, 3b.

RÈGLES ABSOLUES :
- N'AJOUTE AUCUNE information, chiffre, date ou conclusion qui ne soit pas déjà dans les notes.
- Si une note est elliptique ou ambiguë, garde-la elliptique : ne devine pas ce qu'elle voulait dire.
- Ne supprime aucun fait, aucun montant, aucun nom.
- Ne commente pas ton travail et n'ajoute ni introduction ni conclusion.

Réponds UNIQUEMENT par le texte réécrit, sans guillemets ni balises.

NOTES À RÉÉCRIRE :
`;

export async function POST(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé Gemini absente sur cet environnement." }, { status: 500 });
  }

  try {
    const { texte } = (await req.json()) as { texte?: string };
    const source = String(texte || "").trim();
    if (source.length < 15) {
      return NextResponse.json({ error: "Notes trop courtes pour être reformulées." }, { status: 400 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT + source.slice(0, 8000) }] }],
          // Température basse : on veut une reformulation fidèle, pas une variation créative.
          generationConfig: { temperature: 0.2 },
        }),
      },
    );

    const json = await res.json();
    const out = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!out) {
      console.error("[notes/improve] réponse vide:", JSON.stringify(json).slice(0, 300));
      return NextResponse.json({ error: "Reformulation indisponible." }, { status: 502 });
    }

    return NextResponse.json({ texte: out });
  } catch (e: any) {
    console.error("[notes/improve]", e?.message || e);
    return NextResponse.json({ error: "Reformulation impossible." }, { status: 500 });
  }
}
