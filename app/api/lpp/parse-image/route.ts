// app/api/lpp/parse-image/route.ts
//
// Variante SYNCHRONE du parsing LPP : reçoit l'image directement (multipart),
// appelle Gemini avec le schéma LPP, et renvoie les données extraites.
// Pensée pour l'app iOS (scan → parse → préremplissage), sans Storage ni job.
//
// TODO : consolider le schéma/prompt avec app/api/lpp/parse/route.ts (module partagé).
// TODO sécurité : vérif jeton Firebase + App Check.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { INSTITUTION_RULES } from "@/lib/lpp-rules";

const TEXT_FIELDS = [
  "Enter_anneeCertificat", "Enter_prenom", "Enter_nom", "Enter_noAVS",
  "Enter_dateNaissance", "Enter_adresseCaisse", "Enter_employeur", "Enter_adresseEmployeur",
];

const FINANCIAL_FIELDS = [
  "Enter_salaireAnnuel", "Enter_salaireAssureLPP", "Enter_lppSalaireAssureRisque", "Enter_lppTauxActivite",
  "Enter_avoirVieillesseTotal", "Enter_lppAvoirObligatoire", "Enter_lppAvoirMariage",
  "Enter_renteInvaliditeMaladie", "Enter_lppRenteInvaliditeAccident",
  "Enter_renteEnfantInvalideMaladie", "Enter_renteEnfantInvalideAccident",
  "Enter_renteConjointLPP", "Enter_lppRenteConjointAccident",
  "Enter_renteOrphelinLPP", "Enter_lppRenteOrphelinAccident",
  "Enter_CapitalPlusRenteMal", "Enter_CapitalAucuneRenteMal", "Enter_CapitalPlusRenteAcc", "Enter_CapitalAucuneRenteAcc",
  "Enter_lppCotisationEpargneEmploye", "Enter_lppCotisationEpargneEmployeur",
  "Enter_lppCotisationRisqueFraisEmploye", "Enter_lppCotisationRisqueFraisEmployeur",
  "Enter_lppRachatPossible", "Enter_lppEPLPossible",
];

function parseAmountToIntCHF(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return Math.round(val);
  if (typeof val !== "string") return null;
  if (val.includes("%")) return null;
  let str = val.trim();
  const match = str.match(/^(.*)[.,](\d{2})$/);
  if (match) str = match[1];
  str = str.replace(/[^0-9-]/g, "");
  if (str === "") return null;
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? null : parsed;
}

function getGeminiJsonSchema() {
  const properties: Record<string, any> = {
    institutionName: { type: "STRING", description: "Nom de la caisse identifiée ou 'AUTRE'" },
  };
  TEXT_FIELDS.forEach((f) => (properties[f] = { type: "STRING" }));
  FINANCIAL_FIELDS.forEach((f) => (properties[f] = { type: "INTEGER", description: "Montant entier en CHF nettoyé" }));

  // Paliers de projection vieillesse (rentes + capitaux de 58 à 65 ans).
  for (let age = 58; age <= 65; age++) {
    properties[`Enter_rentevieillesseLPP${age}`] = { type: "INTEGER", description: `Rente annuelle projetée à ${age} ans` };
    const capKey = age === 64 || age === 65 ? `Enter_lppCapitalProjete${age}` : `Enter_prestationCapital${age}`;
    properties[capKey] = { type: "INTEGER", description: `Capital projeté à ${age} ans` };
  }

  return { type: "OBJECT", properties, required: ["institutionName"] };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const inlineData = { mimeType: file.type || "image/jpeg", data: buffer.toString("base64") };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API Gemini manquante" }, { status: 500 });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const knowledgeBase = Object.entries(INSTITUTION_RULES)
      .map(([name, rules]) => `### RÈGLES POUR ${name} :\n${rules}`)
      .join("\n\n");

    const prompt = `Tu es un actuaire expert LPP suisse. Analyse rigoureusement ce certificat de prévoyance en appliquant les règles spécifiques par institution ci-dessous.

🚨 PRIORITÉS :
1. IDENTIFICATION : Détermine l'institution exacte parmi : ${Object.keys(INSTITUTION_RULES).join(", ")}. Si non listée, applique les règles de "AUTRE".
2. Ne laisse jamais les salaires/taux d'activité vides si l'info est présente (synonymes : "Traitement assuré", "Taux d'occupation").
3. RENTES INVALIDITÉ (MIRRORING) : sauf règle contraire de l'institution, si aucune distinction Maladie/Accident n'est visible, duplique la même valeur dans les deux.

RÈGLES PAR INSTITUTION :
${knowledgeBase}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData }] }],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: getGeminiJsonSchema(),
          temperature: 0.0,
        },
      }),
    });

    if (!response.ok) return NextResponse.json({ error: `Erreur Gemini: ${response.status}` }, { status: 502 });

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return NextResponse.json({ error: "Réponse Gemini vide" }, { status: 502 });

    const geminiParsed = JSON.parse(rawText.trim());

    // Nettoyage : textes trimés, montants en entiers CHF, nulls sinon.
    const data: Record<string, any> = {};
    Object.keys(getGeminiJsonSchema().properties).forEach((key) => {
      const val = geminiParsed[key];
      if (val !== undefined && val !== null && val !== "" && val !== "null") {
        if (TEXT_FIELDS.includes(key) || key === "institutionName") {
          data[key] = String(val).trim();
        } else {
          data[key] = typeof val === "number" ? Math.round(val) : parseAmountToIntCHF(val);
        }
      }
    });

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur de parsing" }, { status: 500 });
  }
}
