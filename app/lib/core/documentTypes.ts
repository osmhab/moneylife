// app/lib/core/documentTypes.ts
//
// Taxonomie CANONIQUE des types de documents du coffre-fort.
// Source unique partagée par : les prompts IA (lpp/insurance parse), l'upload
// admin (DocumentUploaderModal / AdminPlanGenerator), l'édition côté client
// (PlanDetailsView) et l'affichage du coffre (ClientDocumentsView).
//
// Les types sont stockés en clair (libellé français) — cohérent avec l'existant
// où `documents[].types` contient déjà des libellés et non des clés i18n.

export const DOCUMENT_TYPES = [
  "Certificat LPP",
  "Police 3e pilier",
  "Bulletin de versement",
  "Valeur de rachat",
  "Conditions générales",
  "Offre",
  "Contrat signé",
  "Attestation fiscale",
  "Avenant / Modification",
  "Courrier",
  "Autre",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Titre LISIBLE par le client pour un document scanné (source), construit de
 * façon déterministe depuis le type de plan + le nom de l'institution/compagnie.
 * Ex. "Certificat de caisse de pension - Publica", "Police 3a Generali",
 * "Police 3b AXA". Sert de défaut à la création ET de repli rétroactif dans le
 * coffre pour les plans scannés avant la classification.
 */
export function buildSourceDocTitle(planType?: string, institutionName?: string): string {
  const inst = (institutionName || "").trim();
  // Valeurs génériques/placeholder qu'on n'accole pas au titre.
  const generic = ["", "caisse de pension", "autre", "inconnue", "inconnu", "assurance"];
  const hasInst = !!inst && !generic.includes(inst.toLowerCase());

  switch (planType) {
    case "LPP_BASE":
    case "LPP_COMPL":
      return hasInst ? `Certificat de caisse de pension - ${inst}` : "Certificat de caisse de pension";
    case "PILIER_3A_POLICE":
      return hasInst ? `Police 3a ${inst}` : "Police 3a";
    case "PILIER_3A_BANK":
    case "3A_BANQUE":
      return hasInst ? `3e pilier bancaire - ${inst}` : "3e pilier bancaire (3a)";
    case "PILIER_3B":
      return hasInst ? `Police 3b ${inst}` : "Police 3b";
    default:
      return hasInst ? `Document - ${inst}` : "Document original";
  }
}

/**
 * Bloc d'instruction injecté dans les prompts IA (Gemini) pour classer un
 * document scanné. L'IA choisit le type le plus proche dans la liste ; si rien
 * ne correspond vraiment, elle renvoie un libellé court et explicite de son cru.
 */
export const DOCUMENT_CLASSIFICATION_PROMPT = `
CLASSIFICATION DU DOCUMENT (obligatoire) :
- "documentType" : le type du document parmi cette liste exacte :
  ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}.
  Choisis le type le PLUS PROCHE. Si AUCUN ne correspond vraiment, n'utilise PAS
  "Autre" : invente un libellé court, clair et en français (2-3 mots max).
- "suggestedTags" : tableau de 1 à 3 mots-clés courts en français qui aident à
  identifier le document d'un coup d'œil (ex. l'année "2026", "Important",
  le nom de la compagnie, "Fiscal"). Pas de phrase, juste des mots-clés.
- "keywords" : tableau de mots-clés ISSUS DU CONTENU du document, pour une
  recherche fine ultérieure : noms de personnes/sociétés, numéros de
  contrat/police, dates, montants, produits/assurances, bénéficiaires,
  institutions, références. 10 à 30 termes COURTS, sans phrases ni doublons.
`.trim();
