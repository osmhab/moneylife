// app/lib/core/periodicite.ts
//
// Périodicité d'une prime ou d'un versement d'épargne — SOURCE UNIQUE.
//
// POURQUOI UN HELPER PLUTÔT QU'UN TERNAIRE SUR PLACE
// --------------------------------------------------
// Le moteur portait partout la forme `occurrence === "annee" ? x : x * 12`, qui
// traite implicitement TOUT ce qui n'est pas annuel comme mensuel. Tant qu'il
// n'existait que deux valeurs c'était exact ; à l'ajout du trimestriel, chacun
// de ces ternaires serait devenu un facteur 3 silencieux sur la prime — donc
// sur la projection retraite, la restitution des primes, le coût annuel comparé
// aux offres et le plafond 3a. La conversion vit ici, une seule fois : ajouter
// une périodicité (semestriel…) ne demandera plus qu'une ligne dans la table.
//
// ⚠️ Copie miroir dans `lib/shared/core/periodicite.ts` (Cloud Function).

export type Occurrence = "mois" | "trimestre" | "annee";

/**
 * Nombre de versements par an.
 * Le défaut est MENSUEL : c'est la valeur historique des fiches créées avant
 * l'introduction du champ, et celle qu'écrivent tous les formulaires.
 */
const VERSEMENTS_PAR_AN: Record<Occurrence, number> = {
  mois: 12,
  trimestre: 4,
  annee: 1,
};

export const OCCURRENCES: Occurrence[] = ["mois", "trimestre", "annee"];

export function versementsParAn(occurrence?: string | null): number {
  return VERSEMENTS_PAR_AN[occurrence as Occurrence] ?? VERSEMENTS_PAR_AN.mois;
}

/** Montant annualisé, quelle que soit la périodicité saisie. */
export function montantAnnuel(montant: unknown, occurrence?: string | null): number {
  // `|| 0` volontaire : garde anti-NaN sur un Number(...) issu d'une saisie.
  return (Number(montant) || 0) * versementsParAn(occurrence);
}

/** Montant ramené au mois (pour les formules qui comptent en mois écoulés). */
export function montantMensuel(montant: unknown, occurrence?: string | null): number {
  return montantAnnuel(montant, occurrence) / 12;
}
