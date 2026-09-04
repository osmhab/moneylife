// app/lib/core/retraite.ts
//
// LA RETRAITE, CONFRONTÉE AU RÈGLEMENT.
//
// C'est la prestation que 100 % des assurés toucheront — et celle où le
// règlement pèse le plus lourd, à travers un seul chiffre : le TAUX DE
// CONVERSION, qui transforme l'avoir de vieillesse en rente annuelle. Il varie
// d'une caisse à l'autre, et par âge au sein d'une même caisse.
//
// DEUX USAGES, ET UNE LIGNE À NE PAS FRANCHIR
// -------------------------------------------
// · COMPLÉTER. Un certificat qui annonce un capital projeté sans la rente
//   correspondante laisse le client sans réponse à la seule question qu'il se
//   pose. Le règlement permet de la calculer, taux à l'appui.
//
// · SIGNALER. Quand le certificat donne les deux, on compare — sans jamais rien
//   réécrire. Le certificat AXA du compte de test le montre : 350'945 de capital
//   et 21'618 de rente, soit 6,16 % implicites, là où le règlement annonce
//   5,6 %. Ce n'est pas une erreur, c'est le MINIMUM LÉGAL LPP qui relève la
//   rente. Corriger « l'écart » aurait retiré au client une garantie que la loi
//   lui donne.
//
// D'où la règle : on ajoute ce qui manque, on ne remplace jamais ce qui est
// écrit sur le document de la caisse.

import type { BlocRegles } from "./reglement";
import { estSourcee } from "./reglement";

/** Écart relatif au-delà duquel un taux implicite mérite d'être signalé. */
const TOLERANCE = 0.02;

/**
 * Taux de conversion applicable à un âge, en fraction (0.064 pour 6,4 %).
 *
 * À défaut d'entrée pour l'âge demandé, on ne devine pas : renvoyer le taux
 * d'un âge voisin donnerait une rente fausse de plusieurs centaines de francs
 * par mois, sans que rien ne le signale.
 */
export interface ContexteRetraite {
  /** Année où l'assuré atteindra l'âge choisi. */
  anneeDepart?: number | null;
}

export function tauxConversionA(
  bloc: BlocRegles | null | undefined,
  age: number,
  ctx: ContexteRetraite = {},
): number | null {
  const table = bloc?.retraite?.tauxConversion;
  if (!Array.isArray(table)) return null;

  const pourCetAge = table.filter((e) => Number(e?.age) === age && estTauxPlausible(e?.taux));
  if (pourCetAge.length === 0) return null;

  // RÉGIME. Un barème « enveloppant », ou l'absence de distinction, couvre tout
  // l'avoir. Si la caisse sépare obligatoire et surobligatoire, le taux dépend
  // de la répartition de l'avoir : on ne tranche pas, on rend null pour que le
  // plan parte au conseiller.
  const enveloppants = pourCetAge.filter((e) => !e.regime || e.regime === "enveloppant");
  const candidats = enveloppants.length > 0 ? enveloppants : [];
  if (candidats.length === 0) return null;

  // ANNÉE DE DÉPART. Les barèmes sont donnés par millésime, souvent avec une
  // dernière ligne « à partir de ». On retient donc le millésime le plus récent
  // qui ne dépasse pas l'année de départ ; sans année connue, on ne devine pas.
  const dates = candidats.filter((e) => e.anneeDepart != null);
  if (dates.length === 0) return tauxUnique(candidats);

  const cible = ctx.anneeDepart;
  if (!Number.isFinite(cible)) return null;

  const applicables = dates.filter((e) => Number(e.anneeDepart) <= Number(cible));
  const millesime = applicables.length > 0
    ? Math.max(...applicables.map((e) => Number(e.anneeDepart)))
    // Départ AVANT le premier millésime publié : on prend le plus ancien, qui
    // est celui en vigueur aujourd'hui.
    : Math.min(...dates.map((e) => Number(e.anneeDepart)));

  return tauxUnique(dates.filter((e) => Number(e.anneeDepart) === millesime));
}

/**
 * Un taux, et un seul — sinon rien.
 *
 * Une même caisse publie parfois PLUSIEURS barèmes selon la variante de plan :
 * chez AXA, à 65 ans pour un départ en 2026, on trouve 6,200 % et 5,400 % selon
 * le niveau de rente de partenaire choisi. Rien dans le règlement ne dit lequel
 * concerne CET assuré.
 *
 * Prendre le premier venu donnerait une rente fausse de plus de mille francs par
 * an, avec l'apparence d'une certitude. On rend donc null, et le plan part au
 * conseiller.
 */
function tauxUnique(entrees: { taux: number }[]): number | null {
  const distincts = new Set(entrees.map((e) => Number(e.taux)));
  return distincts.size === 1 ? Number(entrees[0].taux) : null;
}

/**
 * Un taux de conversion suisse se situe entre 4 % et 8 %.
 *
 * Hors de cette plage, c'est une confusion d'unité (6,4 rendu au lieu de 0.064)
 * ou une lecture erronée. Multiplier un capital par 6,4 donnerait une rente
 * cent fois trop élevée — le genre d'erreur qu'un client ne pardonne pas.
 */
export function estTauxPlausible(taux: unknown): boolean {
  const n = Number(taux);
  return Number.isFinite(n) && n >= 0.04 && n <= 0.08;
}

/** Rente annuelle produite par un capital, arrondie au franc. */
export function renteAnnuelle(capital: number, taux: number): number {
  return Math.round(capital * taux);
}

/** Taux réellement appliqué par le certificat : rente ÷ capital. */
export function tauxImplicite(capital?: number | null, rente?: number | null): number | null {
  const c = Number(capital), r = Number(rente);
  if (!Number.isFinite(c) || !Number.isFinite(r) || c <= 0 || r <= 0) return null;
  return r / c;
}

export interface ControleRetraite {
  /** Champs à écrire — uniquement ce qui MANQUAIT. */
  patch: Record<string, number>;
  notes: string[];
  /** Faux si un point demande l'avis d'un conseiller. */
  automatique: boolean;
}

const AGES = [58, 59, 60, 61, 62, 63, 64, 65];

/** Champ de rente vieillesse pour un âge donné, tel que le moteur le nomme. */
function champRente(age: number): string {
  return `Enter_rentevieillesseLPP${age}`;
}

/** Capital projeté à un âge, tel que le certificat le fournit. */
function capitalA(data: Record<string, unknown>, age: number): number | null {
  const brut = age === 65 ? data.Enter_lppCapitalProjete65 : data[`Enter_prestationCapital${age}`];
  const n = typeof brut === "string" ? Number(brut.replace(/['\s]/g, "")) : Number(brut);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Année où l'assuré atteindra cet âge, déduite de sa date de naissance.
 *
 * Sans elle, impossible de choisir dans un barème par millésime — et retenir le
 * taux de l'année courante pour quelqu'un qui partira dans dix ans lui
 * promettrait une rente qu'il ne touchera pas.
 */
function anneeDepart(data: Record<string, unknown>, age: number): number | null {
  const brut = String(data.Enter_dateNaissance ?? "").trim();
  const annee = Number(brut.match(/\b((?:19|20)\d{2})\b/)?.[1]);
  return Number.isFinite(annee) ? annee + age : null;
}

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/['\s]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Complète les rentes de vieillesse absentes, et signale les écarts.
 *
 * On n'écrit QUE là où le certificat est muet : une rente déjà imprimée est le
 * chiffre de la caisse, il fait foi. Un écart avec le taux réglementaire est
 * noté pour le conseiller, jamais corrigé — il s'explique le plus souvent par
 * le minimum légal LPP, qui relève légitimement la rente.
 */
export function completerRetraite(
  data: Record<string, unknown>,
  bloc: BlocRegles | null | undefined,
): ControleRetraite {
  const regle = bloc?.retraite;
  if (!estSourcee(regle) || !Array.isArray(regle?.tauxConversion) || regle.tauxConversion.length === 0) {
    return { patch: {}, notes: [], automatique: true };
  }

  const patch: Record<string, number> = {};
  const notes: string[] = [];
  let automatique = true;
  const article = regle!.article ?? "";

  for (const age of AGES) {
    const capital = capitalA(data, age);
    if (capital == null) continue;

    const taux = tauxConversionA(bloc, age, { anneeDepart: anneeDepart(data, age) });
    if (taux == null) continue;

    const renteExistante = nombre(data[champRente(age)]);

    if (renteExistante == null || renteExistante <= 0) {
      // Le certificat donne le capital mais pas la rente : c'est précisément
      // ce que le règlement permet de combler.
      patch[champRente(age)] = renteAnnuelle(capital, taux);
      notes.push(
        `Rente de vieillesse à ${age} ans calculée au taux de conversion de ${(taux * 100).toFixed(2)} % (${article}).`,
      );
      continue;
    }

    const implicite = tauxImplicite(capital, renteExistante);
    if (implicite == null) continue;

    const ecart = Math.abs(implicite - taux) / taux;
    if (ecart > TOLERANCE) {
      // On NE corrige PAS : la rente imprimée est celle de la caisse, et un
      // écart vers le haut vient d'ordinaire du minimum légal LPP.
      automatique = false;
      notes.push(
        `À ${age} ans, la rente du certificat correspond à ${(implicite * 100).toFixed(2)} % ` +
        `alors que le règlement annonce ${(taux * 100).toFixed(2)} % (${article}). ` +
        `Souvent le minimum légal LPP — à confirmer par un conseiller.`,
      );
    }
  }

  return { patch, notes, automatique };
}

/**
 * Taux d'intérêt de projection retenu par la caisse.
 *
 * À défaut, le moteur applique 1,25 % — le minimum LPP — codé en dur dans les
 * matrices. Le lire dans le règlement remplace une hypothèse par un fait, et
 * change la projection de tous les assurés de la caisse.
 */
export function tauxProjection(bloc: BlocRegles | null | undefined): number | null {
  const t = Number(bloc?.retraite?.tauxInteretProjection);
  // Entre 0 et 4 % : au-delà, c'est une confusion d'unité.
  return Number.isFinite(t) && t >= 0 && t <= 0.04 ? t : null;
}
