// lib/layoutTypes.ts
export type Line = {
  text: string;
  yMid: number;
  x1: number;
  x2: number;
  // minimal payload; si tu veux détailler: words[], page, etc.
  page?: number;
  words?: Array<{ text: string; x1: number; y1: number; x2: number; y2: number }>;
};

// =============================
// MoneyLife — LPP types (centralisés)
// =============================
export type LppReviewStatus = 'pending' | 'verified' | 'flagged';
export type LppFieldSource = 'ocr' | 'manual';
export type LppProofs = Record<string, { snippet: string }>;

export interface LppParsed {
  // Identifiants
  id?: string;
  clientToken?: string;

  // Identité & méta document
  employeur?: string | null;
  caisse?: string | null;
  dateCertificat?: string | null;
  prenom?: string | null;
  nom?: string | null;
  dateNaissance?: string | null;

  // Salaires & avoirs
  salaireDeterminant?: number | null;
  deductionCoordination?: number | null;
  salaireAssureEpargne?: number | null;
  salaireAssureRisque?: number | null;
  avoirVieillesse?: number | null;
  avoirVieillesseSelonLpp?: number | null;
  interetProjetePct?: number | null;

  // Prestations & retraite (annuels)
  renteInvaliditeAnnuelle?: number | null;
  renteEnfantInvaliditeAnnuelle?: number | null;
  renteConjointAnnuelle?: number | null;
  renteOrphelinAnnuelle?: number | null;
  capitalDeces?: number | null;
  capitalRetraite65?: number | null;
  renteRetraite65Annuelle?: number | null;

  // Options / opérations
  rachatPossible?: number | null;
  eplDisponible?: number | null;
  miseEnGage?: boolean | null;

  // Métadonnées IA / parsing
  confidence?: number | null;
  needs_review?: boolean;
  filename?: string | null;
  sourcePath?: string | null;
  issues?: string[] | null;
  proofs?: LppProofs | null;

  // Learner
  review?: {
    status: LppReviewStatus;
    reviewedAt?: string;
    reviewedBy?: string;
  };
  sources?: Partial<Record<string, LppFieldSource>>;
  textHash?: string;
  caisseSlug?: string | null;
  learnerMeta?: LearnerMeta;      



  // Traces d’extraction
  extractedAt?: any; // Firestore Timestamp ou ISO string — volontairement souple
  docType?: 'LPP_CERT' | string;

  // Divers
  meta?: any;
}


export interface LearnerMeta {
  reusedByHash?: boolean;          // le robot a réutilisé un scan identique ?
  appliedTemplate?: boolean;       // un template de caisse a complété des champs ?
  templateId?: string | null;      // slug de la caisse (si template appliqué)
  appliedFields?: string[];        // liste des champs complétés (hash/template)
  updatedAt?: string;              // ISO du moment où le robot a agi
}

