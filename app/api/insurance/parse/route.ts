// app/api/insurance/parse/route.ts
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
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Tu es un actuaire expert en assurances vie suisses (3a/3b). Analyse cette police.
    RETOURNE STRICTEMENT UN JSON VALIDE.

    RÈGLES D'EXTRACTION CRITIQUES :
    1. dateDebut : Cherche "Début de l'assurance" ou "valable dès le". Format attendu: YYYY-MM-DD.
    2. capitalDecesFixe : Extraire UNIQUEMENT si un montant CHF fixe est mentionné (ex: "Capital garanti CHF 74'151"). 
       - Si le capital décès est une formule (ex: "Primes + 10%" ou "Contre-valeur des parts"), inscris 0.
    3. RÈGLES PROFIL DE RISQUE : Analyse la part "Rendement/Fonds" vs "Sécurité/Intérêt fixe".
       - 100% rendement -> "dynamique"
       - 75-99% rendement -> "growth"
       - 40-74% rendement -> "equilibre"
       - < 40% rendement -> "defensif"
    4. projectionAssureur : Capital retraite PROJETÉ à l'échéance (≈65 ans) tel qu'affiché par l'assureur.
       Cherche "Capital de prévoyance à l'échéance", "Prestation à la retraite", "Capital projeté",
       "Valeur à l'échéance", "Capital à l'âge 65".
       - NE PAS confondre avec valeurRachatActuelle (montant ACTUEL) ni avec capitalDecesFixe (prestation décès).
       - SCÉNARIOS MULTIPLES : les offres affichent souvent 3 projections (pessimiste / moyen / optimiste,
         ou faible / moyen / élevé, selon différents taux de rendement). Prends TOUJOURS le scénario MOYEN
         (la valeur centrale). Ignore le pessimiste et l'optimiste.
       - S'il existe seulement une valeur garantie ET une valeur projetée/non-garantie, prends la valeur PROJETÉE.
       - Si ce montant n'est PAS affiché (cas fréquent sur les polices, plus rare sur les offres), inscris 0.

    Champs à extraire :
    - compagnie (string)
    - typeContrat ("3a" ou "3b")
    - dateDebut (string: YYYY-MM-DD)
    - primeTotale (number)
    - primeEpargne (number: prime totale moins frais de risque/incapacité)
    - occurrence ("mois" ou "annee")
    - valeurRachatActuelle (number)
    - projectionAssureur (number)
    - capitalDecesFixe (number)
    - renteInvalidite (number)
    - hasLDP (boolean)
    - isInvesti (boolean)
    - profil (string)
    - documentType (string)
    - suggestedTags (array de strings)

    ${DOCUMENT_CLASSIFICATION_PROMPT}`;

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
        generationConfig: { 
          response_mime_type: "application/json", 
          temperature: 0.0 
        }
      })
    });

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) throw new Error("Réponse vide de l'IA");

    let data = JSON.parse(rawText.replace(/```json/gi, "").replace(/```/g, "").trim());
    
    // Sécurité si Gemini renvoie un tableau au lieu d'un objet
    if (Array.isArray(data)) data = data[0];

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Erreur Scan Assurance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}