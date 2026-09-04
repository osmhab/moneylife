// app/lib/server/analyseIA.ts
//
// QUEL MOTEUR POUR QUELLE TÂCHE.
//
// Les deux besoins ne se ressemblent pas :
//
//   · SCANNER un certificat, c'est relever des montants sur une page. Gemini
//     Flash y est rapide et fiable — mesuré, pas supposé.
//   · COMPRENDRE un règlement de 53 pages, c'est de la lecture juridique :
//     distinguer l'article qui fixe un montant de celui qui pose la condition,
//     repérer qu'une annexe surcharge la partie générale, voir qu'un « ou »
//     dispense d'une durée. C'est là qu'un modèle de raisonnement peut valoir
//     davantage.
//
// D'où cet aiguillage, réglable SANS TOUCHER AU CODE : la variable
// `REGLEMENT_IA` (`gemini:gemini-2.5-flash`, `openai:gpt-5.6-sol`…) décide.
// Le banc d'essai `scripts/bench-reglement.mjs` note chaque candidat sur un
// règlement dont la vérité a été établie à la main.
//
// REPLI AUTOMATIQUE, et il compte : si le fournisseur choisi échoue — crédits
// épuisés, panne, quota — on retombe sur Gemini plutôt que de refuser le scan.
// Un client qui a photographié cinquante pages ne doit pas les perdre parce
// qu'un compte n'est plus approvisionné.

export type Fournisseur = "gemini" | "openai";

export interface ReponseIA {
  texte: string;
  fournisseur: Fournisseur;
  modele: string;
  /** Vrai si le fournisseur demandé a échoué et qu'on a basculé sur Gemini. */
  replied: boolean;
}

export interface FichierIA {
  mimeType: string;
  base64: string;
}

const DEFAUT = "gemini:gemini-2.5-flash";

/** Lit `REGLEMENT_IA` ; toute valeur illisible retombe sur le défaut éprouvé. */
export function choixModele(brut = process.env.REGLEMENT_IA): { fournisseur: Fournisseur; modele: string } {
  const [f, m] = (brut || DEFAUT).split(":");
  if (f === "openai" && m) return { fournisseur: "openai", modele: m };
  if (f === "gemini" && m) return { fournisseur: "gemini", modele: m };
  const [df, dm] = DEFAUT.split(":");
  return { fournisseur: df as Fournisseur, modele: dm };
}

async function viaGemini(prompt: string, fichiers: FichierIA[], modele: string): Promise<string> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) throw new Error("GEMINI_API_KEY absente");

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }, ...fichiers.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }))],
        }],
        // temperature 0 : sur un texte juridique, on veut la même lecture à
        // chaque passage — deux analyses divergentes seraient indéfendables.
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    },
  );
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function viaOpenAI(prompt: string, fichiers: FichierIA[], modele: string): Promise<string> {
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) throw new Error("OPENAI_API_KEY absente");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
    body: JSON.stringify({
      model: modele,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...fichiers.map((f, i) => ({
            type: "input_file",
            filename: `document-${i + 1}.${f.mimeType === "application/pdf" ? "pdf" : "jpg"}`,
            file_data: `data:${f.mimeType};base64,${f.base64}`,
          })),
        ],
      }],
      text: { format: { type: "json_object" } },
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`OpenAI HTTP ${r.status} — ${detail.slice(0, 160)}`);
  }
  const j = await r.json();
  const texte = (j.output ?? [])
    .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
    .find((c: { type: string }) => c.type === "output_text")?.text;
  return texte ?? "";
}

/**
 * Analyse un document et rend la réponse BRUTE (JSON en texte).
 *
 * Le repli n'est pas silencieux : `replied` remonte jusqu'à l'appelant, qui
 * peut le journaliser. Une bascule permanente vers Gemini sans que personne ne
 * s'en aperçoive serait une régression invisible de qualité.
 */
export async function analyserDocument(
  prompt: string,
  fichiers: FichierIA[],
  choix = choixModele(),
): Promise<ReponseIA> {
  if (choix.fournisseur === "openai") {
    try {
      return { texte: await viaOpenAI(prompt, fichiers, choix.modele), ...choix, replied: false };
    } catch (e) {
      console.error("[analyseIA] OpenAI indisponible, repli sur Gemini :", (e as Error).message);
      const secours = choixModele(DEFAUT);
      return { texte: await viaGemini(prompt, fichiers, secours.modele), ...secours, replied: true };
    }
  }
  return { texte: await viaGemini(prompt, fichiers, choix.modele), ...choix, replied: false };
}

/* =========================================================
 * Identification préalable — la passe bon marché
 * =======================================================*/

/**
 * Quelle caisse, quel millésime ? Rien d'autre.
 *
 * POURQUOI UNE PREMIÈRE PASSE
 * Analyser un règlement de cinquante pages coûte ~40 000 jetons de raisonnement.
 * Le faire pour découvrir ensuite qu'on possédait déjà ce document, c'est payer
 * pour rien — et prendre le risque qu'une lecture légèrement différente écrase
 * une version déjà vérifiée.
 *
 * Cette passe ne lit que l'en-tête : on la confie à Gemini Flash, rapide et bon
 * marché, quel que soit le moteur choisi pour l'analyse de fond. Reconnaître un
 * nom et une date ne demande pas de raisonnement juridique.
 */
export async function identifierReglement(
  fichiers: FichierIA[],
): Promise<{ caisse: string | null; enVigueurAu: string | null; estUnReglement: boolean }> {
  const prompt = `Ce document est-il un RÈGLEMENT DE PRÉVOYANCE d'une caisse de pension suisse
(2e pilier) ? Ne lis que l'en-tête et la page de titre, rien d'autre.

Un règlement énonce des RÈGLES pour tous les assurés d'une caisse. Un certificat
de prévoyance, lui, est personnel : il porte un nom, une date de naissance et des
montants propres à une personne. Ce n'est PAS un règlement.

Réponds en JSON : {"estUnReglement":boolean,"caisse":string|null,"enVigueurAu":string|null}
"caisse" = le nom de l'institution tel qu'imprimé. "enVigueurAu" = la date
d'entrée en vigueur, telle qu'écrite.`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }, ...fichiers.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }))],
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    },
  );
  if (!r.ok) throw new Error(`identification HTTP ${r.status}`);
  const texte = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const d = JSON.parse(texte);
  return {
    caisse: (d?.caisse ?? null) || null,
    enVigueurAu: (d?.enVigueurAu ?? null) || null,
    // Absence de réponse = on N'ÉCARTE PAS le document : mieux vaut une analyse
    // de trop qu'un règlement valable refusé au client qui vient de le scanner.
    estUnReglement: d?.estUnReglement !== false,
  };
}
