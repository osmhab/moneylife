import { describe, it, expect } from "vitest";
import {
  calcIjMaladie,
  calcIjAccident,
  calcRenteInvaliditeLAA,
  calcRenteConjointLAA,
  calcCapitalUniqueLAA,
  calcRentesSurvivantsLAA,
} from "./laa";
import type { ClientData, Legal_Settings } from "@/lib/core/types";

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

describe("LAA — indemnités & rentes (% du salaire assuré plafonné)", () => {
  it("IJ maladie = 80% du salaire (sans plafond LAA)", () => {
    expect(calcIjMaladie(client({ Enter_salaireAnnuel: 100_000 }))).toBe(80_000);
  });

  it("IJ accident = 80% du salaire, plafonné au max LAA", () => {
    expect(calcIjAccident(client({ Enter_salaireAnnuel: 100_000 }), legal())).toBe(80_000);
    // 200000 plafonné à 148200 -> 148200 * 0.8
    expect(calcIjAccident(client({ Enter_salaireAnnuel: 200_000 }), legal())).toBe(118_560);
  });

  it("rente invalidité LAA = 80% du salaire assuré", () => {
    expect(calcRenteInvaliditeLAA(client({ Enter_salaireAnnuel: 100_000 }), legal())).toBe(80_000);
  });

  it("rente conjoint LAA = 40%, plafonnée au max LAA", () => {
    expect(calcRenteConjointLAA(client({ Enter_salaireAnnuel: 100_000 }), legal())).toBe(40_000);
    // 200000 plafonné -> 148200 * 0.4
    expect(calcRenteConjointLAA(client({ Enter_salaireAnnuel: 200_000 }), legal())).toBe(59_280);
  });
});

describe("LAA — capital unique & cap famille 70%", () => {
  it("capital unique = rente conjoint × 3", () => {
    expect(calcCapitalUniqueLAA(40_000, legal())).toBe(120_000);
  });

  it("survivants sans dépassement du cap (conjoint + 1 enfant)", () => {
    const r = calcRentesSurvivantsLAA(client({ Enter_salaireAnnuel: 100_000 }), legal(), 1);
    // conjoint 40000 + enfant 15000 = 55000 < cap 70000
    expect(r.renteConjoint).toBe(40_000);
    expect(r.renteEnfants).toBe(15_000);
    expect(r.totalApresCap).toBe(55_000);
  });

  it("survivants plafonnés à 70% (conjoint + 3 enfants)", () => {
    const r = calcRentesSurvivantsLAA(client({ Enter_salaireAnnuel: 100_000 }), legal(), 3);
    // 40000 + 45000 = 85000 -> plafonné à 70% = 70000
    expect(r.totalAvantCap).toBe(85_000);
    expect(r.totalApresCap).toBe(70_000);
  });
});
