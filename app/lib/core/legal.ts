// app/lib/core/legal.ts
//
// SOURCE UNIQUE des paramètres légaux suisses 2025 (LPP / LAA / AVS).
// Remplace les copies `DEFAULT_LEGAL_2025` jadis recopiées dans chaque écran.
// Toute évolution annuelle (valeurs 2026, etc.) se fait ICI uniquement.

import type { Legal_Settings } from "./types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

// Les crédits AVS (BTE/BTA) proviennent du registre Échelle 44 (source des valeurs).
const { meta } = Legal_Echelle44_2025;

/** Paramètres légaux 2025 — référence unique. */
export const LEGAL_2025: Legal_Settings = {
  /* LAA */
  Legal_SalaireAssureMaxLAA: 148_200,
  Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
  Legal_ijAccidentTaux: 80,

  /* LPP */
  Legal_DeductionCoordinationMinLPP: 26_460,
  Legal_SeuilEntreeLPP: 22_680,
  Legal_SalaireMaxLPP: 90_720,
  Legal_SalaireAssureMaxLPP: 64_260,
  Legal_SalaireAssureMinLPP: 3_780,
  Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
  Legal_CotisationsMinLPP: {},

  /* AVS/AI */
  Legal_AgeRetraiteAVS: 65,
  Legal_AgeLegalCotisationsAVS: 21,
  Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
  Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
  Legal_BTE_SplitMarried: 0.5,

  /* Échelle 44 */
  Legal_Echelle44Version: "2025-01",
};
