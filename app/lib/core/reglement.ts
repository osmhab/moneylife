// app/lib/core/reglement.ts
//
// RÈGLEMENT DE CAISSE DE PENSION — la règle du jeu du 2e pilier.
//
// POURQUOI CE MODULE
// ------------------
// Un certificat de prévoyance donne des MONTANTS ; il ne dit pas QUAND ils sont
// dus. Le cas d'école est le capital décès : le certificat Aevum de 2025 affiche
// « Capital décès (correspond au capital de prévoyance) 19'662.05 » sans préciser
// s'il s'ajoute à la rente de partenaire ou s'il n'est versé qu'à défaut.
//
// Le règlement, lui, tranche — et dans le MÊME document Aevum, trois annexes
// donnent trois réponses opposées :
//   · art. 63 (général)   → versé « si aucune rente de partenaire n'est échue »
//   · annexe 7, art. 10   → 100 % de l'épargne SOUS DÉDUCTION du financement de la rente
//   · annexe 8, art. 6    → versé « dans tous les cas »
//
// Pour une assurée mariée dont la rente de partenaire est due, le même montant
// vaut donc 19'662 ou 0 selon le plan. Sans le règlement, on devine — et on
// annonce au client une couverture décès qui n'existe pas.
//
// Le certificat le dit lui-même : « En cas de divergences entre les données
// ci-dessus et le règlement, c'est le règlement qui fait foi. »

/** Comment le capital décès est dû par rapport à la rente de partenaire. */
export type ModeCapitalDeces =
  | "TOUJOURS"                      // versé qu'il y ait ou non une rente
  | "SI_AUCUNE_RENTE_PARTENAIRE"    // versé uniquement à défaut de rente
  | "REDUIT_DU_FINANCEMENT_RENTE"   // versé sous déduction du financement de la rente
  | "NON_PREVU";                    // le règlement ne prévoit pas de capital décès

/**
 * Toute règle extraite porte SA SOURCE. Sans citation ni article, une règle
 * n'est pas vérifiable — donc pas opposable à un client, et inutilisable dans
 * une piste d'audit. On refuse d'appliquer une règle non sourcée (cf. `estSourcee`).
 */
export interface RegleCitee {
  article: string | null;
  citation: string | null;
}

export interface RegleCapitalDeces extends RegleCitee {
  verse: ModeCapitalDeces | null;
  base: string | null;
  /** Part réduite pour les « autres héritiers légaux » (art. 20a LPP) : 0.5 chez Aevum. */
  limiteHeritiersLegaux: number | null;
  avantRetraiteUniquement: boolean | null;
}

export interface ReglePourcentage extends RegleCitee {
  pourcentage: number | null;
  base: string | null;
  conditions?: string | null;
}

export interface BlocRegles {
  capitalDeces: RegleCapitalDeces | null;
  capitalDecesSupplementaire: (RegleCitee & { pourcentageSalaire: number | null; conditions: string | null }) | null;
  rentePartenaire: ReglePourcentage | null;
  renteInvalidite: ReglePourcentage | null;
  renteOrphelin: ReglePourcentage | null;
}

export interface AnnexeRegles {
  /** NOM DU PLAN visé (« Plan ex-PAT BVG »), pas le numéro d'annexe. */
  nom: string;
  /** Numéro de l'annexe, pour la traçabilité (« Annexe n° 8 »). */
  numero?: string | null;
  sappliqueA: string;
  /** Ne contient QUE ce que l'annexe surcharge ; le reste retombe sur le général. */
  surcharges: Partial<BlocRegles>;
}

export interface Reglement {
  cle: string;
  caisse: string;
  enVigueurAu: string | null;
  langue: string | null;
  plansDetectes: string[];
  general: BlocRegles;
  annexes: AnnexeRegles[];
}

/* =========================================================
 * 1. Identité d'une caisse
 * =======================================================*/

/**
 * Forme comparable d'un nom de caisse : sans accents, sans ponctuation, sans les
 * mots de forme juridique qui varient d'un document à l'autre.
 *
 * « Aevum Fondation de Prévoyance » sur le règlement et « AEVUM FONDATION DE
 * PREVOYANCE » sur le certificat doivent se reconnaître, sinon la vérification
 * ne se déclenche jamais et la fonctionnalité paraît cassée.
 */
export function normaliserCaisse(nom: string): string {
  return (nom || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(sa|ag|llc|sarl|gmbh|fondation|stiftung|de|du|des|la|le|les|d|von|of|pour|en|faveur)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deux noms désignent-ils la même caisse ? */
export function memeCaisse(a?: string | null, b?: string | null): boolean {
  const na = normaliserCaisse(a || "");
  const nb = normaliserCaisse(b || "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Un certificat abrège souvent (« Aevum » pour « Aevum Fondation de Prévoyance »).
  // On n'accepte l'inclusion qu'au-delà de 4 caractères : « pk » ou « cp » seuls
  // rapprocheraient n'importe quelles caisses.
  const [court, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return court.length >= 4 && long.startsWith(court + " ");
}

/**
 * Clé de la bibliothèque partagée : `caisse-millesime`. Un règlement est le même
 * texte pour tous les employés d'une caisse — le mutualiser évite de refaire
 * analyser 53 pages à chaque client. Le millésime est dans la clé car les règles
 * changent chaque année : mélanger deux millésimes fausserait les analyses.
 */
export function cleReglement(caisse: string, enVigueurAu?: string | null): string {
  const base = normaliserCaisse(caisse).replace(/\s+/g, "-");
  const annee = (enVigueurAu || "").match(/\b(19|20)\d{2}\b/)?.[0];
  return annee ? `${base}-${annee}` : base;
}

/* =========================================================
 * 2. Quelles règles s'appliquent à CE plan
 * =======================================================*/

/**
 * Une annexe SURCHARGE la partie générale pour les assurés qu'elle vise, et
 * renvoie au règlement général pour le reste (« Pour tout ce qui n'est pas prévu
 * dans la présente annexe, il est renvoyé au règlement de prévoyance »).
 *
 * On fusionne donc champ par champ, l'annexe l'emportant là où elle dit quelque
 * chose. Sans nom de plan, ou si aucune annexe ne correspond, on rend le général :
 * c'est le cas le plus fréquent (le « Plan B » d'Aevum n'a pas d'annexe propre).
 */
export function blocApplicable(reglement: Reglement, nomPlan?: string | null): BlocRegles {
  const annexe = trouverAnnexe(reglement, nomPlan);
  if (!annexe) return reglement.general;

  const fusionne = { ...reglement.general };
  for (const cle of Object.keys(annexe.surcharges) as (keyof BlocRegles)[]) {
    const valeur = annexe.surcharges[cle];
    // Une annexe muette sur un point ne doit PAS effacer la règle générale.
    if (valeur != null) (fusionne as Record<string, unknown>)[cle] = valeur;
  }
  return fusionne;
}

/**
 * Annexe visant ce plan.
 *
 * On cherche aussi dans `sappliqueA` : l'IA nomme parfois l'annexe par son
 * NUMÉRO (« Annexe n° 8 ») au lieu du nom du plan. Un numéro ne figure pas sur
 * le certificat de l'assuré — s'en tenir au seul champ `nom` ferait échouer le
 * rattachement EN SILENCE, et l'assuré se verrait appliquer la règle générale à
 * la place de la sienne.
 */
export function trouverAnnexe(reglement: Reglement, nomPlan?: string | null): AnnexeRegles | null {
  const cible = normaliserCaisse(nomPlan || "");
  if (cible.length < 3) return null;         // « B » seul rapprocherait n'importe quoi
  for (const a of reglement.annexes || []) {
    for (const champ of [a.nom, a.sappliqueA]) {
      const t = normaliserCaisse(champ || "");
      if (t && (t.includes(cible) || cible.includes(t))) return a;
    }
  }
  return null;
}

/* =========================================================
 * 3. Router le montant du certificat vers la bonne case
 * =======================================================*/

/**
 * Champs du moteur où ranger le capital décès lu sur le certificat.
 *
 * Le moteur distingue DÉJÀ les deux situations (`…AucuneRente…` et
 * `…PlusRente…`) ; ce qui manquait, c'est de savoir laquelle vaut pour cette
 * caisse. Le scan du certificat seul ne peut pas le deviner : c'est le règlement
 * qui le dit.
 */
export type CaseCapitalDeces = "AUCUNE_RENTE" | "PLUS_RENTE" | "AUCUNE" | "A_VERIFIER";

export function caseCapitalDeces(mode: ModeCapitalDeces | null | undefined): CaseCapitalDeces {
  switch (mode) {
    case "TOUJOURS": return "PLUS_RENTE";
    case "SI_AUCUNE_RENTE_PARTENAIRE": return "AUCUNE_RENTE";
    case "NON_PREVU": return "AUCUNE";
    // Un capital « sous déduction du financement de la rente » dépend de tarifs
    // actuariels que le règlement ne donne pas. On ne devine pas un montant de
    // prévoyance : on le signale au conseiller.
    case "REDUIT_DU_FINANCEMENT_RENTE": return "A_VERIFIER";
    default: return "A_VERIFIER";
  }
}

/** Une règle non sourcée n'est pas appliquée : elle n'est pas vérifiable. */
export function estSourcee(r?: RegleCitee | null): boolean {
  return !!r && !!(r.citation && r.citation.trim()) && !!(r.article && r.article.trim());
}

export interface ResultatApplication {
  /** Champs `data.*` à écrire sur le plan. */
  patch: Record<string, number | null>;
  /** Ce qui a été fait, en clair — repris dans l'écran client et la piste d'audit. */
  notes: string[];
  /** Faux si le conseiller doit trancher à la main. */
  automatique: boolean;
}

/**
 * Range le capital décès du certificat dans la case dictée par le règlement.
 *
 * On ne CHANGE PAS le montant : le certificat reste la source du chiffre. On
 * corrige seulement la case, c'est-à-dire la condition à laquelle il est dû.
 * D'où l'écriture des deux champs — celui qu'on retient ET celui qu'on vide —
 * car un montant laissé dans l'ancienne case continuerait d'être compté.
 */
export function appliquerCapitalDeces(
  montantCertificat: number | null | undefined,
  bloc: BlocRegles,
): ResultatApplication {
  const regle = bloc.capitalDeces;
  const notes: string[] = [];

  if (!estSourcee(regle)) {
    return { patch: {}, notes: ["Le règlement ne cite aucune règle de capital décès : plan inchangé."], automatique: false };
  }

  const cible = caseCapitalDeces(regle!.verse);
  const montant = typeof montantCertificat === "number" && isFinite(montantCertificat) ? montantCertificat : null;

  if (cible === "A_VERIFIER") {
    notes.push(`Capital décès à confirmer par un conseiller (${regle!.article}) : ${regle!.citation}`);
    return { patch: {}, notes, automatique: false };
  }

  if (cible === "AUCUNE") {
    notes.push(`Aucun capital décès prévu par le règlement (${regle!.article}).`);
    return { patch: patchCapital(0, 0), notes, automatique: true };
  }

  if (montant == null) {
    notes.push("Aucun capital décès lu sur le certificat : rien à reclasser.");
    return { patch: {}, notes, automatique: true };
  }

  if (cible === "AUCUNE_RENTE") {
    notes.push(`Capital décès versé uniquement si aucune rente de partenaire n'est due (${regle!.article}).`);
    return { patch: patchCapital(montant, 0), notes, automatique: true };
  }

  notes.push(`Capital décès versé en plus de la rente de partenaire (${regle!.article}).`);
  return { patch: patchCapital(0, montant), notes, automatique: true };
}

/**
 * Écrit les DEUX cases (maladie et accident) et neutralise les champs
 * génériques.
 *
 * Le moteur lit `…Mal ?? …générique ?? …` : un montant laissé dans le champ
 * générique continuerait donc d'alimenter le calcul ACCIDENT même après un
 * reclassement propre côté maladie. Vider explicitement est la seule façon de
 * garantir qu'un capital n'est plus compté deux fois.
 */
function patchCapital(aucuneRente: number, plusRente: number): Record<string, number | null> {
  return {
    Enter_CapitalAucuneRenteMal: aucuneRente,
    Enter_CapitalAucuneRenteAcc: aucuneRente,
    Enter_CapitalPlusRenteMal: plusRente,
    Enter_CapitalPlusRenteAcc: plusRente,
    Enter_CapitalAucuneRente: null,
    Enter_CapitalPlusRente: null,
  };
}

/* =========================================================
 * 4. Statut affiché au client
 * =======================================================*/

/**
 * ⚠️ À NE PAS CONFONDRE avec le « Contrôle Expert » (vérification payante par un
 * conseiller, champ `reviewStatus`). Celui-ci ne dit qu'une chose : les montants
 * du plan ont été confrontés au règlement de la caisse.
 */
export type StatutReglement = "VERIFIE" | "NON_VERIFIE";

export const STATUT_REGLEMENT_DEFAUT: StatutReglement = "NON_VERIFIE";

/* =========================================================
 * 5. Retrouver le montant lu sur le certificat
 * =======================================================*/

/**
 * Montant du capital décès tel que le scan du certificat l'a enregistré, quelle
 * que soit la case où il l'avait rangé.
 *
 * Le scan du certificat doit bien choisir une case, sans connaître le règlement :
 * il devine. C'est ce montant-là qu'on vient reclasser — d'où la lecture des
 * quatre champs possibles.
 *
 * ⚠️ `Enter_CapitalDecesIndependant*` est volontairement EXCLU : c'est un
 * troisième capital, versé en tout état de cause et indépendamment de la rente
 * (certificats AXA). Le reclasser reviendrait à le confondre avec le capital
 * conditionnel, et fausserait une parité conseiller/client déjà auditée.
 */
export function montantCertificatCapitalDeces(data: Record<string, unknown>): number | null {
  const champs = [
    "Enter_CapitalPlusRenteMal", "Enter_CapitalAucuneRenteMal",
    "Enter_CapitalPlusRente", "Enter_CapitalAucuneRente",
  ];
  for (const c of champs) {
    const v = data?.[c];
    const n = typeof v === "string" ? Number(v.replace(/['\s]/g, "")) : v;
    // `> 0` : un 0 explicite en première case n'empêche pas de trouver le vrai
    // montant rangé ailleurs par le scan.
    if (typeof n === "number" && isFinite(n) && n > 0) return n;
  }
  return null;
}
