import { describe, it, expect } from "vitest";
import { computeSolution } from "./solution";
import type { SituationAnalysis } from "./situation";
import type { ProviderModelDoc } from "lib/engines/threeA-engine";

// Modèle Ridge "constant" : log(y) = beta[0] (les autres features à 0)
// → exp(predictLog) = exp(beta0). predictLog clampe dans [log(1e-6), log(0.2)].
const ridge = (rate: number) => ({ beta: [Math.log(rate), 0, 0, 0], fallbackLogMean: Math.log(rate), nObs: 50 });

const benchmark = (provider: string, opts: { death: number; dis: number; waiver: number; yield: number }): ProviderModelDoc => ({
  provider,
  yieldMedian: opts.yield,
  recoveryMedian: [],
  deathUnit: ridge(opts.death),
  disabilityUnit: ridge(opts.dis),
  waiverRate: ridge(opts.waiver),
});

function baseSituation(overrides: Partial<SituationAnalysis> = {}): SituationAnalysis {
  const card = { besoin: 0, couverture: 0, lacune: 0, score: 0 };
  return {
    totalScore: 50,
    salaireMensuel: 8000, // 96'000/an → tauxFisc 0.25
    retraiteBaseMensuelle: 4000,
    capManquantRetraite: 0,
    retraite: { ...card },
    invaliditeMaladie: { ...card },
    invaliditeAccident: { ...card },
    deces: { ...card },
    fiscal: { investi3aAnnuel: 0, plafond3a: 7258, pourcentUtilise: 0, gainFiscalAnnuel: 0 },
    ...overrides,
  };
}

describe("computeSolution", () => {
  it("tarifie le décès et retient le provider le moins cher", () => {
    const situation = baseSituation({ deces: { besoin: 200000, couverture: 100000, lacune: 100000, score: 50 } });
    const benchmarks = [
      benchmark("AssureurA", { death: 0.002, dis: 0.01, waiver: 0.01, yield: 2 }),
      benchmark("AssureurB", { death: 0.001, dis: 0.01, waiver: 0.01, yield: 2 }), // moins cher
    ];
    const sol = computeSolution({ situation, clientAge: 40, genderF: 0, benchmarks });

    // pDec = lacune * exp(beta0) / 12 = 100000 * 0.001 / 12
    expect(sol.priceDecMensuel).toBeCloseTo((100000 * 0.001) / 12, 4);
    expect(sol.providers.deces).toBe("AssureurB");
  });

  it("tarifie la retraite seulement si le capital manquant dépasse le seuil", () => {
    const benchmarks = [benchmark("A", { death: 0.001, dis: 0.01, waiver: 0.01, yield: 2 })];

    const sousSeuil = computeSolution({ situation: baseSituation({ capManquantRetraite: 4000 }), clientAge: 40, genderF: 0, benchmarks });
    expect(sousSeuil.priceRetMensuel).toBe(0);

    const auDessus = computeSolution({ situation: baseSituation({ capManquantRetraite: 100000 }), clientAge: 40, genderF: 0, benchmarks });
    expect(auDessus.priceRetMensuel).toBeGreaterThan(0);
    expect(auDessus.providers.retraite).toBe("A");
  });

  it("répartit la prime sur le 3a jusqu'au plafond puis sur le 3b, et calcule le gain fiscal", () => {
    const situation = baseSituation({
      deces: { besoin: 200000, couverture: 0, lacune: 200000, score: 0 },
      fiscal: { investi3aAnnuel: 7000, plafond3a: 7258, pourcentUtilise: 96, gainFiscalAnnuel: 0 },
    });
    const benchmarks = [benchmark("A", { death: 0.002, dis: 0.01, waiver: 0.01, yield: 2 })];
    const sol = computeSolution({ situation, clientAge: 40, genderF: 0, benchmarks });

    // potentielRestant = 7258 - 7000 = 258 < 600 → tout en 3b
    expect(sol.split3aMensuel).toBe(0);
    expect(sol.split3bMensuel).toBeGreaterThan(0);
    expect(sol.gainFiscalMensuel).toBe(0);
  });

  it("renvoie des primes nulles sans aucun modèle ML", () => {
    const situation = baseSituation({ deces: { besoin: 200000, couverture: 0, lacune: 200000, score: 0 } });
    const sol = computeSolution({ situation, clientAge: 40, genderF: 0, benchmarks: [] });
    expect(sol.totalMensuel).toBe(0);
    expect(sol.providers.deces).toBeNull();
  });
});
