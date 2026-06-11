import { describe, it, expect } from "vitest";
import {
  computeLPPProjectionRetraite,
  calcRenteInvaliditeLPP,
  calcRenteConjointLPP,
} from "./lpp";
import type { ClientData } from "@/lib/core/types";

/** ClientData est entièrement optionnel : on ne renseigne que les champs testés. */
function client(over: Partial<ClientData> = {}): ClientData {
  return { ...over };
}

describe("computeLPPProjectionRetraite — priorité certificat", () => {
  it("retourne le capital certificat (capitalRetraiteGlobal) s'il est > 0", () => {
    const c = client({ capitalRetraiteGlobal: 250_000, Enter_avoirVieillesseTotal: 999_999 });
    expect(computeLPPProjectionRetraite(c, 40)).toBe(250_000);
  });

  it("retombe sur Enter_lppCapitalProjete65 si capitalRetraiteGlobal est absent", () => {
    const c = client({ Enter_lppCapitalProjete65: 200_000 });
    expect(computeLPPProjectionRetraite(c, 40)).toBe(200_000);
  });
});

describe("computeLPPProjectionRetraite — projection à intérêt composé", () => {
  it("projette avoir + cotisations à 1% (valeur exacte)", () => {
    const c = client({
      Enter_avoirVieillesseTotal: 100_000,
      Enter_lppCotisationEpargneEmploye: 3_000,
      Enter_lppCotisationEpargneEmployeur: 3_000,
    });
    // r = 1%, n = 2, cot = 6000
    // vfAvoir = 100000 * 1.01^2 = 102010
    // vfCotisations = 6000 * ((1.01^2 - 1) / 0.01) = 12060
    // total = 114070
    expect(computeLPPProjectionRetraite(c, 63)).toBe(114_070);
  });

  it("à 65 ans (n = 0), retourne l'avoir actuel sans projeter", () => {
    const c = client({ Enter_avoirVieillesseTotal: 80_000 });
    expect(computeLPPProjectionRetraite(c, 65)).toBe(80_000);
  });
});

describe("calcRenteInvaliditeLPP — règle accident → fallback maladie", () => {
  it("mode maladie : prend la valeur maladie", () => {
    const c = client({ Enter_renteInvaliditeMaladie: 24_000 });
    expect(calcRenteInvaliditeLPP(c, "maladie")).toBe(24_000);
  });

  it("mode accident, valeur accident ABSENTE → fallback sur la valeur maladie", () => {
    const c = client({ Enter_renteInvaliditeMaladie: 24_000 });
    expect(calcRenteInvaliditeLPP(c, "accident")).toBe(24_000);
  });

  it("mode accident, valeur accident présente → prend la valeur accident", () => {
    const c = client({
      Enter_lppRenteInvaliditeAccident: 30_000,
      Enter_renteInvaliditeMaladie: 24_000,
    });
    expect(calcRenteInvaliditeLPP(c, "accident")).toBe(30_000);
  });

  it("mode accident, 0 accident EXPLICITE → reste 0 (non écrasé par ??)", () => {
    const c = client({
      Enter_lppRenteInvaliditeAccident: 0,
      Enter_renteInvaliditeMaladie: 24_000,
    });
    expect(calcRenteInvaliditeLPP(c, "accident")).toBe(0);
  });

  it("aucune donnée → 0", () => {
    expect(calcRenteInvaliditeLPP(client(), "accident")).toBe(0);
  });
});

describe("calcRenteConjointLPP — accident → fallback maladie + 0 préservé", () => {
  it("accident absent → valeur conjoint maladie", () => {
    const c = client({ Enter_renteConjointLPP: 12_000 });
    expect(calcRenteConjointLPP(c, "accident")).toBe(12_000);
  });

  it("0 accident explicite → reste 0", () => {
    const c = client({ Enter_lppRenteConjointAccident: 0, Enter_renteConjointLPP: 12_000 });
    expect(calcRenteConjointLPP(c, "accident")).toBe(0);
  });
});
