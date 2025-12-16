// lib/offers/parsers/types.ts

// -----------------------------------------------------
// Assureurs supportés
// -----------------------------------------------------
export type InsurerCode = "AXA" | "Swiss Life" | "Bâloise" | "PAX";

// -----------------------------------------------------
// Forme du contrat (3a / 3b)
// -----------------------------------------------------
export type ContractForm = "3a" | "3b";

// -----------------------------------------------------
// Couverture d'assurance (décès, IG, exonération, etc.)
// -----------------------------------------------------
export interface OfferCoverageRow {
  id: string;
  label: string;
  sumInsured: number | null;         // Montant assuré (capital / rente)
  premium: number | null;            // Prime annuelle
  waitingPeriodMonths?: 3 | 12 | 24 | null; // Pour l'exonération de primes
}

// -----------------------------------------------------
// Valeurs de rachat par date
// -----------------------------------------------------
export interface SurrenderValueRow {
  id: string;
  dateLabel: string;                 // ex. "31.1.2035"
  guaranteed: number | null;
  pess: number | null;               // Scénario bas
  mid: number | null;                // Scénario moyen
  opt: number | null;                // Scénario élevé
}

// -----------------------------------------------------
// Payload final envoyé dans ton Dashboard admin
// -----------------------------------------------------
export interface ManualOfferPayload {
  insurer: InsurerCode;

  contractForm: ContractForm;
  startDateLabel: string;            // "1.1.2026"
  endDateLabel: string;              // "1.2.2055"
  offerNumber?: string | null;

  premiumAnnual: number | null;
  premiumMonthly: number | null;

  coverages: OfferCoverageRow[];

  projectedModerateAmount: number | null;
  projectedModerateRatePct: number | null;

  // éventuellement utile dans certains parseurs plus tard
  pessRatePct: number | null;
  midRatePct: number | null;
  optRatePct: number | null;

  surrenderValues: SurrenderValueRow[];

  // Valeurs de rachat privilégiées (Swiss Life EPL)
  surrenderValuesEpl?: SurrenderValueRow[] | null;

  //Info questionnaire santé pour cette offre
  healthQuestionnaireRequired?: boolean | null;
  healthQuestionnaireUrl?: string | null;


}

// -----------------------------------------------------
// Contexte passé aux PARSEURS TEXTES uniquement
// (AI SwissLife, legacy SwissLife tabulaire, AXA tabulaire…)
// -----------------------------------------------------
export interface OfferParseContext {
  insurerHint?: InsurerCode | "";
  requestId?: string;
  clientUid?: string;

  // ⚠️ Obligatoire : un parseur texte travaille *uniquement* sur du texte OCR
  ocrText: string;
}