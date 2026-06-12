import { describe, it, expect } from "vitest";
import {
  computeNbAnneesCotisationsCompletes,
  computeNbAnneesCotisationsEffectives,
  computeRevenuMoyen,
  getLegalRenteMinAvsMensuelle,
  selectEchellePlancher,
} from "./avsAi";
import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";

function client(over: Partial<ClientData> = {}): ClientData {
  return { ...over };
}

function legal(over: Partial<Legal_Settings> = {}): Legal_Settings {
  return {
    Legal_SalaireAssureMaxLAA: 148_200,
    Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
    Legal_ijAccidentTaux: 80,
    Legal_DeductionCoordinationMinLPP: 26_460,
    Legal_SeuilEntreeLPP: 22_680,
    Legal_SalaireMaxLPP: 90_720,
    Legal_SalaireAssureMaxLPP: 64_260,
    Legal_SalaireAssureMinLPP: 3_780,
    Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
    Legal_CotisationsMinLPP: {},
    Legal_AgeRetraiteAVS: 65,
    Legal_AgeLegalCotisationsAVS: 21,
    Legal_BTE_AnnualCredit: 45_360,
    Legal_BTA_AnnualCredit: 45_360,
    Legal_BTE_SplitMarried: 0.5,
    ...over,
  };
}

// Échelle 44 synthétique (seules les colonnes utilisées sont renseignées).
const echelle = [
  { Legal_Income: 0, Legal_OldAgeInvalidity: 1_200, Legal_WidowWidowerSurvivor: 960 },
  { Legal_Income: 50_000, Legal_OldAgeInvalidity: 1_500, Legal_WidowWidowerSurvivor: 1_200 },
  { Legal_Income: 100_000, Legal_OldAgeInvalidity: 2_000, Legal_WidowWidowerSurvivor: 1_600 },
] as unknown as Legal_Echelle44Row[];

describe("computeNbAnneesCotisations*", () => {
  it("complètes = âge retraite - âge légal de cotisation (44)", () => {
    expect(computeNbAnneesCotisationsCompletes(legal())).toBe(44);
  });

  it("effectives par défaut = 44 (début à 21, aucune manquante)", () => {
    expect(computeNbAnneesCotisationsEffectives(client(), legal())).toBe(44);
  });

  it("effectives = brut - années manquantes (début 25, 2 manquantes → 38)", () => {
    const c = client({ Enter_ageDebutCotisationsAVS: 25, Enter_anneesManquantesAVS: [2020, 2021] });
    expect(computeNbAnneesCotisationsEffectives(c, legal())).toBe(38);
  });
});

describe("computeRevenuMoyen", () => {
  it("= salaire annuel × années effectives", () => {
    const c = client({ Enter_salaireAnnuel: 80_000 });
    // 80000 × 44 = 3 520 000
    expect(computeRevenuMoyen(c, legal())).toBe(3_520_000);
  });
});

describe("échelle 44 — rente min & sélecteur plancher", () => {
  it("rente min mensuelle = plus petit OldAgeInvalidity", () => {
    expect(getLegalRenteMinAvsMensuelle(echelle)).toBe(1_200);
  });

  it("plancher = la ligne de revenu la plus haute ≤ RAMD", () => {
    // 60000 → palier 50000
    expect(selectEchellePlancher(60_000, echelle)?.Legal_Income).toBe(50_000);
    // 100000 → palier 100000 exact
    expect(selectEchellePlancher(100_000, echelle)?.Legal_Income).toBe(100_000);
  });

  it("aucune ligne ≤ RAMD → undefined", () => {
    expect(selectEchellePlancher(-1, echelle)).toBeUndefined();
  });
});
