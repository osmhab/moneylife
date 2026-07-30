import { describe, it, expect } from "vitest";
import { plafond3aAnnuel, PLAFOND_3A_PETIT, PLAFOND_3A_GRAND_MAX } from "./plafond3a";

describe("plafond3aAnnuel", () => {
  it("affilié LPP → petit plafond fixe", () => {
    expect(plafond3aAnnuel({ Enter_Affilie_LPP: true, Enter_salaireAnnuel: 200_000 })).toBe(PLAFOND_3A_PETIT);
  });

  it("NON affilié → 20% du salaire", () => {
    expect(plafond3aAnnuel({ Enter_Affilie_LPP: false, Enter_salaireAnnuel: 60_000 })).toBe(12_000);
  });

  it("NON affilié → plafonné au grand max pour un haut revenu", () => {
    // 20% × 300'000 = 60'000 > grand max → plafonné.
    expect(plafond3aAnnuel({ Enter_Affilie_LPP: false, Enter_salaireAnnuel: 300_000 })).toBe(PLAFOND_3A_GRAND_MAX);
  });

  it("affiliation absente = non affilié (grand plafond)", () => {
    expect(plafond3aAnnuel({ Enter_salaireAnnuel: 50_000 })).toBe(10_000);
  });
});
