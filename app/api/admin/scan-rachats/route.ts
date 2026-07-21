import { NextRequest, NextResponse } from 'next/server';
import { db, bucket, authAdmin } from "app/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    // 1. Sécurité Admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const decodedToken = await authAdmin.verifyIdToken(token);
    
    // Vérification sommaire que c'est bien toi (ou un admin MoneyLife)
    if (!decodedToken.email?.endsWith('@moneylife.ch') && !decodedToken.email?.endsWith('@creditx.ch')) {
       // Optionnel : tu peux aussi checker ton UID exact ici
       // if (decodedToken.uid !== "TON_UID_PERSO") throw new Error("Accès refusé");
    }

    // 2. Récupération de l'image
    const { filePath } = await req.json();
    if (!filePath) return NextResponse.json({ error: "Image manquante" }, { status: 400 });

    const [fileBuffer] = await bucket.file(filePath).download();
    const mimeType = 'image/jpeg'; // On assume du JPG/PNG pour les captures mobiles

    // 3. Configuration Gemini 2.0 Flash
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Tu es un extracteur de données financières. 
    Analyse cette image qui contient une colonne de montants (valeurs de rachat d'une assurance vie).
    
    INSTRUCTIONS :
    - Extrais uniquement les montants numériques.
    - L'ordre est CRUCIAL : le premier montant en haut correspond à l'année 1, le suivant à l'année 2, etc.
    - Ignore les textes, les labels "Année", les en-têtes ou les totaux.
    - Si un montant est "0" ou "-", écris 0.
    - Nettoie les chiffres (enlève les espaces, les apostrophes de milliers comme 1'200).
    
    RETOURNE CE JSON EXACT :
    {
      "values": [number, number, number, ...]
    }
    RÈGLE : Pas de texte, pas d'explications, juste le JSON pur.`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mimeType, data: fileBuffer.toString("base64") } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json"
      }
    };

    // 4. Appel Gemini
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Erreur Gemini");
    }

    const responseText = result.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(responseText);

    // 5. Nettoyage final des fichiers temporaires (Optionnel mais recommandé)
    try {
      await bucket.file(filePath).delete();
    } catch (e) {
      console.error("Erreur suppression fichier temp:", e);
    }

    return NextResponse.json({ values: parsed.values });

  } catch (error: any) {
    console.error("❌ Erreur Scan Rachats:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}