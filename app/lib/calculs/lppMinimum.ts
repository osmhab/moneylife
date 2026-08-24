// app/lib/calculs/lppMinimum.ts
//
// Estimation du 2e pilier au MINIMUM LÉGAL LPP, quand le client n'a pas (encore)
// fourni son certificat. À partir de : salaire annuel + date de naissance +
// année de début d'activité, on reconstitue un « certificat LPP fictif » au
// strict minimum légal, qui se branche ensuite sur le moteur d'analyse existant.
//
// ⚠️ ESTIMATION — pas le certificat réel du client. À étiqueter comme tel.
//
// ⚠️ CONSTANTES RÉGLEMENTAIRES (à revalider chaque année, cf. LPP_MIN_2025) :
//   - taux d'intérêt minimal LPP (Mindestzinssatz) : varie chaque année ;
//   - taux de conversion minimal à 65 ans : 6.8 % (minimum légal) ;
//   - bonifications de vieillesse par tranche d'âge : 7/10/15/18 % (LPP art. 16).
//
// Hypothèses de l'estimation (à assumer/afficher) :
//   - salaire supposé CONSTANT sur toute la carrière (on n'a pas l'historique) ;
//   - bonifications d'épargne à partir de 25 ans (risque dès 18) ;
//   - salaire coordonné = salaire − déduction de coordination, borné [min, max] ;
//   - rente d'invalidité = taux de conversion × avoir de vieillesse projeté SANS
//     intérêts futurs (LPP art. 24) ; conjoint 60 % / orphelin 20 % de celle-ci.

import { LEGAL_2025 } from "@/lib/core/legal";

/** Paramètres réglementaires spécifiques à l'estimation « minimum légal ». */
export const LPP_MIN_2025 = {
  /** Bonifications de vieillesse (% du salaire coordonné) par tranche d'âge. */
  bonifications: [
    { min: 25, max: 34, taux: 0.07 },
    { min: 35, max: 44, taux: 0.10 },
    { min: 45, max: 54, taux: 0.15 },
    { min: 55, max: 65, taux: 0.18 },
  ],
  /** Taux d'intérêt minimal LPP (Mindestzinssatz) — 2025. */
  tauxInteretMin: 0.0125,
  /** Taux de conversion minimal légal à 65 ans. */
  tauxConversion: 0.068,
  /** Âge de départ des bonifications d'épargne (risque dès 18). */
  ageDebutEpargne: 25,
  /** Âge de référence retraite. */
  ageRetraite: 65,
  /** Part de la rente d'invalidité versée au conjoint / par orphelin. */
  ratioConjoint: 0.6,
  ratioOrphelin: 0.2,
};

export type MinimalLPPInput = {
  salaireAnnuel: number;
  /** Date de naissance : "JJ.MM.AAAA", "AAAA-MM-JJ" ou année (number). */
  dateNaissance: string | number;
  /** Début d'activité par ANNÉE (ex. 2010). Prioritaire sur l'âge si fourni. */
  anneeDebutActivite?: number;
  /** OU par ÂGE au début d'activité (ex. 22) — converti via la date de naissance. */
  ageDebutActivite?: number;
};

export type MinimalLPPResult = {
  /** true si le salaire dépasse le seuil d'entrée (LPP obligatoire). */
  assujetti: boolean;
  salaireCoordonne: number;
  avoirActuel: number;
  capitalProjete65: number;
  renteVieillesse65: number;
  renteInvalidite: number;
  renteConjoint: number;
  renteOrphelin: number;
};

function parseAnneeNaissance(d: string | number): number {
  if (typeof d === "number") return d;
  const s = String(d).trim();
  // "JJ.MM.AAAA"
  const dot = s.split(".");
  if (dot.length === 3 && dot[2].length === 4) return Number(dot[2]);
  // "AAAA-MM-JJ"
  const dash = s.split("-");
  if (dash.length === 3 && dash[0].length === 4) return Number(dash[0]);
  // 4 chiffres isolés
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : NaN;
}

function bonification(age: number): number {
  const b = LPP_MIN_2025.bonifications.find((x) => age >= x.min && age <= x.max);
  return b ? b.taux : 0;
}

/**
 * Reconstitue les prestations LPP au minimum légal. Renvoie des montants ANNUELS.
 * `currentYear` injectable pour les tests (par défaut : année en cours).
 */
export function computeMinimalLPP(
  input: MinimalLPPInput,
  legal = LEGAL_2025,
  currentYear = new Date().getFullYear()
): MinimalLPPResult {
  const salaire = Number(input.salaireAnnuel) || 0;
  const birthYear = parseAnneeNaissance(input.dateNaissance);

  // Salaire coordonné = salaire − déduction, borné [min, max]. Sous le seuil
  // d'entrée → pas de LPP obligatoire.
  const empty: MinimalLPPResult = {
    assujetti: false,
    salaireCoordonne: 0,
    avoirActuel: 0,
    capitalProjete65: 0,
    renteVieillesse65: 0,
    renteInvalidite: 0,
    renteConjoint: 0,
    renteOrphelin: 0,
  };
  if (!salaire || Number.isNaN(birthYear)) return empty;
  if (salaire < (legal.Legal_SeuilEntreeLPP ?? 0)) return empty;

  const sc = Math.min(
    Math.max(salaire - (legal.Legal_DeductionCoordinationMinLPP ?? 0), legal.Legal_SalaireAssureMinLPP ?? 0),
    legal.Legal_SalaireAssureMaxLPP ?? Number.MAX_SAFE_INTEGER
  );

  const { tauxInteretMin: i, tauxConversion, ageDebutEpargne, ageRetraite } = LPP_MIN_2025;

  // Début d'activité : soit par année directe, soit dérivé de l'âge de début
  // (année de naissance + âge). L'année est prioritaire si les deux sont fournis.
  const yearAt25 = birthYear + ageDebutEpargne;
  let debutActivite = Number(input.anneeDebutActivite) || 0;
  if (!debutActivite && input.ageDebutActivite) {
    debutActivite = birthYear + Number(input.ageDebutActivite);
  }
  if (!debutActivite) debutActivite = yearAt25;
  // ⚠️ Les bonifications d'ÉPARGNE ne courent qu'à partir de 25 ans (risque dès 18).
  // Donc un début à 18/19/…/25 donne le même point de départ minimum : 25 ans.
  const startYear = Math.max(debutActivite, yearAt25);

  // 1) Avoir accumulé JUSQU'À aujourd'hui (avec intérêt minimal).
  let avoirActuel = 0;
  for (let y = startYear; y < currentYear; y++) {
    const age = y - birthYear;
    avoirActuel = avoirActuel * (1 + i) + sc * bonification(age);
  }

  // 2) Projection jusqu'à 65 ans : avec intérêt (capital) ET sans intérêt (pour
  //    la rente d'invalidité, LPP art. 24).
  let capital65 = avoirActuel;
  let avoirProjeteSansInteret = avoirActuel;
  const yearAt65 = birthYear + ageRetraite;
  for (let y = currentYear; y < yearAt65; y++) {
    const age = y - birthYear;
    const credit = sc * bonification(age);
    capital65 = capital65 * (1 + i) + credit;
    avoirProjeteSansInteret += credit;
  }

  // Arrondis cohérents : conjoint/orphelin dérivés de la rente d'invalidité DÉJÀ arrondie.
  const renteInvaliditeR = Math.round(avoirProjeteSansInteret * tauxConversion);

  return {
    assujetti: true,
    salaireCoordonne: Math.round(sc),
    avoirActuel: Math.round(avoirActuel),
    capitalProjete65: Math.round(capital65),
    renteVieillesse65: Math.round(capital65 * tauxConversion),
    renteInvalidite: renteInvaliditeR,
    renteConjoint: Math.round(renteInvaliditeR * LPP_MIN_2025.ratioConjoint),
    renteOrphelin: Math.round(renteInvaliditeR * LPP_MIN_2025.ratioOrphelin),
  };
}

/**
 * Fabrique un PLAN LPP_BASE synthétique (minimum légal), à AJOUTER au tableau
 * `plans` fourni au moteur. ⚠️ Les matrices lisent la LPP depuis les PLANS
 * (`sumFromPlans`), pas depuis les champs `Enter_*` du client — d'où un plan et
 * non des champs client. Les libellés de champs correspondent à ceux lus par
 * `sumFromPlans` pour retraite / invalidité / décès.
 */
export function buildMinimalLPPPlan(res: MinimalLPPResult): Record<string, any> | null {
  if (!res.assujetti) return null;
  return {
    id: "lpp-minimum-legal",
    type: "LPP_BASE",
    status: "ACTIVE",
    label: "LPP (estimation minimum légal)",
    _estimation: "LPP_MINIMUM_LEGAL",
    data: {
      // Retraite
      Enter_rentevieillesseLPP65: res.renteVieillesse65,
      capitalRetraiteGlobal: res.capitalProjete65,
      Enter_lppCapitalProjete65: res.capitalProjete65,
      // Invalidité (maladie) — l'accident est couvert par la LAA
      Enter_renteInvaliditeMaladie: res.renteInvalidite,
      Enter_renteEnfantInvalideMaladie: res.renteOrphelin,
      // Décès (rentes de survivants)
      Enter_renteConjointLPP: res.renteConjoint,
      Enter_renteOrphelinLPP: res.renteOrphelin,
    },
  };
}
