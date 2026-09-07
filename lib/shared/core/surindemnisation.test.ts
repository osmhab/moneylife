import { describe, it, expect } from "vitest";
import { plafondDesPlans, reduireLpp, plafondAnnuel } from "./surindemnisation";

const plan = (v: number | null) => ({ data: v == null ? {} : { Enter_surindemnisationPlafond: v } });

describe("plafond issu des plans", () => {
  it("retient la fraction quand les plans s'accordent", () => {
    expect(plafondDesPlans([plan(0.9), plan(0.9), plan(null)])).toBe(0.9);
  });

  it("n'applique RIEN quand deux caisses annoncent des plafonds différents", () => {
    // La matrice additionne les rentes LPP sans savoir laquelle vient de quelle
    // caisse : raboter au hasard retrancherait à la mauvaise.
    expect(plafondDesPlans([plan(0.9), plan(1.0)])).toBeNull();
  });

  it("n'applique rien sans plan porteur de la règle", () => {
    expect(plafondDesPlans([plan(null)])).toBeNull();
    expect(plafondDesPlans([])).toBeNull();
  });

  it("écarte une fraction absurde", () => {
    expect(plafondDesPlans([plan(90)])).toBeNull();
    expect(plafondDesPlans([plan(0)])).toBeNull();
  });
});

describe("réduction de la part LPP", () => {
  const revenus = { ai: 30000, lpp: 50000, laa: 0, ij: 0 };

  it("rabote l'excédent", () => {
    // 80'000 de cumul contre 72'000 de plafond.
    expect(reduireLpp(revenus, 72000)).toEqual({ lpp: 42000, reduction: 8000 });
  });

  it("ne touche à rien sous le plafond", () => {
    expect(reduireLpp(revenus, 100000)).toEqual({ lpp: 50000, reduction: 0 });
  });

  it("compte la LAA et les indemnités journalières", () => {
    // Les IJ entrent dans le décompte (chiffre 73.3).
    const r = reduireLpp({ ai: 0, lpp: 40000, laa: 20000, ij: 20000 }, 72000);
    expect(r.lpp).toBe(32000);
  });

  it("ne descend jamais sous zéro : l'AI reste due", () => {
    const r = reduireLpp({ ai: 80000, lpp: 20000, laa: 0, ij: 0 }, 72000);
    expect(r.lpp).toBe(0);
    expect(r.reduction).toBe(20000);
  });

  it("ne rabote rien sans plafond", () => {
    expect(reduireLpp(revenus, null).lpp).toBe(50000);
  });
});

describe("plafond annuel", () => {
  it("se calcule depuis le revenu et la fraction", () => {
    expect(plafondAnnuel(80000, 0.9)).toBe(72000);
  });

  it("n'existe pas sans revenu ni sans fraction", () => {
    expect(plafondAnnuel(null, 0.9)).toBeNull();
    expect(plafondAnnuel(80000, null)).toBeNull();
  });
});
