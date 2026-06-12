import { describe, it, expect } from "vitest";
import {
  computeProjections3aAssurance,
  computeProjections3aBanque,
  computeDeathBenefitAssurance,
  type Data3aAssurance,
  type Data3aBanque,
} from "./3epilier";

/** Construit une assurance 3a avec des valeurs neutres, surchargeable au cas par cas. */
function makeAssurance(over: Partial<Data3aAssurance> = {}): Data3aAssurance {
  return {
    // Champs Data3aBanque
    soldeActuel: 0,
    isRegulier: false,
    isInvesti: false,
    // Champs Data3aAssurance
    typeContrat: "3a",
    primeTotale: 0,
    primeEpargne: 0,
    valeurRachatActuelle: 0,
    hasLDP: false,
    renteInvalidite: 0,
    capitalDecesFixe: 0,
    hasMandatGestion: false,
    ...over,
  };
}

describe("computeProjections3aAssurance — projection assureur (override)", () => {
  it("utilise la projection assureur si elle est > 0 (et ignore le calcul auto)", () => {
    const data = makeAssurance({
      projectionAssureur: 123456.7,
      valeurRachatActuelle: 999_999, // doit être ignoré
    });
    // La projection assureur prime et est arrondie.
    expect(computeProjections3aAssurance(data, 30)).toBe(123457);
  });

  it("ignore une projection assureur égale à 0 et retombe sur le calcul auto", () => {
    const data = makeAssurance({ projectionAssureur: 0, valeurRachatActuelle: 10_000 });
    // Pas investi -> r = 0.5%, n = 1, aucune prime -> 10000 * 1.005 = 10050
    expect(computeProjections3aAssurance(data, 64)).toBe(10_050);
  });

  it("calcule automatiquement si aucune projection assureur n'est fournie", () => {
    const data = makeAssurance({ valeurRachatActuelle: 10_000 });
    expect(computeProjections3aAssurance(data, 64)).toBe(10_050);
  });
});

describe("computeProjections3aAssurance — calcul automatique", () => {
  it("à 65 ans (n = 0), retourne la valeur de rachat actuelle arrondie", () => {
    const data = makeAssurance({ valeurRachatActuelle: 25_000 });
    expect(computeProjections3aAssurance(data, 65)).toBe(25_000);
  });

  it("ignore les primes futures quand le contrat est libéré (isLibere)", () => {
    const data = makeAssurance({
      valeurRachatActuelle: 10_000,
      primeEpargne: 100, // ignorée car libéré
      isLibere: true,
    });
    // P = 0 -> 10000 * 1.005 = 10050
    expect(computeProjections3aAssurance(data, 64)).toBe(10_050);
  });

  it("projette à intérêt composé sur capital + primes (valeur exacte)", () => {
    const data = makeAssurance({ valeurRachatActuelle: 10_000, primeEpargne: 100 });
    // r = 0.5%, n = 2, P = 1200/an
    // capExistant = 10000 * 1.005^2 = 10100.25
    // epargneFuture = 1200 * ((1.005^2 - 1) / 0.005) = 2406
    // total = 12506.25 -> 12506
    expect(computeProjections3aAssurance(data, 63)).toBe(12_506);
  });

  it("applique le taux du profil d'investissement (équilibré = 3.5%)", () => {
    const data = makeAssurance({
      valeurRachatActuelle: 10_000,
      isInvesti: true,
      profil: "equilibre",
    });
    // r = 3.5%, n = 1, aucune prime -> 10000 * 1.035 = 10350
    expect(computeProjections3aAssurance(data, 64)).toBe(10_350);
  });
});

describe("computeProjections3aBanque", () => {
  it("projette capital + versements réguliers (valeur exacte)", () => {
    const data: Data3aBanque = {
      soldeActuel: 10_000,
      isRegulier: true,
      montantRegulier: 100,
      occurrence: "mois",
      isInvesti: false,
    };
    // r = 0.5%, n = 1, P = 1200 -> 10050 + 1200 = 11250
    expect(computeProjections3aBanque(data, 64)).toBe(11_250);
  });
});

describe("computeDeathBenefitAssurance", () => {
  it("contrat libéré → retourne l'épargne actuelle (valeur de rachat)", () => {
    const data = makeAssurance({ valeurRachatActuelle: 5_000, isLibere: true, capitalDecesFixe: 99_999 });
    expect(computeDeathBenefitAssurance(data)).toBe(5_000);
  });

  it("capital décès fixe > épargne → prend le capital fixe", () => {
    const data = makeAssurance({ valeurRachatActuelle: 5_000, capitalDecesFixe: 100_000 });
    expect(computeDeathBenefitAssurance(data)).toBe(100_000);
  });

  it("épargne > capital fixe → prend l'épargne (max des deux)", () => {
    const data = makeAssurance({ valeurRachatActuelle: 150_000, capitalDecesFixe: 100_000 });
    expect(computeDeathBenefitAssurance(data)).toBe(150_000);
  });

  it("sans capital fixe ni date de début → retourne l'épargne", () => {
    const data = makeAssurance({ valeurRachatActuelle: 5_000 });
    expect(computeDeathBenefitAssurance(data)).toBe(5_000);
  });
});
