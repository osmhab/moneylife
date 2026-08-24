import { describe, it, expect } from "vitest";
import { computeMinimalLPP, buildMinimalLPPPlan, LPP_MIN_2025 } from "./lppMinimum";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import {
  buildRetraiteMatrix,
  buildInvaliditeMaladieMatrix,
  buildInvaliditeAccidentMatrix,
  buildDecesMaladieMatrix,
  buildDecesAccidentMatrix,
} from "lib/shared/calculs/matrices";

const legal = LEGAL_2025 as any;
const echelle44 = Legal_Echelle44_2025.rows as any;

describe("LPP minimum légal", () => {
  it("estime des prestations cohérentes (40 ans, 90k, début 2010)", () => {
    const r = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", anneeDebutActivite: 2010 },
      LEGAL_2025,
      2025 // année figée pour un test déterministe
    );

    expect(r.assujetti).toBe(true);
    // Salaire coordonné = clamp(90000 - 26460, 3780, 64260) = 63540.
    expect(r.salaireCoordonne).toBe(63540);
    // Capital projeté > avoir actuel > 0.
    expect(r.avoirActuel).toBeGreaterThan(0);
    expect(r.capitalProjete65).toBeGreaterThan(r.avoirActuel);
    // Rente vieillesse ≈ taux de conversion × capital (à l'arrondi près).
    expect(r.renteVieillesse65).toBeCloseTo(r.capitalProjete65 * LPP_MIN_2025.tauxConversion, -1);
    // Rentes de survivants = parts de la rente d'invalidité.
    expect(r.renteConjoint).toBe(Math.round(r.renteInvalidite * 0.6));
    expect(r.renteOrphelin).toBe(Math.round(r.renteInvalidite * 0.2));

    console.log("── LPP minimum (40 ans, 90k, début 2010) ──");
    console.log("Salaire coordonné:", r.salaireCoordonne);
    console.log("Avoir actuel:", r.avoirActuel, "· Capital projeté 65:", r.capitalProjete65);
    console.log("Rente vieillesse 65:", r.renteVieillesse65, "→", Math.round(r.renteVieillesse65 / 12), "/mois");
    console.log("Rente invalidité:", r.renteInvalidite, "→", Math.round(r.renteInvalidite / 12), "/mois");
    console.log("Rente conjoint:", r.renteConjoint, "· orphelin:", r.renteOrphelin);
  });

  it("âge de début = année équivalente, et clamp à 25 ans", () => {
    // Né en 1985. Début à 25 ans → 2010.
    const parAge25 = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", ageDebutActivite: 25 },
      LEGAL_2025,
      2025
    );
    const parAnnee2010 = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", anneeDebutActivite: 2010 },
      LEGAL_2025,
      2025
    );
    expect(parAge25.capitalProjete65).toBe(parAnnee2010.capitalProjete65);

    // Début à 18 ou 19 ans → identique à 25 (épargne dès 25 ans).
    const parAge18 = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", ageDebutActivite: 18 },
      LEGAL_2025,
      2025
    );
    expect(parAge18.capitalProjete65).toBe(parAge25.capitalProjete65);
  });

  it("renvoie non-assujetti sous le seuil d'entrée", () => {
    const r = computeMinimalLPP(
      { salaireAnnuel: 20000, dateNaissance: "1990", anneeDebutActivite: 2012 },
      LEGAL_2025,
      2025
    );
    expect(r.assujetti).toBe(false);
    expect(r.capitalProjete65).toBe(0);
    expect(buildMinimalLPPPlan(r)).toBeNull();
  });

  it("alimente le moteur d'analyse (la couverture retraite LPP devient > 0)", () => {
    const base: any = {
      Enter_dateNaissance: "15.06.1985",
      Enter_salaireAnnuel: 90000,
      Enter_tauxOccupation: 100,
      Enter_etatCivil: 0,
    };
    // Client SANS LPP → puis AVEC estimation minimum légale fusionnée.
    const lpp = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", anneeDebutActivite: 2010 },
      LEGAL_2025,
      2025
    );
    const lppPlan = buildMinimalLPPPlan(lpp)!;

    const analyse = (plans: any[]) => {
      const projections = {
        retraite: buildRetraiteMatrix(base, legal, echelle44, plans),
        invalidite_maladie: buildInvaliditeMaladieMatrix(base, legal, echelle44, plans),
        invalidite_accident: buildInvaliditeAccidentMatrix(base, legal, echelle44, plans),
        deces_maladie: buildDecesMaladieMatrix(base, legal, echelle44, plans),
        deces_accident: buildDecesAccidentMatrix(base, legal, echelle44, plans),
      };
      return computeSituationAnalysis({ cloudData: { ...base, projections }, plans });
    };

    const sansLPP = analyse([])!;
    const avecLPP = analyse([lppPlan])!;

    // La couverture retraite doit augmenter grâce à la LPP estimée.
    expect(avecLPP.retraite.couverture).toBeGreaterThan(sansLPP.retraite.couverture);
    console.log(
      "Couverture retraite — sans LPP:",
      Math.round(sansLPP.retraite.couverture),
      "· avec LPP min:",
      Math.round(avecLPP.retraite.couverture)
    );
  });
});
