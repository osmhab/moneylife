import { describe, it, expect } from "vitest";
import {
  computeProjections3aAssurance,
  computeProjections3aBanque,
  computeProjectionsEpargneLibre,
  computeDeathBenefitAssurance,
  yearsToMaturity,
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

describe("computeProjectionsEpargneLibre (cash)", () => {
  it("compte épargne non investi : taux 0% → solde + versements sans intérêt", () => {
    const data: Data3aBanque = {
      soldeActuel: 10_000, isRegulier: true, montantRegulier: 100,
      occurrence: "mois", isInvesti: false,
    };
    // r = 0%, n = 1, P = 1200 -> 10000 + 1200 = 11200 (aucun intérêt, contrairement au 3a banque à 0,5%)
    expect(computeProjectionsEpargneLibre(data, 64)).toBe(11_200);
  });

  it("investi (ETF/actions) : intérêt composé selon le profil (comme 3a investi)", () => {
    const data: Data3aBanque = {
      soldeActuel: 10_000, isRegulier: false, isInvesti: true, profil: "growth",
    };
    // r = 5%, n = 1 -> 10000 * 1.05 = 10500 (identique au 3a investi même profil)
    expect(computeProjectionsEpargneLibre(data, 64)).toBe(10_500);
    expect(computeProjectionsEpargneLibre(data, 64))
      .toBe(computeProjections3aBanque(data, 64));
  });

  it("à 65 ans : pas de projection, renvoie le solde", () => {
    expect(computeProjectionsEpargneLibre({ soldeActuel: 42_000, isRegulier: false, isInvesti: false }, 65)).toBe(42_000);
  });

  it("court terme (utilisée dans l'année) : aucune projection retraite → 0", () => {
    const data = { soldeActuel: 20_000, isRegulier: false, isInvesti: true, profil: "growth", epargneHorizon: "court" };
    expect(computeProjectionsEpargneLibre(data as any, 35)).toBe(0);
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

describe("yearsToMaturity — horizon de capitalisation", () => {
  const AT = new Date("2026-07-20T12:00:00Z");

  it("retombe sur 65 - âge quand l'échéance est absente", () => {
    // NON-RÉGRESSION : les plans déjà en base n'ont pas ce champ, leur
    // résultat ne doit pas bouger d'un franc.
    expect(yearsToMaturity(undefined, 40, AT)).toBe(25);
    expect(yearsToMaturity(null, 30, AT)).toBe(35);
    expect(yearsToMaturity("", 50, AT)).toBe(15);
  });

  it("retombe aussi sur 65 - âge si la date est illisible", () => {
    // Une date invalide ne doit pas produire un horizon nul (capital ecrasé),
    // mais se comporter comme une date absente.
    expect(yearsToMaturity("pas une date", 40, AT)).toBe(25);
    expect(yearsToMaturity("31.02.2030", 40, AT)).toBe(25); // 31 février
  });

  it("accepte les DEUX formats de date qui circulent dans l'app", () => {
    const iso = yearsToMaturity("2036-07-20", 40, AT);
    const mask = yearsToMaturity("20.07.2036", 40, AT);
    expect(iso).toBeCloseTo(10, 1);
    expect(mask).toBeCloseTo(10, 1);
    expect(iso).toBeCloseTo(mask, 5);
  });

  it("prime sur l'hypothèse des 65 ans", () => {
    // Client de 40 ans dont la police échoit dans 5 ans : 5, pas 25.
    expect(yearsToMaturity("20.07.2031", 40, AT)).toBeCloseTo(5, 1);
  });

  it("ne renvoie jamais de valeur négative sur une échéance passée", () => {
    expect(yearsToMaturity("20.07.2020", 40, AT)).toBe(0);
  });
});

describe("computeProjections3aAssurance — effet de la date d'échéance", () => {
  it("projette moins loin quand la police échoit avant 65 ans", () => {
    const base = { valeurRachatActuelle: 50_000, primeEpargne: 500, occurrence: "mois" as const };
    const sans = computeProjections3aAssurance(makeAssurance(base), 40);
    const avec = computeProjections3aAssurance(
      makeAssurance({ ...base, dateEcheance: `20.07.${new Date().getFullYear() + 5}` }),
      40
    );
    // Avant le correctif, les deux renvoyaient la MÊME valeur (25 ans d'horizon)
    // et le capital d'une police échéant à 45 ans était largement surévalué.
    expect(avec).toBeLessThan(sans);
  });

  it("laisse l'override projectionAssureur prioritaire malgré l'échéance", () => {
    // La règle §2.3 de CLAUDE.md ne doit pas être affaiblie par ce changement.
    const p = computeProjections3aAssurance(
      makeAssurance({
        projectionAssureur: 123_456,
        valeurRachatActuelle: 50_000,
        primeEpargne: 500,
        dateEcheance: "20.07.2031",
      }),
      40
    );
    expect(p).toBe(123_456);
  });
});
