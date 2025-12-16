// app/lib/core/health-engine.ts

import type {
  HealthQuestionnaire3e,
  HealthCase,
  HealthCaseCategory,
  HealthAnswer,
  HealthAnswerCategory,
} from "./types";

/**
 * Domaines médicaux gérés par le moteur.
 * On commence avec les 3 blocs critiques (ostéo, cardio, psy).
 * Les autres domains (respiratory, digestive, etc.) seront ajoutés plus tard.
 */
export type HealthDomain =
  | "osteo"
  | "cardio"
  | "psy"
  | "respiratory"
  | "digestive"
  | "renal"
  | "neuro"
  | "derm"
  | "endocrine"
  | "gyneco"
  | "onco"
  | "infectious"
  | "orl_oph"
  | "lifestyle"
  | "sports_risk";

export type HealthAnswerValue = string | number | boolean | string[] | null;

export type HealthQuestionType =
  | "boolean"
  | "choice"
  | "text"
  | "textarea"
  | "number"
  | "year";

export interface HealthQuestionDescriptor {
  id: string;
  domain: HealthDomain | "screening";
  label: string;
  helpText?: string;
  type: HealthQuestionType;
  options?: string[]; // pour "choice"
}

function toRawString(value: HealthAnswerValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (value === null || value === undefined) return "";
  return String(value);
}

function getAnswerCategory(
  question: HealthQuestionDescriptor
): HealthAnswerCategory {
  if (question.domain === "screening") return "general";
  if (question.domain === "sports_risk") return "sport";
  return "module";
}

function mapDomainToCategory(domain: HealthDomain): HealthCaseCategory {
  switch (domain) {
    case "cardio":
      return "cardio";
    case "psy":
      return "psy";
    case "osteo":
      // Ostéo = squelette / dos / articulations → on le rapproche de "back" pour l'instant
      return "back";
    case "respiratory":
      return "respiratory";
    case "onco":
      return "cancer";
    case "neuro":
      return "neuro";
    case "endocrine":
      return "metabolic";
    default:
      return "other";
  }
}

/**
 * État minimal du moteur de questions.
 * - questionnaire: structure métier (cases etc.)
 * - currentDomain: domaine en cours (osteo, cardio, psy…)
 * - currentCaseId: l'ID du cas en cours dans ce domaine (ex. Ostéo #1)
 * - currentQuestionId: ID de la question en cours (ex. "screen_osteo", "osteo_side")
 */
export interface HealthEngineState {
  questionnaire: HealthQuestionnaire3e;
  currentDomain: HealthDomain | null;
  currentCaseId: string | null;
  currentQuestionId: string | null;
  screening: { [domain in HealthDomain]?: "yes" | "no" };
  clientSex?: number | null; // 👈 ajouté
}



/**
 * Génère un nouvel ID "case" simple.
 * Tu pourras remplacer par un uuid si tu veux.
 */
function createCaseId(domain: HealthDomain): string {
  return `${domain}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Crée un état initial du moteur à partir d'un questionnaire vide.
 */
export function createInitialQuestionnaire(): HealthQuestionnaire3e {
  const now = Date.now();
  return {
    id: `hq_${now}_${Math.random().toString(36).slice(2, 8)}`,
    clientUid: "",
    cases: [],
    answers: [],
    riskSports: [],
    globalFlags: {
      hasChronicDisease: false,
      hasPsychHistory: false,
      hasSeriousAccident: false,
      hasRiskSports: false,
    },
    summaries: {},
    lastConsentText: "",
    lastConsentAcceptedAt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialEngineState(
  clientUid: string,
  clientSex?: number | null
): HealthEngineState {
  const questionnaire = createInitialQuestionnaire();
  questionnaire.clientUid = clientUid;

  return {
    questionnaire,
    currentDomain: null,
    currentCaseId: null,
    currentQuestionId: "screen_osteo",
    screening: {},
    clientSex: clientSex ?? null,
  };
}

/* =========================================================
 * 1. REGISTRE DE QUESTIONS (V1 — Ostéo / Cardio / Psy)
 * =======================================================*/

/**
 * Questions de screening par domaine (Oui/Non).
 * Une seule par domaine pour l'instant.
 */
const SCREENING_QUESTIONS: Record<HealthDomain, HealthQuestionDescriptor> = {
  osteo: {
    id: "screen_osteo",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème au niveau des os, articulations, muscles, tendons ou de la colonne (par ex. fracture, opération, hernie discale, prothèse) ?",
    type: "boolean",
  },
  cardio: {
    id: "screen_cardio",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème au niveau du cœur ou de la tension (par ex. hypertension, infarctus, palpitations importantes) ?",
    type: "boolean",
  },
  psy: {
    id: "screen_psy",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème de moral, de stress ou d'épuisement (par ex. dépression, burn-out, anxiété) ?",
    type: "boolean",
  },

  // Les domaines suivants seront implémentés plus tard :
  respiratory: {
    id: "screen_respiratory",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème respiratoire important (asthme, bronchite chronique, apnée du sommeil, etc.) ?",
    type: "boolean",
  },
  digestive: {
    id: "screen_digestive",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème digestif important (ulcère, maladie inflammatoire intestinale, maladie du foie, etc.) ?",
    type: "boolean",
  },
  renal: {
    id: "screen_renal",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème au niveau des reins ou des voies urinaires (calculs, infections fréquentes, insuffisance rénale, etc.) ?",
    type: "boolean",
  },
  neuro: {
    id: "screen_neuro",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème neurologique (épilepsie, migraine sévère, AVC, etc.) ?",
    type: "boolean",
  },
  derm: {
    id: "screen_derm",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème dermatologique important (psoriasis étendu, mélanome, etc.) ?",
    type: "boolean",
  },
  endocrine: {
    id: "screen_endocrine",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème hormonal ou métabolique important (diabète, maladie de la thyroïde, obésité sévère, etc.) ?",
    type: "boolean",
  },
  gyneco: {
    id: "screen_gyneco",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème gynécologique important (kyste, fibrome, frottis anormal, etc.) ?",
    type: "boolean",
  },
  onco: {
    id: "screen_onco",
    domain: "screening",
    label:
      "Avez-vous déjà eu une tumeur ou un cancer (même traité) ou un examen en cours pour en rechercher un ?",
    type: "boolean",
  },
  infectious: {
    id: "screen_infectious",
    domain: "screening",
    label:
      "Avez-vous déjà eu une infection grave ou chronique (hépatite, VIH, tuberculose, etc.) ?",
    type: "boolean",
  },
  orl_oph: {
    id: "screen_orl_oph",
    domain: "screening",
    label:
      "Avez-vous déjà eu un problème important au niveau des oreilles, du nez, de la gorge ou des yeux (chirurgie, glaucome, perte auditive importante, etc.) ?",
    type: "boolean",
  },
  lifestyle: {
    id: "screen_lifestyle",
    domain: "screening",
    label:
      "Avez-vous des habitudes de vie particulières que vous souhaitez mentionner (tabac, horaires irréguliers, autres habitudes spécifiques) ?",
    type: "boolean",
  },
  sports_risk: {
    id: "screen_sports_risk",
    domain: "screening",
    label:
      "Pratiquez-vous des sports considérés comme à risques (parapente, plongée, moto de course, ski hors-piste, etc.) ?",
    type: "boolean",
  },
};

/**
 * Mini-flows "cas" pour chaque domaine.
 * V1 simplifiée : Ostéo, Cardio, Psy.
 * Pour le moment, ce sont des questions statiques enchaînées.
 * Plus tard, on pourra les déléguer à une API IA.
 */

const OSTEO_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "osteo_description",
    domain: "osteo",
    label:
      "Pouvez-vous décrire en quelques mots ce problème (par ex. « opération de la main droite en 2021 », « hernie discale », etc.) ?",
    type: "textarea",
  },
  {
    id: "osteo_location",
    domain: "osteo",
    label:
      "Sur quelle partie du corps se situe principalement ce problème ?",
    helpText:
      "Par ex. main, poignet, épaule, colonne vertébrale, hanche, genou, pied…",
    type: "choice",
    options: [
      "Main / poignet / doigts",
      "Coude",
      "Épaule",
      "Colonne (dos / nuque)",
      "Hanche",
      "Genou",
      "Cheville / pied",
      "Autre",
    ],
  },
  {
    id: "osteo_side",
    domain: "osteo",
    label: "De quel côté s'agit-il ?",
    type: "choice",
    options: ["Côté droit", "Côté gauche", "Les deux / plusieurs endroits"],
  },
  {
    id: "osteo_firstYear",
    domain: "osteo",
    label:
      "En quelle année ce problème est-il apparu pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "osteo_status",
    domain: "osteo",
    label:
      "Aujourd'hui, ce problème est-il plutôt guéri, stabilisé ou toujours en cours ?",
    type: "choice",
    options: [
      "Guéri, aucune gêne",
      "Stabilisé avec une légère gêne",
      "Toujours en cours / récidivant",
    ],
  },
  {
    id: "osteo_impactWork",
    domain: "osteo",
    label:
      "Ce problème vous gêne-t-il dans votre travail actuel (port de charges, posture, gestes répétitifs, etc.) ?",
    type: "choice",
    options: ["Non, pas du tout", "Oui, un peu", "Oui, de manière importante"],
  },
  {
    id: "osteo_another_case",
    domain: "osteo",
    label:
      "Avez-vous un autre problème ostéo (os, articulations, dos, tendons) à un autre endroit ou à une autre période ?",
    type: "boolean",
  },
];

const CARDIO_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "cardio_description",
    domain: "cardio",
    label:
      "Pouvez-vous décrire en quelques mots ce problème cardiaque (par ex. « hypertension depuis 2018 », « infarctus en 2021 avec stent », etc.) ?",
    type: "textarea",
  },
  {
    id: "cardio_diagnosis_type",
    domain: "cardio",
    label:
      "S'agit-il plutôt d'hypertension, d'un infarctus, de palpitations / trouble du rythme, ou autre chose ?",
    type: "choice",
    options: [
      "Hypertension",
      "Infarctus / pose de stent",
      "Trouble du rythme (palpitations)",
      "Autre",
      "Je ne sais pas",
    ],
  },
  {
    id: "cardio_firstYear",
    domain: "cardio",
    label:
      "En quelle année ce problème cardiaque a-t-il été diagnostiqué pour la première fois ?",
    type: "year",
  },
  {
    id: "cardio_medication",
    domain: "cardio",
    label: "Prenez-vous actuellement un traitement pour ce problème ?",
    type: "choice",
    options: ["Oui, tous les jours", "Oui, mais de manière irrégulière", "Non"],
  },
  {
    id: "cardio_status",
    domain: "cardio",
    label:
      "Aujourd'hui, ce problème cardiaque est-il bien contrôlé, plutôt instable, ou vous gêne-t-il dans votre vie quotidienne ?",
    type: "choice",
    options: [
      "Bien contrôlé, pas de gêne au quotidien",
      "Plutôt instable, quelques symptômes",
      "Gêne importante dans la vie quotidienne",
    ],
  },
  {
    id: "cardio_impactWork",
    domain: "cardio",
    label:
      "Ce problème cardiaque a-t-il un impact sur votre travail (limitation, changement de poste, réduction du temps de travail) ?",
    type: "choice",
    options: ["Non", "Oui, légèrement", "Oui, clairement"],
  },
  {
    id: "cardio_another_case",
    domain: "cardio",
    label:
      "Avez-vous eu un autre problème cardiaque ou circulatoire (à une autre période ou de nature différente) ?",
    type: "boolean",
  },
];

const PSY_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "psy_description",
    domain: "psy",
    label:
      "Pouvez-vous décrire en quelques mots ce problème (par ex. « burn-out en 2021 », « dépression en 2019 », etc.) ?",
    type: "textarea",
  },
  {
    id: "psy_diagnosis_type",
    domain: "psy",
    label:
      "S'agissait-il plutôt d'une dépression, d'un burn-out, d'anxiété ou d'autre chose ?",
    type: "choice",
    options: [
      "Dépression",
      "Burn-out / épuisement",
      "Anxiété / attaques de panique",
      "Autre",
      "Je ne sais pas",
    ],
  },
  {
    id: "psy_firstYear",
    domain: "psy",
    label:
      "En quelle année cet épisode a-t-il commencé (environ) ?",
    type: "year",
  },
  {
    id: "psy_episodesCount",
    domain: "psy",
    label:
      "Avez-vous eu un seul épisode de ce type ou plusieurs épisodes ?",
    type: "choice",
    options: ["Un seul épisode", "2–3 épisodes", "Plus de 3 épisodes"],
  },
  {
    id: "psy_longestWorkStop",
    domain: "psy",
    label:
      "Avez-vous eu un arrêt de travail pour ce problème ? Si oui, quelle a été la durée du plus long arrêt ?",
    type: "choice",
    options: [
      "Aucun arrêt",
      "Moins de 2 semaines",
      "2 à 6 semaines",
      "2–3 mois",
      "Plus de 3 mois",
    ],
  },
  {
    id: "psy_currentStatus",
    domain: "psy",
    label:
      "Aujourd'hui, vous sentez-vous totalement rétabli, stabilisé avec quelques symptômes, ou toujours en difficulté à cause de ce problème ?",
    type: "choice",
    options: [
      "Totalement rétabli",
      "Stabilisé avec quelques symptômes",
      "Toujours en difficulté / en traitement",
    ],
  },
  {
    id: "psy_impactWork",
    domain: "psy",
    label:
      "Ce problème affecte-t-il votre travail actuel (capacité à travailler, concentration, énergie) ?",
    type: "choice",
    options: ["Non", "Oui, légèrement", "Oui, de manière importante"],
  },
  {
    id: "psy_another_case",
    domain: "psy",
    label:
      "Avez-vous eu un autre épisode ou un autre trouble psychologique à une autre période ?",
    type: "boolean",
  },
];

const ONCO_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "onco_description",
    domain: "onco",
    label:
      "Pouvez-vous décrire le type de tumeur ou cancer concerné ?",
    helpText:
      "Exemples : cancer du sein, mélanome, tumeur bénigne, polype précancéreux.",
    type: "textarea",
  },
  {
    id: "onco_location",
    domain: "onco",
    label: "Sur quelle partie du corps était située la tumeur ?",
    type: "choice",
    options: [
      "Sein",
      "Peau (mélanome ou autre)",
      "Thyroïde",
      "Colon / rectum",
      "Poumon",
      "Prostate",
      "Utérus / ovaires",
      "Testicule",
      "Tête / cou",
      "Autre",
    ],
  },
  {
    id: "onco_firstYear",
    domain: "onco",
    label:
      "En quelle année ce cancer ou cette tumeur a-t-il été diagnostiqué pour la première fois ?",
    type: "year",
  },
  {
    id: "onco_treatment_primary",
    domain: "onco",
    label:
      "Quel a été le premier traitement principal ?",
    helpText:
      "Exemples : chirurgie, radiothérapie, chimiothérapie, hormonothérapie, immunothérapie.",
    type: "choice",
    options: [
      "Chirurgie",
      "Chimiothérapie",
      "Radiothérapie",
      "Hormonothérapie",
      "Immunothérapie",
      "Aucun / surveillance",
    ],
  },
  {
    id: "onco_treatment_lastYear",
    domain: "onco",
    label:
      "En quelle année votre dernier traitement s'est-il terminé ?",
    helpText: "Si encore en cours, indiquez l'année actuelle.",
    type: "year",
  },
  {
    id: "onco_status",
    domain: "onco",
    label:
      "Quel est votre statut actuel ?",
    type: "choice",
    options: [
      "Rémission complète",
      "Rémission partielle / surveillance",
      "Encore sous traitement",
      "Progression récente",
    ],
  },
  {
    id: "onco_recidive",
    domain: "onco",
    label:
      "Y a-t-il déjà eu une récidive ou un nouvel épisode de ce cancer ?",
    type: "boolean",
  },
  {
    id: "onco_impactWork",
    domain: "onco",
    label:
      "Ce problème a-t-il un impact sur votre travail ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, clairement",
    ],
  },
  {
    id: "onco_another_case",
    domain: "onco",
    label:
      "Avez-vous eu un autre cancer ou une autre tumeur importante ?",
    type: "boolean",
  },
];

const ENDOCRINE_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "endocrine_description",
    domain: "endocrine",
    label:
      "Pouvez-vous décrire en quelques mots ce problème hormonal ou métabolique ?",
    helpText:
      "Exemples : diabète de type 2, hypothyroïdie, hyperthyroïdie, obésité importante.",
    type: "textarea",
  },
  {
    id: "endocrine_type",
    domain: "endocrine",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Diabète (type 1 ou 2)",
      "Problème de thyroïde",
      "Obésité / surpoids important",
      "Autre problème hormonal",
      "Je ne sais pas",
    ],
  },
  {
    id: "endocrine_firstYear",
    domain: "endocrine",
    label:
      "En quelle année ce problème a-t-il été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "endocrine_treatment",
    domain: "endocrine",
    label:
      "Quel est le traitement principal actuellement ?",
    helpText:
      "Exemples : régime alimentaire, comprimés, insuline, substitut hormonal.",
    type: "choice",
    options: [
      "Régime / conseils alimentaires uniquement",
      "Médicaments oraux (comprimés)",
      "Insuline",
      "Substitut hormonal (thyroïde, etc.)",
      "Autre",
      "Aucun traitement",
    ],
  },
  {
    id: "endocrine_control",
    domain: "endocrine",
    label:
      "D'après votre médecin, ce problème est-il bien contrôlé actuellement ?",
    type: "choice",
    options: [
      "Oui, bien contrôlé",
      "Plutôt instable",
      "Mal contrôlé / fluctuations importantes",
      "Je ne sais pas",
    ],
  },
  {
    id: "endocrine_complications",
    domain: "endocrine",
    label:
      "Avez-vous des complications ou conséquences liées à ce problème (par ex. yeux, reins, nerfs, cardiovasculaire, etc.) ?",
    type: "boolean",
  },
  {
    id: "endocrine_impactWork",
    domain: "endocrine",
    label:
      "Ce problème a-t-il un impact sur votre travail (fatigue, limitations, absences, etc.) ?",
    type: "choice",
    options: ["Non", "Oui, légèrement", "Oui, clairement"],
  },
  {
    id: "endocrine_another_case",
    domain: "endocrine",
    label:
      "Avez-vous un autre problème hormonal ou métabolique important (en plus de celui-ci) ?",
    type: "boolean",
  },
];

const RESPIRATORY_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "resp_description",
    domain: "respiratory",
    label:
      "Pouvez-vous décrire en quelques mots ce problème respiratoire ?",
    helpText:
      "Exemples : asthme, bronchite chronique, apnée du sommeil, BPCO.",
    type: "textarea",
  },
  {
    id: "resp_type",
    domain: "respiratory",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Asthme",
      "Apnée du sommeil",
      "Bronchite chronique / BPCO",
      "Autre problème respiratoire",
      "Je ne sais pas",
    ],
  },
  {
    id: "resp_firstYear",
    domain: "respiratory",
    label:
      "En quelle année ce problème respiratoire a-t-il été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "resp_treatment",
    domain: "respiratory",
    label:
      "Avez-vous un traitement régulier pour ce problème respiratoire ?",
    helpText:
      "Exemples : inhalateur (Ventolin, Seretide, etc.), CPAP pour l'apnée du sommeil.",
    type: "choice",
    options: [
      "Aucun traitement régulier",
      "Inhalateur à la demande uniquement",
      "Inhalateur de fond tous les jours",
      "Appareil CPAP / ventilation nocturne",
      "Autre traitement",
    ],
  },
  {
    id: "resp_crisisFrequency",
    domain: "respiratory",
    label:
      "À quelle fréquence avez-vous des symptômes ou des crises (toux, sifflements, essoufflement, apnées) ?",
    type: "choice",
    options: [
      "Très rarement (moins d'une fois par mois)",
      "Environ 1–3 fois par mois",
      "Plusieurs fois par semaine",
      "Quasi tous les jours / toutes les nuits",
    ],
  },
  {
    id: "resp_hospital",
    domain: "respiratory",
    label:
      "Avez-vous déjà été hospitalisé(e) ou vu les urgences pour ce problème respiratoire ?",
    type: "boolean",
  },
  {
    id: "resp_smokerContext",
    domain: "respiratory",
    label:
      "Fumez-vous ou avez-vous fumé régulièrement des cigarettes (ou autre) ?",
    type: "choice",
    options: [
      "Jamais fumé",
      "Ancien fumeur",
      "Fumeur actuel",
    ],
  },
  {
    id: "resp_impactWork",
    domain: "respiratory",
    label:
      "Ce problème a-t-il un impact sur votre travail ou vos activités physiques ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "resp_another_case",
    domain: "respiratory",
    label:
      "Avez-vous eu un autre problème respiratoire important (différent de celui-ci) ?",
    type: "boolean",
  },
];

const NEURO_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "neuro_description",
    domain: "neuro",
    label:
      "Pouvez-vous décrire en quelques mots ce problème neurologique ?",
    helpText:
      "Exemples : migraine sévère, épilepsie, AVC, AIT, neuropathie, tremblements.",
    type: "textarea",
  },
  {
    id: "neuro_type",
    domain: "neuro",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Migraine sévère / fréquente",
      "Épilepsie / convulsions",
      "AVC ou AIT",
      "Autre problème neurologique",
      "Je ne sais pas",
    ],
  },
  {
    id: "neuro_firstYear",
    domain: "neuro",
    label:
      "En quelle année ce problème neurologique a-t-il commencé ou été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "neuro_lastEventYear",
    domain: "neuro",
    label:
      "En quelle année a eu lieu le dernier épisode significatif (crise, AVC, poussée, etc.) ?",
    type: "year",
  },
  {
    id: "neuro_treatment",
    domain: "neuro",
    label:
      "Avez-vous un traitement régulier pour ce problème ?",
    helpText:
      "Exemples : antiépileptique, traitement de fond pour les migraines, autre médicament spécifique.",
    type: "choice",
    options: [
      "Aucun traitement régulier",
      "Traitement de fond tous les jours",
      "Traitement uniquement en cas de crise",
      "Autre traitement",
    ],
  },
  {
    id: "neuro_hospital",
    domain: "neuro",
    label:
      "Avez-vous déjà été hospitalisé(e) ou admis(e) aux urgences pour ce problème neurologique ?",
    type: "boolean",
  },
  {
    id: "neuro_sequelae",
    domain: "neuro",
    label:
      "Avez-vous actuellement des séquelles ou limitations (force, sensibilité, parole, mémoire, équilibre, etc.) ?",
    type: "boolean",
  },
  {
    id: "neuro_driving",
    domain: "neuro",
    label:
      "Ce problème a-t-il une influence sur votre capacité à conduire (restrictions, retrait de permis, etc.) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, restrictions ou conseils du médecin",
      "Oui, retrait ou suspension du permis",
    ],
  },
  {
    id: "neuro_impactWork",
    domain: "neuro",
    label:
      "Ce problème a-t-il un impact sur votre travail (tâches possibles, taux d'activité, absences) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "neuro_another_case",
    domain: "neuro",
    label:
      "Avez-vous eu un autre problème neurologique important (différent de celui-ci) ?",
    type: "boolean",
  },
];
const DIGESTIVE_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "dig_description",
    domain: "digestive",
    label:
      "Pouvez-vous décrire en quelques mots ce problème digestif ?",
    helpText:
      "Exemples : reflux sévère (RGO), ulcère, maladie de Crohn, rectocolite, problème du foie ou du pancréas.",
    type: "textarea",
  },
  {
    id: "dig_type",
    domain: "digestive",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Reflux / brûlures d'estomac (RGO)",
      "Ulcère",
      "Maladie de Crohn / RCH",
      "Maladie du foie",
      "Problème du pancréas",
      "Autre problème digestif",
      "Je ne sais pas",
    ],
  },
  {
    id: "dig_firstYear",
    domain: "digestive",
    label:
      "En quelle année ce problème digestif a-t-il commencé ou été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "dig_lastFlareYear",
    domain: "digestive",
    label:
      "En quelle année a eu lieu le dernier épisode important (poussée, crise, hospitalisation) ?",
    type: "year",
  },
  {
    id: "dig_treatment",
    domain: "digestive",
    label:
      "Avez-vous un traitement régulier pour ce problème ?",
    helpText:
      "Exemples : médicaments anti-acides, traitement immunosuppresseur ou biologique, régime spécifique.",
    type: "choice",
    options: [
      "Aucun traitement régulier",
      "Traitement au besoin uniquement",
      "Traitement quotidien / de fond",
      "Traitement immunosuppresseur / biologique",
      "Autre traitement",
    ],
  },
  {
    id: "dig_hospital",
    domain: "digestive",
    label:
      "Avez-vous déjà été hospitalisé(e) ou opéré(e) pour ce problème digestif ?",
    type: "boolean",
  },
  {
    id: "dig_surgery",
    domain: "digestive",
    label:
      "Avez-vous subi une opération au niveau de l'estomac, de l'intestin, du foie ou du pancréas pour ce problème ?",
    type: "boolean",
  },
  {
    id: "dig_impactWork",
    domain: "digestive",
    label:
      "Ce problème a-t-il un impact sur votre travail ou votre énergie (fatigue, douleurs, absences) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "dig_another_case",
    domain: "digestive",
    label:
      "Avez-vous eu un autre problème digestif important (différent de celui-ci) ?",
    type: "boolean",
  },
];
const RENAL_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "renal_description",
    domain: "renal",
    label:
      "Pouvez-vous décrire en quelques mots ce problème au niveau des reins ou des voies urinaires ?",
    helpText:
      "Exemples : calculs rénaux, infections urinaires répétées, insuffisance rénale.",
    type: "textarea",
  },
  {
    id: "renal_type",
    domain: "renal",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Calculs rénaux",
      "Infections urinaires répétées",
      "Insuffisance rénale",
      "Problème de vessie / prostate",
      "Autre problème rénal ou urinaire",
      "Je ne sais pas",
    ],
  },
  {
    id: "renal_firstYear",
    domain: "renal",
    label:
      "En quelle année ce problème a-t-il commencé ou été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "renal_lastEpisodeYear",
    domain: "renal",
    label:
      "En quelle année a eu lieu le dernier épisode important (crise de calcul, infection, aggravation, etc.) ?",
    type: "year",
  },
  {
    id: "renal_treatment",
    domain: "renal",
    label:
      "Avez-vous un traitement ou suivi régulier pour ce problème ?",
    helpText:
      "Exemples : hydratation stricte, médicaments, suivi néphrologue, dialyse.",
    type: "choice",
    options: [
      "Aucun traitement régulier",
      "Traitement uniquement en cas de crise / infection",
      "Traitement quotidien / de fond",
      "Suivi spécialisé (néphrologue / urologue)",
      "Dialyse",
      "Autre",
    ],
  },
  {
    id: "renal_hospital",
    domain: "renal",
    label:
      "Avez-vous déjà été hospitalisé(e) ou opéré(e) pour ce problème (calcul bloqué, infection, chirurgie, etc.) ?",
    type: "boolean",
  },
  {
    id: "renal_function",
    domain: "renal",
    label:
      "Savez-vous si votre fonction rénale est normale ou réduite, selon votre médecin ?",
    type: "choice",
    options: [
      "Fonction rénale normale",
      "Fonction légèrement réduite",
      "Fonction fortement réduite / dialyse",
      "Je ne sais pas",
    ],
  },
  {
    id: "renal_impactWork",
    domain: "renal",
    label:
      "Ce problème a-t-il un impact sur votre travail ou votre énergie (fatigue, absences, limitations) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "renal_another_case",
    domain: "renal",
    label:
      "Avez-vous eu un autre problème important au niveau des reins ou des voies urinaires (différent de celui-ci) ?",
    type: "boolean",
  },
];
const DERM_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "derm_description",
    domain: "derm",
    label:
      "Pouvez-vous décrire en quelques mots ce problème dermatologique ?",
    helpText:
      "Exemples : psoriasis étendu, eczéma sévère, mélanome, grain de beauté atypique, infection chronique.",
    type: "textarea",
  },
  {
    id: "derm_type",
    domain: "derm",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Psoriasis",
      "Eczéma sévère",
      "Acné sévère / traitement Roaccutane",
      "Mélanome / cancer de la peau",
      "Lésions pré-cancéreuses (kératose, dysplasie)",
      "Vitiligo",
      "Autre problème dermatologique",
      "Je ne sais pas",
    ],
  },
  {
    id: "derm_firstYear",
    domain: "derm",
    label:
      "En quelle année ce problème dermatologique a-t-il commencé (environ) ?",
    type: "year",
  },
  {
    id: "derm_lastEpisodeYear",
    domain: "derm",
    label:
      "En quelle année a eu lieu le dernier épisode important (poussée, aggravation, intervention) ?",
    type: "year",
  },
  {
    id: "derm_treatment",
    domain: "derm",
    label:
      "Avez-vous un traitement régulier pour ce problème ?",
    helpText:
      "Exemples : crèmes corticoïdes, immunosuppresseurs, traitements biologiques, photothérapie.",
    type: "choice",
    options: [
      "Aucun traitement",
      "Traitement local léger",
      "Traitement local fort (corticoïdes, etc.)",
      "Traitement immunosuppresseur / biologique",
      "Autre traitement",
    ],
  },
  {
    id: "derm_surface",
    domain: "derm",
    label:
      "Quelle surface approximative du corps est concernée lors des poussées ?",
    type: "choice",
    options: [
      "< 5% du corps",
      "5%–15% du corps",
      "> 15% du corps",
      "Je ne sais pas",
    ],
  },
  {
    id: "derm_hospital",
    domain: "derm",
    label:
      "Avez-vous déjà été opéré(e) ou hospitalisé(e) pour ce problème dermatologique ?",
    type: "boolean",
  },
  {
    id: "derm_cancerFollowUp",
    domain: "derm",
    label:
      "Faites-vous un suivi dermatologique régulier (contrôle de grains de beauté, surveillance post-cancer, etc.) ?",
    type: "boolean",
  },
  {
    id: "derm_impactWork",
    domain: "derm",
    label:
      "Ce problème a-t-il un impact sur votre travail (douleurs, gênes, restrictions) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "derm_another_case",
    domain: "derm",
    label:
      "Avez-vous eu un autre problème dermatologique important (différent de celui-ci) ?",
    type: "boolean",
  },
];
const GYNECO_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "gyn_description",
    domain: "gyneco",
    label:
      "Pouvez-vous décrire en quelques mots ce problème gynécologique ?",
    helpText:
      "Exemples : kyste ovarien, fibrome, endométriose, frottis anormal, polype, trouble menstruel important, grossesse compliquée.",
    type: "textarea",
  },
  {
    id: "gyn_type",
    domain: "gyneco",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Kyste ovarien",
      "Fibrome utérin",
      "Endométriose",
      "Polype",
      "Frottis anormal / HPV",
      "Problème de cycle ou règles très douloureuses",
      "Grossesse compliquée (pré-éclampsie, prématurité…)",
      "Autre problème gynécologique",
      "Je ne sais pas",
    ],
  },
  {
    id: "gyn_firstYear",
    domain: "gyneco",
    label:
      "En quelle année ce problème gynécologique a-t-il commencé ou été diagnostiqué ?",
    type: "year",
  },
  {
    id: "gyn_lastEpisodeYear",
    domain: "gyneco",
    label:
      "En quelle année a eu lieu le dernier épisode important (crise douloureuse, évolution, anomalie au contrôle) ?",
    type: "year",
  },
  {
    id: "gyn_treatment",
    domain: "gyneco",
    label:
      "Avez-vous un traitement ou suivi régulier pour ce problème ?",
    helpText:
      "Exemples : hormones, pilule spécifique, traitement de l’endométriose, suivi échographique régulier.",
    type: "choice",
    options: [
      "Aucun traitement",
      "Traitement hormonal léger (pilule, patch…)",
      "Traitement hormonal spécifique (endométriose, fibromes…)",
      "Suivi régulier chez le gynécologue",
      "Chirurgie / intervention prévue",
      "Autre traitement",
    ],
  },
  {
    id: "gyn_surgery",
    domain: "gyneco",
    label:
      "Avez-vous déjà été opérée (ou une chirurgie est-elle prévue) pour ce problème ?",
    type: "boolean",
  },
  {
    id: "gyn_followup",
    domain: "gyneco",
    label:
      "Avez-vous un suivi gynécologique particulier (contrôles rapprochés, frottis de contrôle, surveillance d’un kyste ou fibrome) ?",
    type: "boolean",
  },
  {
    id: "gyn_frottis",
    domain: "gyneco",
    label:
      "Avez-vous déjà eu un frottis anormal (ASC-US, LSIL, HSIL, HPV positif, etc.) ?",
    helpText:
      "Important pour la souscription, car certains HPV nécessitent une surveillance régulière.",
    type: "boolean",
  },
  {
    id: "gyn_pregnancyComplication",
    domain: "gyneco",
    label:
      "Avez-vous déjà vécu une grossesse compliquée (pré-éclampsie, diabète gestationnel, hémorragie, prématurité) ?",
    type: "boolean",
  },
  {
    id: "gyn_impactWork",
    domain: "gyneco",
    label:
      "Ce problème a-t-il un impact sur votre travail ou votre énergie (fatigue, douleurs, absences) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "gyn_another_case",
    domain: "gyneco",
    label:
      "Avez-vous eu un autre problème gynécologique important (différent de celui-ci) ?",
    type: "boolean",
  },
];
const INFECTIOUS_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "inf_description",
    domain: "infectious",
    label:
      "Pouvez-vous décrire en quelques mots cette infection grave ou chronique ?",
    helpText:
      "Exemples : hépatite B ou C, VIH, tuberculose, autre infection chronique.",
    type: "textarea",
  },
  {
    id: "inf_type",
    domain: "infectious",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Hépatite B",
      "Hépatite C",
      "VIH",
      "Tuberculose",
      "Autre infection chronique / grave",
      "Je ne sais pas",
    ],
  },
  {
    id: "inf_firstYear",
    domain: "infectious",
    label:
      "En quelle année cette infection a-t-elle été diagnostiquée pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "inf_lastControlYear",
    domain: "infectious",
    label:
      "En quelle année avez-vous eu votre dernier contrôle important (prise de sang, examen de suivi) ?",
    helpText:
      "Si le suivi est très régulier, indiquez l'année du dernier contrôle dont vous vous souvenez.",
    type: "year",
  },
  {
    id: "inf_treatment",
    domain: "infectious",
    label:
      "Avez-vous ou avez-vous eu un traitement spécifique pour cette infection ?",
    type: "choice",
    options: [
      "Aucun traitement",
      "Traitement terminé (guérison ou charge virale indétectable)",
      "Traitement en cours",
      "Traitement prévu",
    ],
  },
  {
    id: "inf_status",
    domain: "infectious",
    label:
      "Quel est le statut actuel d'après votre médecin ?",
    type: "choice",
    options: [
      "Guéri(e) / infection résolue",
      "Stable / chronique sans aggravation",
      "Chronique avec complications",
      "Je ne sais pas",
    ],
  },
  {
    id: "inf_specialistFollowup",
    domain: "infectious",
    label:
      "Êtes-vous suivi(e) régulièrement par un spécialiste (infectiologue, hépatologue, etc.) ?",
    type: "boolean",
  },
  {
    id: "inf_hospital",
    domain: "infectious",
    label:
      "Avez-vous déjà été hospitalisé(e) pour cette infection (complication, poussée, rechute) ?",
    type: "boolean",
  },
  {
    id: "inf_impactWork",
    domain: "infectious",
    label:
      "Cette infection a-t-elle un impact sur votre travail ou votre énergie (fatigue, absences, limitations) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "inf_another_case",
    domain: "infectious",
    label:
      "Avez-vous eu une autre infection grave ou chronique (différente de celle-ci) ?",
    type: "boolean",
  },
];
const ORL_OPH_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "orl_description",
    domain: "orl_oph",
    label:
      "Pouvez-vous décrire en quelques mots ce problème au niveau des oreilles, du nez, de la gorge ou des yeux ?",
    helpText:
      "Exemples : surdité partielle, acouphènes, otites chroniques, sinusites chroniques, glaucome, chirurgie des yeux.",
    type: "textarea",
  },
  {
    id: "orl_type",
    domain: "orl_oph",
    label: "S'agit-il plutôt de :",
    type: "choice",
    options: [
      "Problème d'audition (surdité, appareil auditif, acouphènes)",
      "Problème des oreilles (otites, perforation, autre)",
      "Problème du nez / sinus (sinusites chroniques, polypes, etc.)",
      "Problème des yeux (glaucome, chirurgie, autre atteinte)",
      "Autre problème ORL / ophtalmo",
      "Je ne sais pas",
    ],
  },
  {
    id: "orl_firstYear",
    domain: "orl_oph",
    label:
      "En quelle année ce problème ORL / ophtalmo a-t-il commencé ou été diagnostiqué pour la première fois (environ) ?",
    type: "year",
  },
  {
    id: "orl_lastEpisodeYear",
    domain: "orl_oph",
    label:
      "En quelle année a eu lieu le dernier épisode important (crise, aggravation, intervention) ?",
    type: "year",
  },
  {
    id: "orl_treatment",
    domain: "orl_oph",
    label:
      "Avez-vous un traitement ou un dispositif régulier pour ce problème ?",
    helpText:
      "Exemples : appareil auditif, collyres pour glaucome, traitement nasal, autre traitement régulier.",
    type: "choice",
    options: [
      "Aucun traitement ou dispositif régulier",
      "Traitement au besoin uniquement",
      "Traitement quotidien / de fond",
      "Appareil auditif",
      "Autre traitement",
    ],
  },
  {
    id: "orl_surgery",
    domain: "orl_oph",
    label:
      "Avez-vous déjà été opéré(e) au niveau des oreilles, du nez, de la gorge ou des yeux pour ce problème ?",
    type: "boolean",
  },
  {
    id: "orl_hearingImpact",
    domain: "orl_oph",
    label:
      "Ce problème a-t-il un impact sur votre audition (difficulté à entendre, besoin d'appareil auditif) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, léger",
      "Oui, important",
    ],
  },
  {
    id: "orl_visionImpact",
    domain: "orl_oph",
    label:
      "Ce problème a-t-il un impact sur votre vision (champ visuel, acuité, sensibilité à la lumière, etc.) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, léger",
      "Oui, important",
    ],
  },
  {
    id: "orl_driving",
    domain: "orl_oph",
    label:
      "Ce problème a-t-il une influence sur votre capacité à conduire (avis du médecin, restrictions, retrait de permis) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, avec quelques restrictions",
      "Oui, retrait ou suspension du permis",
    ],
  },
  {
    id: "orl_impactWork",
    domain: "orl_oph",
    label:
      "Ce problème a-t-il un impact sur votre travail (communication, bruit, vision, etc.) ?",
    type: "choice",
    options: [
      "Non",
      "Oui, légèrement",
      "Oui, de manière importante",
    ],
  },
  {
    id: "orl_another_case",
    domain: "orl_oph",
    label:
      "Avez-vous eu un autre problème ORL ou ophtalmologique important (différent de celui-ci) ?",
    type: "boolean",
  },
];
const LIFESTYLE_FLOW: HealthQuestionDescriptor[] = [
  {
    id: "life_description",
    domain: "lifestyle",
    label:
      "Souhaitez-vous décrire en quelques mots des habitudes de vie particulières importantes à mentionner ?",
    helpText:
      "Exemples : tabac, vapotage, travail de nuit, activité physique intense ou très sédentaire, autres habitudes significatives.",
    type: "textarea",
  },
  {
    id: "life_smoking_status",
    domain: "lifestyle",
    label: "Fumez-vous ou avez-vous déjà fumé régulièrement ?",
    type: "choice",
    options: [
      "Jamais fumé régulièrement",
      "Ancien fumeur",
      "Fumeur actuel",
      "Vapotage uniquement",
    ],
  },
  {
    id: "life_smoking_cigs_per_day",
    domain: "lifestyle",
    label:
      "Si vous fumez ou avez fumé, combien de cigarettes ou équivalent par jour en moyenne ?",
    helpText: "Indiquez un ordre de grandeur, même approximatif.",
    type: "number",
  },
  {
    id: "life_smoking_sinceYear",
    domain: "lifestyle",
    label:
      "Depuis quelle année fumez-vous (ou fumiez-vous) régulièrement (environ) ?",
    type: "year",
  },
  {
    id: "life_smoking_quitYear",
    domain: "lifestyle",
    label:
      "Si vous avez arrêté, en quelle année environ avez-vous arrêté de fumer ?",
    helpText: "Si vous n'avez pas arrêté, laissez vide ou indiquez l’année actuelle.",
    type: "year",
  },
  {
    id: "life_other_substances",
    domain: "lifestyle",
    label:
      "Consommez-vous d'autres substances ou produits particuliers (par ex. cannabis, produits dopants, etc.) ?",
    type: "boolean",
  },
  {
    id: "life_other_substances_details",
    domain: "lifestyle",
    label:
      "Si oui, pouvez-vous préciser de quoi il s'agit et la fréquence approximative ?",
    type: "textarea",
  },
  {
    id: "life_activity_level",
    domain: "lifestyle",
    label:
      "Comment décririez-vous votre niveau d'activité physique habituel (hors sport à risques) ?",
    type: "choice",
    options: [
      "Plutôt sédentaire",
      "Actif / marche régulière",
      "Sport 1–2 fois par semaine",
      "Sport 3 fois par semaine ou plus",
    ],
  },
  {
    id: "life_night_work",
    domain: "lifestyle",
    label:
      "Travaillez-vous régulièrement de nuit ou avec des horaires très irréguliers ?",
    type: "boolean",
  },
  {
    id: "life_weight_change",
    domain: "lifestyle",
    label:
      "Avez-vous eu une variation importante de poids (perte ou prise) ces 3 dernières années ?",
    type: "boolean",
  },
  {
    id: "life_weight_change_details",
    domain: "lifestyle",
    label:
      "Si oui, pouvez-vous préciser approximativement de combien de kilos et sur quelle période ?",
    type: "textarea",
  },
  {
    id: "life_another_case",
    domain: "lifestyle",
    label:
      "Avez-vous d'autres habitudes de vie importantes que vous souhaitez mentionner ?",
    type: "boolean",
  },
];

/* =========================================================
 * 2. MOTEUR — RÉCUPÉRER LA QUESTION COURANTE
 * =======================================================*/

/**
 * Retourne la définition de la question courante.
 */
export function getCurrentQuestion(
  state: HealthEngineState
): HealthQuestionDescriptor | null {
  if (!state.currentQuestionId) return null;

  // Screening ?
  const screening = Object.values(SCREENING_QUESTIONS).find(
    (q) => q.id === state.currentQuestionId
  );
  if (screening) return screening;

// Flows par domaine
const domain = state.currentDomain;
if (!domain) return null;

const flow = getFlowForDomain(domain);

return flow.find((q) => q.id === state.currentQuestionId) || null;
}

/* =========================================================
 * 3. MOTEUR — AVANCER DANS LE QUESTIONNAIRE
 * =======================================================*/

/**
 * Applique une réponse à la question courante et calcule l'état suivant.
 * Pour l'instant, on met à jour seulement :
 * - le screening (Oui/Non)
 * - la navigation dans les mini-flows
 *
 * Le remplissage détaillé des HealthCase (diagnosis, etc.)
 * se fera ensuite (et/ou avec l'IA).
 */
export function applyAnswerAndGetNextState(
  state: HealthEngineState,
  answer: HealthAnswerValue
): HealthEngineState {
  const question = getCurrentQuestion(state);
  if (!question) return state;

  let nextState: HealthEngineState = {
    ...state,
    questionnaire: {
      ...state.questionnaire,
      updatedAt: Date.now(),
    },
  };

  // 🔹 Enregistrer la réponse dans le journal des réponses
  const raw = toRawString(answer);
  const now = Date.now();

  const newAnswer: HealthAnswer = {
    id: `ans_${now}_${Math.random().toString(36).slice(2, 8)}`,
    questionId: question.id,
    questionLabel: question.label,
    category: getAnswerCategory(question),
    rawAnswer: raw,
    normalized: answer as any,
    linkedCaseId: state.currentCaseId,
    linkedRiskSportId: null,
    createdAt: now,
  };

  const prevAnswers = nextState.questionnaire.answers ?? [];
  let updatedCases = nextState.questionnaire.cases ?? [];

  // 🔹 Si on est dans un cas en cours, mettre à jour le case (rawNotes + facts Ostéo)
  if (state.currentCaseId) {
    updatedCases = updatedCases.map((c) => {
      if (c.id !== state.currentCaseId) return c;

      let updated = { ...c, rawNotes: [...(c.rawNotes ?? [])] };

      // Ajouter la réponse brute dans les notes
      if (raw) {
        updated.rawNotes.push(raw);
      }

      // 🦴 Logique métier Ostéo (V1)
      if (state.currentDomain === "osteo") {
        const qid = question.id;

        // 1) Description → diagnosis + title
        if (qid === "osteo_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw, // pour toi souscripteur
          };
          // titre court pour les collaborateurs
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Année de début → startDate (simplement l'année pour l'instant)
        if (qid === "osteo_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 3) Statut actuel → ongoing + sequelae (texte)
        if (qid === "osteo_status" && typeof raw === "string") {
          const txt = raw;
          const isRecovered = txt.startsWith("Guéri");
          updated.facts = {
            ...updated.facts,
            ongoing: !isRecovered,
            sequelae: txt,
          };
        }
      }

            // ❤️ Logique métier Cardio (V1)
      if (state.currentDomain === "cardio") {
        const qid = question.id;

        // Description → diagnosis + title
        if (qid === "cardio_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // Type de problème (HTA, infarctus, palpitations, autre)
        if (qid === "cardio_diagnosis_type" && typeof raw === "string") {
          // On enrichit le diagnosis avec ce label
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag
              ? `${prevDiag} — ${raw}`
              : raw,
          };
        }

        // Année de diagnostic
        if (qid === "cardio_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // Traitement actuel → treatments (texte)
        if (qid === "cardio_medication" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // Statut actuel → ongoing + sequelae (ici sequelae = ressenti)
        if (qid === "cardio_status" && typeof raw === "string") {
          const txt = raw;
          const isWellControlled =
            txt.startsWith("Bien contrôlé") ||
            txt.includes("pas de gêne");
          updated.facts = {
            ...updated.facts,
            ongoing: !isWellControlled,
            sequelae: txt,
          };
        }

        // Impact travail → on concatène dans sequelae
        if (qid === "cardio_impactWork" && typeof raw === "string") {
          const prevSeq = updated.facts.sequelae || "";
          const extra = `Impact travail: ${raw}`;
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }

      // 🧠 Logique métier Psy (V1)
      if (state.currentDomain === "psy") {
        const qid = question.id;

        // Description → diagnosis + title
        if (qid === "psy_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // Type de trouble (dépression, burn-out, anxiété…)
        if (qid === "psy_diagnosis_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag
              ? `${prevDiag} — ${raw}`
              : raw,
          };
        }

        // Année du premier épisode
        if (qid === "psy_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // Durée max de l'arrêt de travail → workStopMonths approximatif
        if (qid === "psy_longestWorkStop" && typeof raw === "string") {
          let months: number | undefined = undefined;
          if (raw === "Moins de 2 semaines" || raw === "Aucun arrêt") {
            months = 0;
          } else if (raw === "2 à 6 semaines") {
            months = 1;
          } else if (raw === "2–3 mois") {
            months = 3;
          } else if (raw === "Plus de 3 mois") {
            months = 4; // on note juste ">= 4" comme signal
          }

          updated.facts = {
            ...updated.facts,
            workStopMonths: months,
          };
        }

        // Statut actuel
        if (qid === "psy_currentStatus" && typeof raw === "string") {
          const txt = raw;
          const isRecovered = txt.startsWith("Totalement rétabli");
          updated.facts = {
            ...updated.facts,
            ongoing: !isRecovered,
            sequelae: txt,
          };
        }

        // Impact travail
        if (qid === "psy_impactWork" && typeof raw === "string") {
          const prevSeq = updated.facts.sequelae || "";
          const extra = `Impact travail: ${raw}`;
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }

            // 🎗️ Logique métier Onco (V1)
      if (state.currentDomain === "onco") {
        const qid = question.id;

        // 1) Description = diagnostic + titre
        if (qid === "onco_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Localisation = enrichir diagnosis
        if (qid === "onco_location" && typeof raw === "string") {
          const prev = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prev ? `${prev} — ${raw}` : raw,
          };
        }

        // 3) Année du diagnostic
        if (qid === "onco_firstYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Traitement principal
        if (qid === "onco_treatment_primary" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 5) Dernière année de traitement → finDate
        if (qid === "onco_treatment_lastYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 6) Statut actuel
        if (qid === "onco_status" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            ongoing: !raw.includes("Rémission complète"),
            sequelae: raw,
          };
        }

        // 7) Récidive
        if (qid === "onco_recidive") {
          const yes = answer === true || answer === "Oui";
          updated.facts = {
            ...updated.facts,
            sequelae: updated.facts.sequelae
              ? `${updated.facts.sequelae} | Récidive: ${yes ? "Oui" : "Non"}`
              : `Récidive: ${yes ? "Oui" : "Non"}`,
          };
        }

        // 8) Impact travail
        if (qid === "onco_impactWork" && typeof raw === "string") {
          const prev = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prev
              ? `${prev} | Impact travail: ${raw}`
              : `Impact travail: ${raw}`,
          };
        }
      }

            // 🧪 Logique métier Endocrine / Métabolique (V1)
      if (state.currentDomain === "endocrine") {
        const qid = question.id;

        // Description libre → diagnosis + title
        if (qid === "endocrine_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // Type (diabète, thyroïde, obésité, autre) → enrichit diagnosis
        if (qid === "endocrine_type" && typeof raw === "string") {
          const prev = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prev ? `${prev} — ${raw}` : raw,
          };
        }

        // Année du diagnostic
        if (qid === "endocrine_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // Type de traitement → treatments
        if (qid === "endocrine_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // Contrôle actuel → ongoing + partie de sequelae
        if (qid === "endocrine_control" && typeof raw === "string") {
          const txt = raw;
          const isWellControlled = txt.startsWith("Oui, bien contrôlé");
          updated.facts = {
            ...updated.facts,
            ongoing: !isWellControlled,
            sequelae: txt,
          };
        }

        // Complications → enrichit sequelae
        if (qid === "endocrine_complications") {
          const yes = answer === true || answer === "Oui";
          const extra = `Complications: ${yes ? "Oui" : "Non"}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // Impact travail → enrichit sequelae
        if (qid === "endocrine_impactWork" && typeof raw === "string") {
          const extra = `Impact travail: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }
            // 🌬️ Logique métier Respiratoire (V1)
      if (state.currentDomain === "respiratory") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "resp_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type (asthme, apnée, BPCO…) → enrichit diagnosis
        if (qid === "resp_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année du diagnostic → startDate
        if (qid === "resp_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Traitement (inhalateur, CPAP…) → treatments
        if (qid === "resp_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 5) Fréquence des symptômes → sequelae / ongoing
        if (qid === "resp_crisisFrequency" && typeof raw === "string") {
          const txt = raw;
          const frequent =
            txt.startsWith("Plusieurs fois par semaine") ||
            txt.startsWith("Quasi tous les jours");
          const prevSeq = updated.facts.sequelae || "";
          const extra = `Fréquence: ${txt}`;
          updated.facts = {
            ...updated.facts,
            ongoing: frequent,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 6) Hospitalisation / urgences → hospitalizations/sequelae
        if (qid === "resp_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation/urgences: ${yes ? "Oui" : "Non"}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevSeq
              ? `${prevSeq} | ${extra}`
              : extra,
          };
        }

        // 7) Contexte tabac → sequelae
        if (qid === "resp_smokerContext" && typeof raw === "string") {
          const extra = `Tabac (contexte resp.): ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 8) Impact travail → sequelae
        if (qid === "resp_impactWork" && typeof raw === "string") {
          const extra = `Impact travail: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }
            // 🧠 Logique métier Neuro (V1)
      if (state.currentDomain === "neuro") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "neuro_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type de problème (migraine, épilepsie, AVC, autre) → enrichit diagnosis
        if (qid === "neuro_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année de début → startDate
        if (qid === "neuro_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Année du dernier évènement → endDate / lastEvent
        if (qid === "neuro_lastEventYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement régulier → treatments
        if (qid === "neuro_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Hospitalisation / urgences
        if (qid === "neuro_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation/urgences neuro: ${
            yes ? "Oui" : "Non"
          }`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        // 7) Séquelles actuelles (oui/non)
        if (qid === "neuro_sequelae") {
          const yes = answer === true || answer === "Oui";
          const extra = `Séquelles neurologiques actuelles: ${
            yes ? "Oui" : "Non"
          }`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: yes || updated.facts.ongoing,
          };
        }

        // 8) Capacité à conduire
        if (qid === "neuro_driving" && typeof raw === "string") {
          const extra = `Conduite: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 9) Impact travail
        if (qid === "neuro_impactWork" && typeof raw === "string") {
          const extra = `Impact travail: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }
            // 🥴 Logique métier Digestif (V1)
      if (state.currentDomain === "digestive") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "dig_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type de problème (RGO, Crohn, foie…) → enrichit diagnosis
        if (qid === "dig_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année de début → startDate
        if (qid === "dig_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Dernier épisode important → endDate
        if (qid === "dig_lastFlareYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement régulier → treatments
        if (qid === "dig_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Hospitalisation / chirurgie → hospitalizations + sequelae
        if (qid === "dig_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation digestif: ${yes ? "Oui" : "Non"}`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        if (qid === "dig_surgery") {
          const yes = answer === true || answer === "Oui";
          const extra = `Chirurgie digestive: ${yes ? "Oui" : "Non"}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 7) Impact travail → sequelae + ongoing si important
        if (qid === "dig_impactWork" && typeof raw === "string") {
          const extra = `Impact travail: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          const important = raw.startsWith("Oui, de manière importante");
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 💧 Logique métier Rénal / Urinaire (V1)
      if (state.currentDomain === "renal") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "renal_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type (calculs, infections, insuffisance…) → enrichit diagnosis
        if (qid === "renal_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année de début → startDate
        if (qid === "renal_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Dernier épisode important → endDate
        if (qid === "renal_lastEpisodeYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement / suivi → treatments
        if (qid === "renal_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Hospitalisation / chirurgie → hospitalizations
        if (qid === "renal_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation rénale/urinaire: ${
            yes ? "Oui" : "Non"
          }`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        // 7) Fonction rénale → ongoing + sequelae
        if (qid === "renal_function" && typeof raw === "string") {
          const txt = raw;
          const reduced =
            txt.startsWith("Fonction légèrement réduite") ||
            txt.startsWith("Fonction fortement réduite");
          const prevSeq = updated.facts.sequelae || "";
          const extra = `Fonction rénale: ${txt}`;
          updated.facts = {
            ...updated.facts,
            ongoing: reduced || updated.facts.ongoing,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 8) Impact travail → sequelae + ongoing si important
        if (qid === "renal_impactWork" && typeof raw === "string") {
          const txt = raw;
          const important = txt.startsWith("Oui, de manière importante");
          const extra = `Impact travail: ${txt}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 🧴 Logique métier Dermatologie (V1)
      if (state.currentDomain === "derm") {
        const qid = question.id;

        // 1) Description → diagnosis + title
        if (qid === "derm_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type de problème → enrichit diagnosis
        if (qid === "derm_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année du début → startDate
        if (qid === "derm_firstYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Dernier épisode important → endDate
        if (qid === "derm_lastEpisodeYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement → treatments
        if (qid === "derm_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Surface atteinte → sequelae
        if (qid === "derm_surface" && typeof raw === "string") {
          const extra = `Surface atteinte: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 7) Hospitalisation / chirurgie
        if (qid === "derm_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation dermato: ${yes ? "Oui" : "Non"}`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        // 8) Suivi régulier → sequelae
        if (qid === "derm_cancerFollowUp") {
          const yes = answer === true || answer === "Oui";
          const extra = `Suivi dermato régulier: ${yes ? "Oui" : "Non"}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 9) Impact travail → sequelae + ongoing si important
        if (qid === "derm_impactWork" && typeof raw === "string") {
          const extra = `Impact travail: ${raw}`;
          const important = raw.startsWith("Oui, de manière importante");
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 🌸 Logique métier Gynécologie (V1)
      if (state.currentDomain === "gyneco") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "gyn_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type de problème → enrichit diagnosis
        if (qid === "gyn_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année du début
        if (qid === "gyn_firstYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = { ...updated.facts, startDate: String(year) };
          }
        }

        // 4) Année dernier épisode / aggravation
        if (qid === "gyn_lastEpisodeYear") {
          const year = Number.parseInt(String(answer), 10);
          if (year > 1900 && year < 2100) {
            updated.facts = { ...updated.facts, endDate: String(year) };
          }
        }

        // 5) Traitement / suivi → treatments
        if (qid === "gyn_treatment" && typeof raw === "string") {
          updated.facts = { ...updated.facts, treatments: raw };
        }

        // 6) Chirurgie → hospitalizations
        if (qid === "gyn_surgery") {
          const yes = answer === true || answer === "Oui";
          const extra = `Chirurgie gynéco: ${yes ? "Oui" : "Non"}`;
          const prev = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prev ? `${prev} | ${extra}` : extra,
          };
        }

        // 7) Suivi gynécologique → sequelae
        if (qid === "gyn_followup") {
          const yes = answer === true || answer === "Oui";
          const extra = `Suivi gynécologique régulier: ${
            yes ? "Oui" : "Non"
          }`;
          const prev = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prev ? `${prev} | ${extra}` : extra,
          };
        }

        // 8) Frottis anormal → sequelae + ongoing éventuel
        if (qid === "gyn_frottis") {
          const yes = answer === true || answer === "Oui";
          const extra = `Frottis anormal / HPV: ${yes ? "Oui" : "Non"}`;
          const prev = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prev ? `${prev} | ${extra}` : extra,
            ongoing: yes || updated.facts.ongoing,
          };
        }

        // 9) Grossesse compliquée
        if (qid === "gyn_pregnancyComplication") {
          const yes = answer === true || answer === "Oui";
          const extra = `Grossesse compliquée: ${yes ? "Oui" : "Non"}`;
          const prev = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prev ? `${prev} | ${extra}` : extra,
          };
        }

        // 10) Impact travail
        if (qid === "gyn_impactWork" && typeof raw === "string") {
          const important = raw.startsWith("Oui, de manière importante");
          const extra = `Impact travail: ${raw}`;
          const prev = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prev ? `${prev} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 🦠 Logique métier Infectious (V1)
      if (state.currentDomain === "infectious") {
        const qid = question.id;

        // 1) Description libre → diagnosis + title
        if (qid === "inf_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type (hépatite, VIH, TBC…) → enrichit diagnosis
        if (qid === "inf_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année du diagnostic → startDate
        if (qid === "inf_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Dernier contrôle important → endDate
        if (qid === "inf_lastControlYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement → treatments
        if (qid === "inf_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Statut actuel → ongoing + sequelae
        if (qid === "inf_status" && typeof raw === "string") {
          const txt = raw;
          const chronicOrComplicated =
            txt.startsWith("Chronique") ||
            txt.includes("complications");
          updated.facts = {
            ...updated.facts,
            ongoing: chronicOrComplicated || updated.facts.ongoing,
            sequelae: txt,
          };
        }

        // 7) Suivi spécialiste → sequelae
        if (qid === "inf_specialistFollowup") {
          const yes = answer === true || answer === "Oui";
          const extra = `Suivi spécialiste: ${yes ? "Oui" : "Non"}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 8) Hospitalisation → hospitalizations
        if (qid === "inf_hospital") {
          const yes = answer === true || answer === "Oui";
          const extra = `Hospitalisation infection: ${yes ? "Oui" : "Non"}`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        // 9) Impact travail → sequelae + ongoing si important
        if (qid === "inf_impactWork" && typeof raw === "string") {
          const txt = raw;
          const important = txt.startsWith("Oui, de manière importante");
          const extra = `Impact travail: ${txt}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 👂👁️ Logique métier ORL / Ophtalmo (V1)
      if (state.currentDomain === "orl_oph") {
        const qid = question.id;

        // 1) Description → diagnosis + title
        if (qid === "orl_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw,
          };
          updated.title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
        }

        // 2) Type de problème → enrichit diagnosis
        if (qid === "orl_type" && typeof raw === "string") {
          const prevDiag = updated.facts.diagnosis || "";
          updated.facts = {
            ...updated.facts,
            diagnosis: prevDiag ? `${prevDiag} — ${raw}` : raw,
          };
        }

        // 3) Année de début → startDate
        if (qid === "orl_firstYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              startDate: String(year),
            };
          }
        }

        // 4) Année du dernier épisode → endDate
        if (qid === "orl_lastEpisodeYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            updated.facts = {
              ...updated.facts,
              endDate: String(year),
            };
          }
        }

        // 5) Traitement / dispositif → treatments
        if (qid === "orl_treatment" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            treatments: raw,
          };
        }

        // 6) Chirurgie ORL / ophtalmo → hospitalizations
        if (qid === "orl_surgery") {
          const yes = answer === true || answer === "Oui";
          const extra = `Chirurgie ORL/Ophtalmo: ${yes ? "Oui" : "Non"}`;
          const prevHosp = updated.facts.hospitalizations || "";
          updated.facts = {
            ...updated.facts,
            hospitalizations: prevHosp
              ? `${prevHosp} | ${extra}`
              : extra,
          };
        }

        // 7) Impact audition
        if (qid === "orl_hearingImpact" && typeof raw === "string") {
          const extra = `Impact audition: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 8) Impact vision
        if (qid === "orl_visionImpact" && typeof raw === "string") {
          const extra = `Impact vision: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 9) Conduite
        if (qid === "orl_driving" && typeof raw === "string") {
          const extra = `Conduite: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 10) Impact travail → sequelae + ongoing si important
        if (qid === "orl_impactWork" && typeof raw === "string") {
          const txt = raw;
          const important = txt.startsWith("Oui, de manière importante");
          const extra = `Impact travail: ${txt}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            ongoing: important || updated.facts.ongoing,
          };
        }
      }
            // 🧬 Logique métier Lifestyle (V1)
      if (state.currentDomain === "lifestyle") {
        const qid = question.id;

        // 1) Description générale → diagnosis + title
        if (qid === "life_description" && typeof raw === "string") {
          updated.facts = {
            ...updated.facts,
            diagnosis: raw || "Habitudes de vie particulières",
          };
          updated.title = raw
            ? raw.slice(0, 80) + (raw.length > 80 ? "…" : "")
            : "Habitudes de vie";
        }

        // 2) Statut tabac
        if (qid === "life_smoking_status" && typeof raw === "string") {
          const extra = `Tabac / vape: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          const isCurrentSmoker =
            raw === "Fumeur actuel" || raw === "Vapotage uniquement";
          updated.facts = {
            ...updated.facts,
            ongoing: isCurrentSmoker || updated.facts.ongoing,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 3) Quantité tabac
        if (qid === "life_smoking_cigs_per_day") {
          const n =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(n) && n > 0) {
            const extra = `Consommation tabac (équivalent): ~${n} / jour`;
            const prevSeq = updated.facts.sequelae || "";
            updated.facts = {
              ...updated.facts,
              sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            };
          }
        }

        // 4) Année début tabac
        if (qid === "life_smoking_sinceYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            const extra = `Tabac/vape depuis: ${year}`;
            const prevSeq = updated.facts.sequelae || "";
            updated.facts = {
              ...updated.facts,
              sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            };
          }
        }

        // 5) Année arrêt tabac
        if (qid === "life_smoking_quitYear") {
          const year =
            typeof answer === "number"
              ? answer
              : Number.parseInt(String(answer), 10);
          if (Number.isFinite(year) && year > 1900 && year < 2100) {
            const extra = `Arrêt tabac/vape: ${year}`;
            const prevSeq = updated.facts.sequelae || "";
            updated.facts = {
              ...updated.facts,
              ongoing: false && updated.facts.ongoing, // on peut marquer comme non actuel dans l'IA plus tard
              sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
            };
          }
        }

        // 6) Autres substances
        if (qid === "life_other_substances") {
          const yes = answer === true || answer === "Oui";
          const extra = `Autres substances particulières: ${
            yes ? "Oui" : "Non"
          }`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        if (
          qid === "life_other_substances_details" &&
          typeof raw === "string" &&
          raw.trim()
        ) {
          const extra = `Détails autres substances: ${raw.trim()}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 7) Niveau d'activité
        if (qid === "life_activity_level" && typeof raw === "string") {
          const extra = `Activité physique: ${raw}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 8) Travail de nuit
        if (qid === "life_night_work") {
          const yes = answer === true || answer === "Oui";
          const extra = `Travail de nuit / horaires irréguliers: ${
            yes ? "Oui" : "Non"
          }`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        // 9) Variation de poids
        if (qid === "life_weight_change") {
          const yes = answer === true || answer === "Oui";
          const extra = `Variation de poids significative (3 dernières années): ${
            yes ? "Oui" : "Non"
          }`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }

        if (
          qid === "life_weight_change_details" &&
          typeof raw === "string" &&
          raw.trim()
        ) {
          const extra = `Détails variation de poids: ${raw.trim()}`;
          const prevSeq = updated.facts.sequelae || "";
          updated.facts = {
            ...updated.facts,
            sequelae: prevSeq ? `${prevSeq} | ${extra}` : extra,
          };
        }
      }

      return updated;
    });
  }

  nextState.questionnaire = {
    ...nextState.questionnaire,
    answers: [...prevAnswers, newAnswer],
    cases: updatedCases,
    updatedAt: now,
  };

  // 1) Si c'est une question de screening
  if (question.domain === "screening") {
    const domain = mapScreeningIdToDomain(question.id);
    if (domain) {
      const yes = answer === true || answer === "true" || answer === "Oui";
      nextState.screening = {
        ...nextState.screening,
        [domain]: yes ? "yes" : "no",
      };

      if (yes) {
        // On ouvre un premier cas pour ce domaine
        const caseId = createCaseId(domain);

        const newCase: HealthCase = {
          id: caseId,
          category: mapDomainToCategory(domain),
          title: "", // on pourra mettre un titre généré plus tard (ex: "Problème ostéo #1")
          facts: {
            diagnosis: "",
            startDate: "",
            endDate: null,
            ongoing: true,
            treatments: "",
            hospitalizations: "",
            workStopMonths: undefined,
            sequelae: "",
            doctorOrClinic: "",
          },
          rawNotes: [],
          summaries: {},
        };

        nextState.currentDomain = domain;
        nextState.currentCaseId = caseId;
        nextState.currentQuestionId = getFirstQuestionIdForDomain(domain);
        nextState.questionnaire = {
          ...nextState.questionnaire,
          cases: [
            ...(nextState.questionnaire.cases ?? []),
            newCase,
          ],
        };

        return nextState;
      } else {
        // Passer au prochain domaine de screening
        const nextDomain = getNextDomainAfter(domain, nextState);
        if (nextDomain) {
          nextState.currentDomain = null;
          nextState.currentCaseId = null;
          nextState.currentQuestionId =
            SCREENING_QUESTIONS[nextDomain].id;
        } else {
          // Plus de domaines -> fin du questionnaire (à affiner)
          nextState.currentQuestionId = null;
        }
        return nextState;
      }
    }
  }

  // 2) Sinon : question dans un flow de domaine
  if (state.currentDomain) {
    const domain = state.currentDomain;

    // 🔀 ROUTAGE DYNAMIQUE SPÉCIFIQUE À LIFESTYLE
    if (domain === "lifestyle") {
      const nextLifestyleId = getNextLifestyleQuestionId(
        question.id,
        answer,
        state
      );

      if (nextLifestyleId) {
        // Si on reste dans le même domaine → on avance à la question demandée
        if (nextLifestyleId !== "life_another_case") {
          nextState.currentQuestionId = nextLifestyleId;
          return nextState;
        }
        // Si on arrive sur life_another_case, on laisse la logique générique
        // gérer le cas (_another_case) ci-dessous.
      }
    }

    const flow = getFlowForDomain(domain);
    const index = flow.findIndex((q) => q.id === question.id);
    const isLast = index === flow.length - 1;

    if (isLast) {
      // On est sur la dernière question du flow (ex. "..._another_case")
      if (question.id.endsWith("_another_case")) {
        const yes =
          answer === true || answer === "true" || answer === "Oui";
        if (yes) {
          // Nouveau cas pour le même domaine
          const caseId = createCaseId(domain);

          const newCase: HealthCase = {
            id: caseId,
            category: mapDomainToCategory(domain),
            title: "",
            facts: {
              diagnosis: "",
              startDate: "",
              endDate: null,
              ongoing: true,
              treatments: "",
              hospitalizations: "",
              workStopMonths: undefined,
              sequelae: "",
              doctorOrClinic: "",
            },
            rawNotes: [],
            summaries: {},
          };

          nextState.currentCaseId = caseId;
          nextState.currentQuestionId = getFirstQuestionIdForDomain(domain);
          nextState.questionnaire = {
            ...nextState.questionnaire,
            cases: [
              ...(nextState.questionnaire.cases ?? []),
              newCase,
            ],
          };

          return nextState;
        } else {
          // Pas d'autre cas → on passe au domaine suivant
          const nextDomain = getNextDomainAfter(domain, nextState);
          if (nextDomain) {
            nextState.currentDomain = null;
            nextState.currentCaseId = null;
            nextState.currentQuestionId =
              SCREENING_QUESTIONS[nextDomain].id;
          } else {
            nextState.currentQuestionId = null;
          }
          return nextState;
        }
      } else {
        // Dernière question mais pas *_another_case -> domaine suivant
        const nextDomain = getNextDomainAfter(domain, nextState);
        if (nextDomain) {
          nextState.currentDomain = null;
          nextState.currentCaseId = null;
          nextState.currentQuestionId =
            SCREENING_QUESTIONS[nextDomain].id;
        } else {
          nextState.currentQuestionId = null;
        }
        return nextState;
      }
    } else {
      // Question intermédiaire du flow : passer à la suivante (fallback générique)
      const nextQuestion = flow[index + 1];
      if (nextQuestion) {
        nextState.currentQuestionId = nextQuestion.id;
        return nextState;
      }
    }
  }

  

  return nextState;
}



/* =========================================================
 * Helpers internes
 * =======================================================*/

function mapScreeningIdToDomain(questionId: string): HealthDomain | null {
  const entry = Object.entries(SCREENING_QUESTIONS).find(
    ([, q]) => q.id === questionId
  );
  return entry ? (entry[0] as HealthDomain) : null;
}

function getLastAnswerForQuestion(
  questionnaire: HealthQuestionnaire3e,
  questionId: string
): HealthAnswer | undefined {
  const answers = questionnaire.answers ?? [];
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].questionId === questionId) return answers[i];
  }
  return undefined;
}

/**
 * Router dynamique pour le domaine Lifestyle.
 * Retourne l'id de la prochaine question, ou null si on laisse le flow par défaut.
 */
function getNextLifestyleQuestionId(
  currentId: string,
  answer: HealthAnswerValue,
  state: HealthEngineState
): string | null {
  // On récupère, si dispo, la réponse à life_smoking_status
  const smokingStatusAnswer = getLastAnswerForQuestion(
    state.questionnaire,
    "life_smoking_status"
  );
  const smokingStatus = smokingStatusAnswer
    ? (smokingStatusAnswer.normalized as string | undefined)
    : undefined;

  // Normalisation simple pour les oui/non
  const isYes =
    answer === true ||
    answer === "true" ||
    answer === "Oui" ||
    answer === "oui";

  switch (currentId) {
    case "life_description":
      // Toujours enchaîner sur le tabac / vape
      return "life_smoking_status";

    case "life_smoking_status": {
      // Jamais fumé → on saute tout le bloc tabac et on va direct sur autres substances
      if (answer === "Jamais fumé régulièrement") {
        return "life_other_substances";
      }
      // Ancien fumeur, fumeur actuel ou vapotage uniquement → on demande la quantité
      return "life_smoking_cigs_per_day";
    }

    case "life_smoking_cigs_per_day":
      // Toujours demander depuis quand
      return "life_smoking_sinceYear";

    case "life_smoking_sinceYear": {
      // Ancien fumeur → on demande l'année d’arrêt
      if (smokingStatus === "Ancien fumeur") {
        return "life_smoking_quitYear";
      }
      // Fumeur actuel ou vape uniquement → on passe directement aux autres substances
      return "life_other_substances";
    }

    case "life_smoking_quitYear":
      // Après l'année d’arrêt → on passe aux autres substances
      return "life_other_substances";

    case "life_other_substances": {
      // Si Non → on saute les détails
      if (!isYes) {
        return "life_activity_level";
      }
      // Si Oui → on demande les détails
      return "life_other_substances_details";
    }

    case "life_other_substances_details":
      return "life_activity_level";

    case "life_activity_level":
      return "life_night_work";

    case "life_night_work":
      return "life_weight_change";

    case "life_weight_change": {
      // Si pas de variation de poids → on saute les détails
      if (!isYes) {
        return "life_another_case";
      }
      // Si Oui → on demande les détails
      return "life_weight_change_details";
    }

    case "life_weight_change_details":
      return "life_another_case";

    // life_another_case reste géré par la logique générique (_another_case)

    default:
      return null;
  }
}

function getDomainOrder(state: HealthEngineState): HealthDomain[] {
  const order: HealthDomain[] = [
    "osteo",
    "cardio",
    "psy",
    "onco",
    "endocrine",
    "respiratory",
    "neuro",
    "digestive",
    "renal",
    "derm",
  ];

  // Gynéco uniquement si Femme (Enter_sexe = 1)
  if (state.clientSex === 1) {
    order.push("gyneco");
  }

  // Infections graves / chroniques pour tout le monde
  order.push("infectious");
  // ORL / ophtalmo
  order.push("orl_oph");
  // Habitudes de vie
  order.push("lifestyle");

  // plus tard: "infectious", "orl_oph", "lifestyle", "sports_risk"
  return order;
}

function getNextDomainAfter(
  domain: HealthDomain,
  state: HealthEngineState
): HealthDomain | null {
  const order = getDomainOrder(state);
  const idx = order.indexOf(domain);
  if (idx === -1) return null;
  if (idx >= order.length - 1) return null;
  return order[idx + 1];
}

function getFirstQuestionIdForDomain(
  domain: HealthDomain
): string | null {
  const flow = getFlowForDomain(domain);
  return flow.length > 0 ? flow[0].id : null;
}

function getFlowForDomain(domain: HealthDomain): HealthQuestionDescriptor[] {
  switch (domain) {
    case "osteo":
      return OSTEO_FLOW;
    case "cardio":
      return CARDIO_FLOW;
    case "psy":
      return PSY_FLOW;
    case "onco":
      return ONCO_FLOW;
    case "endocrine":
      return ENDOCRINE_FLOW;
    case "respiratory":
      return RESPIRATORY_FLOW;
    case "neuro":
      return NEURO_FLOW;
    case "digestive":
      return DIGESTIVE_FLOW;
    case "renal":
      return RENAL_FLOW;
    case "derm":
      return DERM_FLOW;
    case "gyneco":
      return GYNECO_FLOW;
    case "infectious":
      return INFECTIOUS_FLOW;
    case "orl_oph":
      return ORL_OPH_FLOW;
    case "lifestyle":
      return LIFESTYLE_FLOW;
    default:
      return [];
  }
}