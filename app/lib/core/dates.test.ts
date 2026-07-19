import { describe, it, expect } from "vitest";
import { isEnfantRenteEligible } from "./dates";

// Règle unique orphelin / enfant d'invalide (art. 25 LAVS / 35 LAI) :
//   < 18 → toujours ; 18–24 → seulement si en formation ; ≥ 25 → jamais.
// « Photo » à la date `at` (ici figée pour un test déterministe).
describe("isEnfantRenteEligible", () => {
  const at = new Date(2026, 0, 1); // 01.01.2026 (mois 0-indexé)
  const kid = (birth: string, enFormation?: boolean) => ({
    Enter_dateNaissance: birth,
    Enter_enFormation: enFormation,
  });

  it("enfant < 18 ans → éligible (formation ignorée)", () => {
    expect(isEnfantRenteEligible(kid("01.06.2015"), at)).toBe(true); // ~10 ans
    expect(isEnfantRenteEligible(kid("01.06.2009"), at)).toBe(true); // ~16 ans
  });

  it("18–24 ans → éligible SEULEMENT si en formation", () => {
    expect(isEnfantRenteEligible(kid("01.06.2005", true), at)).toBe(true);  // ~20 ans, études
    expect(isEnfantRenteEligible(kid("01.06.2005", false), at)).toBe(false); // ~20 ans, pas d'études
    expect(isEnfantRenteEligible(kid("01.06.2005"), at)).toBe(false);        // flag absent = pas d'études
  });

  it("exactement 18 ans sans formation → non éligible", () => {
    expect(isEnfantRenteEligible(kid("01.01.2008"), at)).toBe(false); // 18 pile
  });

  it("≥ 25 ans → jamais, même en formation", () => {
    expect(isEnfantRenteEligible(kid("01.06.2000", true), at)).toBe(false); // ~25 ans
  });

  it("date invalide ou enfant nul → non éligible (pas de faux positif)", () => {
    expect(isEnfantRenteEligible(kid(""), at)).toBe(false);
    expect(isEnfantRenteEligible(null, at)).toBe(false);
    expect(isEnfantRenteEligible(undefined, at)).toBe(false);
  });
});
