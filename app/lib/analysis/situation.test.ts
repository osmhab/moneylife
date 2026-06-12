import { describe, it, expect } from "vitest";
import { computeSituationAnalysis } from "./situation";

/** Construit une matrice {headerYears, rows} à partir d'un objet label→cells. */
function matrix(rows: Record<string, number[]>, headerYears: number[]) {
  return {
    headerYears,
    rows: Object.entries(rows).map(([label, cells]) => ({ label, cells })),
  };
}

/** cloudData synthétique : salaire 60k, rentes connues, célibataire sans enfant, aucun plan 3a. */
function cloudData() {
  const igYears = [40, 41, 42, 43]; // idx<2 ignorés
  return {
    Enter_salaireAnnuel: 60_000,
    Enter_etatCivil: 0,
    Enter_enfants: [],
    projections: {
      retraite: matrix({ "Besoin (Salaire)": [60_000], "AVS/AI": [24_000], "LPP": [18_000] }, [65]),
      invalidite_maladie: matrix(
        { "AVS/AI": [12_000, 12_000, 12_000, 12_000], LPP: [6_000, 6_000, 6_000, 6_000], LAA: [0, 0, 0, 0] },
        igYears
      ),
      invalidite_accident: matrix(
        { "AVS/AI": [12_000, 12_000, 12_000, 12_000], LPP: [6_000, 6_000, 6_000, 6_000], LAA: [0, 0, 0, 0] },
        igYears
      ),
      deces_maladie: matrix({ "Prestations en capital / indemnité unique": [100_000] }, [40]),
    },
  };
}

describe("computeSituationAnalysis", () => {
  it("retourne null sans projections ni salaire", () => {
    expect(computeSituationAnalysis({ cloudData: {}, plans: [] })).toBeNull();
  });

  it("retraite : besoin 80%, couverture AVS+LPP, lacune et score exacts", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    // cible = 60000*0.8/12 = 4000 ; rente = (24000+18000)/12 = 3500 ; lacune = 500 ; score = 70
    expect(r.retraite.besoin).toBe(4_000);
    expect(r.retraite.couverture).toBe(3_500);
    expect(r.retraite.lacune).toBe(500);
    expect(r.retraite.score).toBe(70);
  });

  it("invalidité : besoin 90%, lacune et score exacts", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    // cible = 60000*0.9/12 = 4500 ; rentes = 18000/12 = 1500 ; lacune = 3000 ; score = 30
    expect(r.invaliditeMaladie.besoin).toBe(4_500);
    expect(r.invaliditeMaladie.lacune).toBe(3_000);
    expect(r.invaliditeMaladie.couverture).toBe(1_500);
    expect(r.invaliditeMaladie.score).toBe(30);
    expect(r.invaliditeAccident.score).toBe(30); // mêmes données
  });

  it("décès : besoin par défaut 20000, capitaux couvrent → lacune 0", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    expect(r.deces.besoin).toBe(20_000);
    expect(r.deces.couverture).toBe(100_000);
    expect(r.deces.lacune).toBe(0);
  });

  it("score global pondéré (célibataire : 60/40/0) = 54", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    // 70*0.6 + 30*0.4 + scoreDec*0 = 42 + 12 = 54
    expect(r.totalScore).toBe(54);
  });

  it("fiscal : aucun plan 3a → 0 investi", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    expect(r.fiscal.investi3aAnnuel).toBe(0);
    expect(r.fiscal.plafond3a).toBe(7_258);
  });
});
