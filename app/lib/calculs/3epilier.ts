// app/lib/calculs/3epilier.ts

import { parseFlexibleDate } from "@/lib/core/dates";
import { montantAnnuel, montantMensuel, type Occurrence } from "@/lib/core/periodicite";

/**
 * Interface pour les données brutes issues du formulaire 3a Banque
 */
export interface Data3aBanque {
  soldeActuel: number;
  isRegulier: boolean;
  montantRegulier?: number;
  occurrence?: Occurrence;
  isInvesti: boolean;
  profil?: "defensif" | "equilibre" | "growth" | "dynamique";
  startDate?: string;
  isEnGage?: boolean;
}

/**
 * Interface pour les données issues du formulaire 3a/3b Assurance
 */
export interface Data3aAssurance extends Data3aBanque {
  typeContrat: "3a" | "3b";
  dateDebut?: string;
  primeTotale: number;
  primeEpargne: number;
  valeurRachatActuelle: number;
  hasLDP: boolean;
  renteInvalidite: number;
  capitalDecesFixe: number;
  hasMandatGestion: boolean;
  isLibere?: boolean;
  /**
   * Nature de la prestation décès du contrat — choix EXPLICITE du conseiller :
   *   - `"fixe"`   : un capital garanti, porté par `capitalDecesFixe`
   *                  (0 admis = le contrat n'assure aucun capital décès) ;
   *   - `"primes"` : restitution des primes versées, calculée.
   *
   * Absent sur les fiches antérieures : on retombe alors sur `capitalDecesFixe`.
   * Sans ce champ, le moteur devait DEVINER l'intention à partir de
   * `capitalDecesFixe > 0` — c'est ce qui faisait afficher une restitution à
   * cinq chiffres sur des contrats explicitement sans capital décès.
   */
  typeCapitalDeces?: "fixe" | "primes";
  /**
   * Projection du capital retraite telle qu'AFFICHÉE PAR L'ASSUREUR
   * (relevée sur l'offre avant signature). Saisie manuelle et optionnelle.
   * Si > 0, elle PRIME sur la projection calculée automatiquement.
   */
  projectionAssureur?: number;
  /**
   * Date d'ÉCHÉANCE de la police ("jj.mm.aaaa" ou "aaaa-mm-jj").
   * Toute police 3a/3b en a une ; elle figure sur le contrat.
   * Détermine l'horizon de projection — cf. `yearsToMaturity`.
   */
  dateEcheance?: string;
}

/**
 * Nombre d'ANNÉES restantes à capitaliser.
 *
 * Historiquement le moteur postulait `65 - âge` pour TOUTE police : une police
 * échéant à 60 ou 62 ans — cas courant — se voyait donc créditer des années de
 * primes qui n'existeront jamais, et le capital projeté était surévalué.
 *
 * On utilise désormais la date d'échéance RÉELLE dès qu'elle est connue.
 * En son absence, on retombe sur l'ancienne hypothèse : les milliers de plans
 * déjà en base n'ont pas ce champ, leur résultat ne doit pas bouger.
 *
 * Note : avec une échéance, l'horizon est FRACTIONNAIRE (2.4 ans) là où le repli
 * reste entier. C'est volontaire — une échéance dans 5 mois ne doit pas être
 * arrondie à zéro ni à un an.
 */
export function yearsToMaturity(
  dateEcheance: string | null | undefined,
  clientAge: number,
  at: Date = new Date()
): number {
  const end = parseFlexibleDate(dateEcheance);
  if (end) {
    const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
    return Math.max(0, (end.getTime() - at.getTime()) / MS_PER_YEAR);
  }
  return Math.max(0, 65 - clientAge);
}

/**
 * Helper pour obtenir le taux selon le profil
 */
function getRate(isInvesti: boolean, profil: string = "equilibre"): number {
  if (!isInvesti) return 0.005;
  switch (profil) {
    case "defensif":  return 0.02;  
    case "equilibre": return 0.035; 
    case "growth":    return 0.05;  
    case "dynamique": return 0.065; 
    default:          return 0.005;
  }
}

/* -------------------------------------------------------------------------- */
/* LOGIQUE BANCAIRE                                                           */
/* -------------------------------------------------------------------------- */

export function computeProjections3aBanque(data: Data3aBanque, clientAge: number): number {
  const { soldeActuel = 0, isRegulier, montantRegulier = 0, occurrence = "mois", isInvesti, profil } = data;
  const r = getRate(isInvesti, profil);
  const n = Math.max(0, 65 - clientAge);
  if (n === 0) return Math.round(soldeActuel);

  const P = isRegulier ? montantAnnuel(montantRegulier, occurrence) : 0;
  const capExistant = soldeActuel * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

/* -------------------------------------------------------------------------- */
/* ÉPARGNE LIBRE (cash : compte épargne, fonds, ETF, actions)                 */
/* -------------------------------------------------------------------------- */

/**
 * Taux marché actuel d'un COMPTE ÉPARGNE libre non investi.
 * Suisse ≈ 0 % en ce moment. Constante paramétrable (à ajuster si les taux montent).
 */
export const EPARGNE_LIBRE_SAVINGS_RATE = 0;

/**
 * Projection retraite de l'ÉPARGNE LIBRE (comptée comme cash). Même modèle que le
 * 3a bancaire (solde + versements réguliers), MAIS :
 *  - compte épargne non investi → croît au taux marché ~0 % (pas 0,5 %) ;
 *  - investi (fonds / ETF / actions) → intérêt composé selon le profil de risque
 *    (mêmes taux que le 3a investi).
 */
export function computeProjectionsEpargneLibre(
  data: Data3aBanque & { epargneKind?: string; epargneHorizon?: string; epargneHorizonAnnee?: number },
  clientAge: number
): number {
  // COURT TERME (argent utilisé dans l'année) → aucune projection retraite possible.
  // La somme reste des liquidités disponibles (décès / logement), mais pas un capital 65.
  if (data.epargneHorizon === "court") return 0;

  const { soldeActuel = 0, isRegulier, montantRegulier = 0, occurrence = "mois", isInvesti, profil, epargneKind } = data;
  // Le SUPPORT fait foi quand il est renseigné (compte = non investi ; fonds/ETF/actions
  // = investi), sinon on retombe sur le flag isInvesti. → cohérent même si l'utilisateur
  // change le support a posteriori sans mettre à jour isInvesti.
  const invested = epargneKind !== undefined ? epargneKind !== "compte" : !!isInvesti;
  const r = invested ? getRate(true, profil) : EPARGNE_LIBRE_SAVINGS_RATE;
  // Horizon de capitalisation (années) : « Autre » = jusqu'à l'année d'échéance choisie ;
  // sinon (retraite / ancien « long ») = jusqu'à 65 ans.
  const n =
    data.epargneHorizon === "autre" && data.epargneHorizonAnnee
      ? Math.max(0, Math.round(data.epargneHorizonAnnee) - new Date().getFullYear())
      : Math.max(0, 65 - clientAge);
  if (n === 0) return Math.round(soldeActuel);

  const P = isRegulier ? montantAnnuel(montantRegulier, occurrence) : 0;
  const capExistant = soldeActuel * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

/* -------------------------------------------------------------------------- */
/* LOGIQUE ASSURANCE                                                          */
/* -------------------------------------------------------------------------- */

export function computeProjections3aAssurance(data: Data3aAssurance, clientAge: number): number {
  // Priorité : projection affichée par l'assureur (saisie manuelle depuis l'offre).
  // Si renseignée, elle fait foi et remplace le calcul automatique.
  if (data.projectionAssureur && data.projectionAssureur > 0) {
    return Math.round(data.projectionAssureur);
  }

  const { valeurRachatActuelle = 0, primeEpargne = 0, occurrence = "mois", isInvesti, profil, isLibere } = data;
  const r = getRate(isInvesti, profil);
  // Horizon = échéance réelle de la police si connue, sinon 65 ans (cf. yearsToMaturity).
  const n = yearsToMaturity(data.dateEcheance, clientAge);
  if (n === 0) return Math.round(valeurRachatActuelle);

  const P = isLibere ? 0 : montantAnnuel(primeEpargne, occurrence);
  const capExistant = valeurRachatActuelle * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

/** Une valeur a-t-elle été SAISIE ? `0` est une saisie ; `undefined`/`null`/`""` non. */
function estRenseigne(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}

/** Restitution des primes versées depuis le début du contrat, majorée de 10 %. */
function restitutionDesPrimes(data: Data3aAssurance, epargneAujourdhui: number): number | null {
  if (!data.dateDebut || !(data.primeTotale > 0)) return null;

  const start = new Date(data.dateDebut);
  const now = new Date();
  const diffYears = now.getFullYear() - start.getFullYear();
  const diffMonths = now.getMonth() - start.getMonth();
  const nbMois = (diffYears * 12) + diffMonths + 1;
  if (!(nbMois > 0)) return null;

  const pMensuelle = montantMensuel(data.primeTotale, data.occurrence);
  return Math.max(epargneAujourdhui, Math.round(pMensuelle * nbMois * 1.10));
}

/**
 * Capital versé aux bénéficiaires au décès du preneur.
 *
 * ORDRE DE PRIORITÉ
 * -----------------
 * 1. `typeCapitalDeces` — le choix EXPLICITE du conseiller. `"primes"` demande la
 *    restitution, `"fixe"` renvoie au montant garanti.
 * 2. `capitalDecesFixe` s'il est SAISI, **0 compris** : 0 signifie « ce contrat
 *    n'assure aucun capital décès », et non « on ne sait pas ».
 * 3. Restitution des primes, uniquement si RIEN n'a été renseigné (fiche ancienne
 *    ou pas encore complétée).
 *
 * POURQUOI CET ORDRE
 * ------------------
 * L'ancien test `capitalDecesFixe && > 0` ne distinguait pas un champ absent d'un
 * 0 saisi, et enchaînait sur la restitution : un contrat explicitement sans
 * capital décès affichait un montant à cinq chiffres, au conseiller comme au
 * client dans son app (`dashboard/prevoyance/page.tsx` somme cette valeur). Le
 * moteur DEVINAIT une intention que le générateur d'offre écrivait déjà noir sur
 * blanc dans `typeCapitalDeces` sans que personne ne la lise. C'est aussi la
 * règle `??` plutôt que `||` du manuel : un 0 légitime ne s'écrase pas.
 */
export function computeDeathBenefitAssurance(data: Data3aAssurance): number {
  const epargneAujourdhui = data.valeurRachatActuelle || 0;
  if (data.isLibere) return Math.round(epargneAujourdhui);

  // 1. Choix explicite du conseiller.
  if (data.typeCapitalDeces === "primes") {
    return restitutionDesPrimes(data, epargneAujourdhui) ?? Math.round(epargneAujourdhui);
  }
  if (data.typeCapitalDeces === "fixe") {
    return Math.round(Math.max(epargneAujourdhui, Number(data.capitalDecesFixe) || 0));
  }

  // 2. Pas de choix enregistré : le montant saisi fait foi, 0 compris.
  if (estRenseigne(data.capitalDecesFixe)) {
    // Au décès, les bénéficiaires touchent au moins l'épargne déjà accumulée.
    return Math.round(Math.max(epargneAujourdhui, Number(data.capitalDecesFixe)));
  }

  // 3. Rien de renseigné : ancien repli.
  {
    const r = restitutionDesPrimes(data, epargneAujourdhui);
    if (r !== null) return r;
  }

  return Math.round(epargneAujourdhui);
}

/**
 * Capital décès RETENU DANS LA COUVERTURE (celle qui pilote la lacune décès).
 *
 * La restitution des primes n'y entre que sur un choix EXPLICITE `"primes"`.
 * La compter aussi dans le repli — celui des fiches où rien n'est renseigné —
 * réintroduirait les montants fantômes : un contrat sans capital décès assuré
 * réduirait la lacune du client d'un montant que personne ne lui a garanti.
 */
export function capitalDecesCouvert(data: Data3aAssurance): number {
  if (data.typeCapitalDeces === "primes") return computeDeathBenefitAssurance(data);
  return Number(data.capitalDecesFixe) || Number((data as any).capitalDeces) || 0;
}

/* -------------------------------------------------------------------------- */
/* HELPERS COMMUNS                                                            */
/* -------------------------------------------------------------------------- */

export function computeTotalVersements3a(data: Data3aBanque | Data3aAssurance, clientAge: number): number {
  const n = Math.max(0, 65 - clientAge);
  if ("primeTotale" in data) {
    const soldeBase = (data as Data3aAssurance).valeurRachatActuelle || 0;
    const P = (data as Data3aAssurance).isLibere
      ? 0
      : montantAnnuel((data as Data3aAssurance).primeTotale, data.occurrence);
    return Math.round(soldeBase + (P * n));
  }
  const P = data.isRegulier ? montantAnnuel(data.montantRegulier, data.occurrence) : 0;
  return Math.round((data.soldeActuel || 0) + (P * n));
}

export function computeInteretsGagnes3a(data: any, clientAge: number): number {
  const isAssurance = "primeEpargne" in data;
  const totalProjete = isAssurance 
    ? computeProjections3aAssurance(data, clientAge) 
    : computeProjections3aBanque(data, clientAge);
    
  const totalVersements = computeTotalVersements3a(data, clientAge);
  return Math.max(0, totalProjete - totalVersements);
}

/* -------------------------------------------------------------------------- */
/* COMPATIBILITÉ BUILD (ANCIEN CONFIGURATEUR)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Patch pour débloquer le build Docker.
 * Le configurateur attend un objet précis.
 */
export function computeRiskAndSavings(data: any, context?: any) {
  return { 
    totalRiskPremium: 0, 
    netSavingsPremium: 0, 
    breakdown: { 
        risk: 0, 
        savings: 0, 
        fees: 0 
    } 
  };
}

export function getAgeAtDate(birthDate: string, targetDate: Date = new Date()) {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  let age = targetDate.getFullYear() - birth.getFullYear();
  const m = targetDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birth.getDate())) age--;
  return age;
}

export type RiskPricingContext = any;


/* -------------------------------------------------------------------------- */
/* MOTEUR D'ARBITRAGE 360° (ANCIEN CONTRAT VS NOUVELLE OFFRE CREDITX)         */
/* -------------------------------------------------------------------------- */

export interface CreditXOfferData {
  primeTotaleAnnuelle: number;
  capitalRetraiteProjete: number; // Le 'projectedRetirement' calculé par CreditX
  capitalDeces: number; // Le 'targets.deces'
  renteInvalidite: number; // Le 'targets.maladie'
  hasLiberation: boolean; // Le 'selPay'
  rendementAttendu: number; // Ex: 0.045 pour équilibré
}

export interface ComparatifOffreReelle {
  primes: {
    actuelle: number;
    proposee: number;
    economieAnnuelle: number;
  };
  retraite: {
    capitalActuelProjete: number;
    capitalProposeProjete: number; 
    gainNetRetraite: number;
    perteImmediateRachat: number;
  };
  risques: {
    decesActuel: number;
    decesPropose: number;
    invaliditeActuelle: number;
    invaliditeProposee: number;
    liberationActuelle: boolean;
    liberationProposee: boolean;
  };
  scoring: {
    isEpargneBetter: boolean;
    isRisqueBetter: boolean;
    isPriceBetter: boolean;
    verdictFinal: "TRANSFERT_RECOMMANDÉ" | "GARDEZ_VOTRE_CONTRAT" | "COMPARAISON_MITIGÉE";
  };
}

/**
 * Compare le contrat d'assurance actuel avec la nouvelle offre sur mesure.
 */
export function compareInsuranceWithOffer(
  dataCurrent: Data3aAssurance, 
  newOffer: CreditXOfferData, 
  clientAge: number
): ComparatifOffreReelle {
  
  const n = Math.max(0, 65 - clientAge);

  // --- 1. LES PRIMES (COÛT) ---
  const primeActuelleAnnuelle = montantAnnuel(dataCurrent.primeTotale, dataCurrent.occurrence);
  const economieAnnuelle = primeActuelleAnnuelle - newOffer.primeTotaleAnnuelle;

  // --- 2. L'ÉPARGNE (RETRAITE) ---
  const capitalActuelProjete = computeProjections3aAssurance(dataCurrent, clientAge);
  
  // Calcul de la perte immédiate estimée
  let perteImmediateRachat = 0;
  if (dataCurrent.dateDebut && dataCurrent.primeTotale > 0) {
    const start = new Date(dataCurrent.dateDebut);
    const diffYears = (new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const totalPaye = diffYears * primeActuelleAnnuelle;
    perteImmediateRachat = Math.max(0, Math.round(totalPaye - (dataCurrent.valeurRachatActuelle || 0)));
  }

  // Le capital CreditX (newOffer.capitalRetraiteProjete) inclut DÉJÀ le transfert du rachat et les primes futures
  const capitalProposeProjete = Math.round(newOffer.capitalRetraiteProjete);
  
  const gainNetRetraite = capitalProposeProjete - capitalActuelProjete;

  // --- 3. LES RISQUES ---
  const decesActuel = computeDeathBenefitAssurance(dataCurrent);
  const invaliditeActuelle = dataCurrent.renteInvalidite || 0;
  const liberationActuelle = dataCurrent.isLibere || dataCurrent.hasLDP || false;

  // --- 4. LE SCORING ---
  const isEpargneBetter = gainNetRetraite > 0;
  // On considère le risque meilleur si au moins une couverture majeure est supérieure sans que l'autre ne s'effondre
  const isRisqueBetter = (newOffer.capitalDeces >= decesActuel && newOffer.renteInvalidite >= invaliditeActuelle) && 
                         (newOffer.capitalDeces > decesActuel || newOffer.renteInvalidite > invaliditeActuelle || (newOffer.hasLiberation && !liberationActuelle));
  const isPriceBetter = economieAnnuelle >= 0;

  let verdictFinal: "TRANSFERT_RECOMMANDÉ" | "GARDEZ_VOTRE_CONTRAT" | "COMPARAISON_MITIGÉE" = "COMPARAISON_MITIGÉE";
  
  // Si l'épargne est meilleure ET que (le prix est meilleur OU le risque est meilleur)
  if (isEpargneBetter && (isPriceBetter || isRisqueBetter)) {
    verdictFinal = "TRANSFERT_RECOMMANDÉ";
  } else if (!isEpargneBetter && !isPriceBetter && !isRisqueBetter) {
    verdictFinal = "GARDEZ_VOTRE_CONTRAT";
  }

  return {
    primes: {
      actuelle: Math.round(primeActuelleAnnuelle),
      proposee: Math.round(newOffer.primeTotaleAnnuelle),
      economieAnnuelle: Math.round(economieAnnuelle)
    },
    retraite: {
      capitalActuelProjete,
      capitalProposeProjete,
      gainNetRetraite,
      perteImmediateRachat
    },
    risques: {
      decesActuel,
      decesPropose: newOffer.capitalDeces,
      invaliditeActuelle,
      invaliditeProposee: newOffer.renteInvalidite,
      liberationActuelle,
      liberationProposee: newOffer.hasLiberation
    },
    scoring: {
      isEpargneBetter,
      isRisqueBetter,
      isPriceBetter,
      verdictFinal
    }
  };
}