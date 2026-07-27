import { describe, it, expect } from "vitest";
import { computeNew3aOffer, calculatePredictedRate, deriveTargets, pickCheapestInsurer, pickBestSaver, allocateBudget, type New3aWizard } from "./new3a";
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

  it("plancher rente IG : lacune positive < 250/mois (3'000/an) → 250/mois", () => {
    const s = baseSituation({
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 180, score: 0 }, // 2'160/an
      invaliditeAccident: { besoin: 0, couverture: 0, lacune: 120, score: 0 },
    });
    expect(deriveTargets(s).maladie).toBe(250);
  });

  it("plancher rente IG : lacune ≥ 250/mois inchangée ; lacune nulle reste 0", () => {
    const above = baseSituation({
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 300, score: 0 }, // 3'600/an
      invaliditeAccident: { besoin: 0, couverture: 0, lacune: 0, score: 0 },
    });
    expect(deriveTargets(above).maladie).toBe(300);

    const none = baseSituation(); // toutes lacunes à 0
    expect(deriveTargets(none).maladie).toBe(0);
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

  it("profil de risque : module la projection MÊME avec un rendement provider", () => {
    // benchmark("A") a un yieldMedian > 0 → rendement provider retenu, PUIS modulé
    // par le profil (dynamique majore, garanti minore) : l'ordre doit être respecté.
    const s = baseSituation({ capManquantRetraite: 100000 });
    const garanti = computeNew3aOffer({ wizard: wizard({ riskProfile: "guaranteed" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [benchmark("A")] });
    const dynamique = computeNew3aOffer({ wizard: wizard({ riskProfile: "dynamic" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [benchmark("A")] });
    expect(dynamique.projectedRetirement).toBeGreaterThan(garanti.projectedRetirement);
  });

  it("épargne : à profil égal, un meilleur rendement provider projette plus de capital", () => {
    const s = baseSituation({ capManquantRetraite: 100000 });
    const faible = { ...benchmark("A"), yieldMedian: 2 };
    const fort = { ...benchmark("B"), yieldMedian: 6 };
    const o1 = computeNew3aOffer({ wizard: wizard({ riskProfile: "balanced" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [faible] });
    const o2 = computeNew3aOffer({ wizard: wizard({ riskProfile: "balanced" }), situation: s, clientAge: 35, clientGender: "M", benchmarks: [fort] });
    expect(o2.projectedRetirement).toBeGreaterThan(o1.projectedRetirement);
  });

  it("cale le total sur le budget quand l'épargne idéale y tient (réconciliation)", () => {
    // Aucune lacune retraite → épargne idéale = 0 → on consomme le budget disponible.
    const s = baseSituation({ capManquantRetraite: 0 });
    const offre = computeNew3aOffer({ wizard: wizard({ monthlyBudget: 300 }), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")] });
    // épargne = budget/(1+payRate) ; payCost = épargne*payRate ⇒ total ≈ budget.
    expect(offre.grossTotal).toBeCloseTo(300, 0);
  });

  it("budget = plafond DUR : la prime ne dépasse pas le budget (idéal exposé, non forcé)", () => {
    const s = baseSituation({ capManquantRetraite: 500000 });
    const offre = computeNew3aOffer({ wizard: wizard({ monthlyBudget: 300 }), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")] });
    expect(offre.grossTotal).toBeLessThanOrEqual(305);   // plafonné au budget (~300)
    expect(offre.recoEpargne).toBeGreaterThan(300);       // l'idéal reste un conseil affiché
  });

  it("bouton Recommandation (fillGap) : cale sur l'idéal, quitte à dépasser le budget", () => {
    const s = baseSituation({ capManquantRetraite: 500000 });
    const offre = computeNew3aOffer({ wizard: wizard({ monthlyBudget: 300 }), situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")], overrides: { fillGap: true } });
    expect(offre.grossTotal).toBeGreaterThan(300);
    expect(offre.premiums.ret).toBeGreaterThan(300);
  });

  it("fillGap active AUSSI les couvertures risque ciblées à lacune (pas que l'épargne)", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 30 },
      invaliditeAccident: { besoin: 0, couverture: 0, lacune: 1000, score: 30 },
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 40 },
    });
    const o = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_income", "protection_family"], monthlyBudget: 100 }),
      situation: s, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")],
      overrides: { selInc: false, selDec: false, fillGap: true }, // désactivées au départ
    });
    expect(o.selInc).toBe(true);  // invalidité ciblée + lacune → activée par la reco
    expect(o.selDec).toBe(true);  // décès ciblé + lacune → activé par la reco
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

describe("best-of-breed provider selection", () => {
  // Modèle Ridge à taux plat (beta age/fumeur/femme = 0 → rate = `rate` quel que soit l'âge).
  const unit = (rate: number, nObs = 50) => ({ beta: [Math.log(rate), 0, 0, 0], fallbackLogMean: Math.log(rate), nObs });
  const mk = (
    provider: string,
    o: { death: number; dis: number; waiver: number; yieldMedian: number; deathObs?: number }
  ) => ({
    provider,
    deathUnit: unit(o.death, o.deathObs ?? 50),
    disabilityUnit: unit(o.dis),
    waiverRate: unit(o.waiver),
    smokerFloors: { death: 1, disability: 1, waiver: 1 },
    yieldMedian: o.yieldMedian,
  });

  // Baloise a le décès le moins cher (0.0005) MAIS sur 0 benchmark (repli) → doit être écarté.
  const benches = [
    mk("AXA", { death: 0.001, dis: 0.02, waiver: 0.03, yieldMedian: 5.04 }),
    mk("Baloise", { death: 0.0005, dis: 0.015, waiver: 0.025, yieldMedian: 4.1, deathObs: 0 }),
    mk("SwissLife", { death: 0.0008, dis: 0.008, waiver: 0.02, yieldMedian: 0 }),
  ];

  it("décès : écarte le modèle nObs<3 (repli) et prend le moins cher FIABLE", () => {
    // Baloise 0.0005 exclu (nObs=0) → reste AXA 0.001 vs SwissLife 0.0008 → SwissLife.
    expect(pickCheapestInsurer(benches, "deathUnit", "death", 40, false, false)?.provider).toBe("SwissLife");
  });

  it("invalidité : prend le taux le plus bas", () => {
    // AXA 0.02, Baloise 0.015, SwissLife 0.008 → SwissLife.
    expect(pickCheapestInsurer(benches, "disabilityUnit", "disability", 40, false, false)?.provider).toBe("SwissLife");
  });

  it("épargne : meilleur yieldMedian > 0 (SwissLife=0 écarté)", () => {
    expect(pickBestSaver(benches)?.provider).toBe("AXA");
  });

  it("aucun modèle fiable → null (repli forfaitaire côté offre)", () => {
    expect(pickCheapestInsurer([], "deathUnit", "death", 40, false, false)).toBeNull();
    expect(pickBestSaver([{ provider: "X", yieldMedian: 0 }])).toBeNull();
  });

  it("computeNew3aOffer : providers best-of-breed PAR produit (mix d'assureurs)", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 0 },
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 0 },
    });
    const o = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_income", "protection_family"] }),
      situation: s, clientAge: 40, clientGender: "M", benchmarks: benches,
    });
    expect(o.providers.dec).toBe("SwissLife"); // décès le moins cher fiable
    expect(o.providers.inc).toBe("SwissLife"); // invalidité la moins chère
    expect(o.providers.ret).toBe("AXA");       // meilleur rendement épargne
    expect(o.provider).toBe("AXA");            // legacy = épargne
  });

  it("computeNew3aOffer : sans benchmark → providers 'Sur mesure'", () => {
    const o = computeNew3aOffer({
      wizard: wizard(), situation: baseSituation({ deces: { besoin: 0, couverture: 0, lacune: 100000, score: 0 } }),
      clientAge: 40, clientGender: "M", benchmarks: [],
    });
    expect(o.providers.dec).toBe("Sur mesure");
    expect(o.providers.ret).toBe("Sur mesure");
  });

  it("comparaison : sur ces données l'ÉCLATÉ gagne + une libération PAR contrat", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 0 },
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 0 },
    });
    const o = computeNew3aOffer({
      wizard: wizard({ objective: ["protection_income", "protection_family"] }),
      situation: s, clientAge: 40, clientGender: "M", benchmarks: benches,
    });
    expect(o.comparison.recommended).toBe("eclate");
    expect(o.comparison.regroupe).not.toBeNull();
    // Éclaté : épargne@AXA + invalidité/décès@SwissLife → 2 contrats → 2 libérations.
    expect(o.waivers.map((w) => w.provider).sort()).toEqual(["AXA", "SwissLife"]);
    expect(o.comparison.eclate.nbContrats).toBe(2);
  });

  it("comparaison : le REGROUPÉ gagne si le meilleur rendement a une libération punitive", () => {
    // A = meilleur rendement (8) MAIS libération énorme (0.5) et pas de données invalidité/décès.
    // B = rendement quasi égal (7.9) + libération minuscule (0.001). Regrouper chez B doit gagner
    //     (capital ~identique, mais la libération de A ronge la prime épargne).
    const A = { provider: "A", yieldMedian: 8, deathUnit: unit(0.001, 0), disabilityUnit: unit(0.01, 0), waiverRate: unit(0.5), smokerFloors: { death: 1, disability: 1, waiver: 1 } };
    const B = { provider: "B", yieldMedian: 7.9, deathUnit: unit(0.001), disabilityUnit: unit(0.01), waiverRate: unit(0.001), smokerFloors: { death: 1, disability: 1, waiver: 1 } };
    const s = baseSituation({ capManquantRetraite: 100000 }); // épargne seule (pas d'inc/dec)
    const o = computeNew3aOffer({ wizard: wizard(), situation: s, clientAge: 35, clientGender: "M", benchmarks: [A, B] });
    expect(o.comparison.recommended).toBe("regroupe");
    expect(o.providers.ret).toBe("B");
    expect(o.comparison.regroupe!.net).toBeGreaterThan(o.comparison.eclate.net);
  });
});

describe("allocateBudget (slider recommandation)", () => {
  const situ = () => baseSituation({
    capManquantRetraite: 100000,
    invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 20 },
    invaliditeAccident: { besoin: 0, couverture: 0, lacune: 1000, score: 20 },
    deces: { besoin: 0, couverture: 0, lacune: 100000, score: 60 },
  });
  const wiz = wizard({ objective: ["protection_income", "protection_family"] });
  const alloc = (budget: number) => allocateBudget({
    situation: situ(), wizard: wiz, clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")], budget,
  });

  it("budget max → toutes les couvertures à lacune activées + recoMax > 0", () => {
    const a = alloc(100000);
    expect(a.selInc).toBe(true);
    expect(a.selDec).toBe(true);
    expect(a.recoMax).toBeGreaterThan(0);
  });

  it("budget minimal → épargne seule (aucun risque ne rentre)", () => {
    const a = alloc(55);
    expect(a.selInc).toBe(false);
    expect(a.selDec).toBe(false);
  });

  it("budget serré → la PLUS GROSSE lacune d'abord (invalidité, score le plus bas)", () => {
    const a = alloc(65);
    expect(a.selInc).toBe(true);
    expect(a.selDec).toBe(false);
  });

  it("priorité inversée : si le DÉCÈS a la plus grosse lacune, il passe d'abord", () => {
    const s = baseSituation({
      capManquantRetraite: 100000,
      invaliditeMaladie: { besoin: 0, couverture: 0, lacune: 1000, score: 70 },
      invaliditeAccident: { besoin: 0, couverture: 0, lacune: 1000, score: 70 },
      deces: { besoin: 0, couverture: 0, lacune: 100000, score: 15 },
    });
    const a = allocateBudget({ situation: s, wizard: wizard({ objective: ["protection_income", "protection_family"] }), clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")], budget: 65 });
    expect(a.selDec).toBe(true);
    expect(a.selInc).toBe(false);
  });

  it("respecte les objectifs : sans objectif décès, on ne comble PAS le décès même à budget max", () => {
    const a = allocateBudget({
      situation: situ(), wizard: wizard({ objective: ["protection_income"] }), // pas de protection_family
      clientAge: 40, clientGender: "M", benchmarks: [benchmark("A")], budget: 100000,
    });
    expect(a.selInc).toBe(true);   // objectif invalidité présent
    expect(a.selDec).toBe(false);  // décès NON ciblé → jamais activé
  });
});
