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
import { requireAuth } from "@/lib/server/requireAuth";
import { INSTITUTION_RULES, dropBlockingZeroAccident } from "@/lib/lpp-rules";
import { MULTILINGUAL_PREAMBLE, MULTILINGUAL_LPP_GLOSSARY } from "@/lib/core/multilingual";

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
  "Enter_CapitalDecesIndependantMal", "Enter_CapitalDecesIndependantAcc",
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

// FAMILLE de document 2e pilier détectée par l'IA (fiable) → type de plan interne.
// NB : base vs complémentaire N'EST PAS décidé par l'IA (indistinguable sur une pièce
// seule : une caisse de base a aussi une « part LPP » faible). C'est l'app qui tranche
// par CONTEXTE (1re caisse = base, 2e = complémentaire), avec bascule en un tap.
const FAMILY_TO_PLANTYPE: Record<string, string> = {
  CAISSE: "LPP_BASE", // défaut ; l'UI passe en LPP_COMPL s'il existe déjà une caisse
  LIBRE_PASSAGE_POLICE: "LIBRE_PASSAGE_POLICE",
  LIBRE_PASSAGE_COMPTE: "LIBRE_PASSAGE_COMPTE",
};

function getGeminiJsonSchema() {
  const properties: Record<string, any> = {
    institutionName: { type: "STRING", description: "Nom de la caisse identifiée ou 'AUTRE'" },
    // Classification du document (voir prompt). Chaînes libres validées côté serveur.
    documentSubtype: {
      type: "STRING",
      description: "Famille du document : CAISSE, LIBRE_PASSAGE_POLICE ou LIBRE_PASSAGE_COMPTE",
    },
    subtypeConfidence: { type: "STRING", description: "HIGH si la famille est claire, LOW si ambigu" },
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
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    // MULTI-PAGE : le certificat LPP peut faire plusieurs pages. On lit TOUS les fichiers
    // envoyés sous la clé "file" (getAll) — rétro-compatible avec un envoi d'un seul fichier.
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });

    const imageParts = await Promise.all(
      files.map(async (f) => ({
        inlineData: { mimeType: f.type || "image/jpeg", data: Buffer.from(await f.arrayBuffer()).toString("base64") },
      }))
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API Gemini manquante" }, { status: 500 });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const knowledgeBase = Object.entries(INSTITUTION_RULES)
      .map(([name, rules]) => `### RÈGLES POUR ${name} :\n${rules}`)
      .join("\n\n");

    const prompt = `Tu es un actuaire expert LPP suisse. Analyse rigoureusement ce certificat de prévoyance en appliquant les règles spécifiques par institution ci-dessous.

${MULTILINGUAL_PREAMBLE}

🚨 PRIORITÉS :
1. IDENTIFICATION : Détermine l'institution exacte parmi : ${Object.keys(INSTITUTION_RULES).join(", ")}. Si non listée, applique les règles de "AUTRE".
2. Ne laisse jamais les salaires/taux d'activité vides si l'info est présente (synonymes : "Traitement assuré", "Taux d'occupation").
3. RENTES INVALIDITÉ (MIRRORING) : sauf règle contraire de l'institution, si aucune distinction Maladie/Accident n'est visible, duplique la même valeur dans les deux.

🔎 CLASSIFICATION DU DOCUMENT (champ "documentSubtype", OBLIGATOIRE) — choisis EXACTEMENT une des 3 FAMILLES. NE cherche PAS à distinguer « base » vs « complémentaire » (décidé ailleurs par le contexte) :
- "CAISSE" : certificat d'une CAISSE DE PENSION rattachée à un EMPLOYEUR (cotisations employé + employeur en cours, avoir de vieillesse, taux de conversion, rentes). Plan de base OU complémentaire/surobligatoire/cadres → dans les DEUX cas c'est "CAISSE".
- "LIBRE_PASSAGE_POLICE" : POLICE de LIBRE PASSAGE émise par un ASSUREUR (avoir de 2e pilier « parqué » hors emploi). Signes : « libre passage » + assureur, valeur de rachat, AUCUN employeur, pas de cotisations en cours.
- "LIBRE_PASSAGE_COMPTE" : COMPTE de LIBRE PASSAGE dans une BANQUE / fondation de libre passage. Signes : « compte de libre passage », banque/fondation, un solde, AUCUN employeur.
Renseigne "subtypeConfidence" = "HIGH" si la famille est claire (présence ou non d'un employeur + cotisations en cours → quasi toujours net), "LOW" seulement si vraiment ambigu.
Pour un LIBRE PASSAGE, mets le montant de l'avoir/prestation de libre passage dans "Enter_avoirVieillesseTotal", et la projection à 65 ans (si présente) dans "Enter_lppCapitalProjete65".

RÈGLES PAR INSTITUTION :
${knowledgeBase}

${MULTILINGUAL_LPP_GLOSSARY}

📄 MULTI-PAGES : ${files.length > 1 ? `Le certificat est fourni en ${files.length} PAGES (images ci-dessous). Analyse-les TOUTES et CONSOLIDE les informations : une donnée peut n'apparaître que sur une page (rachats, EPL, cotisations, paliers de projection…).` : "Certificat en une page."}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
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
      // Les 2 clés de classification ne sont PAS des montants → traitées à part.
      if (key === "documentSubtype" || key === "subtypeConfidence") return;
      const val = geminiParsed[key];
      if (val !== undefined && val !== null && val !== "" && val !== "null") {
        if (TEXT_FIELDS.includes(key) || key === "institutionName") {
          data[key] = String(val).trim();
        } else {
          data[key] = typeof val === "number" ? Math.round(val) : parseAmountToIntCHF(val);
        }
      }
    });

    // Retire les `0` accident qui bloqueraient le fallback maladie du moteur.
    dropBlockingZeroAccident(data);

    // ── Classification de la FAMILLE 2e pilier (caisse / libre passage police / compte) ──
    // base vs complémentaire n'est PAS décidé ici (indistinguable sur une pièce) → l'UI tranche
    // par contexte (1re caisse = base, 2e = complémentaire).
    const rawSubtype = String(geminiParsed.documentSubtype || "").trim().toUpperCase();
    const subtypeKind = FAMILY_TO_PLANTYPE[rawSubtype] ? rawSubtype : "CAISSE";
    const confidence: "HIGH" | "LOW" =
      FAMILY_TO_PLANTYPE[rawSubtype] && String(geminiParsed.subtypeConfidence || "").toUpperCase() === "HIGH"
        ? "HIGH"
        : "LOW";
    const planType = FAMILY_TO_PLANTYPE[subtypeKind];

    // Libre passage = capital seul : on mappe l'avoir vers le champ lu par le moteur
    // (solde pour un compte, valeur de rachat pour une police) + la projection à 65.
    if (planType === "LIBRE_PASSAGE_COMPTE" || planType === "LIBRE_PASSAGE_POLICE") {
      const solde = Number(data.Enter_avoirVieillesseTotal) || 0;
      if (solde > 0) {
        if (planType === "LIBRE_PASSAGE_COMPTE") data.soldeActuel = solde;
        else data.valeurRachatActuelle = solde;
      }
      if (Number(data.Enter_lppCapitalProjete65) > 0) data.capitalRetraiteGlobal = Number(data.Enter_lppCapitalProjete65);
    }

    return NextResponse.json({
      data,
      // Classification exposée à l'UI : type de plan + confiance (silencieux si HIGH, sinon confirmer).
      subtype: { kind: subtypeKind, planType, confidence },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur de parsing" }, { status: 500 });
  }
}
