// app/api/bank/parse/route.ts
// Scan d'un relevé/attestation de 3e pilier BANCAIRE (compte 3a) → extraction IA.
// Modelé sur /api/insurance/parse (même infra Gemini Vision), prompt adapté au 3a bancaire.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const base64Data = Buffer.from(bytes).toString("base64");

    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Tu es un expert en prévoyance 3e pilier BANCAIRE suisse (compte 3a).
    Analyse ce relevé / cette attestation de compte 3a. RETOURNE STRICTEMENT UN JSON VALIDE.

    Champs à extraire :
    - institution (string) : nom de la banque ou fondation 3a (ex: "PostFinance", "VIAC", "frankly",
      "Raiffeisen", "UBS", "Migros Bank", "Swisscanto").
    - soldeActuel (number) : l'avoir / solde ACTUEL du compte 3a en CHF (le total épargné à ce jour).
    - versementAnnuel (number) : montant des versements/cotisations ANNUELS récurrents si indiqué, sinon 0.
    - isInvesti (boolean) : true si le 3a est investi en titres/fonds (solution "titres" / "invest" /
      stratégie actions), false si c'est un compte d'épargne 3a classique (intérêt).

    RÈGLES :
    - N'invente AUCUN montant. Si une valeur n'est pas clairement lisible, mets 0 (ou false pour isInvesti).
    - soldeActuel = l'avoir accumulé, JAMAIS un simple versement.
    - Les montants sont en CHF, sans apostrophe de milliers dans le JSON (ex: 12500, pas "12'500").`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: file.type, data: base64Data } }
          ]
        }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.0 }
      })
    });

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Réponse vide de l'IA");

    let data = JSON.parse(rawText.replace(/```json/gi, "").replace(/```/g, "").trim());
    if (Array.isArray(data)) data = data[0];

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Erreur Scan 3a bancaire:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
