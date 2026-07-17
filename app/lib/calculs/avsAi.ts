/* =========================================================
 * MoneyLife — Calculs AVS/AI (BTE, BTA, RAMD, Rentes)
 * Fichier : /lib/calculs/avsAi.ts
 * ---------------------------------------------------------
 * Convention :
 *  - Données saisies client : Enter_*
 *  - Données légales/admin : Legal_*
 *  - Table échelle 44 : Legal_Echelle44Row[]
 *  - Rente AI/Retraite affichée = ligne "plancher" (income <= RAMD)
 * =======================================================*/

import type {
  ClientData,
  Legal_Settings,
  Legal_Echelle44Row,
  Enter_EtatCivil,
} from "@/lib/core/types";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

/* =========================================================
 * Utilitaires internes
 * =======================================================*/

/** yyyy depuis "dd.MM.yyyy" */
function yearFromMask(m?: string): number | undefined {
  if (!m || !isValidDateMask(m)) return undefined;
  const [, , yyyy] = normalizeDateMask(m).split(".");
  return Number(yyyy);
}

/** Années BTE : années où au moins un enfant a <16 ans, entre startY..endY */
function computeBteYearSetFromChildren(client: ClientData, startY: number, endY: number): Set<number> {
  const years = new Set<number>();
  for (const e of (client.Enter_enfants ?? [])) {
    const y = yearFromMask(e.Enter_dateNaissance);
    if (!y) continue;
    const last = y + 16 - 1; // dernière année <16
    const a = Math.max(startY, y);
    const b = Math.min(endY, last);
    for (let k = a; k <= b; k++) years.add(k);
  }
  return years;
}

/**
 * Calcule les crédits bonifications (BTE/BTA) au meilleur par année (max par année).
 * - BTE auto: via enfants (<16 ans) si nbAnneesBTE non fourni
 * - Split marié/partenariat: Legal_BTE_SplitMarried (ex 0.5)
 * - BTA: nb années (pas datées) placées sur les années les moins couvertes (greedy)
 */
function computeBonifsCreditsPerYear(
  client: ClientData,
  legal: Legal_Settings,
  params?: { nbAnneesBTE?: number; nbAnneesMariagePourBTE?: number; nbAnneesBTA?: number; },
  refYear?: number, // année de référence (sinistre / actuelle)
): {
  perYearCreditTotal: number;
  bteYearsEffective: number;
  btaYearsUsed: number;
} {
  const birthY = yearFromMask(client.Enter_dateNaissance);
  const startY = birthY ? birthY + (client.Enter_ageDebutCotisationsAVS ?? legal.Legal_AgeLegalCotisationsAVS) : undefined;
  const endY = refYear ?? new Date().getFullYear();

  const BTE_AN = legal.Legal_BTE_AnnualCredit ?? 0;
  const BTA_AN = legal.Legal_BTA_AnnualCredit ?? 0;
  const splitMarried = typeof legal.Legal_BTE_SplitMarried === "number" ? legal.Legal_BTE_SplitMarried : 0.5;
  const isMarried = client.Enter_etatCivil === 1 || client.Enter_etatCivil === 3;
  const btePct = isMarried ? splitMarried : 1.0;

  // si période inconnue → pas de bonif reconstruite
  if (!startY || startY > endY) {
    const nbBte = Math.max(0, params?.nbAnneesBTE ?? 0);
    const nbBta = Math.max(0, params?.nbAnneesBTA ?? 0);
    // conservateur: prend max si on ne sait pas si chevauchement
    return {
      perYearCreditTotal: Math.max(nbBte * (BTE_AN * btePct), nbBta * BTA_AN),
      bteYearsEffective: nbBte,
      btaYearsUsed: nbBta,
    };
  }

  // Années de la carrière
  const years: number[] = [];
  for (let y = startY; y <= endY; y++) years.push(y);

  // BTE: auto par enfants si nbAnneesBTE non fourni
  let bteYearSet: Set<number>;
  if (typeof params?.nbAnneesBTE === "number") {
    // si fourni: appliquons sur les premières années pour approx (pas d'info datée)
    bteYearSet = new Set<number>();
    const nb = Math.min(params.nbAnneesBTE, years.length);
    for (let i = 0; i < nb; i++) bteYearSet.add(years[i]);
  } else {
    bteYearSet = computeBteYearSetFromChildren(client, startY, endY);
  }

  // crédits initiaux: BTE (partagé si marié)
  const credits: number[] = years.map(y => (bteYearSet.has(y) ? BTE_AN * btePct : 0));
  const bteYearsEffective = Array.from(bteYearSet).length;

  // BTA: nombre d'années données; on les place là où BTE est le plus faible (greedy)
  let btaLeft = Math.max(0, params?.nbAnneesBTA ?? 0);
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
  const btaYearsUsed = (params?.nbAnneesBTA ?? 0) - btaLeft;
  return { perYearCreditTotal, bteYearsEffective, btaYearsUsed };
}

/** Nombre d'années de cotisations complètes (légal) */
export function computeNbAnneesCotisationsCompletes(legal: Legal_Settings): number {
  return legal.Legal_AgeRetraiteAVS - legal.Legal_AgeLegalCotisationsAVS;
}

/** Nombre d'années de cotisations effectives (saisie user - années manquantes) */
export function computeNbAnneesCotisationsEffectives(
  client: ClientData,
  legal: Legal_Settings
): number {
  const ageDebut = Math.max(client.Enter_ageDebutCotisationsAVS ?? legal.Legal_AgeLegalCotisationsAVS, 0);
  const nbEffectivesBrut = legal.Legal_AgeRetraiteAVS - ageDebut;
  const manquantes = client.Enter_anneesManquantesAVS?.length ?? 0;
  return Math.max(0, nbEffectivesBrut - manquantes);
}

/** Revenu moyen au sens RAMD (définition simplifiée de ton glossaire) */
export function computeRevenuMoyen(
  client: ClientData,
  legal: Legal_Settings
): number {
  const nbEffectives = computeNbAnneesCotisationsEffectives(client, legal);
  return (client.Enter_salaireAnnuel ?? 0) * nbEffectives;
}

/** Récupère la rente AVS minimale mensuelle depuis l'échelle 44 (plus petite OldAgeInvalidity) */
export function getLegalRenteMinAvsMensuelle(echelle44: Legal_Echelle44Row[]): number {
  if (!echelle44?.length) return 0;
  return echelle44.reduce(
    (min, row) => Math.min(min, row.Legal_OldAgeInvalidity),
    Number.POSITIVE_INFINITY
  );
}

/** Récupère la rente AVS maximale mensuelle depuis l'échelle 44 (plus grande OldAgeInvalidity).
 *  Sert de base au plafond des rentes de couple (150 % du max individuel). */
export function getLegalRenteMaxAvsMensuelle(echelle44: Legal_Echelle44Row[]): number {
  if (!echelle44?.length) return 0;
  return echelle44.reduce(
    (max, row) => Math.max(max, row.Legal_OldAgeInvalidity),
    0
  );
}

/* =========================================================
 * Plafonnement des rentes de couple (marié / partenariat enregistré)
 * ---------------------------------------------------------
 * Règle AVS : quand les DEUX conjoints touchent une rente vieillesse, la
 * somme de leurs deux rentes individuelles est plafonnée à 150 % de la rente
 * maximale individuelle. Si la somme dépasse, chaque rente est réduite
 * PROPORTIONNELLEMENT à sa part. Le 150 % n'est PAS codé en dur : il dérive du
 * haut de l'échelle 44 (source unique LEGAL_2025).
 * =======================================================*/

/** Ratio légal du plafond couple (150 % de la rente max individuelle). */
export const AVS_COUPLE_CAP_RATIO = 1.5;

export type AvsCoupleResult = {
  /** Rente mensuelle du conjoint A APRÈS plafonnement. */
  renteAMensuelle: number;
  /** Rente mensuelle du conjoint B APRÈS plafonnement. */
  renteBMensuelle: number;
  /** Somme mensuelle des deux rentes après plafonnement. */
  renteCoupleMensuelle: number;
  /** Plafond mensuel appliqué (150 % du max individuel), ou null si N/A. */
  plafondMensuel: number | null;
  /** true si le plafond a effectivement réduit les rentes. */
  plafonnee: boolean;
  /** Facteur de réduction appliqué (1 = pas de réduction). */
  facteurReduction: number;
};

/**
 * Applique le plafonnement couple à deux rentes individuelles MENSUELLES.
 *
 * @param renteAMensuelle rente individuelle projetée du conjoint A (mensuelle)
 * @param renteBMensuelle rente individuelle projetée du conjoint B (mensuelle)
 * @param echelle44 table légale (fournit le max individuel via le haut de la colonne)
 * @param opts.applyCap si false, ne plafonne pas (ex. un seul conjoint à la retraite).
 *                      Défaut true (les deux à la retraite, mariés/partenariat).
 *
 * Garde anti-`NaN` : les rentes non finies sont ramenées à 0.
 */
export function computeAvsCouple(
  renteAMensuelle: number,
  renteBMensuelle: number,
  echelle44: Legal_Echelle44Row[],
  opts?: { applyCap?: boolean }
): AvsCoupleResult {
  // Gardes : jamais de NaN/négatif qui fausserait la proportion.
  const a = Number.isFinite(renteAMensuelle) ? Math.max(0, renteAMensuelle) : 0;
  const b = Number.isFinite(renteBMensuelle) ? Math.max(0, renteBMensuelle) : 0;
  const somme = a + b;

  const maxIndividuel = getLegalRenteMaxAvsMensuelle(echelle44);
  const plafondMensuel = maxIndividuel > 0 ? maxIndividuel * AVS_COUPLE_CAP_RATIO : null;

  const applyCap = opts?.applyCap ?? true;

  // Pas de plafonnement : un seul retraité, plafond indisponible, ou somme sous le plafond.
  if (!applyCap || plafondMensuel === null || somme <= plafondMensuel || somme === 0) {
    return {
      renteAMensuelle: a,
      renteBMensuelle: b,
      renteCoupleMensuelle: somme,
      plafondMensuel,
      plafonnee: false,
      facteurReduction: 1,
    };
  }

  // Réduction proportionnelle à la part de chacun.
  const facteur = plafondMensuel / somme;
  return {
    renteAMensuelle: a * facteur,
    renteBMensuelle: b * facteur,
    renteCoupleMensuelle: plafondMensuel,
    plafondMensuel,
    plafonnee: true,
    facteurReduction: facteur,
  };
}

/** États civils qui déclenchent le plafonnement couple : marié (1) / partenariat (3). */
export function isCoupleEtatCivil(etatCivil: Enter_EtatCivil | undefined): boolean {
  return etatCivil === 1 || etatCivil === 3;
}

/** D'où vient la rente individuelle du conjoint retenue. */
export type RenteConjointSource = "projetee" | "aucune";

/**
 * Résout la rente AVS mensuelle individuelle du conjoint : TOUJOURS projetée
 * depuis le salaire annuel du conjoint via l'échelle 44 (hypothèse carrière
 * complète, même échelle que la personne principale). On ne demande jamais de
 * rente estimée à l'utilisateur.
 */
export function resolveRenteConjointMensuelle(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[]
): { renteMensuelle: number; source: RenteConjointSource } {
  const revenu = client.Enter_spouseSalaireAnnuel;
  if (typeof revenu === "number" && Number.isFinite(revenu) && revenu > 0) {
    // Conjoint modélisé comme un client minimal (revenu + naissance + sexe) :
    // carrière complète par défaut (âge début cotisations légal → nbEffectives = 44).
    const spouseClient: ClientData = {
      ...client,
      Enter_salaireAnnuel: revenu,
      // Fallback sur la personne principale : la rente vieillesse projetée ici ne
      // dépend ni de la date ni du sexe (elle vient du RAMD/échelle 44), mais le type l'exige.
      Enter_dateNaissance: client.Enter_spouseDateNaissance ?? client.Enter_dateNaissance,
      Enter_sexe: client.Enter_spouseSexe ?? client.Enter_sexe,
      // Carrière pleine côté conjoint : pas de lacunes ni d'âge de début tardif.
      Enter_ageDebutCotisationsAVS: legal.Legal_AgeLegalCotisationsAVS,
      Enter_hasAnnesManquantesAVS: false,
      Enter_anneesManquantesAVS: [],
    };
    const { renteRetraiteMensuelle } = computeRetraiteProjection(spouseClient, legal, echelle44);
    return { renteMensuelle: renteRetraiteMensuelle, source: "projetee" };
  }

  return { renteMensuelle: 0, source: "aucune" };
}

export type AvsCoupleForClientResult = AvsCoupleResult & {
  /** Rente individuelle de la personne principale AVANT plafonnement. */
  renteIndividuelleMensuelle: number;
  /** Rente individuelle du conjoint AVANT plafonnement (retenue). */
  renteConjointMensuelle: number;
  /** Origine de la rente conjoint : saisie, projetée, ou absente. */
  sourceConjoint: RenteConjointSource;
  /** true si l'état civil est marié/partenariat (plafond pertinent). */
  estCouple: boolean;
};

/**
 * Calcul complet du plafonnement couple à partir d'un `ClientData` :
 * projette la rente de la personne, résout celle du conjoint (fournie sinon
 * projetée), et applique le plafond 150 % UNIQUEMENT si marié/partenariat.
 * Source unique branchée sur une rente conjoint saisie manuellement OU projetée.
 */
export function computeAvsCoupleForClient(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[]
): AvsCoupleForClientResult {
  const { renteRetraiteMensuelle } = computeRetraiteProjection(client, legal, echelle44);
  const { renteMensuelle: renteConjoint, source } = resolveRenteConjointMensuelle(
    client,
    legal,
    echelle44
  );

  const estCouple = isCoupleEtatCivil(client.Enter_etatCivil);
  // Plafond appliqué seulement pour un couple avec deux rentes réelles.
  const applyCap = estCouple && renteConjoint > 0;

  const capped = computeAvsCouple(renteRetraiteMensuelle, renteConjoint, echelle44, { applyCap });

  return {
    ...capped,
    renteIndividuelleMensuelle: renteRetraiteMensuelle,
    renteConjointMensuelle: renteConjoint,
    sourceConjoint: source,
    estCouple,
  };
}

/** Sélecteur "plancher" : dernière ligne dont income <= ramd (ou undefined si aucune) */
export function selectEchellePlancher(
  ramd: number,
  echelle44: Legal_Echelle44Row[]
): Legal_Echelle44Row | undefined {
  if (!echelle44?.length) return undefined;
  // On garde uniquement les lignes dont le plancher est <= RAMD, puis on prend la plus élevée
  const candidates = echelle44.filter((r) => r.Legal_Income <= ramd);
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => b.Legal_Income - a.Legal_Income);
  return candidates[0];
}

/* =========================================================
 * Bonifications (BTE / BTA)
 * =======================================================*/

/**
 * BTE (Bonification pour Tâches Éducatives)
 * - base = rente AVS minimale mensuelle * 12 * 3 * nbAnnées
 * - si marié(e), la bonification est divisée par 2 pendant les années de mariage
 *   (tu peux passer anneesMariage=0 si inconnu → approximation)
 */
export function calcBTE(
  nbAnneesBTE: number,
  renteMinMensuelle: number,
  anneesMariage: number = 0
): number {
  const anneesNonMarie = Math.max(0, nbAnneesBTE - anneesMariage);
  const baseAnnuelle = renteMinMensuelle * 12 * 3;

  const partNonMarie = baseAnnuelle * anneesNonMarie;
  const partMarie = baseAnnuelle * (anneesMariage * 0.5); // division par deux pendant mariage

  return Math.max(0, partNonMarie + partMarie);
}

/**
 * BTA (Bonification pour Tâches d’Assistance)
 * - base = rente AVS minimale mensuelle * 12 * 3 * nbAnnées
 */
export function calcBTA(
  nbAnneesBTA: number,
  renteMinMensuelle: number
): number {
  const baseAnnuelle = renteMinMensuelle * 12 * 3;
  return Math.max(0, baseAnnuelle * nbAnneesBTA);
}

/* =========================================================
 * RAMD (AI, Retraite)
 * =======================================================*/

/**
 * RAMD AI
 * RAMD = (revenuMoyen + max(BTE, BTA)) / nbAnnéesComplt
 */
export function calcRamdAi(
  client: ClientData,
  legal: Legal_Settings,
  opts: {
    totalBTE: number; // somme BTE toutes années pertinentes jusqu’au sinistre
    totalBTA: number; // somme BTA idem
  },
): number {
  const nbCompletes = computeNbAnneesCotisationsCompletes(legal);
  if (nbCompletes <= 0) return 0;

  const revenuMoyen = computeRevenuMoyen(client, legal);
  const bonif = Math.max(opts.totalBTE || 0, opts.totalBTA || 0);
  return (revenuMoyen + bonif) / nbCompletes;
}

/**
 * RAMD Retraite
 * (Même principe que AI selon ta définition)
 */
export function calcRamdRetraite(
  client: ClientData,
  legal: Legal_Settings,
  opts: {
    totalBTE: number;
    totalBTA: number;
  }
): number {
  // Même formule que RAMD AI dans ton glossaire
  return calcRamdAi(client, legal, opts);
}

/* =========================================================
 * Rentes à partir de l’échelle 44 (plancher)
 * =======================================================*/

/** Rente AI mensuelle (oldAgeInvalidity) à partir du RAMD (plancher) */
export function findRenteAiMensuelle(
  ramdAi: number,
  echelle44: Legal_Echelle44Row[]
): number {
  const line = selectEchellePlancher(ramdAi, echelle44);
  return line?.Legal_OldAgeInvalidity ?? 0;
}

/** Rente Retraite AVS mensuelle (même colonne oldAgeInvalidity pour la retraite) */
export function findRenteRetraiteMensuelle(
  ramdRetraite: number,
  echelle44: Legal_Echelle44Row[]
): number {
  const line = selectEchellePlancher(ramdRetraite, echelle44);
  return line?.Legal_OldAgeInvalidity ?? 0;
}

/* =========================================================
 * Helpers “haut niveau” (faciles à brancher côté page)
 * =======================================================*/

/**
 * Calcule un set minimal pour une projection AI :
 * - nb années complètes/effectives
 * - revenu moyen
 * - rente min AVS (pour BTE/BTA)
 * - RAMD AI
 * - rente AI mensuelle
 */
export function computeAiProjection(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  params?: {
    nbAnneesBTE?: number;
    nbAnneesMariagePourBTE?: number;
    nbAnneesBTA?: number;
  }
) {
  const nbCompletes = computeNbAnneesCotisationsCompletes(legal);
  const nbEffectives = computeNbAnneesCotisationsEffectives(client, legal);
  const revenuMoyen = computeRevenuMoyen(client, legal);

  // Bonifs modernes (crédits légaux, auto BTE via enfants, max par année)
  const refYear = new Date().getFullYear();
  const { perYearCreditTotal, bteYearsEffective, btaYearsUsed } =
    computeBonifsCreditsPerYear(client, legal, params, refYear);

  // RAMD AI enrichi (revenu proxy + crédits) / années complètes
  const ramdAi = nbCompletes > 0 ? (revenuMoyen + perYearCreditTotal) / nbCompletes : 0;
  const renteAiMensuelle = findRenteAiMensuelle(ramdAi, echelle44);

  // on garde renteMinMensuelle pour compat (même si plus nécessaire aux crédits modernes)
  const renteMinMensuelle = getLegalRenteMinAvsMensuelle(echelle44);

  return {
    nbCompletes,
    nbEffectives,
    revenuMoyen,
    renteMinMensuelle, // info
    // méta bonifs modernes
    ramdAi,
    renteAiMensuelle,
    bonifs: {
      perYearCreditTotal,
      bteYearsEffective,
      btaYearsUsed,
      legalBteAnnual: legal.Legal_BTE_AnnualCredit ?? 0,
      legalBtaAnnual: legal.Legal_BTA_AnnualCredit ?? 0,
      splitMarried: legal.Legal_BTE_SplitMarried ?? 0.5,
    },
  };
}

/**
 * Calcule un set minimal pour une projection Retraite :
 * - RAMD Retraite
 * - Rente AVS mensuelle estimée
 */
export function computeRetraiteProjection(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Legal_Echelle44Row[],
  params?: {
    nbAnneesBTE?: number;
    nbAnneesMariagePourBTE?: number;
    nbAnneesBTA?: number;
  }
) {
  // Bonifs modernes (mêmes règles que AI)
  const refYear = new Date().getFullYear();
  const { perYearCreditTotal } =
    computeBonifsCreditsPerYear(client, legal, params, refYear);

  const nbCompletes = computeNbAnneesCotisationsCompletes(legal);
  const revenuMoyen = computeRevenuMoyen(client, legal);
  const ramdRetraite = nbCompletes > 0 ? (revenuMoyen + perYearCreditTotal) / nbCompletes : 0;

  const renteRetraiteMensuelle = findRenteRetraiteMensuelle(ramdRetraite, echelle44);
  return {
    ramdRetraite,
    renteRetraiteMensuelle,
  };
}
