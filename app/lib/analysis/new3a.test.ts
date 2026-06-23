import { describe, it, expect } from "vitest";
import { computeNew3aOffer, calculatePredictedRate, deriveTargets, type New3aWizard } from "./new3a";
import type { SituationAnalysis } from "./situation";

const ridge = (rate: number) => ({ beta: [Math.log(rate), 0, 0, 0], fallbackLogMean: Math.log(rate), nObs: 50 });

const benchmark = (provider: string) => ({
  provider,
  yieldMedian: 2,
  recoveryMedian: [],
  deathUnit: ridge(0.001),
  disabilityUnit: ridge(0.01),
  waiverRate: ridge(0.03),
  smokerFloors: { death: 1.25, disability: 1.15, waiver: 1.1 },
});

function baseSituation(overrides: Partial<SituationAnalysis> = {}): SituationAnalysis {
  const card = { besoin: 0, couverture: 0, lacune: 0, score: 0 };
  return {
    totalScore: 50,
    salaireMensuel: 8000,
    retraiteBaseMensuelle: 4000,
    capManquantRetraite: 0,
    retraite: { ...card },
    invaliditeMaladie: { ...card },
    invaliditeAccident: { ...card },
    deces: { ...card },
    fiscal: { investi3aAnnuel: 0, plafond3a: 7258, pourcentUtilise: 0, gainFiscalAnnuel: 0, tauxMarginal: 0.25 },
    ...overrides,
  };
}

const wizard = (o: Partial<New3aWizard> = {}): New3aWizard => ({
  objective: [],
  philosophy: "security",
  riskProfile: "balanced",
  isSmoker: false,
  monthlyBudget: 300,
  ...o,
});

describe("calculatePredictedRate", () => {
  it("applique le plancher fumeur (fumeur ≥ non-fumeur × floor)", () => {
    const model = { beta: [Math.log(0.01), 0, 0, 0], fallbackLogMean: Math.log(0.01), nObs: 50 };
    const ns = calculatePredictedRate(model, 40, false, false, 1.25);
    const sm = calculatePredictedRate(model, 40, true, false, 1.25);
    expect(sm).toBeCloseTo(ns * 1.25, 6); // beta fumeur = 0 → plancher impose ×1.25
  });
});

describe("deriveTargets", () => {
  it("prend la pire lacune invalidité (maladie/accident) et arrondit le décès au millier", () => {
    const s = baseSituation({
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1200, score: 0 },
      invaliditeAccident: { besoin: 0, couverture: 0, lacune: 1800, score: 0 },
      deces: { besoin: 0, couverture: 0, lacune: 47600, score: 0 },
      capManquantRetraite: 90000,
    });
    const t = deriveTargets(s);
    expect(t.maladie).toBe(1800);
    expect(t.deces).toBe(48000);
    expect(t.retraite).toBe(90000);
  });
});

describe("computeNew3aOffer", () => {
  it("active invalidité/décès selon les objectifs, épargne+libération toujours actives", () => {
    const s = baseSituation({
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 0 },
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 0 },
    });
    const offre = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_income"] }),
      situation: s,
      clientAge: 40,
      clientGender: "M",
      benchmarks: [benchmark("A")],
    });
    expect(offre.selRet).toBe(true);
    expect(offre.selPay).toBe(true);
    expect(offre.selInc).toBe(true);
    expect(offre.selDec).toBe(false); // pas protection_family → décès non couvert
    expect(offre.premiums.inc).toBeGreaterThan(0);
  });

  it("le profil dynamique projette plus de capital que le garanti (rendement supérieur)", () => {
    const s = baseSituation({ capManquantRetraite: 100000 });
    const garanti = computeNew3aOffer({ wizard: wizard({ riskProfile: "guaranteed" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [benchmark("A")] });
    const dynamique = computeNew3aOffer({ wizard: wizard({ riskProfile: "dynamic" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [benchmark("A")] });
    expect(dynamique.projectedRetirement).toBeGreaterThan(garanti.projectedRetirement);
  });

  it("cale le total sur le budget quand l'épargne idéale y tient (réconciliation)", () => {
    // Aucune lacune retraite → épargne idéale = 0 → on consomme le budget disponible.
    const s = baseSituation({ capManquantRetraite: 0 });
    const offre = computeNew3aOffer({ wizard: wizard({ monthlyBudget: 300 }), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")] });
    // épargne = budget/(1+payRate) ; payCost = épargne*payRate ⇒ total ≈ budget.
    expect(offre.grossTotal).toBeCloseTo(300, 0);
  });

  it("la lacune retraite peut faire dépasser le budget (prime idéale prioritaire, comme le web)", () => {
    const s = baseSituation({ capManquantRetraite: 500000 });
    const offre = computeNew3aOffer({ wizard: wizard({ monthlyBudget: 300 }), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")] });
    expect(offre.grossTotal).toBeGreaterThan(300);
    expect(offre.recoEpargne).toBeGreaterThan(300);
  });

  it("respecte les overrides d'édition (toggle décès off + prime d'épargne éditée)", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 0 },
    });
    const base = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_family"] }),
      situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")],
    });
    expect(base.selDec).toBe(true);

    const edited = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_family"] }),
      situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")],
      overrides: { selDec: false, hasUserEditedEpargne: true, primeEpargne: 200 },
    });
    expect(edited.selDec).toBe(false);
    expect(edited.premiums.ret).toBe(200);              // prime d'épargne éditée respectée
    expect(edited.grossTotal).toBeLessThan(base.grossTotal); // décès retiré → total plus bas
  });

  it("répartit sur le 3a jusqu'au plafond restant puis le 3b", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      fiscal: { investi3aAnnuel: 7200, plafond3a: 7258, pourcentUtilise: 99, gainFiscalAnnuel: 0, tauxMarginal: 0.25 },
    });
    const offre = computeNew3aOffer({ wizard: wizard(), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")] });
    // plafond restant = 58/an < 50/mois → tout en 3b, pas de gain fiscal
    expect(offre.split3a).toBe(0);
    expect(offre.split3b).toBeGreaterThan(0);
    expect(offre.taxSaving).toBe(0);
  });
});
