import { describe, it, expect } from "vitest";
import { getSuppCarrierePct, calcSuppCarriere } from "./avsDeces";

describe("getSuppCarrierePct — table de supplément de carrière par âge au décès", () => {
  it("décroît par paliers selon l'âge", () => {
    expect(getSuppCarrierePct(22)).toBe(100);
    expect(getSuppCarrierePct(23)).toBe(90);
    expect(getSuppCarrierePct(24)).toBe(80);
    expect(getSuppCarrierePct(25)).toBe(70);
    expect(getSuppCarrierePct(26)).toBe(60);
    expect(getSuppCarrierePct(27)).toBe(50);
    expect(getSuppCarrierePct(28)).toBe(40);
    expect(getSuppCarrierePct(29)).toBe(40);
    expect(getSuppCarrierePct(30)).toBe(30);
    expect(getSuppCarrierePct(32)).toBe(20);
    expect(getSuppCarrierePct(35)).toBe(10);
    expect(getSuppCarrierePct(39)).toBe(5);
    expect(getSuppCarrierePct(44)).toBe(5);
  });

  it("est nul à partir de 45 ans", () => {
    expect(getSuppCarrierePct(45)).toBe(0);
    expect(getSuppCarrierePct(60)).toBe(0);
  });
});

describe("calcSuppCarriere — pourcentage appliqué au revenu moyen", () => {
  it("applique le % du palier d'âge", () => {
    expect(calcSuppCarriere(22, 100_000)).toBe(100_000); // 100%
    expect(calcSuppCarriere(35, 100_000)).toBe(10_000); // 10%
  });

  it("retourne 0 dès 45 ans", () => {
    expect(calcSuppCarriere(45, 100_000)).toBe(0);
  });
});
