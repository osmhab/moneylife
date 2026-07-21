// app/profil/_client/form-wizard/sections.registry.ts

// NOTE: on évite les imports lourds (RHF / Zod) ici.
// On décrit uniquement la "carte" des sections et la logique d'apparition.

// ---- Form shape minimal (les champs utilisés par les 6 premières sections)
export type MinimalForm = {
  Enter_prenom?: string;
  Enter_nom?: string;
  Enter_dateNaissance?: string;
  Enter_sexe?: number;
  Enter_etatCivil?: number;
  Enter_mariageDuree?: number;

  // conjoint / partenaire (mariage / partenariat)
  Enter_spouseSexe?: number;
  Enter_spouseDateNaissance?: string;

  // concubinage
  Enter_menageCommun5Ans?: boolean;
  Enter_partenaireDesigneLPP?: boolean;

  Enter_hasEnfants?: boolean;

  Enter_enfants?: { Enter_dateNaissance: string }[];
  Enter_statutProfessionnel?: number;
  Enter_salaireAnnuel?: number;
  Enter_travaillePlusde8HSemaine?: boolean;

  // 👇 IJ + LPP basics
  Enter_ijMaladie?: boolean;
  Enter_ijMaladieTaux?: number;
  Enter_ijAccidentTaux?: number;
  Enter_Affilie_LPP?: boolean;

  Enter_lppScanMode?: "manual" | "scan";
  Enter_lppScanDone?: boolean;
  Enter_dateCertificatLPP?: string;
  Enter_typeSalaireAssure?: "general" | "split";
  Enter_salaireAssureLPP?: number;
  Enter_salaireAssureLPPRisque?: number;
  Enter_salaireAssureLPPEpargne?: number;

  // 👇 Rentes LPP (invalidité + décès)
  Enter_renteInvaliditeLPP?: number;
  Enter_renteEnfantInvaliditeLPP?: number;
  Enter_renteOrphelinLPP?: number;

  Enter_RenteConjointOuPartenaireLPP?: number; // 0 = conjoint, 1 = partenaire
  Enter_renteConjointLPP?: number;
  Enter_rentePartenaireLPP?: number;

  // 👇 Avoirs / Libre passage / Options
  Enter_avoirVieillesseObligatoire?: number;
  Enter_avoirVieillesseTotal?: number;
  Enter_librePassageObligatoire?: number;
  Enter_librePassageTotal?: number;

  Enter_prestationCapital65?: number;
  Enter_rachatPossible?: number;
  Enter_eplPossibleMax?: number;
  Enter_versementsAnticipesLogement?: number;
  Enter_miseEnGage?: boolean;

  // 👇 Capitaux décès (liste brute, comme ton repeater)
  DecesCapitaux?: {
    amount: number;
    plusRente: "oui" | "non" | "np";
    condition: "accident" | "maladie" | "les_deux" | "np";
  }[];

  // 👇 AVS / lacunes
  Enter_ageDebutCotisationsAVS?: number;
  Enter_anneeDebutCotisationAVS?: number;
  Enter_hasAnnesManquantesAVS?: boolean;
  Enter_anneesManquantesAVS?: number[];
};

// ---- Section Definition
export type SectionId =
  | "intro"
  | "prenom"
  | "nom"
  | "birthdate"
  | "sex"
  | "etat-civil"
  | "concubinage-menage"
  | "concubinage-partenaire-designe"
  | "mariage-duree"
  | "spouse-sex"
  | "spouse-birthdate"
  | "has-kids"
  | "kids-dates"
  | "statut-pro"
  | "salaire-annuel"
  | "travaille-8h"
  | "ij-maladie"
  | "ij-accident"
  | "affilie-lpp"
  | "scan-lpp"
  | "lpp-basics"
  | "lpp-split-risque"
  | "lpp-split-epargne"
  | "lpp-rentes-invalidite"
  | "lpp-rentes-deces"
  | "lpp-avoirs"
  | "lpp-options"
  | "lpp-caps-deces"
  | "avs-age"
  | "avs-lacunes-toggle"
  | "avs-lacunes-years"
  | "review";

export type SectionDef = {
  id: SectionId;
  title: string;
  subtitle?: string;
  icon?: string; // nom Lucide, ex. "User", "Calendar"
  // Champs concernés par la section (pour trigger/dirty/analytics)
  fields: (keyof MinimalForm | string)[];
  // La section doit-elle être montée/visible dans le flow ?
  // (exécuté à chaque step avec le form courant)
  mountIf: (form: MinimalForm) => boolean;
  // Les conditions minimales pour activer le bouton "Suivant"
  isValid: (form: MinimalForm) => boolean;
  // Nom du composant React qui rendra la section (on l’implémentera ensuite)
  component: string;
};

// ---- Helpers locaux
const isValidDateMask = (s?: string) =>
  !!s && /^\d{2}\.\d{2}\.\d{4}$/.test(s); // on branchera ton vrai helper côté rendu

const isMarriedOrPartner = (ec?: number) =>
  ec === 1 /* marié-e */ || ec === 3 /* partenariat enregistré */;

const isConcubinage = (ec?: number) => ec === 4; // Concubinage

// ---- Registre ordonné des 6 premières sections
export const SECTIONS: SectionDef[] = [

  {
    id: "intro",
    title: "Données personnelles",
    subtitle:
      "Afin de réaliser votre analyse de prévoyance, quelques questions rapides.",
    icon: "UserRound",
    fields: [], // aucun champ requis, écran d’intro
    mountIf: () => true,
    isValid: () => true, // bouton "Commencer" géré côté composant
    component: "IntroConsentSection",
  },
  {
    id: "prenom",
    title: "Votre prénom",
    icon: "User",
    fields: ["Enter_prenom"],
    mountIf: () => true,
    isValid: (f) => !!(f.Enter_prenom && f.Enter_prenom.trim().length > 0),
    component: "PrenomSection",
  },
  {
    id: "nom",
    title: "Votre nom",
    icon: "User2",
    fields: ["Enter_nom"],
    mountIf: () => true,
    isValid: (f) => !!(f.Enter_nom && f.Enter_nom.trim().length > 0),
    component: "NomSection",
  },
  {
    id: "birthdate",
    title: "Date de naissance",
    icon: "Calendar",
    fields: ["Enter_dateNaissance"],
    mountIf: () => true,
    isValid: (f) => isValidDateMask(f.Enter_dateNaissance),
    component: "BirthdateSection",
  },
  {
    id: "sex",
    title: "Votre sexe",
    icon: "User",
    fields: ["Enter_sexe"],
    mountIf: () => true,
    isValid: (f) => f.Enter_sexe === 0 || f.Enter_sexe === 1,
    component: "SexSection",
  },
  {
    id: "etat-civil",
    title: "État civil",
    icon: "HeartHandshake",
    fields: ["Enter_etatCivil"],
    mountIf: () => true,
    isValid: (f) => Number.isInteger(f.Enter_etatCivil as any),
    component: "EtatCivilSection",
  },
  {
  id: "concubinage-menage",
  title: "Concubinage",
  subtitle: "Depuis combien de temps faites-vous ménage commun ?",
  icon: "Home",
  fields: ["Enter_menageCommun5Ans"],
  mountIf: (f) => isConcubinage(f.Enter_etatCivil),
  isValid: (f) =>
    !isConcubinage(f.Enter_etatCivil) ||
    typeof f.Enter_menageCommun5Ans === "boolean",
  component: "ConcubinageMenageSection",
},
{
  id: "concubinage-partenaire-designe",
  title: "Partenaire désigné LPP",
  subtitle: "Votre partenaire est-il inscrit auprès de la caisse de pension ?",
  icon: "FileSignature",
  fields: ["Enter_partenaireDesigneLPP"],
  mountIf: (f) => isConcubinage(f.Enter_etatCivil) && f.Enter_menageCommun5Ans === true,
  isValid: (f) =>
    !isConcubinage(f.Enter_etatCivil) ||
    f.Enter_menageCommun5Ans !== true ||
    typeof f.Enter_partenaireDesigneLPP === "boolean",
  component: "ConcubinagePartenaireSection",
},
  {
    id: "mariage-duree",
    title: "Marié-e",
    subtitle: "Depuis quand êtes-vous marié-e ?",
    icon: "Heart",
    fields: ["Enter_mariageDuree"],
    mountIf: (f) => isMarriedOrPartner(f.Enter_etatCivil),
    isValid: (f) =>
      !isMarriedOrPartner(f.Enter_etatCivil) ||
      f.Enter_mariageDuree === 0 ||
      f.Enter_mariageDuree === 1,
    component: "MariageDureeSection",
  },
  {
  id: "spouse-sex",
  title: "Conjoint·e / partenaire",
  subtitle: "Sexe du conjoint ou partenaire",
  icon: "User2",
  fields: ["Enter_spouseSexe"],
  mountIf: (f) => isMarriedOrPartner(f.Enter_etatCivil),
  isValid: (f) => f.Enter_spouseSexe === 0 || f.Enter_spouseSexe === 1,
  component: "SpouseSexSection",
},
{
  id: "spouse-birthdate",
  title: "Conjoint·e / partenaire",
  subtitle: "Date de naissance du conjoint ou partenaire",
  icon: "CalendarClock",
  fields: ["Enter_spouseDateNaissance"],
  mountIf: (f) => isMarriedOrPartner(f.Enter_etatCivil),
  isValid: (f) => !isMarriedOrPartner(f.Enter_etatCivil) || isValidDateMask(f.Enter_spouseDateNaissance),
  component: "SpouseBirthdateSection",
},
  {
    id: "has-kids",
    title: "Enfants",
    subtitle: "Avez-vous des enfants à charge ?",
    icon: "Baby",
    fields: ["Enter_hasEnfants"],
    mountIf: () => true,
    isValid: (f) => typeof f.Enter_hasEnfants === "boolean",
    component: "HasKidsSection",
  },
  {
  id: "kids-dates",
  title: "Enfants",
  subtitle: "Dates de naissance",
  icon: "Baby",
  fields: ["Enter_enfants"],
  mountIf: (f) => !!f.Enter_hasEnfants,
  isValid: (f) => {
    if (!f.Enter_hasEnfants) return true;
    const list = f.Enter_enfants;
    const rx = /^\d{2}\.\d{2}\.\d{4}$/;
    return Array.isArray(list) && list.length > 0 && list.every(k => rx.test(k.Enter_dateNaissance));
  },
  component: "KidsDatesSection",
},
{
  id: "avs-age",
  title: "Cotisations AVS",
  subtitle: "À quel âge avez-vous commencé à travaillé en Suisse ?",
  icon: "Timer",
  fields: ["Enter_ageDebutCotisationsAVS", "Enter_anneeDebutCotisationAVS"],
  mountIf: () => true,
  isValid: (f) => typeof f.Enter_ageDebutCotisationsAVS === "number",
  component: "AvsAgeDebutSection",
},
{
  id: "avs-lacunes-toggle",
  title: "Lacunes AVS",
  subtitle: "Périodes sans cotisations AVS ?",
  icon: "AlertTriangle",
  fields: ["Enter_hasAnnesManquantesAVS"],
  mountIf: () => true,
  isValid: (f) => typeof f.Enter_hasAnnesManquantesAVS === "boolean",
  component: "AvsLacunesToggleSection",
},
{
  id: "avs-lacunes-years",
  title: "Années manquantes AVS",
  subtitle: "Ex. 2010 2011",
  icon: "CalendarClock",
  fields: ["Enter_anneesManquantesAVS"],
  mountIf: (f) => !!f.Enter_hasAnnesManquantesAVS,
  isValid: () => true, // liste optionnelle, ton calcul AVS gérera
  component: "AvsLacunesYearsSection",
},
{
  id: "statut-pro",
  title: "Statut professionnel",
  icon: "BriefcaseBusiness",
  fields: ["Enter_statutProfessionnel"],
  mountIf: () => true,
  isValid: (f) => Number.isInteger(f.Enter_statutProfessionnel as any),
  component: "StatutProSection",
},
{
  id: "salaire-annuel",
  title: "Salaire annuel",
  icon: "Wallet",
  fields: ["Enter_salaireAnnuel"],
  mountIf: () => true,
  isValid: (f) => typeof f.Enter_salaireAnnuel === "number" && (f.Enter_salaireAnnuel as number) >= 0,
  component: "SalaireAnnuelSection",
},
{
  id: "travaille-8h",
  title: "Temps de travail",
  subtitle: "Travaillez-vous plus de 8 heures par semaine ?",
  icon: "Clock",
  fields: ["Enter_travaillePlusde8HSemaine"],
  mountIf: (f) => (f.Enter_statutProfessionnel ?? 0) === 0, // salarié
  isValid: (f) =>
    (f.Enter_statutProfessionnel ?? 0) !== 0 ||
    typeof f.Enter_travaillePlusde8HSemaine === "boolean",
  component: "Travaille8hSection",
},
{
  id: "ij-maladie",
  title: "Indemnités en cas de maladie",
  subtitle: "Votre employeur vous verse-t-il un salaire si vous tombez malade ?",
  icon: "Stethoscope",
  fields: ["Enter_ijMaladie", "Enter_ijMaladieTaux"],
  mountIf: () => true,
  isValid: (f) => {
    if (typeof f.Enter_ijMaladie !== "boolean") return false;
    if (f.Enter_ijMaladie === false) return true;
    const t = Number(f.Enter_ijMaladieTaux ?? 0);
    return t >= 10 && t <= 100;
  },
  component: "IjMaladieSection",
},
{
  id: "ij-accident",
  title: "Indemnité en cas d'accident",
  subtitle: "Votre employeur a l'obligation de vous assurer au minium à 80%. Mais il est possible que votre employeur vous assure au-delà de 80%",
  icon: "FirstAidKit",
  fields: ["Enter_ijAccidentTaux"],
  mountIf: () => true,
  isValid: (f) => {
    const t = Number(f.Enter_ijAccidentTaux ?? 0);
    return t >= 80 && t <= 100;
  },
  component: "IjAccidentSection",
},
{
  id: "affilie-lpp",
  title: "Affiliation au 2ᵉ pilier (LPP)",
  subtitle: "Indiquez si vous êtes affilié·e à une caisse de pension.",
  icon: "ShieldCheck",
  fields: ["Enter_Affilie_LPP", "Enter_salaireAnnuel", "Enter_statutProfessionnel"],
  mountIf: () => true, // tout le monde voit cette étape
  isValid: (f) => {
    const salaire = Number(f.Enter_salaireAnnuel ?? 0);
    const statut = Number(f.Enter_statutProfessionnel ?? 0); // 0 = salarié-e
    const forceAffilie = statut === 0 && salaire >= 22680;

    if (forceAffilie) return true;
    return typeof f.Enter_Affilie_LPP === "boolean";
  },
  component: "AffilieLPPSection",
},
{
  id: "scan-lpp",
  title: "Scannez votre certificat LPP (2e pilier)",
  icon: "ScanLine",
  fields: [],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: () => true,
  component: "ScanLPPSection",
},
{
  id: "lpp-basics",
  title: "Certificat LPP",
  subtitle: "Date (facultatif) + type de salaire assuré",
  icon: "FileBadge",
  fields: ["Enter_dateCertificatLPP", "Enter_typeSalaireAssure"],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: (f) =>
    f.Enter_typeSalaireAssure === "general" ||
    f.Enter_typeSalaireAssure === "split",
  component: "LppBasicsSection",
},
{
  id: "lpp-split-risque",
  title: "Salaire assuré (risque)",
  icon: "Shield",
  fields: ["Enter_salaireAssureLPPRisque"],
  // ⬇️ seulement si affilié LPP ET type = split
  mountIf: (f) =>
    f.Enter_Affilie_LPP === true &&
    f.Enter_typeSalaireAssure === "split",
  isValid: (f) =>
    f.Enter_typeSalaireAssure !== "split" ||
    Number(f.Enter_salaireAssureLPPRisque ?? 0) >= 0,
  component: "LppBasicsSplitRiskSection",
},
{
  id: "lpp-split-epargne",
  title: "Salaire assuré (épargne / général)",
  icon: "PiggyBank",
  fields: ["Enter_salaireAssureLPPEpargne", "Enter_salaireAssureLPP"],
  // ⬇️ affilié LPP obligatoire, le type est géré dans isValid
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: (f) => {
    if (f.Enter_typeSalaireAssure === "general") {
      return Number(f.Enter_salaireAssureLPP ?? 0) >= 0;
    }
    return Number(f.Enter_salaireAssureLPPEpargne ?? 0) >= 0;
  },
  component: "LppBasicsSplitSaveSection",
},
{
  id: "lpp-rentes-invalidite",
  title: "Rentes LPP en cas d’invalidité",
  subtitle: "Rente principale et rentes d’enfants",
  icon: "Activity",
  fields: [
    "Enter_renteInvaliditeLPP",
    "Enter_renteEnfantInvaliditeLPP",
    "Enter_renteOrphelinLPP",
  ],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: () => true, // montants optionnels, 0 autorisé
  component: "LppRentesInvaliditeSection",
},
{
  id: "lpp-rentes-deces",
  title: "Rentes LPP en cas de décès",
  subtitle: "Conjoint·e ou partenaire et montants",
  icon: "HeartPulse",
  fields: [
    "Enter_RenteConjointOuPartenaireLPP",
    "Enter_renteConjointLPP",
    "Enter_rentePartenaireLPP",
  ],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: (f) => {
    const v = f.Enter_RenteConjointOuPartenaireLPP;
    return v === 0 || v === 1;
  },
  component: "LppRentesDecesSection",
},
{
  id: "lpp-avoirs",
  title: "Avoirs LPP / Libre passage",
  subtitle: "Au jour du certificat",
  icon: "Banknote",
  fields: [
    "Enter_avoirVieillesseObligatoire",
    "Enter_avoirVieillesseTotal",
    "Enter_librePassageObligatoire",
    "Enter_librePassageTotal",
  ],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: () => true,
  component: "LppAvoirsSection",
},
{
  id: "lpp-options",
  title: "Capitaux & options LPP",
  subtitle: "Capital à 65 ans, rachat, EPL…",
  icon: "Settings2",
  fields: [
    "Enter_prestationCapital65",
    "Enter_rachatPossible",
    "Enter_eplPossibleMax",
    "Enter_versementsAnticipesLogement",
    "Enter_miseEnGage",
  ],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: () => true,
  component: "LppOptionsSection",
},
{
  id: "lpp-caps-deces",
  title: "Capitaux décès",
  subtitle: "Comme indiqué sur le certificat LPP",
  icon: "Skull",
  fields: ["DecesCapitaux"],
  mountIf: (f) => f.Enter_Affilie_LPP === true,
  isValid: () => true,
  component: "LppCapitauxDecesSection",
},
{
  id: "review",
  title: "Récapitulatif",
  subtitle: "Vérifiez vos informations avant d’enregistrer",
  icon: "CheckCircle2",
  fields: [],
  mountIf: () => true,
  isValid: () => true,
  component: "ReviewSection",
},
];

// ---- Utilitaire : liste des IDs montés selon le form courant
export function getMountedSectionIds(form: MinimalForm): SectionId[] {
  return SECTIONS.filter((s) => s.mountIf(form)).map((s) => s.id);
}

// ---- Utilitaire : trouver la prochaine section montable
export function getNextSectionId(
  form: MinimalForm,
  currentId: SectionId
): SectionId | null {
  const mounted = SECTIONS.filter((s) => s.mountIf(form));
  const idx = mounted.findIndex((s) => s.id === currentId);
  if (idx < 0) return mounted[0]?.id ?? null;
  return mounted[idx + 1]?.id ?? null;
}