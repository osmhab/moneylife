// app/lib/calculs/3epilier.ts

/**
 * Interface pour les données brutes issues du formulaire 3a Banque
 */
export interface Data3aBanque {
  soldeActuel: number;
  isRegulier: boolean;
  montantRegulier?: number;
  occurrence?: "mois" | "annee";
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
   * Projection du capital retraite telle qu'AFFICHÉE PAR L'ASSUREUR
   * (relevée sur l'offre avant signature). Saisie manuelle et optionnelle.
   * Si > 0, elle PRIME sur la projection calculée automatiquement.
   */
  projectionAssureur?: number;
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

  const isAnnuel = occurrence === "annee";
  const P = isRegulier ? (isAnnuel ? montantRegulier : montantRegulier * 12) : 0;
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
  const n = Math.max(0, 65 - clientAge);
  if (n === 0) return Math.round(valeurRachatActuelle);

  const isAnnuel = occurrence === "annee";
  const P = isLibere ? 0 : (isAnnuel ? primeEpargne : primeEpargne * 12);
  const capExistant = valeurRachatActuelle * Math.pow(1 + r, n);
  const epargneFuture = r <= 0 ? P * n : P * ((Math.pow(1 + r, n) - 1) / r);

  return Math.round(capExistant + epargneFuture);
}

export function computeDeathBenefitAssurance(data: Data3aAssurance): number {
  const epargneAujourdhui = data.valeurRachatActuelle || 0;
  if (data.isLibere) return Math.round(epargneAujourdhui);

  if (data.capitalDecesFixe && data.capitalDecesFixe > 0) {
    return Math.max(epargneAujourdhui, data.capitalDecesFixe);
  }

  if (data.dateDebut && data.primeTotale > 0) {
    const start = new Date(data.dateDebut);
    const now = new Date();
    const diffYears = now.getFullYear() - start.getFullYear();
    const diffMonths = now.getMonth() - start.getMonth();
    const nbMois = (diffYears * 12) + diffMonths + 1;

    if (nbMois > 0) {
      const isAnnuel = data.occurrence === "annee";
      const pMensuelle = isAnnuel ? data.primeTotale / 12 : data.primeTotale;
      const capitalFormule = (pMensuelle * nbMois) * 1.10;
      return Math.max(epargneAujourdhui, Math.round(capitalFormule));
    }
  }

  return Math.round(epargneAujourdhui);
}

/* -------------------------------------------------------------------------- */
/* HELPERS COMMUNS                                                            */
/* -------------------------------------------------------------------------- */

export function computeTotalVersements3a(data: Data3aBanque | Data3aAssurance, clientAge: number): number {
  const n = Math.max(0, 65 - clientAge);
  const isAnnuel = data.occurrence === "annee";
  
  if ("primeTotale" in data) {
    const soldeBase = (data as Data3aAssurance).valeurRachatActuelle || 0;
    const P = (data as Data3aAssurance).isLibere ? 0 : (isAnnuel ? (data as Data3aAssurance).primeTotale : (data as Data3aAssurance).primeTotale * 12);
    return Math.round(soldeBase + (P * n));
  } 
  const P = data.isRegulier ? (isAnnuel ? (data.montantRegulier || 0) : (data.montantRegulier || 0) * 12) : 0;
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
  const isAnnuel = dataCurrent.occurrence === "annee";
  const primeActuelleAnnuelle = isAnnuel ? dataCurrent.primeTotale : dataCurrent.primeTotale * 12;
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