// app/lib/core/veille.ts
//
// VEILLE : reconnaître un règlement DE PRÉVOYANCE sur le site d'une caisse.
//
// LE VRAI PROBLÈME N'EST PAS DE TROUVER DES PDF
// ---------------------------------------------
// Une caisse de pension en publie beaucoup, et presque tous s'appellent
// « règlement » : règlement de placement, d'organisation, de liquidation
// partielle, de provisions, sur les frais. Un seul nous intéresse — celui qui
// dit à quelles conditions les prestations sont dues.
//
// Ramasser les autres coûterait une analyse à chaque fois, remplirait la
// bibliothèque de politiques de placement, et — plus grave — pourrait faire
// appliquer à un assuré des règles qui n'ont rien à voir avec ses prestations.
//
// D'où un tri en deux temps : il faut qu'un mot de PRÉVOYANCE apparaisse, et
// qu'aucun mot d'EXCLUSION ne soit présent. Le doute profite à l'exclusion :
// mieux vaut manquer un règlement — un client ou un collaborateur le déposera —
// que d'en ingérer un qui fausserait des analyses.

/**
 * Mots qui signalent un règlement, dans les trois langues.
 *
 * VOLONTAIREMENT LARGE — « règlement » suffit. Les intitulés réels ne
 * ressemblent pas à ceux qu'on imagine : CPVAL publie le sien sous le titre
 * « Règlement actualisé ». Une liste exigeant « règlement de prévoyance »
 * ratait le seul document qui compte, sur un site pourtant bien lisible.
 *
 * On peut se le permettre parce qu'un SECOND filtre suit : avant toute analyse
 * de fond, une passe d'identification demande à l'IA si le document est bien un
 * règlement de prévoyance. Elle coûte des centimes et écarte le reste. Le tri
 * ci-dessous n'a donc pas à être parfait — seulement à ne pas rater l'essentiel.
 */
const REGLEMENT = ["reglement", "vorsorgereglement", "regolamento", "regulations"];

/**
 * Mots qui disqualifient, même en présence du mot « règlement ».
 *
 * Une caisse publie beaucoup de règlements : placement, organisation,
 * liquidation partielle, provisions, frais. Aucun ne dit à quelles conditions
 * les prestations sont dues, et chacun coûterait une analyse.
 *
 * « Règlement de placement de la fondation de prévoyance » contient les deux
 * familles de mots : l'exclusion l'emporte.
 */
const EXCLUSIONS = [
  "placement", "anlage", "investissement", "investimenti",
  "organisation", "organisationsreglement", "organizzazione",
  "liquidation partielle", "teilliquidation", "liquidazione parziale",
  "provision", "rueckstellung", "ruckstellung", "accantonament",
  "frais", "kostenreglement", "gebuehren", "spese",
  "election", "wahlreglement", "elettorale",
  "cotisations impayees", "archivage", "protection des donnees", "datenschutz",
  // Gouvernance interne : constaté sur cpval.ch, dont la page d'accueil pointe
  // un « Règlement actualisé » qui est celui de l'assemblée des délégués.
  "assemblee des delegues", "delegiertenversammlung", "assemblea dei delegati",
  "conseil de fondation", "stiftungsrat", "consiglio di fondazione",
];

/** Forme comparable : sans accents, sans ponctuation, en minuscules. */
export function normaliser(texte: string): string {
  return (texte || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ce lien mène-t-il à un règlement de prévoyance ?
 *
 * On juge sur le TEXTE du lien ET sur le nom du fichier : un site donne parfois
 * un intitulé parlant pour un fichier nommé `doc_4471.pdf`, et l'inverse arrive
 * tout autant.
 */
export function estLienDeReglement(texteDuLien: string, url: string): boolean {
  const foin = `${normaliser(texteDuLien)} ${normaliser(decodeURIComponent(url))}`;
  if (!REGLEMENT.some((m) => foin.includes(normaliser(m)))) return false;
  return !EXCLUSIONS.some((m) => foin.includes(normaliser(m)));
}

export interface LienPdf {
  url: string;
  texte: string;
}

/**
 * Liens PDF d'une page, avec leur intitulé, adresses rendues absolues.
 *
 * Analyse volontairement sommaire : on ne cherche pas à comprendre la page,
 * seulement à en extraire des liens. Un site qui charge ses documents en
 * JavaScript ne rendra rien — c'est assumé, un collaborateur déposera alors le
 * PDF à la main plutôt que d'embarquer un navigateur sans tête.
 */
export function extraireLiensPdf(html: string, base: string): LienPdf[] {
  const liens: LienPdf[] = [];
  const vus = new Set<string>();

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    if (!/\.pdf(\?|#|$)/i.test(href)) continue;

    let absolue: string;
    try {
      absolue = new URL(href, base).toString();
    } catch {
      continue;                                  // href inexploitable
    }
    if (vus.has(absolue)) continue;
    vus.add(absolue);

    // Le texte du lien peut contenir des balises (icône, <span>) : on ne garde
    // que les mots.
    const texte = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    liens.push({ url: absolue, texte });
  }
  return liens;
}

/** Liens d'une page qui méritent une analyse. */
export function reglementsCandidats(html: string, base: string): LienPdf[] {
  return extraireLiensPdf(html, base).filter((l) => estLienDeReglement(l.texte, l.url));
}

/**
 * Une caisse doit-elle être revisitée ?
 *
 * Un règlement change au plus une fois l'an. Repasser chaque semaine sur des
 * sites qui ne bougent pas est inutile et peu courtois ; on espace donc les
 * visites, tout en garantissant qu'une caisse jamais visitée passe en premier.
 */
export function aRevisiter(
  dernierPassage: number | null | undefined,
  maintenant: number = Date.now(),
  joursEntreDeuxPassages = 30,
): boolean {
  if (!dernierPassage) return true;
  return maintenant - dernierPassage >= joursEntreDeuxPassages * 24 * 3600 * 1000;
}
