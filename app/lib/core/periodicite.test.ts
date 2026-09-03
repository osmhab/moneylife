import { describe, it, expect } from "vitest";
import { montantAnnuel, montantMensuel, versementsParAn } from "./periodicite";

describe("periodicite — conversion des primes", () => {
  it("annualise selon la périodicité", () => {
    expect(montantAnnuel(100, "mois")).toBe(1_200);
    expect(montantAnnuel(300, "trimestre")).toBe(1_200);
    expect(montantAnnuel(1_200, "annee")).toBe(1_200);
  });

  it("mensualise selon la périodicité", () => {
    expect(montantMensuel(300, "trimestre")).toBe(100);
    expect(montantMensuel(1_200, "annee")).toBe(100);
    expect(montantMensuel(100, "mois")).toBe(100);
  });

  // Les fiches créées avant l'introduction du champ n'ont pas d'`occurrence` :
  // leur montant a toujours été interprété comme mensuel, ça ne doit pas bouger.
  it("sans périodicité connue → mensuel (valeur historique)", () => {
    expect(versementsParAn(undefined)).toBe(12);
    expect(versementsParAn(null)).toBe(12);
    expect(versementsParAn("bidon")).toBe(12);
    expect(montantAnnuel(100)).toBe(1_200);
  });

  it("garde anti-NaN sur une saisie non numérique", () => {
    expect(montantAnnuel("", "mois")).toBe(0);
    expect(montantAnnuel(undefined, "trimestre")).toBe(0);
  });
});
