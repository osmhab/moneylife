// app/api/documents/classify/route.ts
//
// Classification IA générique d'un document quelconque déposé par le client
// dans le coffre-fort (assurance maladie, fiscal, bancaire, contrat…), au-delà
// du seul domaine prévoyance. Renvoie un titre lisible + type + tags.

import { NextRequest, NextResponse } from "next/server";
import { DOCUMENT_CLASSIFICATION_PROMPT } from "@/lib/core/documentTypes";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const base64Data = Buffer.from(bytes).toString("base64");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Tu analyses un document personnel quelconque d'un client suisse
(assurance maladie, document fiscal, relevé bancaire, prévoyance, contrat, facture, etc.).
RETOURNE STRICTEMENT UN JSON VALIDE avec EXACTEMENT ces champs :
- "documentTitle" : titre COURT et clair en français qui identifie le document d'un coup d'œil.
  Inclus l'émetteur/compagnie et l'année s'ils sont visibles. Max ~6 mots.
  Ex. "Police assurance maladie - Assura", "Déclaration d'impôts 2024", "Relevé bancaire UBS 2025".
- "documentType" : (voir ci-dessous).
- "suggestedTags" : (voir ci-dessous).

IMPORTANT : ce document sort souvent du domaine prévoyance. Si aucun type de la liste ci-dessous
ne convient, NE force PAS : crée un type adéquat en français (ex. "Assurance maladie",
"Document fiscal", "Relevé bancaire", "Facture", "Contrat").

${DOCUMENT_CLASSIFICATION_PROMPT}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.0 },
      }),
    });

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Réponse vide de l'IA");

    let data = JSON.parse(rawText.replace(/```json/gi, "").replace(/```/g, "").trim());
    if (Array.isArray(data)) data = data[0];

    return NextResponse.json({
      data: {
        documentTitle: typeof data.documentTitle === "string" ? data.documentTitle.trim() : "",
        documentType: typeof data.documentType === "string" ? data.documentType.trim() : "",
        suggestedTags: Array.isArray(data.suggestedTags)
          ? data.suggestedTags.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 4)
          : [],
      },
    });
  } catch (error: any) {
    console.error("Erreur classification document:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
