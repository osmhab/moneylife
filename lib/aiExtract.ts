// lib/aiExtract.ts
// Extraction LPP/BVG robuste (FR/DE/IT) avec GPT-5 + garde-fous layout.
// - Sélectionne le MONTANT le plus à DROITE du libellé (et lignes voisines)
// - Ignore les pourcentages si un montant CHF est présent
// - Convertit "par mois" → annuel pour les rentes
// - Évite les projections "Prestations de vieillesse … <âge> ans …" pour les avoirs actuels
// - Sortie JSON strict via json_schema (fallback json_object)
// - Ajoute les nouveaux champs : prenom, nom, dateNaissance, renteConjoint, renteOrphelin,
//   capitalRetraite65, renteRetraite65, rachatPossible, eplDisponible, miseEnGage

import type { Line } from "./layoutTypes";

/** Résultat IA attendu pour un certificat LPP/BVG (élargi) */
export type LppAIResult = {
  employeur: string | null;              // optionnel : pas demandé dans cette passe, on le garde
  caisse: string | null;                 // nom de la caisse de pension
  dateCertificat: string | null;         // JJ.MM.AAAA ou YYYY-MM-DD (imprimée)
  prenom: string | null;
  nom: string | null;
  dateNaissance: string | null;          // JJ.MM.AAAA ou YYYY-MM-DD
  salaireDeterminant: number | null;
  deductionCoordination: number | null;
  salaireAssureEpargne: number | null;
  salaireAssureRisque: number | null;
  avoirVieillesse: number | null;
  avoirVieillesseSelonLpp: number | null;
  interetProjetePct: number | null;      // 1.5 pour 1,5%
  renteInvaliditeAnnuelle: number | null;
  renteEnfantInvaliditeAnnuelle: number | null;
  renteConjointAnnuelle: number | null;  // veuf/veuve/partenaire
  renteOrphelinAnnuelle: number | null;
  capitalDeces: number | null;
  capitalRetraite65: number | null;      // capital à la retraite (65 ans)
  renteRetraite65Annuelle: number | null;// rente à la retraite (65 ans) ANNUELLE
  rachatPossible: number | null;         // achat/rachat possible
  eplDisponible: number | null;          // montant dispo pour EPL/WEF
  miseEnGage: boolean | null;            // mise en gage oui/non
  remarques: string | null;
  proofs?: Record<
    string,
    { snippet: string; page?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  >;
  confidence?: number | null;
  issues?: string[];
};

/* ===========================
   Prompts (IA experte LPP)
   =========================== */

const SYSTEM_PROMPT = `
Tu es un extracteur suisse LPP/BVG expert. Tu lis des certificats de prévoyance (2e pilier) en FR/DE/IT.
Objectif: retourner EXCLUSIVEMENT un JSON valide respectant le schéma fourni, sans texte en dehors du JSON.

PRINCIPE CLÉ — SÉLECTION DE VALEUR:
- Pour chaque libellé cible, CHOISIS le MONTANT EN CHF le PLUS À DROITE sur la même ligne que le libellé.
- S’il n’y a pas de montant crédible sur cette ligne, cherche dans la même colonne, 1–3 lignes en DESSOUS.
- En dernier recours, 1–3 lignes au-DESSUS (certaines caisses inversent).
- IGNORE les pourcentages (%) si un montant en CHF est présent sur la ligne/zone. N’utilise JAMAIS un pourcentage comme valeur finale si un montant existe.
- Si la ligne indique une périodicité “par mois / mensuel / monatlich / al mese”, CONVERTIS en annuel (×12) pour les rentes et NOTE-LE dans "remarques".

CONDUITE EN CAS D’INCERTITUDE:
- Si la valeur n’est pas clairement imprimée, renvoie null et ajoute un "issue" explicite (ex.: "Montant non trouvé", "Libellé ambigu").
- NE PAS halluciner. NE PAS inventer de dates. NE PAS déduire depuis d’autres champs si un montant imprimé existe quelque part pour ce champ.

ZONES À EXCLURE / PIÈGES:
- Ne JAMAIS utiliser les montants de “Prestations de vieillesse … <âge> ans …” pour "avoirVieillesse" / "avoirVieillesseSelonLpp" (ce sont des PROJECTIONS).
- Ne pas confondre taux de conversion avec taux d’intérêt projeté.
- Évite numéros de page, notes, astérisques, totaux globaux, options maximales.
- Si plusieurs employeurs/caisses apparaissent, sélectionne le bloc principal du certificat (ignore les annexes) et signale toute ambiguïté.

ROBUSTESSE LINGUISTIQUE:
- Traite FR/DE/IT, y compris abréviations (ex.: "Koordinationsabzug", "ded. coord.", "davon nach BVG").
- Tolère accents/ligatures/retours à la ligne: concentre-toi sur le SENS.

FORMAT & PREUVES:
- Tu renvoies UNIQUEMENT un JSON conforme au schéma demandé.
- Pour chaque champ ≠ null, ajoute dans "proofs" UNE ENTRÉE dont la CLÉ est le nom du champ et la VALEUR est un objet { snippet, page?, x1?, y1?, x2?, y2? }.
- Ajoute "issues[]" pour toute anomalie (p.ex. pourcentage ignoré, mensuel converti, suspicion d’alignement, valeur incohérente).
- Renseigne "confidence" ∈ [0.0, 1.0].

VALIDATIONS LOGIQUES MINIMALES (à appliquer côté modèle):
- Si une rente annuelle < 1000 CHF, ajoute "issue: Rente improbable".
- Si rente enfant < 500 CHF, ajoute "issue: Rente enfant improbable".
- Si un montant capturé n’a pas de preuve lisible, préfère null + issue.

PROCÉDURE EN 2 PHASES:
PHASE 1 — Cartographie rapide:
  • Déduis la structure: colonnes libellés vs valeurs (droite), tableaux éventuels.
  • Localise la “colonne montants” (chiffres alignés à droite).
  • Décide pour chaque libellé quel est le meilleur candidat (même ligne > dessous > dessus).

PHASE 2 — Extraction stricte:
  • Associe chaque libellé au montant EXACT imprimé selon la règle “droite du libellé”.
  • Si aucun montant imprimé: tente un calcul UNIQUEMENT si vraiment nécessaire ET si le document décrit la formule. Sinon null.
  • Toujours préférer un montant imprimé contractuel à un calcul.

RENDU:
- JSON strict, aucun commentaire en dehors.
`;

const FIELD_SPEC = `
Schéma de sortie (toutes les valeurs en nombre sans séparateurs; décimales avec point):
{
  "employeur": string|null,
  "caisse": string|null,
  "dateCertificat": "YYYY-MM-DD"| "DD.MM.YYYY"|null,
  "prenom": string|null,
  "nom": string|null,
  "dateNaissance": "YYYY-MM-DD"| "DD.MM.YYYY"|null,
  "salaireDeterminant": number|null,
  "deductionCoordination": number|null,
  "salaireAssureEpargne": number|null,
  "salaireAssureRisque": number|null,
  "avoirVieillesse": number|null,
  "avoirVieillesseSelonLpp": number|null,
  "interetProjetePct": number|null,
  "renteInvaliditeAnnuelle": number|null,
  "renteEnfantInvaliditeAnnuelle": number|null,
  "renteConjointAnnuelle": number|null,
  "renteOrphelinAnnuelle": number|null,
  "capitalDeces": number|null,
  "capitalRetraite65": number|null,
  "renteRetraite65Annuelle": number|null,
  "rachatPossible": number|null,
  "eplDisponible": number|null,
  "miseEnGage": boolean|null,
  "remarques": string|null,
  "proofs": { "<field>": { "snippet": string, "page"?: number, "x1"?: number, "y1"?: number, "x2"?: number, "y2"?: number } },
  "confidence": number|null,
  "issues": [string]
}

Libellés indicatifs (non exhaustif, FR/DE/IT) :
- caisse: "Caisse de pensions", "Pensionskasse", "Cassa pensioni".
- dateCertificat: "Certificat valable dès JJ.MM.AAAA", "Gültig ab TT.MM.JJJJ", "Valido dal GG.MM.AAAA".
- prenom/nom: "Prénom", "Nom" | "Vorname", "Name/Nachname" | "Nome", "Cognome".
- dateNaissance: "Date de naissance", "Geburtsdatum", "Data di nascita".
- renteConjointAnnuelle: "Rente de conjoint/veuf/veuve/partenaire", "Witwen-/Witwerrente", "rendita per coniuge/partner".
- renteOrphelinAnnuelle: "Rente d'orphelin", "Waisenrente", "rendita per orfano".
- capitalRetraite65 / renteRetraite65Annuelle: montants à 65 ans (capital/rente); NE PAS confondre avec projections de tableaux génériques.
- rachatPossible: "Achat possible / Rachat possible".
- eplDisponible: "Versement anticipé EPL/WEF", "Vorbezug WEF", "prelievo anticipato abitazione".
- miseEnGage: "Mise en gage" / "Verpfändung" (oui/non).
`;

const LAYOUT_GUIDE = `
MÉTHODE D’ANCRAGE (layout):
1) Déterminer la/les colonnes de montants (alignement à droite) vs colonnes de libellés (texte).
2) Pour un libellé:
   a) même ligne: choisir le montant le plus à DROITE du libellé.
   b) sinon: même colonne, 1–3 lignes en dessous.
   c) sinon: 1–3 lignes au-dessus.
3) Ignorer explicitement:
   • blocs "Prestations de vieillesse … <âge> ans …" pour les champs d’avoirs,
   • pourcentages si un montant existe,
   • totaux globaux, en-têtes/pieds de page, notes/astérisques,
   • options maximales non contractuelles.
4) Si la ligne/zone contient un indice mensuel ("par mois", "mensuel", "monatlich", "al mese"), convertir rentes en annuel (×12) et noter en "remarques".
5) Pour chaque valeur retenue, fournir un court snippet de preuve tiré de la ligne/zone utilisée.
`;

/* ===========================
   Schéma JSON strict
   =========================== */

function toSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      employeur: { type: ["string", "null"] },
      caisse: { type: ["string", "null"] },
      dateCertificat: { type: ["string", "null"] },
      prenom: { type: ["string", "null"] },
      nom: { type: ["string", "null"] },
      dateNaissance: { type: ["string", "null"] },
      salaireDeterminant: { type: ["number", "null"] },
      deductionCoordination: { type: ["number", "null"] },
      salaireAssureEpargne: { type: ["number", "null"] },
      salaireAssureRisque: { type: ["number", "null"] },
      avoirVieillesse: { type: ["number", "null"] },
      avoirVieillesseSelonLpp: { type: ["number", "null"] },
      interetProjetePct: { type: ["number", "null"] },
      renteInvaliditeAnnuelle: { type: ["number", "null"] },
      renteEnfantInvaliditeAnnuelle: { type: ["number", "null"] },
      renteConjointAnnuelle: { type: ["number", "null"] },
      renteOrphelinAnnuelle: { type: ["number", "null"] },
      capitalDeces: { type: ["number", "null"] },
      capitalRetraite65: { type: ["number", "null"] },
      renteRetraite65Annuelle: { type: ["number", "null"] },
      rachatPossible: { type: ["number", "null"] },
      eplDisponible: { type: ["number", "null"] },
      miseEnGage: { type: ["boolean", "null"] },
      remarques: { type: ["string", "null"] },
      proofs: {
        type: ["object", "null"],
        additionalProperties: {
          type: "object",
          additionalProperties: false,
          properties: {
            snippet: { type: "string" },
            page: { type: ["number", "null"] },
            x1: { type: ["number", "null"] },
            y1: { type: ["number", "null"] },
            x2: { type: ["number", "null"] },
            y2: { type: ["number", "null"] },
          },
          required: ["snippet"],
        },
      },
      confidence: { type: ["number", "null"] },
      issues: { type: ["array", "null"], items: { type: "string" } },
    },
    required: [],
  } as const;
}

/* ===========================
   Helpers parsing / layout
   =========================== */

const AMOUNT_RE = /(?:CHF\s*)?([0-9]{1,3}(?:[’'\u00A0\s]?[0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)/g;
const PERCENT_AFTER = /^\s*%/;

function parseChf(s: string): number | null {
  const cleaned = s.replace(/[’'\u00A0\s]/g, "").replace(/,(?=\d{2}\b)/, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function lineHintsMonthly(text: string): boolean {
  const t = text.toLowerCase();
  return /(par\s*mois|mensuel|mensuelle|monatlich|al\s*mese)/.test(t);
}
function maybeAnnualize(value: number | null, contextText: string): number | null {
  if (value == null) return null;
  return lineHintsMonthly(contextText) ? value * 12 : value;
}

/** Cherche le montant le plus à droite sur la ligne/voisines (en ignorant les %) */
function extractRightmostAmountForLabel(
  layout: Line[],
  labelIdx: number,
  xLabel: number
): { value: number | null; proofText?: string } {
  const base = layout[labelIdx];
  if (!base) return { value: null };
  const neighborIdxs = [labelIdx, labelIdx + 1, labelIdx - 1].filter(
    (i) => i >= 0 && i < layout.length
  );

  let best: { v: number; x: number; text: string } | null = null;

  for (const i of neighborIdxs) {
    const L = layout[i];
    if (!L) continue;

    // Parcourt tous les montants
    AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AMOUNT_RE.exec(L.text)) !== null) {
      const raw = m[1];
      const rightPart = L.text.slice(m.index + (m[0]?.length || 0));
      if (PERCENT_AFTER.test(rightPart)) continue; // c’est un %
      const ratio = (m.index + (raw?.length || 0)) / (L.text.length || 1);
      const xApprox = L.x1 + ratio * (L.x2 - L.x1);
      if (xApprox <= xLabel) continue; // on veut à droite du label
      const v = parseChf(raw);
      if (v == null) continue;
      if (!best || xApprox > best.x || v > best.v) best = { v, x: xApprox, text: L.text };
    }
  }
  return best ? { value: best.v, proofText: best.text } : { value: null };
}

/** Trouve la 1re ligne qui matche le regex */
function findLineIdx(layout: Line[], re: RegExp): number {
  return layout.findIndex((L) => re.test(L.text));
}

/** Nettoie les proofs qui pointent vers “Prestations de vieillesse … <âge> ans …” */
function sanitizeProofs(proofs?: LppAIResult["proofs"]) {
  if (!proofs) return proofs;
  const badAgeRe = /\b\d{2}\s*ans\b/i;
  const clean: NonNullable<LppAIResult["proofs"]> = {};
  for (const [k, v] of Object.entries(proofs)) {
    const snip = v?.snippet || "";
    const isProjected = /prestations?\s+de\s+vieillesse/i.test(snip) && badAgeRe.test(snip);
    if (isProjected && (k === "avoirVieillesse" || k === "avoirVieillesseSelonLpp")) continue;
    clean[k] = v;
  }
  return clean;
}

/* ===========================
   Corrections layout ciblées
   =========================== */

function applyLayoutCorrections(rawText: string, layout: Line[], ai: LppAIResult): LppAIResult {
  const out: LppAIResult = { ...ai, issues: [...(ai.issues || [])], proofs: ai.proofs || {} };

  // Regex FR/DE/IT par champ (sans exhaustivité absolue, mais robustes)
  const RX = {
    invalidite: /\b(rente\s+d[’']?invalidit[éè]|invalidenrente|rendita\s+d[’']?invalidit[aà])\b(?!.*(enfant|kind|bambino))/i,
    enfantAI: /(rente\s+d[’']?enfant\s+d[’']?invalidit[éè]|kinderrente\s*\(invalidit[äa]t\)|rendita\s+per\s+bambino\s+di\s+invalidit[aà])/i,
    conjoint: /(rente\s+de\s+(?:conjoint|veuf|veuve|partenaire)|witwen-\/?witwerrente|partner(?:rente)?|rendita\s+per\s+coniuge|partner)/i,
    orphelin: /(rente\s+d[’']?orphelin|waisenrente|rendita\s+per\s+orfano)/i,
    capitalDeces: /(capital(?:e)?\s+d[ée]c[èe]s|minim(?:al)?\s+d[ée]c[èe]s|todesfallkapital|capitale\s+decesso)/i,
    capitalRetraite65: /(capital(?:e)?\s+(?:de\s+)?retraite\s*\(?(?:65)\s*ans\)?|kapital\s+im\s+rentenalter\s*65|capitale\s+di\s+vecchiaia\s*65)/i,
    renteRetraite65: /(rente\s+(?:de\s+)?retraite\s*\(?(?:65)\s*ans\)?|altersrente\s*65|rendita\s+di\s+vecchiaia\s*65)/i,
    rachat: /(achat\s+possible|rachat\s+possible|einkauf(?:\s+möglich)?|acquisto\s+possibile)/i,
    epl: /(versement\s+anticip[ée]\s+(?:epl|wef)|wef[-\s]?vorbezug|prelievo\s+anticipato\s+abitazione)/i,
    miseEnGage: /(mise\s+en\s+gage|verpf[äa]ndung)/i,
    caisse: /(caisse\s+de\s+pensions|pensionskasse|cassa\s+pensioni)/i,
    dateCert: /(certificat\s+valable\s+d[èe]s|gültig\s+ab|valido\s+dal)/i,
    dateNai: /(date\s+de\s+naissance|geburtsdatum|data\s+di\s+nascita)/i,
    prenom: /\b(pr[ée]nom|vorname|nome)\b/i,
    nom: /\b(nom|name|nachname|cognome)\b/i,
  };

  type Corr = { field: keyof LppAIResult; rx: RegExp; annualize?: boolean };
  const CORRS: Corr[] = [
    { field: "renteInvaliditeAnnuelle", rx: RX.invalidite, annualize: true },
    { field: "renteEnfantInvaliditeAnnuelle", rx: RX.enfantAI, annualize: true },
    { field: "renteConjointAnnuelle", rx: RX.conjoint, annualize: true },
    { field: "renteOrphelinAnnuelle", rx: RX.orphelin, annualize: true },
    { field: "capitalDeces", rx: RX.capitalDeces },
    { field: "capitalRetraite65", rx: RX.capitalRetraite65 },
    { field: "renteRetraite65Annuelle", rx: RX.renteRetraite65, annualize: true },
    { field: "rachatPossible", rx: RX.rachat },
    { field: "eplDisponible", rx: RX.epl },
  ];

  for (const c of CORRS) {
    const idx = findLineIdx(layout, c.rx);
    if (idx >= 0) {
      const { value, proofText } = extractRightmostAmountForLabel(layout, idx, layout[idx].x2);
      if (value != null) {
        const v = c.annualize ? maybeAnnualize(value, layout[idx].text)! : value;
        const cur = out[c.field] as number | null;
        if (cur == null || cur < (v / 4)) {
          (out as any)[c.field] = v;
          out.issues!.push(`${String(c.field)} corrigé via layout (montant à droite)`);
          out.proofs![String(c.field)] = { snippet: `Layout: ${proofText || ""}` };
        }
      }
    }
  }

  // Mise en gage (booléen) — repérage par présence d’un mot-clé + un oui/non dans la zone
  const idxPledge = findLineIdx(layout, RX.miseEnGage);
  if (idxPledge >= 0 && out.miseEnGage == null) {
    const L = layout[idxPledge];
    const t = L.text.toLowerCase();
    const yes = /(oui|ja|s[iì])\b/.test(t);
    const no = /\b(non|nein|no)\b/.test(t);
    if (yes !== no) {
      out.miseEnGage = yes ? true : false;
      out.proofs!["miseEnGage"] = { snippet: `Layout: ${L.text.slice(0, 120)}` };
    }
  }

  return out;
}

/* ===========================
   IA principale (GPT-5)
   =========================== */

export async function aiExtractLpp(
  rawText: string,
  layoutLines: Line[],
  openaiKey?: string
): Promise<LppAIResult> {
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY manquant: l'IA est obligatoire pour l'analyse LPP.");
  }

  const layoutHints = layoutLines.slice(0, 500).map((L, i) => ({
    idx: i,
    text: L.text,
    x1: Math.round(L.x1),
    x2: Math.round(L.x2),
    yMid: Math.round(L.yMid),
  }));
  const schema = toSchema();

  // === GPT-5 REQUEST START ===
  const MODEL = "gpt-5";
  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "Guide de lecture du layout:\n" +
        LAYOUT_GUIDE +
        "\n\nIndices de layout (quelques lignes):\n" +
        JSON.stringify(layoutHints).slice(0, 100_000),
    },
    {
      role: "user",
      content:
        "Texte OCR du certificat LPP/BVG (peut être incomplet/bruité). " +
        "Utilise les définitions LPP, les libellés multilingues, et les règles d'alignement droite/sous.\n\n" +
        FIELD_SPEC +
        "\n\n--- TEXTE OCR ---\n" +
        rawText.slice(0, 100_000),
    },
    {
      role: "user",
      content:
        "RENVOIE UNIQUEMENT le JSON final avec tous les champs. " +
        "Les champs inconnus doivent être null. " +
        "Inclure 'proofs' (indexés par champ) et 'confidence' ∈ [0..1].",
    },
  ] as const;

  let body: any = {
    model: MODEL,
    response_format: {
      type: "json_schema",
      json_schema: { name: "lpp_extract_v4_strict", schema, strict: true },
    },
    messages: baseMessages,
  };

  let res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify(body),
  });

  // Fallback : si 400 lié au format, repasse en json_object
  if (!res.ok) {
    const firstErr = await res.text().catch(() => "");
    if (res.status === 400 && /response_format|json_schema|unsupported|temperature|verbosity/i.test(firstErr)) {
      body = {
        model: MODEL,
        response_format: { type: "json_object" },
        messages: baseMessages,
      };
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify(body),
      });
    }
    if (!res.ok) {
      const secondErr = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status}: ${secondErr || firstErr}`);
    }
  }
  // === GPT-5 REQUEST END ===

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse IA vide");

  let data: LppAIResult;
  try {
    data = JSON.parse(content) as LppAIResult;
  } catch {
    throw new Error("Réponse IA invalide (JSON parse error)");
  }

  /* ===========================
     Post-validation & corrections
     =========================== */

  const toNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const nz = (v: unknown) => (toNum(v) === 0 ? null : toNum(v));

  data.salaireDeterminant = nz(data.salaireDeterminant);
  data.deductionCoordination = nz(data.deductionCoordination);
  data.salaireAssureEpargne = nz(data.salaireAssureEpargne);
  data.salaireAssureRisque = nz(data.salaireAssureRisque);
  data.avoirVieillesse = nz(data.avoirVieillesse);
  data.avoirVieillesseSelonLpp = nz(data.avoirVieillesseSelonLpp);
  data.interetProjetePct = toNum(data.interetProjetePct);
  data.renteInvaliditeAnnuelle = nz(data.renteInvaliditeAnnuelle);
  data.renteEnfantInvaliditeAnnuelle = nz(data.renteEnfantInvaliditeAnnuelle);
  data.renteConjointAnnuelle = nz(data.renteConjointAnnuelle);
  data.renteOrphelinAnnuelle = nz(data.renteOrphelinAnnuelle);
  data.capitalDeces = nz(data.capitalDeces);
  data.capitalRetraite65 = nz(data.capitalRetraite65);
  data.renteRetraite65Annuelle = nz(data.renteRetraite65Annuelle);
  data.rachatPossible = nz(data.rachatPossible);
  data.eplDisponible = nz(data.eplDisponible);
  if (typeof data.miseEnGage !== "boolean") data.miseEnGage = data.miseEnGage == null ? null : !!data.miseEnGage;

  // Harmonisation Risque/Epargne si non distingués
  if (data.salaireAssureRisque == null && data.salaireAssureEpargne != null) {
    data.salaireAssureRisque = data.salaireAssureEpargne;
  }
  if (data.salaireAssureEpargne == null && data.salaireAssureRisque != null) {
    data.salaireAssureEpargne = data.salaireAssureRisque;
  }

  // Confiance bornée
  if (typeof data.confidence !== "number" || !Number.isFinite(data.confidence)) {
    data.confidence = 0.7;
  } else {
    data.confidence = Math.max(0, Math.min(1, data.confidence));
  }

  // Écarter les projections pour les avoirs (si confondu)
  const NUMBER_CHUNK = /[\d’'\u00A0\s.,]+/;
  const normNumber = (raw?: string | number | null): number | null => {
    if (raw == null) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const s = String(raw).replace(/[’'\u00A0\s.,]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const projectedNums = Array.from(
    rawText.matchAll(/\b(\d{2})\s*ans\s+(\d[\d’'\u00A0\s.,]+)/gi)
  ).map((m) => normNumber(m[2])).filter((n): n is number => n != null);

  const rxAvoir = (() => {
    const m = rawText.match(new RegExp(`Avoir\\s+de\\s+vieillesse\\s+au\\s+\\d{2}\\.\\d{2}\\.\\d{4}\\s*(${NUMBER_CHUNK.source})`, "i"));
    return m ? normNumber(m[1]) : null;
  })();
  const rxAvoirLpp = (() => {
    const m = rawText.match(new RegExp(`dont\\s+selon\\s+LPP\\s+au\\s+\\d{2}\\.\\d{2}\\.\\d{4}\\s*(${NUMBER_CHUNK.source})`, "i"));
    return m ? normNumber(m[1]) : null;
  })();

  const looksProjected = (v: number | null) => v != null && projectedNums.includes(v);
  if (looksProjected(data.avoirVieillesse) && rxAvoir != null) data.avoirVieillesse = rxAvoir;
  if (looksProjected(data.avoirVieillesseSelonLpp) && rxAvoirLpp != null) data.avoirVieillesseSelonLpp = rxAvoirLpp;

  if (rxAvoir != null && data.avoirVieillesse != null && data.avoirVieillesse > rxAvoir * 5) {
    data.avoirVieillesse = rxAvoir;
  }
  if (rxAvoirLpp != null && data.avoirVieillesseSelonLpp != null && data.avoirVieillesseSelonLpp > rxAvoirLpp * 5) {
    data.avoirVieillesseSelonLpp = rxAvoirLpp;
  }

  // Corrections layout supplémentaires pour nouveaux champs (et rentes)
  data = applyLayoutCorrections(rawText, layoutLines, data);

  // Sanity minimal
  data.issues = data.issues || [];
  const pushIf = (cond: boolean, msg: string) => { if (cond) data.issues!.push(msg); };
  pushIf((data.renteInvaliditeAnnuelle ?? 0) < 1000 && data.renteInvaliditeAnnuelle != null, "Invalidité < 1000/an improbable");
  pushIf((data.renteEnfantInvaliditeAnnuelle ?? 0) < 500 && data.renteEnfantInvaliditeAnnuelle != null, "Enfant < 500/an improbable");

  // Preuves propres
  data.proofs = sanitizeProofs(data.proofs);

  return data;
}
