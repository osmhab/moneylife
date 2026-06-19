//app/api/lpp/parse/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, bucket, authAdmin } from "app/lib/firebase/admin";
import admin from "firebase-admin";
import { INSTITUTION_RULES } from "app/lib/lpp-rules";
import { DOCUMENT_CLASSIFICATION_PROMPT } from "app/lib/core/documentTypes";

// Clés de classification renvoyées par l'IA mais qui ne sont PAS des champs de
// formulaire (on les stocke à part, pas dans clientMappedData / plan.data).
const CLASSIFICATION_KEYS = ["documentType", "suggestedTags"];

const TEXT_FIELDS = [
  "Enter_anneeCertificat", "Enter_prenom", "Enter_nom", "Enter_noAVS", 
  "Enter_dateNaissance", "Enter_adresseCaisse", "Enter_employeur", "Enter_adresseEmployeur"
];

// Filet de sécurité si une chaîne passe encore à travers les mailles du filet
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

// Génération dynamique du schéma strict pour l'API Gemini
function getGeminiJsonSchema() {
  const properties: Record<string, any> = {
    institutionName: { type: "STRING", description: "Nom de la caisse identifiée ou 'AUTRE'" },
    fileUrl: { type: "STRING" },
    // Classification du document scanné (cf. DOCUMENT_CLASSIFICATION_PROMPT).
    documentType: { type: "STRING", description: "Type du document scanné" },
    suggestedTags: { type: "ARRAY", items: { type: "STRING" }, description: "1-3 mots-clés courts" }
  };

  // Ajout des champs textes
  TEXT_FIELDS.forEach(field => {
    properties[field] = { type: "STRING" };
  });

  // Ajout des champs financiers génériques (Avoirs, Cotisations, Risques)
  const financialFields = [
    "Enter_salaireAnnuel", "Enter_salaireAssureLPP", "Enter_lppSalaireAssureRisque", "Enter_lppTauxActivite",
    "Enter_avoirVieillesseTotal", "Enter_lppAvoirObligatoire", "Enter_lppAvoirMariage",
    "Enter_renteInvaliditeMaladie", "Enter_lppRenteInvaliditeAccident",
    "Enter_renteEnfantInvalideMaladie", "Enter_renteEnfantInvalideAccident",
    "Enter_renteConjointLPP", "Enter_lppRenteConjointAccident",
    "Enter_renteOrphelinLPP", "Enter_lppRenteOrphelinAccident",
    "Enter_CapitalPlusRenteMal", "Enter_CapitalAucuneRenteMal", "Enter_CapitalPlusRenteAcc", "Enter_CapitalAucuneRenteAcc",
    "Enter_lppCotisationEpargneEmploye", "Enter_lppCotisationEpargneEmployeur",
    "Enter_lppCotisationRisqueFraisEmploye", "Enter_lppCotisationRisqueFraisEmployeur",
    "Enter_lppRachatPossible", "Enter_lppEPLPossible"
  ];

  financialFields.forEach(field => {
    properties[field] = { type: "INTEGER", description: "Montant entier en CHF nettoyé de tout symbole ou espace" };
  });

  // Ajout strict des 8 paliers de projection vieillesse (Rentes et Capitaux de 58 à 65 ans)
  for (let age = 58; age <= 65; age++) {
    properties[`Enter_rentevieillesseLPP${age}`] = { type: "INTEGER", description: `Rente annuelle projetée à ${age} ans` };
    properties[age === 64 || age === 65 ? `Enter_lppCapitalProjete${age}` : `Enter_prestationCapital${age}`] = { 
      type: "INTEGER", 
      description: `Capital projeté à ${age} ans` 
    };
  }

  return {
    type: "OBJECT",
    properties,
    required: ["institutionName"] // On force au moins la détection de la caisse à la racine
  };
}

export async function POST(req: NextRequest) {
  let jobRef: admin.firestore.DocumentReference | null = null;

  try {
    // 1. Authentification & Sécurité
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé (Token manquant)" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await authAdmin.verifyIdToken(token);
    } catch (err) {
      return NextResponse.json({ error: "Non autorisé (Token invalide)" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { filePath, allPaths } = body;
    let pathsToProcess: string[] = Array.isArray(allPaths) && allPaths.length > 0 ? allPaths : (filePath ? [filePath] : []);

    if (pathsToProcess.length === 0) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    const clientUid = pathsToProcess[0].split("/")[1];

    const isAdmin = 
      decoded.uid === "FRFN1sTxU4VjlbJXnC3wBGLoVyw2" ||
      (decoded.email && decoded.email.endsWith("@creditx.ch")) ||
      (decoded.email && decoded.email.endsWith("@moneylife.ch")) ||
      decoded.admin === true;

    if (decoded.uid !== clientUid && !isAdmin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // 2. Initialisation Job
    jobRef = db.collection("clients").doc(clientUid).collection("lpp_jobs").doc();
    await jobRef.set({
      status: "PENDING",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      requestedPaths: pathsToProcess,
      uidRequester: decoded.uid
    });

    // 3. Préparation Fichiers
    const fileParts = await Promise.all(pathsToProcess.map(async (path) => {
      const file = bucket.file(path);
      const [buffer] = await file.download();
      const ext = path.split(".").pop()?.toLowerCase();
      let mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
      return { inlineData: { mimeType, data: buffer.toString("base64") } };
    }));

    // 4. Configuration de l'appel Gemini avec Réponse Structurée
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Clé API Gemini manquante");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const knowledgeBase = Object.entries(INSTITUTION_RULES)
      .map(([name, rules]) => `### RÈGLES POUR ${name} :\n${rules}`)
      .join("\n\n");

    const prompt = `Tu es un actuaire expert LPP suisse. Analyse rigoureusement ce document en appliquant les règles spécifiques par institution ci-dessous.

🚨 PRIORITÉS ET LOGIQUE CONSTRUITE :
1. IDENTIFICATION : Détermine l'institution exacte parmi : ${Object.keys(INSTITUTION_RULES).join(", ")}. Si non listée, applique impérativement les règles de "AUTRE".
2. EXTRACTIBILITÉ DES DONNÉES : Ne laisse jamais les salaires ou le taux d'activité vides si l'information est présente (même sous des synonymes comme "Traitement assuré" ou "Taux d'occupation").
3. INTÉGRITÉ DU TABLEAU DE PROJECTIONS : Tu DOIS obligatoirement extraire l'intégralité des 8 lignes (âges 58 à 65) sans t'arrêter au premier palier.
4. RENTES INVALIDITÉ (MIRRORING) : Sauf indication contraire spécifiée dans les règles de l'institution (comme le GROUPE_MUTUEL), applique le mirroring : si aucune distinction Maladie/Accident n'est visible sur le document, duplique la même valeur de rente dans les deux sous-catégories.

RÈGLES D'EXTRACTION SPÉCIFIQUES PAR INSTITUTION :
${knowledgeBase}

${DOCUMENT_CLASSIFICATION_PROMPT}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...fileParts] }],
        generationConfig: { 
          response_mime_type: "application/json", 
          response_schema: getGeminiJsonSchema(), // 🌟 FORCE LE SCHÉMA EN AMONT
          temperature: 0.0 
        }
      })
    });

    if (!response.ok) throw new Error(`Erreur Gemini: ${response.status}`);

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Réponse de l'API Gemini vide ou mal formatée");
    
    const geminiParsed = JSON.parse(rawText.trim());

    // 5. Génération URL Publique Sécurisée
    const mainFile = bucket.file(pathsToProcess[0]);
    const downloadToken = db.collection("tmp").doc().id; 
    await mainFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pathsToProcess[0])}?alt=media&token=${downloadToken}`;

    // 6. Nettoyage final & Validations Métiers secondaires
    const clientMappedData: Record<string, any> = {};
    const warnings: string[] = [];

    // On s'assure que toutes les clés du schéma théorique existent dans la réponse finale
    const masterKeys = Object.keys(getGeminiJsonSchema().properties);
    masterKeys.forEach((key) => {
      let val = geminiParsed[key];
      if (key === "fileUrl") {
        clientMappedData[key] = publicUrl;
        return;
      }
      // La classification n'est pas une donnée de formulaire → stockée à part.
      if (CLASSIFICATION_KEYS.includes(key)) return;

      if (val !== undefined && val !== null && val !== "") {
        if (TEXT_FIELDS.includes(key) || key === "institutionName") {
          clientMappedData[key] = val.toString().trim();
        } else {
          // Gemini a renvoyé un INTEGER, on passe une validation finale au cas où
          const parsedVal = typeof val === "number" ? Math.round(val) : parseAmountToIntCHF(val);
          clientMappedData[key] = parsedVal;
        }
      } else {
        clientMappedData[key] = null;
      }
    });

    // Validations de cohérence logique métier
    if (clientMappedData.Enter_salaireAssureLPP > clientMappedData.Enter_salaireAnnuel) {
      warnings.push("Le salaire assuré LPP extrait est supérieur au salaire annuel constaté.");
    }
    if (clientMappedData.Enter_avoirVieillesseTotal < clientMappedData.Enter_lppAvoirObligatoire) {
      warnings.push("L'avoir total extrait est inférieur à l'avoir obligatoire minimum.");
    }

    let confidenceGlobal = 0.95 - (warnings.length * 0.1);
    if (confidenceGlobal < 0.2) confidenceGlobal = 0.2;

    const detectedInstitution = clientMappedData.institutionName || "AUTRE";

    // Classification du document (type + tags) — repli sur "Certificat LPP".
    const documentType =
      typeof geminiParsed.documentType === "string" && geminiParsed.documentType.trim()
        ? geminiParsed.documentType.trim()
        : "Certificat LPP";
    const suggestedTags = Array.isArray(geminiParsed.suggestedTags)
      ? geminiParsed.suggestedTags.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 3)
      : [];

    // 7. Persistance Firestore
    await jobRef.update({
      status: "DONE_FAST",
      clientMappedData: clientMappedData,
      institutionName: detectedInstitution,
      documentType,
      suggestedTags,
      warnings,
      confidenceGlobal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ jobId: jobRef.id, status: "ok" });

  } catch (error: any) {
    console.error("=== ERREUR CRITIQUE API LPP ===", error);
    if (jobRef) {
      await jobRef.update({
        status: "ERROR",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message
      }).catch(console.error);
    }
    return NextResponse.json({ 
        error: error.message, 
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    }, { status: 500 });
  }
}