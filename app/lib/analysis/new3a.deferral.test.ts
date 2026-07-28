import { describe, it, expect } from "vitest";
import { calculatePredictedRate } from "./new3a";

// beta = [intercept, age, smoker, femaleF, DIFFÉRÉ]. beta[4] < 0 → une rente différée
// coûte moins cher (le coefficient différé abaisse le taux).
const model = { beta: [-3.219, 0, 0, 0, -0.02616], nObs: 10 };

describe("calculatePredictedRate — décote de différé (Phase 4)", () => {
  it("taux immédiat (différé 0) inchangé", () => {
    const r = calculatePredictedRate(model, 36, false, false, 1.0, 0);
    expect(r).toBeCloseTo(0.04, 3);
  });

  it("taux plus BAS quand la rente est différée", () => {
    const r0 = calculatePredictedRate(model, 36, false, false, 1.0, 0);
    const r11 = calculatePredictedRate(model, 36, false, false, 1.0, 11);
    expect(r11).toBeLessThan(r0);
    expect(r11).toBeCloseTo(0.03, 3); // exp(-3.219 - 0.02616*11) ≈ 0.03
  });

  it("un modèle SANS coefficient différé (beta longueur 4) ignore le différé", () => {
    const m4 = { beta: [-3.219, 0, 0, 0], nObs: 10 };
    const r0 = calculatePredictedRate(m4, 36, false, false, 1.0, 0);
    const r11 = calculatePredictedRate(m4, 36, false, false, 1.0, 11);
    expect(r11).toBe(r0); // pas de donnée différée → même taux (repli conservateur)
  });
});
