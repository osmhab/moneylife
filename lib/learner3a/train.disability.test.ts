import { describe, it, expect } from "vitest";
import { buildProviderModelsServer } from "./train";

describe("buildProviderModelsServer — capture invalidité (nObs)", () => {
  it("capte l'ancien format (disabilityRente scalaire) ET le nouveau (disabilityLevels 1 niveau)", () => {
    const bs: any[] = [
      // Ancien format scalaire (5 obs)
      { provider: "AXA", age: 30, gender: "M", isSmoker: false, disabilityRente: 12000, disabilityPremium: 400 },
      { provider: "AXA", age: 35, gender: "M", isSmoker: false, disabilityRente: 12000, disabilityPremium: 440 },
      { provider: "AXA", age: 40, gender: "M", isSmoker: false, disabilityRente: 12000, disabilityPremium: 480 },
      { provider: "AXA", age: 45, gender: "M", isSmoker: false, disabilityRente: 12000, disabilityPremium: 520 },
      { provider: "AXA", age: 39, gender: "F", isSmoker: false, disabilityRente: 12000, disabilityPremium: 425 },
      // Nouveau format 1 niveau (1 obs) — doit être capté aussi
      { provider: "AXA", age: 36, gender: "M", isSmoker: false, disabilityPremium: 479, disabilityLevels: [{ deferralYears: 0, amount: 12000 }] },
    ];
    const models = buildProviderModelsServer(bs);
    const axa = models.get("AXA");
    expect(axa).toBeTruthy();
    expect(axa!.disabilityUnit.nObs).toBe(6); // les 6 benchmarks captés
    // beta de longueur 5 (inclut le différé) puisque > fallback
    expect(axa!.disabilityUnit.beta.length).toBe(5);
  });

  it("ignore une grille MULTI-niveaux du fit (mais compte les autres)", () => {
    const bs: any[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        provider: "PAX", age: 30 + i, gender: "M", isSmoker: false,
        disabilityPremium: 400 + i * 10, disabilityLevels: [{ deferralYears: 0, amount: 12000 }],
      })),
      // grille multi-niveaux → ignorée
      { provider: "PAX", age: 36, gender: "M", isSmoker: false, disabilityPremium: 960,
        disabilityLevels: [{ deferralYears: 0, amount: 12000 }, { deferralYears: 20, amount: 24000 }] },
    ];
    const pax = buildProviderModelsServer(bs).get("PAX");
    expect(pax!.disabilityUnit.nObs).toBe(6); // 6 unitaires, la grille exclue
  });
});
