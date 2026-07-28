// app/lib/analysis/rentesDifferees.ts
//
// Échéancier de RENTES DIFFÉRÉES pour la reco Revenu Protect (invalidité 3a).
// La lacune invalidité évolue dans le temps : tant que des enfants ouvrent droit à des
// rentes (AI/LPP), elle est faible/nulle ; à mesure qu'ils sortent (18 ans, ou 25 en
// formation), la couverture baisse → la lacune grandit → un nouveau PALIER de rente.
// On produit donc une suite CROISSANTE de rentes différées (comme les assureurs — jamais
// décroissante), avec une DATE de début précise par palier.
//
// Règles (validées avec Habib) :
//  - Dimensionnement sur la lacune MALADIE (le produit couvre maladie + accident).
//  - Enfant à charge : < 18 ans, ou < 25 si « en formation » (case cochée, ≥18 uniquement).
//  - Délai d'attente 24 mois (aligné AI) — déjà reflété dans la matrice d'analyse.
//  - Cutoff 65 ans : (a) si aujourd'hui + 24 mois ≥ 65 ans → aucune rente possible ;
//    (b) tout palier qui démarrerait à ≥ 65 ans est écarté.

import type { SituationAnalysis } from "./situation";

export interface RenteDiffereePalier {
  /** Année de début du palier. */
  fromYear: number;
  /** Date de début (1er du mois), ISO "YYYY-MM-01". */
  fromISO: string;
  /** Nombre d'enfants encore à charge pendant ce palier. */
  nbEnfants: number;
  /** Rente mensuelle du palier = lacune invalidité de la période (arrondie au franc). */
  montantMensuel: number;
}

export interface RentesDiffereesResult {
  /** false si l'assuré est trop proche de 65 ans (1er versement au-delà de l'âge terme). */
  eligible: boolean;
  paliers: RenteDiffereePalier[];
  note?: string;
}

const WAITING_MONTHS = 24;
const AGE_TERME = 65;

function parseDMY(s: unknown): Date | null {
  const str = String(s ?? "");
  const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const y = str.match(/\b(19|20)\d{2}\b/);
  return y ? new Date(parseInt(y[0], 10), 0, 1) : null;
}
const addYears = (d: Date, y: number) => new Date(d.getFullYear() + y, d.getMonth(), d.getDate());
const addMonths = (d: Date, mo: number) => new Date(d.getFullYear(), d.getMonth() + mo, d.getDate());
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

export function computeRentesDifferees(
  situation: SituationAnalysis,
  enfants: any[],
  clientDateNaissance: unknown,
  today: Date = new Date()
): RentesDiffereesResult {
  const steps = situation.invaliditeMaladie.igSteps ?? [];
  const birth = parseDMY(clientDateNaissance);
  const age65 = birth ? addYears(birth, AGE_TERME) : null;

  // (a) Gate d'éligibilité : le 1er versement possible = aujourd'hui + délai d'attente.
  const firstPossiblePayment = addMonths(today, WAITING_MONTHS);
  if (age65 && firstPossiblePayment >= age65) {
    return { eligible: false, paliers: [], note: "Trop proche de 65 ans : le 1er versement (après 24 mois de délai) tomberait au-delà de l'âge terme." };
  }

  const list: any[] = Array.isArray(enfants) ? enfants : [];
  const isFormation = (e: any) => e?.Enter_enFormation === true || e?.Enter_enFormation === "true";
  const ageNow = (bd: Date) => today.getFullYear() - bd.getFullYear();

  // Dates de sortie FUTURES des enfants (18 ans, ou 25 si en formation), triées.
  const departures: Date[] = list
    .map((e) => {
      const bd = parseDMY(e?.Enter_dateNaissance);
      if (!bd) return null;
      const endAge = ageNow(bd) >= 18 && isFormation(e) ? 25 : 18;
      return addYears(bd, endAge);
    })
    .filter((d): d is Date => !!d && d > today)
    .sort((a, b) => a.getTime() - b.getTime());

  // Nombre d'enfants à charge AUJOURD'HUI (pour mapper nbEnfants d'un palier → sa date).
  const eligibleNow = list.filter((e) => {
    const bd = parseDMY(e?.Enter_dateNaissance);
    if (!bd) return false;
    const a = ageNow(bd);
    return a < 18 || (isFormation(e) && a < 25);
  }).length;

  const paliers: RenteDiffereePalier[] = [];
  for (const step of steps) {
    if (!(step.lacune > 0)) continue;
    // Combien d'enfants sont déjà partis quand il en reste `step.nbEnfants`.
    const departuresSoFar = eligibleNow - step.nbEnfants;
    const start =
      departuresSoFar <= 0
        ? today
        : departures[departuresSoFar - 1] ?? new Date(step.fromYear, 7, 1); // repli : 01.08 de l'année
    // (b) Cutoff 65 : pas de palier qui démarre à/après l'âge terme.
    if (age65 && start >= age65) continue;
    paliers.push({
      fromYear: start.getFullYear(),
      fromISO: iso(start),
      nbEnfants: step.nbEnfants,
      montantMensuel: Math.round(step.lacune),
    });
  }

  return { eligible: true, paliers };
}
