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

  it("couches : décomposent la couverture par pilier (somme = couverture)", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;

    // Retraite : AVS 2000 + LPP 1500 (3a absent → filtré) = 3500 = couverture.
    expect(r.retraite.layers.map((l) => l.key)).toEqual(["avs", "lpp"]);
    expect(r.retraite.layers.find((l) => l.key === "avs")!.amount).toBe(2_000);
    expect(r.retraite.layers.find((l) => l.key === "lpp")!.amount).toBe(1_500);
    expect(r.retraite.layers.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.retraite.couverture);

    // Invalidité : AVS 1000 + LPP 500 (LAA 0 et 3a absents → filtrés) = 1500.
    expect(r.invaliditeMaladie.layers.map((l) => l.key)).toEqual(["avs", "lpp"]);
    expect(r.invaliditeMaladie.layers.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(
      r.invaliditeMaladie.couverture
    );

    // Décès : capital LPP/LAA 100000 (3a absent → filtré).
    expect(r.deces.layers.map((l) => l.key)).toEqual(["lpp"]);
    expect(r.deces.layers[0].amount).toBe(100_000);
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

  it("source LPP : capital AFFICHÉ = capital projeté du certificat, pas rente×25", () => {
    // Un plan LPP portant le capital projeté du certificat (350'945). L'ancien calcul
    // affichait rente×25 = 18000×25 = 450'000 (gonflé). Le fix retient 350'945.
    const lppPlan = {
      id: "lpp1",
      type: "LPP",
      status: "ACTIVE",
      data: { Enter_lppCapitalProjete65: 350_945, allocationRetraite: 100 },
    };
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [lppPlan] })!;
    const src = r.retraiteSources.find((s) => s.type === "LPP_BASE")!;
    expect(src.capital).toBe(350_945); // certificat, pas 18000×25=450000
    // La rente/lacune reste inchangée (basée sur la rente LPP de la matrice, pas le capital).
    expect(r.retraite.couverture).toBe(3_500);
  });

  it("source LPP : repli sur rente×25 si le certificat ne porte pas de projection", () => {
    const lppPlan = { id: "lpp1", type: "LPP", status: "ACTIVE", data: { allocationRetraite: 100 } };
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [lppPlan] })!;
    const src = r.retraiteSources.find((s) => s.type === "LPP_BASE")!;
    expect(src.capital).toBe(18_000 * 25); // fallback = rente×25
  });

  it("plafond couple : AFFICHÉ à part, sans toucher la lacune (rente individuelle)", () => {
    // Individuel AVS = 2000/mois. Plafond couple = 3150/mois (total ménage).
    const r = computeSituationAnalysis({
      cloudData: cloudData(),
      plans: [],
      avsCouplePlafondMensuel: 3_150,
    })!;
    // La couverture reste sur la rente INDIVIDUELLE : (24000+18000)/12 = 3500.
    expect(r.retraite.couverture).toBe(3_500);
    // La couche AVS reste individuelle (2000), pas le total ménage.
    expect(r.retraite.layers.find((l) => l.key === "avs")!.amount).toBe(2_000);
    // Le plafond couple est exposé pour l'affichage en note « * ».
    expect(r.avsCouplePlafondMensuel).toBe(3_150);
  });

  it("plafond couple : non exposé si ≤ rente individuelle (rien à montrer)", () => {
    // Individuel AVS = 2000/mois. Plafond couple 1800 < individuel → non affiché.
    const r = computeSituationAnalysis({
      cloudData: cloudData(),
      plans: [],
      avsCouplePlafondMensuel: 1_800,
    })!;
    expect(r.avsCouplePlafondMensuel).toBeUndefined();
    expect(r.retraite.couverture).toBe(3_500); // inchangé
  });

  it("plafond couple : absent (célibataire) → champ non présent", () => {
    const r = computeSituationAnalysis({ cloudData: cloudData(), plans: [] })!;
    expect(r.avsCouplePlafondMensuel).toBeUndefined();
  });
});
