/* =========================================================
 * MoneyLife — Types métier (v3)
 * Cohérence:
 *  - Saisie utilisateur / OCR  → Enter_*
 *  - Paramètres légaux        → Legal_*
 *  - Échelle 44               → Legal_Echelle44Row[]
 * =======================================================*/

/** Indices i18n (valeurs stockées, textes traduits côté UI) */
export type Enter_EtatCivil = 0 | 1 | 2 | 3 | 4 | 5; // 0 Célibataire, 1 Marié-e, 2 Divorcé-e, 3 Partenariat, 4 Concubinage, 5 Veuf-ve
export type Enter_Sexe = 0 | 1;                       // 0 Masculin, 1 Féminin
export type Enter_StatutProfessionnel = 0 | 1 | 2;    // 0 Salarié, 1 Indépendant, 2 Sans activité lucrative

/** Enfant : on saisit uniquement la date de naissance */
export interface Enter_Enfant {
  /** "01.12.2015" (masque "dd.MM.yyyy") */
  Enter_dateNaissance: string;
}

/* =========================================================
 * Données saisies (formulaire / OCR)
 * =======================================================*/
export interface ClientData {
  /* -------- Identité -------- */
  Enter_prenom: string;
  Enter_nom: string;
  Enter_dateNaissance: string; // "dd.MM.yyyy"
  Enter_sexe: Enter_Sexe;

  /* -------- Statut civil / conjoint -------- */
  Enter_etatCivil: Enter_EtatCivil;
  Enter_spouseSexe?: Enter_Sexe;
  Enter_spouseDateNaissance?: string; // "dd.MM.yyyy"
  Enter_mariageDuree?: 0 | 1; // 0 = ≥5 ans, 1 = <5 ans
  Enter_menageCommun5Ans?: boolean; // concubinage
  Enter_partenaireDesigneLPP?: boolean; // concubinage

  /* -------- Enfants -------- */
  Enter_hasEnfants?: boolean;
  Enter_enfants?: Enter_Enfant[];

  /* -------- Activité / affiliation -------- */
  Enter_statutProfessionnel: Enter_StatutProfessionnel;
  Enter_travaillePlusde8HSemaine: boolean;
  Enter_Affilie_LPP: boolean;

  /* -------- IJ -------- */
  Enter_ijMaladie?: boolean;
  Enter_ijMaladieTaux?: number;   // 10..100
  Enter_ijAccidentTaux?: number;  // 80..100

  /* -------- Carrière AVS -------- */
  Enter_ageDebutCotisationsAVS: number;
  Enter_anneeDebutCotisationAVS?: number;
  Enter_hasAnnesManquantesAVS?: boolean;
  Enter_anneesManquantesAVS?: number[];

  /* -------- ***Lié au certificat LPP*** -------- */

  /* -------- Chiffres LPP (certificat ou saisie) -------- */
  Enter_salaireAnnuel: number;

  // Salaire assuré : général OU split (épargne/risque)
  Enter_typeSalaireAssure?: "general" | "split";
  Enter_salaireAssureLPP?: number;          // si general
  Enter_salaireAssureLPPRisque?: number;    // si split
  Enter_salaireAssureLPPEpargne?: number;   // si split

  Enter_renteInvaliditeLPP?: number;
  Enter_renteEnfantInvaliditeLPP?: number;
  Enter_renteOrphelinLPP?: number;
  Enter_RenteConjointOuPartenaireLPP?: 0 | 1; // 0 conjoint, 1 partenaire
  Enter_renteConjointLPP?: number;
  Enter_rentePartenaireLPP?: number;

  /* Capitaux décès */
  // Saisie libre côté UI/scan, mappée ensuite sur les flats ci-dessous
  DecesCapitaux?: Array<{
    amount: number;
    plusRente: "oui" | "non" | "np";
    condition: "accident" | "maladie" | "les_deux" | "np";
  }>;

  Enter_CapitalAucuneRente?: number;
  Enter_CapitalPlusRente?: number;
  Enter_CapitalAucuneRenteMal?: number;
  Enter_CapitalAucuneRenteAcc?: number;
  Enter_CapitalPlusRenteMal?: number;
  Enter_CapitalPlusRenteAcc?: number;

  /* Vieillesse */
  Enter_rentevieillesseLPP65?: number;

  /* -------- Métadonnées certificat LPP -------- */
  Enter_dateCertificatLPP?: string; // "dd.MM.yyyy"

  /* -------- Avoirs / Libre passage -------- */
  Enter_avoirVieillesseObligatoire?: number;
  Enter_avoirVieillesseTotal?: number;
  Enter_librePassageObligatoire?: number;
  Enter_librePassageTotal?: number;

  /* -------- Prestations / options diverses -------- */
  Enter_prestationCapital65?: number;
  Enter_rachatPossible?: number;
  Enter_versementsAnticipesLogement?: number;
  Enter_eplPossibleMax?: number;
  Enter_miseEnGage?: boolean;
}

/* =========================================================
 * Paramétrage légal Firestore
 * =======================================================*/

/** Paramétrage des règles survivants (AVS / LAA / LPP) */
export interface Legal_SurvivorsAVS {
  widowMinAge: number;       // ex: 45
  marriageMinYears: number;  // ex: 5
  childMinorAge: number;     // ex: 18
}
export interface Legal_SurvivorsLAA {
  spouseMinAge: number;      // ex: 45
  marriageMinYears: number;  // ex: 5
  childMinorAge: number;     // ex: 18
}
export interface Legal_SurvivorsLPP {
  spouseMinAge: number;       // ex: 45
  marriageMinYears: number;   // ex: 5
  childMinorAge: number;      // ex: 18
  requireAffiliation: boolean; // ex: true
}

export interface Legal_Settings {
  /* ----- LAA (accidents) ----- */
  Legal_SalaireAssureMaxLAA: number;                 // 148200
  Legal_MultiplicateurCapitalSiPasRenteLAA: number;  // 3
  Legal_ijAccidentTaux: number;                      // 80

  /* ----- LPP (2e pilier) ----- */
  Legal_DeductionCoordinationMinLPP: number; // 26460
  Legal_SeuilEntreeLPP: number;              // 22680
  Legal_SalaireMaxLPP: number;               // 90720
  Legal_SalaireAssureMaxLPP: number;         // 64260
  Legal_SalaireAssureMinLPP: number;         // 3780
  Legal_MultiplicateurCapitalSiPasRenteLPP: number; // 3
  Legal_CotisationsMinLPP: Record<string, number>;

  /* ----- AVS/AI (1er pilier) ----- */
  Legal_AgeRetraiteAVS: number;         // 65
  Legal_AgeLegalCotisationsAVS: number; // 21
  Legal_BTE_AnnualCredit: number;
  Legal_BTA_AnnualCredit: number;
  Legal_BTE_SplitMarried: number;       // 0.5

  /* ----- Survivants (configurable) ----- */
  Legal_Survivors?: {
    avs: Legal_SurvivorsAVS;
    laa: Legal_SurvivorsLAA;
    lpp: Legal_SurvivorsLPP;
  };

  /* ----- Échelle 44 ----- */
  Legal_Echelle44Version?: string;
}

/* =========================================================
 * Échelle 44 — ligne mensuelle (OFAS)
 * =======================================================*/
export interface Legal_Echelle44Row {
  Legal_Income: number;                // RAMD plancher (CHF/an)
  Legal_OldAgeInvalidity: number;      // Rente base adulte (CHF/mois)
  Legal_WidowWidowerSurvivor: number;  // Veuve/veuf (CHF/mois)
  Legal_OldAgeInvalidityForWidowWidower?: number;
  Legal_Supplementary30?: number;
  Legal_Child40?: number;              // Orphelin simple 40% (CHF/mois)
  Legal_Orphan60?: number;             // Orphelin double 60% (CHF/mois)
}

/* =========================================================
 * Types résultats
 * =======================================================*/
export interface RenteResult {
  amount: number; // CHF (mois ou an)
  meta?: Record<string, unknown>;
}
export interface SurvivantsLaaResult {
  renteConjoint: number;  // CHF/an
  renteEnfants: number;   // CHF/an total
  total: number;          // CHF/an après cap famille 70%
  meta?: Record<string, unknown>;
}

/* =========================================================
 * MoneyLife — 3e pilier (3a / 3b)
 * Configurateur de produit
 * =======================================================*/

export type Config_3e_Type = "3a" | "3b";
export type Config_3e_Frequency = "monthly" | "yearly";
export type Config_3e_WaitingPeriod = 3 | 12 | 24; // en mois

/* ---------- Couvertures de risque ---------- */
export interface Config_3e_DeathFixed {
  enabled: boolean;
  capital: number; // CHF
}

export interface Config_3e_DeathDecreasing {
  enabled: boolean;
  capitalInitial: number; // CHF au début
  durationYears: number;  // durée jusqu'à 0
}

export interface Config_3e_DisabilityAnnuity {
  enabled: boolean;
  annualRente: number;          // CHF/an
  startAge: number;             // âge à partir duquel la rente court
  waitingPeriod: Config_3e_WaitingPeriod;
}

export interface Config_3e_PremiumWaiver {
  enabled: boolean;
  waitingPeriod: Config_3e_WaitingPeriod;
}

/* ---------- Épargne / fonds ---------- */

export type Config_3e_InvestmentProfile =
  | "secure"
  | "balanced"
  | "dynamic";

export interface Config_3e_Savings {
  withFunds: boolean;                 // true = avec fonds
  investmentProfile?: Config_3e_InvestmentProfile;
  expectedReturnPct?: number;         // ex. 2, 4, 6
  transferAmount3a?: number;          // capital transféré (3a uniquement)
}

/* ---------- IA / Santé ---------- */

export type HealthAIStatus =
  | "not_required"        // pas de risque
  | "pending"             // questions en cours
  | "completed"           // terminé
  | "needs_manual_review"; // besoin d'un humain

export interface HealthAIQuestionAnswer {
  id: string;
  question: string;
  answer: string;
  createdAt: number; // timestamp
}

/* ---------- Snapshot client minimal pour tarification ---------- */

export interface Config_3e_ClientSnapshot {
  firstName: string;
  lastName: string;
  sexe: Enter_Sexe;
  birthdate: string; // YYYY-MM-DD
  nationality: string;
  hasSwissNationality: boolean;
  residencePermit?: "B" | "C" | null;
  profession: string;
  isSmoker: boolean;
  heightCm: number;
  weightKg: number;
  hasHypertension: boolean;
  hasHealthIssues: boolean;

  /** Diplôme / formation supérieure (pour le questionnaire Lifestyle) */
  highestDegreeLabel?: string;          // ex. "Master en droit"
  highestDegreeType?: "bachelor" | "master" | "phd" | "federal_diploma" | "other";
  highestDegreeInstitution?: string;    // ex. "UNIL, EPFL..."

  /** Travail manuel ou physique significatif (>4h/semaine) */
  hasManualWorkComponent?: boolean;
}

/* ---------- Configurateur complet ---------- */

export interface Config_3e_Pilier {
  id: string;               // id doc Firestore
  clientUid: string;
  offerName?: string;

  type: Config_3e_Type;

  // Prime
  premiumAmount: number;           // CHF
  premiumFrequency: Config_3e_Frequency;
  startDate: string;               // YYYY-MM-DD
  endAge: number;                  // âge à la fin du contrat

  // Risques
  deathFixed: Config_3e_DeathFixed;
  deathDecreasing: Config_3e_DeathDecreasing;
  disabilityAnnuities: Config_3e_DisabilityAnnuity[]; // multi-rente IG
  premiumWaiver: Config_3e_PremiumWaiver;

  // Épargne
  savings: Config_3e_Savings;

  // Santé / IA
  healthStatus: HealthAIStatus;
  healthNotes?: string;
  healthQA: HealthAIQuestionAnswer[];

  // Calculs internes
  totalRiskPremium: number;   // CHF
  netSavingsPremium: number;  // CHF = prime - risques (>= 0)

  // Statut du configurateur
  status: "draft" | "locked" | "offers_requested";

  createdAt: number;          // timestamp
  updatedAt: number;          // timestamp
}

/* =========================================================
 * Questionnaire santé & sports 3e pilier (MoneyLife)
 * =======================================================*/

/**
 * Statut du questionnaire santé/sports pour une configuration 3e pilier.
 * À utiliser dans Config_3e_Pilier.healthStatus.
 *
 * - "not_required" : aucune couverture de risque (questionnaire non requis)
 * - "required"     : il y a des risques, questionnaire encore non commencé
 * - "in_progress"  : questionnaire ouvert, pas encore validé
 * - "completed"    : questionnaire terminé + consentement donné
 */
export type HealthStatus3e =
  | "not_required"
  | "required"
  | "in_progress"
  | "completed";

/** Catégories de thèmes médicaux (pour structurer les dossiers) */
export type HealthCaseCategory =
  | "general"
  | "psy"          // dépression, burn-out, anxiété, etc.
  | "cardio"       // hypertension, infarctus, etc.
  | "back"         // dos / colonne / articulations
  | "metabolic"    // diabète, hypercholestérolémie, etc.
  | "respiratory"  // asthme, BPCO, etc.
  | "cancer"
  | "neuro"
  | "other";

/** Catégorie de réponse, pour le journal questions/réponses */
export type HealthAnswerCategory =
  | "general"
  | "module"       // questions liées à un HealthCase
  | "sport"        // sports à risques
  | "summary"
  | "consent";

/** Catégories de sports à risques reconnues par MoneyLife */
export type RiskSportCategory =
  | "mountaineering"   // alpinisme, escalade, via ferrata…
  | "ski_freeride"     // hors-piste, freeride
  | "paragliding"      // parapente, parachutisme, wingsuit…
  | "scuba_diving"     // plongée sous-marine
  | "motor_sport"      // sports mécaniques (moto, rallye, karting…)
  | "aviation"         // aviation privée, voltige
  | "martial_arts"     // sports de combat
  | "horse_riding"     // équitation sportive (saut, cross…)
  | "other";

/** Dossier médical structuré (un "cas" : dépression 2021, lombalgies, etc.) */
export type HealthCase = {
  /** ID interne (UUID) */
  id: string;

  /** Thème principal : psy, cardio, dos, etc. */
  category: HealthCaseCategory;

  /** Titre lisible : "Dépression", "Lombalgies chroniques", etc. */
  title: string;

  /** Informations structurées exploitables par les collaborateurs / IA */
  facts: {
    diagnosis?: string;       // "Dépression", "Hypertension", etc.
    startDate?: string;       // "2021-03" ou "2021-03-15"
    endDate?: string | null;  // null si en cours
    ongoing: boolean;         // true si encore suivi/actif
    treatments?: string;      // texte libre : médicaments, thérapies…
    hospitalizations?: string;// séjours à l'hôpital / cliniques
    workStopMonths?: number;  // durée d'arrêt de travail cumulé
    sequelae?: string;        // séquelles / limitations actuelles
    doctorOrClinic?: string;  // médecin traitant, clinique, etc.
  };

  /** Toutes les notes brutes liées à ce cas (texte du client) */
  rawNotes: string[];

  /** Résumés formatés pour être recopiés dans les logiciels d'offres */
  summaries?: {
    generic?: string;   // résumé neutre
    axaAura?: string;   // variante adaptée au ton / format Aura
    swisslife?: string; // variante adaptée Swiss Life
    // autres assureurs éventuels…
    [insurer: string]: string | undefined;
  };
};

/**
 * Entrée du journal complet des questions/réponses.
 * Permet aux collaborateurs de voir EXACTEMENT ce que le client a répondu.
 */
export type HealthAnswer = {
  id: string;                // UUID interne
  questionId: string;        // ID logique (stable) de la question
  questionLabel: string;     // texte affiché au moment de la réponse
  category: HealthAnswerCategory;

  /** Réponse brute telle que tapée / choisie par le client */
  rawAnswer: string;

  /**
   * Variante normalisée pour la logique (optionId, bool, nombre…)
   * Exemple : true/false, "yes"/"no", 20 (cigarettes/jour), etc.
   */
  normalized?: string | number | boolean | string[];

  /** Référence éventuelle vers un dossier médical (HealthCase) ou sport */
  linkedCaseId?: string | null;
  linkedRiskSportId?: string | null;

  createdAt: number;
};

/** Sport à risques pratiqué par le client, avec détail structuré + notes brutes */
export type RiskSport = {
  id: string;                 // UUID
  category: RiskSportCategory;
  label: string;              // "Plongée sous-marine", "Moto piste", etc.

  facts: {
    sinceYear?: number;       // année de début (ex. 2018)
    frequencyPerYear?: number;// nb de sorties / compétitions par an
    level: "leisure" | "advanced" | "competition" | "pro";
    mainLocations?: string;   // pays, montagne / mer, etc.
    hasAccidentHistory: boolean;
    lastAccidentDate?: string;
    accidentDetails?: string;
    safetyEquipments?: string; // casque, DVA, parachute de secours, etc.
    clubOrLicense?: string;    // fédération, licence, club
  };

  /** Notes brutes du client (texte libre) */
  rawNotes: string[];

  /** Résumés par assureur, pour copier-coller dans les formulaires */
  summaries?: {
    generic?: string;
    axaAura?: string;
    swisslife?: string;
    [insurer: string]: string | undefined;
  };
};

/* ---------- NOUVEAUX TYPES IA POUR LIFESTYLE ---------- */

/** Bloc IA côté serveur : quel "thème" on traite */
export type HealthAIBlocKind =
  | "degree"                         // diplômes / études supérieures
  | "manual_work"                    // travail manuel / physique
  | "risk_sport"                     // sport / loisir à risque
  | "travel"                         // voyage / séjour en zone à risque
  | "smoking"                        // tabac / vape / nicotine
  | "cholesterol"                    // cholestérol / métabolisme
  | "general_condition"              // affection médicale générale
  | "planned_surgery"                // opération prévue / recommandée
  | "drug_use"                       // drogues / stupéfiants
  | "completeness_missing_condition" // complétude : problème oublié
  | "past_insurance_decision";       // proposition refusée / ajournée / aggravée

/** Voyages / séjours à risque (gérés par IA) */
export interface TravelRisk {
  id: string;
  country: string;
  regionDescription?: string;   // si zone particulière
  purpose: "tourism" | "work" | "expat" | "other";
  durationMonths: number;
  startApprox?: string;        // "2026-03"
  inWarOrCrisisZone: boolean;
  remarks?: string;
  summaries?: {
    generic?: string;
    axaAura?: string;
    swisslife?: string;
    [insurer: string]: string | undefined;
  };
}

/** Consommation de drogues / stupéfiants */
export interface SubstanceUse {
  id: string;
  substance: string;           // cannabis, cocaïne, MDMA, etc.
  pattern: "occasionnel" | "regulier" | "ancien";
  frequencyPerMonth?: number;
  firstUseYear?: number;
  lastUseYear?: number;
  hasDependenceHistory: boolean;
  treatmentOrFollowup?: string;
  summaries?: {
    generic?: string;
    axaAura?: string;
    swisslife?: string;
    [insurer: string]: string | undefined;
  };
}

/** Historique d'assurance : refus / ajournement / conditions aggravées */
export interface InsuranceHistoryItem {
  id: string;
  insurerName: string;
  productType?: string;   // vie, 3a, risque pur, etc.
  decision: "refused" | "postponed" | "rated_up" | "other";
  decisionDateApprox?: string; // "2024-05"
  reasonClientVersion?: string;
  coverageRequested?: string;
  summaries?: {
    generic?: string;
    axaAura?: string;
    swisslife?: string;
    [insurer: string]: string | undefined;
  };
}

/**
 * Questionnaire santé & sports pour le 3e pilier.
 * Stocké en général sous clients/{uid}/health_3epilier/{questionnaireId}
 */
export type HealthQuestionnaire3e = {
  id: string;
  clientUid: string;

  /** Cas médicaux structurés (un par pathologie / épisode significatif) */
  cases: HealthCase[];

  /** Journal complet questions/réponses (santé + sports + consentement) */
  answers: HealthAnswer[];

  /** Liste des sports à risques déclarés */
  riskSports: RiskSport[];

  /** Voyages / séjours en zones à risque ou longue durée à l'étranger */
  travelRisks?: TravelRisk[];

  /** Consommation de drogues / stupéfiants */
  substanceUses?: SubstanceUse[];

  /** Historique d'assurances (refus, ajournement, surprime) */
  insuranceHistory?: InsuranceHistoryItem[];

  /** Drapeaux globaux utiles pour filtrer rapidement */
  globalFlags: {
    hasChronicDisease: boolean;
    hasPsychHistory: boolean;
    hasSeriousAccident: boolean;
    hasRiskSports: boolean;
  };

  /** Résumés globaux (optionnels) du questionnaire */
  summaries?: {
    generic?: string;
    axaAura?: string;
    swisslife?: string;
    [insurer: string]: string | undefined;
  };

  /** Texte de consentement affiché au client et horodatage */
  lastConsentText: string;
  lastConsentAcceptedAt: number;

  /** Métadonnées */
  createdAt: number;
  updatedAt: number;
};