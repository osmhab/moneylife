import { describe, it, expect } from "vitest";
import { computeNew3aOffer } from "./new3a";

// SwissLife MOINS CHER en immédiat (taux 0.037) ; AXA plus cher immédiat (0.050) mais SEUL
// à gérer le différé (coefficient beta[4] < 0). Selon la règle : besoin différé → AXA forcé.
const axa: any = {
  provider: "AXA",
  disabilityUnit: { beta: [-3.0, 0, 0, 0, -0.03], nObs: 12 }, // immédiat exp(-3)=0.0498 ; différé moins cher
  deathUnit: { beta: [-9, 0, 0, 0], nObs: 0 },
  waiverRate: { beta: [-4, 0, 0, 0], nObs: 0 },
  smokerFloors: { death: 1.25, disability: 1.15, waiver: 1.1 },
  yieldMedian: 2,
};
const swiss: any = {
  provider: "SwissLife",
  disabilityUnit: { beta: [-3.3, 0, 0, 0], nObs: 12 }, // immédiat exp(-3.3)=0.0369 (moins cher qu'AXA)
  deathUnit: { beta: [-9, 0, 0, 0], nObs: 0 },
  waiverRate: { beta: [-4, 0, 0, 0], nObs: 0 },
  smokerFloors: { death: 1.25, disability: 1.15, waiver: 1.1 },
  yieldMedian: 2,
};
const benchmarks = [axa, swiss];
const enfants = [
  { Enter_dateNaissance: "01.01.2016", Enter_enFormation: false },
  { Enter_dateNaissance: "02.06.2019", Enter_enFormation: false },
];
const wizard: any = { objective: ["protection_income"], riskProfile: "balanced", isSmoker: false, monthlyBudget: 500 };

function situation(igSteps: any[], lacuneNow: number): any {
  return {
    invaliditeMaladie: { lacune: lacuneNow, igSteps },
    invaliditeAccident: { lacune: 0 },
    deces: { lacune: 0 },
    capManquantRetraite: 0,
    fiscal: { investi3aAnnuel: 0 },
  };
}
const call = (sit: any) =>
  computeNew3aOffer({ wizard, situation: sit, clientAge: 36, clientGender: "M", benchmarks, enfants, clientDateNaissance: "29.01.1990" });

describe("computeNew3aOffer — règle AXA forcé sur besoin différé", () => {
  it("besoin DIFFÉRÉ (rente utile plus tard) → invalidité forcée AXA (pas de comparaison)", () => {
    const sit = situation(
      [
        { fromYear: 2028, nbEnfants: 2, lacune: 0, layers: [] },
        { fromYear: 2038, nbEnfants: 0, lacune: 1080, layers: [] },
      ],
      0 // aucune lacune aujourd'hui
    );
    const offer = call(sit);
    expect(offer.rentesDifferees?.paliers.length).toBe(1);
    expect(offer.selInc).toBe(true);
    expect(offer.providers?.inc).toBe("AXA"); // AXA forcé malgré SwissLife moins cher en immédiat
  });

  it("besoin IMMÉDIAT (lacune dès aujourd'hui) → comparaison → SwissLife (moins cher)", () => {
    const sit = situation(
      [{ fromYear: 2028, nbEnfants: 2, lacune: 1080, layers: [] }],
      1080 // lacune immédiate ; 12'960/an > min SwissLife (6'000) → éligible
    );
    const offer = call(sit);
    expect(offer.selInc).toBe(true);
    expect(offer.providers?.inc).toBe("SwissLife"); // comparaison normale, moins cher gagne
  });

  it("écarte un assureur si la rente visée est SOUS son minimum", () => {
    const sit = situation(
      [{ fromYear: 2028, nbEnfants: 2, lacune: 333, layers: [] }],
      333 // 333/mois = ~4'000/an : SOUS le min SwissLife (6'000), AU-DESSUS du min AXA (3'000)
    );
    const offer = call(sit);
    expect(offer.selInc).toBe(true);
    // SwissLife (moins cher) écarté car min 6'000 > 4'000 → AXA (min 3'000) retenu.
    expect(offer.providers?.inc).toBe("AXA");
  });
});
