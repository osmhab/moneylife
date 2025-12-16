/* =========================================================
 * MoneyLife — Calculs AVS (Décès, survivants)
 * Fichier : /lib/calculs/avsDeces.ts
 * ---------------------------------------------------------
 * Ajouts / Mises à jour :
 *  - Orphelin AVS simple (40%) via Legal_Child40 de l’échelle 44
 *  - computeDecesProjection retourne :
 *      • renteSurvivantMensuelle (veuve/veuf)
 *      • orphelinMensuelParEnfant
 *      • orphelinMensuelTotal (nbEnfants × par enfant)
 *  - nbEnfantsOrphelins est désormais déduit automatiquement depuis Enter_enfants
 *  - Suppression du paramètre inutilisé nbAnneesMariagePourBTE
 * =======================================================*/

import type {
  ClientData,
  Legal_Settings,
  Legal_Echelle44Row,
} from "@/lib/core/types";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

import {
  computeNbAnneesCotisationsCompletes,
  computeNbAnneesCotisationsEffectives,
  computeRevenuMoyen,
  getLegalRenteMinAvsMensuelle,
  calcBTE,
  calcBTA,
  selectEchellePlancher,
} from "@/lib/calculs/avsAi";

/* ---------- Helpers dates ---------- */
function yearFromMask(m?: string): number | undefined {
  if (!m || !isValidDateMask(m)) return undefined;
  const [, , yyyy] = normalizeDateMask(m).split(".");
  return Number(yyyy);
}

/* ---------- BTE auto-datées via enfants (<16 ans) ---------- */
function computeBteYearSetFromChildren(
  client: ClientData,
  startYear: number,
  endYear: number
): Set<number> {
  const years = new Set<number>();
  for (const e of (client.Enter_enfants ?? [])) {
    const y = yearFromMask(e.Enter_dateNaissance);
    if (!y) continue;
    const last = y + 16 - 1; // dernière année <16
    const a = Math.max(startYear, y);
    const b = Math.min(endYear, last);
    for (let k = a; k <= b; k++) years.add(k);
  }
  return years;
}

/* =========================================================
 * Crédits BTE/BTA par année (max par année), partage marié
 * =======================================================*/
function computeBonifsCreditsPerYearForDeces(
  client: ClientData,
  legal: Legal_Settings,
  params: { nbAnneesBTE?: number; nbAnneesBTA?: number },
  deathYear: number
) {
  const birthY = yearFromMask(client.Enter_dateNaissance);
  const startY = birthY
    ? birthY + (client.Enter_ageDebutCotisationsAVS ?? legal.Legal_AgeLegalCotisationsAVS)
    : undefined;

  const BTE_AN = legal.Legal_BTE_AnnualCredit ?? 0;
  const BTA_AN = legal.Legal_BTA_AnnualCredit ?? 0;

  // Idéalement : importer ENUM_EtatCivil. Fallback constants :
  const ETAT_MARIE = 1;       // ENUM_EtatCivil.Marie
  const ETAT_PARTENARIAT = 3; // ENUM_EtatCivil.Partenariat
  const isMarried =
    client.Enter_etatCivil === ETAT_MARIE || client.Enter_etatCivil === ETAT_PARTENARIAT;

  const splitMarried =
    typeof legal.Legal_BTE_SplitMarried === "number" ? legal.Legal_BTE_SplitMarried : 0.5;
  const btePct = isMarried ? splitMarried : 1.0;

  if (!startY || startY > deathYear) {
    // Fallback conservateur si datation impossible : on applique des totaux simples.
    const bte = Math.max(0, params.nbAnneesBTE ?? 0) * (BTE_AN * btePct);
    const bta = Math.max(0, params.nbAnneesBTA ?? 0) * BTA_AN;
    return {
      perYearCreditTotal: Math.max(bte, bta),
      bteYearsEffective: params.nbAnneesBTE ?? 0,
      btaYearsUsed: params.nbAnneesBTA ?? 0,
    };
  }

  const years: number[] = [];
  for (let y = startY; y <= deathYear; y++) years.push(y);

  // BTE : si nbAnneesBTE fourni → pose dès le début; sinon → datation auto via enfants
  let bteYearSet: Set<number>;
  if (typeof params.nbAnneesBTE === "number") {
    bteYearSet = new Set<number>();
    const nb = Math.min(params.nbAnneesBTE, years.length);
    for (let i = 0; i < nb; i++) bteYearSet.add(years[i]);
  } else {
    bteYearSet = computeBteYearSetFromChildren(client, startY, deathYear);
  }

  const credits: number[] = years.map((y) => (bteYearSet.has(y) ? BTE_AN * btePct : 0));
  const bteYearsEffective = Array.from(bteYearSet).length;

  // BTA : nombre d’années non datées → on les place où BTE est le plus faible
  let btaLeft = Math.max(0, params.nbAnneesBTA ?? 0);
  if (btaLeft > 0 && BTA_AN > 0) {
    const idxOrder = years.map((_, i) => i).sort((a, b) => credits[a] - credits[b]);
    for (const i of idxOrder) {
      if (btaLeft <= 0) break;
      const best = Math.max(credits[i], BTA_AN);
      if (best > credits[i]) {
        credits[i] = best;
        btaLeft--;
      }
    }
  }

  const perYearCreditTotal = credits.reduce((s, v) => s + v, 0);
  const btaYearsUsed = (params.nbAnneesBTA ?? 0) - btaLeft;

  return { perYearCreditTotal, bteYearsEffective, btaYearsUsed };
}

/* =========================================================
 * Supplément de carrière (table simple de pourcentages)
 * =======================================================*/
export function getSuppCarrierePct(ageAuDeces: number): number {
  if (ageAuDeces < 23) return 100;
  if (ageAuDeces < 24) return 90;
  if (ageAuDeces < 25) return 80;
  if (ageAuDeces < 26) return 70;
  if (ageAuDeces < 27) return 60;
  if (ageAuDeces < 28) return 50;
  if (ageAuDeces < 30) return 40;
  if (ageAuDeces < 32) return 30;
  if (ageAuDeces < 35) return 20;
  if (ageAuDeces < 39) return 10;
  if (ageAuDeces < 45) return 5;
  return 0;
}

export function calcSuppCarriere(ageAuDeces: number, revenuMoyen: number): number {
  const pct = getSuppCarrierePct(ageAuDeces);
  return Math.max(0, (revenuMoyen * pct) / 100);
}

/* =========================================================
 * RAMD Décès
 * =======================================================*/
export function calcRamdDeces(
  client: ClientData,
  legal: Legal_Settings,
  opts: {
    ageAuDeces: number;
    totalBTE: number;
    totalBTA: number;
  }
): number {
  const nbCompletes = computeNbAnneesCotisationsCompletes(legal);
  if (nbCompletes <= 0) return 0;

  const revenuMoyen = computeRevenuMoyen(client, legal);
  const supp = opts.ageAuDeces < 45 ? calcSuppCarriere(opts.ageAuDeces, revenuMoyen) : 0;
  const bonif = Math.max(opts.totalBTE || 0, opts.totalBTA || 0);

  return (revenuMoyen + supp + bonif) / nbCompletes;
}

/* =========================================================
 * Rentes mensuelles via échelle 44 (plancher)
 * =======================================================*/
export function findRenteSurvivantMensuelle(
  ramdDeces: number,
  echelle44: Legal_Echelle44Row[]
): number {
  const line = selectEchellePlancher(ramdDeces, echelle44);
  return line?.Legal_WidowWidowerSurvivor ?? 0;
}

/** Orphelin simple (40%) — montant mensuel par enfant */
export function findRenteOrphelinMensuelleParEnfant(
  ramdDeces: number,
  echelle44: Legal_Echelle44Row[]
): number {
  const line = selectEchellePlancher(ramdDeces, echelle44);
  if (!line) return 0;
  if (typeof line.Legal_Child40 === "number") return line.Legal_Child40;
  const base = line.Legal_OldAgeInvalidity ?? 0;
  return Math.round(base * 0.4);
}

/* =========================================================
 * Orphelins éligibles (calculés depuis Enter_enfants)
 * - Règle actuelle : enfant < 18 ans au moment du décès.
 *   (Si extension "en formation" plus tard : ajuster à <25)
 * =======================================================*/
function computeNbOrphelinsEligiblesAVS(client: ClientData, deathYear: number): number {
  const kids = client.Enter_enfants ?? [];
  let count = 0;
  for (const k of kids) {
    const y = yearFromMask(k.Enter_dateNaissance);
    if (!y) continue;
    const ageAtDeath = deathYear - y;
    if (ageAtDeath < 18) count++;
  }
  return count;
}

/* =========================================================
 * Helper "tout-en-un" pour l'écran Décès
 * =======================================================*/
export function computeDecesProjection(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  params: {
    ageAuDeces: number;
    /** BTE override (sinon calcul auto via Enter_enfants) */
    nbAnneesBTE?: number;
    /** BTA override numérique (le formulaire ne capte pas BTA) */
    nbAnneesBTA?: number;
  }
) {
  const nbCompletes = computeNbAnneesCotisationsCompletes(legal);
  const nbEffectives = computeNbAnneesCotisationsEffectives(client, legal);
  const revenuMoyen = computeRevenuMoyen(client, legal);

  // Année du décès
  const baseYear = yearFromMask(client.Enter_dateNaissance) ?? new Date().getFullYear();
  const deathYear = baseYear + params.ageAuDeces;

  // Crédits légaux (BTE/BTA) modernes, max par année jusqu'à l'année du décès
  const { perYearCreditTotal } = computeBonifsCreditsPerYearForDeces(
    client,
    legal,
    {
      nbAnneesBTE: params.nbAnneesBTE,
      nbAnneesBTA: params.nbAnneesBTA,
    },
    deathYear
  );

  // RAMD Décès
  const ramdDeces = (() => {
    const nbC = computeNbAnneesCotisationsCompletes(legal);
    if (nbC <= 0) return 0;
    const rev = computeRevenuMoyen(client, legal);
    const supp = params.ageAuDeces < 45 ? calcSuppCarriere(params.ageAuDeces, rev) : 0;
    return (rev + supp + perYearCreditTotal) / nbC;
  })();

  // Rente conjoint/partenaire survivant (mensuel)
  const renteSurvivantMensuelle = findRenteSurvivantMensuelle(ramdDeces, echelle44);

  // Orphelins AVS (simples)
  const nbEnfants = computeNbOrphelinsEligiblesAVS(client, deathYear);
  const orphelinMensuelParEnfant = findRenteOrphelinMensuelleParEnfant(ramdDeces, echelle44);
  const orphelinMensuelTotal = orphelinMensuelParEnfant * nbEnfants;

  return {
    nbCompletes,
    nbEffectives,
    revenuMoyen,
    ramdDeces,

    // Sorties pour l’UI
    renteSurvivantMensuelle,   // veuve/veuf (mensuel)
    orphelinMensuelParEnfant,  // orphelin simple par enfant (mensuel)
    orphelinMensuelTotal,      // total orphelins (mensuel)
  };
}