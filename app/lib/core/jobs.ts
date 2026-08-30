// app/lib/core/jobs.ts
//
// SOURCE UNIQUE des offres d'emploi publiées sur /careers.
//
// Pourquoi un fichier de données et pas Firestore ?
// -------------------------------------------------
// Une offre d'emploi est un contenu éditorial rare (quelques ouvertures par an),
// versionné avec le code et indexable par les moteurs de recherche. Le mettre ici
// donne du SSG gratuit, un typage strict, et évite un back-office d'édition dont
// personne n'a besoin aujourd'hui. Le jour où le rythme de publication le justifie,
// cette structure se transpose telle quelle dans une collection Firestore.
//
// ⚠️ Le CONTENU d'une annonce est rédigé dans la langue de travail du poste
// (`contentLocale`). Le poste « Spécialiste en prévoyance » à Sion exige le
// français : son annonce reste donc en français, même quand l'interface est en
// allemand. Le chrome de la page (boutons, étapes, libellés du formulaire) est,
// lui, traduit via le namespace i18n `Careers`.
//
// ⚠️ Les questions de pré-qualification (`screening`) sont la SOURCE UNIQUE :
// elles pilotent à la fois l'affichage du formulaire ET la validation serveur
// (`app/api/careers/apply/route.ts`). Ne jamais dupliquer la liste ailleurs.

export type ScreeningOption = {
  value: string;
  label: string;
  /** Cette réponse ferme la candidature (critère éliminatoire du poste). */
  disqualifying?: boolean;
  /**
   * Cette réponse impose une précision libre (ex. « Autre formation » → laquelle ?).
   * Exigée côté client ET revalidée côté serveur.
   */
  requiresPrecision?: boolean;
};

export type ScreeningQuestion = {
  id: string;
  label: string;
  help?: string;
  options: ScreeningOption[];
  /** Message affiché au candidat quand il coche une réponse éliminatoire. */
  rejectMessage?: string;
  /** Libellé du champ de précision, quand une option en réclame une. */
  precisionLabel?: string;
  precisionPlaceholder?: string;
};

export type JobDocumentSlot = {
  id: string;
  label: string;
  desc: string;
  required: boolean;
  /** Attribut `accept` de l'input + liste blanche vérifiée côté serveur. */
  accept: string;
  multiple?: boolean;
  maxFiles?: number;
};

export type JobSection = {
  title: string;
  /** Phrase d'introduction de la section, avant la liste. */
  lead?: string;
  items: string[];
};

export type Job = {
  slug: string;
  title: string;
  department: string;
  location: string;
  /** Modalité de travail, ex. « Sur site ». */
  workMode: string;
  workload: string;
  /** Modèle de rémunération, affiché dans « En bref ». */
  compensation: string;
  /** ISO (YYYY-MM-DD) — sert au tri et au balisage JSON-LD. */
  publishedAt: string;
  /** Langue de rédaction de l'annonce (le chrome reste traduit). */
  contentLocale: "fr" | "de";
  /** Accroche courte, affichée dans la liste et en méta description. */
  summary: string;
  /** Paragraphe d'introduction du détail. */
  intro: string;
  sections: JobSection[];
  /** Texte d'appel affiché juste au-dessus du formulaire de candidature. */
  closing: { paragraphs: string[]; note: string };
  screening: ScreeningQuestion[];
  documents: JobDocumentSlot[];
};

const CV_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const ANY_DOC_ACCEPT = `${CV_ACCEPT},${IMAGE_ACCEPT}`;

/** Extensions réellement acceptées par le serveur, toutes catégories confondues. */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "jpg", "jpeg", "png", "webp",
];

/** Limites d'upload (appliquées côté client ET revalidées côté serveur). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo par fichier
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 Mo par candidature
export const MAX_FILES = 10;

const SPECIALISTE_PREVOYANCE: Job = {
  slug: "specialiste-prevoyance-sion",
  title: "Spécialiste en prévoyance",
  department: "Gestion & Conseil",
  location: "Sion",
  workMode: "Sur site",
  workload: "100 %",
  compensation: "Lié à la performance",
  publishedAt: "2026-08-29",
  contentLocale: "fr",
  summary:
    "Développez et fidélisez un portefeuille de clientèle tout en accompagnant vos clientes et clients dans leurs besoins en prévoyance. Un poste destiné à un·e spécialiste expérimenté·e et autonome.",
  intro:
    "CreditX poursuit son développement et recherche un·e spécialiste en prévoyance expérimenté·e souhaitant exercer son activité avec une forte autonomie. Ce poste s'adresse à un profil commercial confirmé, disposant de résultats démontrables dans le domaine de la prévoyance et capable de développer sa propre clientèle.",
  sections: [
    {
      title: "Votre mission",
      lead: "Vous accompagnez une clientèle privée dans les domaines de la prévoyance, de la retraite, de la protection familiale et de la couverture des risques.",
      items: [
        "Analyser la situation de prévoyance des clients et établir des bilans complets.",
        "Proposer des solutions adaptées à la situation et aux objectifs de chaque client.",
        "Développer et fidéliser votre clientèle.",
        "Présenter l'application CreditX et accompagner les clients dans son utilisation.",
        "Collaborer avec le back-office et les spécialistes produits de CreditX.",
      ],
    },
    {
      title: "Ce que CreditX met à votre disposition",
      items: [
        "Des prestations sociales et des couvertures d'assurance supérieures aux standards usuels.",
        "Un environnement de travail moderne et de qualité, au cœur du quartier Cour de Gare à Sion.",
        "L'application CreditX et ses outils d'analyse et de simulation de dernière génération, conçus pour le travail du conseiller.",
        "Un CRM et une infrastructure administrative qui automatisent les tâches répétitives.",
      ],
    },
    {
      title: "Votre profil",
      items: [
        "Diplôme AFA exigé.",
        "Minimum cinq ans d'expérience dans le conseil en prévoyance.",
        "Résultats commerciaux élevés, réguliers et démontrables.",
        "Réseau personnel et professionnel directement mobilisable.",
        "Expérience confirmée dans l'acquisition et la fidélisation de clients.",
        "Excellente maîtrise du système suisse de prévoyance.",
        "Capacité à analyser des situations complexes et à formuler des recommandations claires.",
        "Sens élevé des responsabilités et de l'éthique professionnelle.",
        "Autonomie et rigueur dans l'organisation de votre activité.",
        "Maîtrise courante du français ; toute autre langue constitue un atout.",
        "Très bonne maîtrise des outils numériques.",
      ],
    },
  ],
  closing: {
    paragraphs: [
      "Vous disposez d’une solide expérience en prévoyance et de résultats démontrables ?",
      "Nous serions heureux d'échanger avec vous.",
    ],
    note: "Toutes les démarches seront traitées de manière strictement confidentielle.",
  },
  // ⚠️ Les 4 premières questions sont ÉLIMINATOIRES : ce sont les conditions
  // d'exercice exigées pour ce poste (honorabilité et qualification). La 5e est
  // informative — la formation générale est souhaitée, pas requise.
  screening: [
    {
      id: "casier",
      label: "Votre extrait de casier judiciaire est-il vierge ?",
      help: "L'activité d'intermédiaire en assurance suppose une honorabilité sans réserve.",
      rejectMessage:
        "Ce poste exige un extrait de casier judiciaire vierge. Nous ne pouvons malheureusement pas donner suite à votre candidature.",
      options: [
        { value: "oui", label: "Oui" },
        { value: "non", label: "Non", disqualifying: true },
      ],
    },
    {
      id: "poursuites",
      label: "Avez-vous fait l'objet de poursuites ou d'une faillite au cours des trois dernières années ?",
      help: "Un extrait du registre des poursuites vous sera demandé en cas d'engagement.",
      rejectMessage:
        "Ce poste exige l'absence de poursuites ou de faillite au cours des trois dernières années. Nous ne pouvons malheureusement pas donner suite à votre candidature.",
      options: [
        { value: "non", label: "Non" },
        { value: "oui", label: "Oui", disqualifying: true },
      ],
    },
    {
      id: "afa",
      label: "Êtes-vous titulaire du diplôme AFA ?",
      help: "Le diplôme AFA est exigé pour ce poste.",
      rejectMessage:
        "Le diplôme AFA est exigé pour ce poste. Nous ne pouvons malheureusement pas donner suite à votre candidature.",
      options: [
        { value: "oui", label: "Oui" },
        { value: "non", label: "Non", disqualifying: true },
      ],
    },
    {
      id: "experience",
      label: "Avez-vous au moins cinq ans d'expérience dans le conseil en prévoyance ?",
      rejectMessage:
        "Ce poste exige au minimum cinq ans d'expérience dans le conseil en prévoyance. Nous ne pouvons malheureusement pas donner suite à votre candidature.",
      options: [
        { value: "5_10", label: "Oui — 5 à 10 ans" },
        { value: "10_plus", label: "Oui — plus de 10 ans" },
        { value: "moins_5", label: "Non — moins de cinq ans", disqualifying: true },
      ],
    },
    {
      id: "formation",
      label: "Quelle est votre formation générale ?",
      help: "Un diplôme de commerce ou équivalent est souhaité, sans être une condition d'engagement.",
      precisionLabel: "Précisez votre formation",
      precisionPlaceholder: "Ex. CFC d'employé de commerce, brevet fédéral, maturité…",
      options: [
        { value: "master", label: "Master" },
        { value: "bachelor", label: "Bachelor" },
        { value: "commerce", label: "Diplôme de commerce ou équivalent" },
        { value: "autre", label: "Autre formation", requiresPrecision: true },
      ],
    },
  ],
  documents: [
    {
      id: "cv",
      label: "Curriculum vitae",
      desc: "PDF ou Word, 10 Mo maximum.",
      required: true,
      accept: CV_ACCEPT,
    },
    {
      id: "lettre",
      label: "Lettre de motivation",
      desc: "Dites-nous pourquoi la prévoyance, et pourquoi CreditX.",
      required: true,
      accept: CV_ACCEPT,
    },
    {
      id: "photo",
      label: "Photo",
      desc: "Facultatif. JPG ou PNG.",
      required: false,
      accept: IMAGE_ACCEPT,
    },
    {
      id: "autres",
      label: "Autres documents",
      desc: "Facultatif. Diplôme AFA, certificats de travail, références.",
      required: false,
      accept: ANY_DOC_ACCEPT,
      multiple: true,
      maxFiles: 6,
    },
  ],
};

/** Toutes les offres ouvertes, de la plus récente à la plus ancienne. */
export const JOBS: Job[] = [SPECIALISTE_PREVOYANCE];

export function getJob(slug: string): Job | undefined {
  return JOBS.find((j) => j.slug === slug);
}

/** L'option choisie exige-t-elle une précision libre ? */
export function optionRequiresPrecision(job: Job, questionId: string, value: string): boolean {
  const q = job.screening.find((s) => s.id === questionId);
  return !!q?.options.find((o) => o.value === value)?.requiresPrecision;
}

/**
 * Réponse lisible, précision comprise (e-mail, back-office).
 * Ex. « Autre formation — CFC d'employé de commerce ».
 */
export function describeAnswer(
  job: Job,
  questionId: string,
  value: string,
  precision?: string,
): string {
  const label = labelForAnswer(job, questionId, value);
  const detail = (precision ?? "").trim();
  return detail ? `${label} — ${detail}` : label;
}

/** Libellé lisible d'une réponse de pré-qualification (e-mail, back-office). */
export function labelForAnswer(job: Job, questionId: string, value: string): string {
  const q = job.screening.find((s) => s.id === questionId);
  return q?.options.find((o) => o.value === value)?.label ?? value;
}
