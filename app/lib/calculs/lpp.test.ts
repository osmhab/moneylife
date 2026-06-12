import { describe, it, expect } from "vitest";
import {
  computeLPPProjectionRetraite,
  calcRenteInvaliditeLPP,
  calcRenteEnfantInvaliditeLPP,
  calcRenteConjointLPP,
  calcRenteOrphelinLPP,
  calcRenteVieillesseLPP,
  calcLegalSalaireAssureLPP,
  calcSalaireAssureRisqueLPP,
  calcSalaireAssureEpargneLPP,
} from "./lpp";
import type { ClientData, Legal_Settings } from "@/lib/core/types";

/** ClientData est entièrement optionnel : on ne renseigne que les champs testés. */
function client(over: Partial<ClientData> = {}): ClientData {
  return { ...over };
}

/** Paramètres légaux 2025 (valeurs réelles), surchargeables. */
function legal(over: Partial<Legal_Settings> = {}): Legal_Settings {
  return {
    Legal_SalaireAssureMaxLAA: 148_200,
    Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
    Legal_ijAccidentTaux: 80,
    Legal_DeductionCoordinationMinLPP: 26_460,
    Legal_SeuilEntreeLPP: 22_680,
    Legal_SalaireMaxLPP: 90_720,
    Legal_SalaireAssureMaxLPP: 64_260,
    Legal_SalaireAssureMinLPP: 3_780,
    Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
    Legal_CotisationsMinLPP: {},
    Legal_AgeRetraiteAVS: 65,
    Legal_AgeLegalCotisationsAVS: 21,
    Legal_BTE_AnnualCredit: 0,
    Legal_BTA_AnnualCredit: 0,
    Legal_BTE_SplitMarried: 0.5,
    ...over,
  };
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

describe("calcLegalSalaireAssureLPP — bornes légales (clamp)", () => {
  it("borne haute : salaire élevé plafonné au max légal", () => {
    // 100000 - 26460 = 73540 > 64260 -> 64260
    expect(calcLegalSalaireAssureLPP(client({ Enter_salaireAnnuel: 100_000 }), legal())).toBe(64_260);
  });

  it("borne basse : salaire faible relevé au min légal", () => {
    // 28000 - 26460 = 1540 < 3780 -> 3780
    expect(calcLegalSalaireAssureLPP(client({ Enter_salaireAnnuel: 28_000 }), legal())).toBe(3_780);
  });

  it("dans les bornes : salaire - déduction sans clamp", () => {
    // 60000 - 26460 = 33540
    expect(calcLegalSalaireAssureLPP(client({ Enter_salaireAnnuel: 60_000 }), legal())).toBe(33_540);
  });
});

describe("calcSalaireAssureRisqueLPP — cascade de priorité (dont mode split)", () => {
  it("priorité 1 : champ IA spécifique (Enter_lppSalaireAssureRisque)", () => {
    const c = client({
      Enter_lppSalaireAssureRisque: 48_000,
      Enter_salaireAssureLPP: 55_000, // ignoré
    });
    expect(calcSalaireAssureRisqueLPP(c, legal())).toBe(48_000);
  });

  it("priorité 2 : certificat SPLIT (Enter_salaireAssureLPPRisque)", () => {
    const c = client({
      Enter_typeSalaireAssure: "split",
      Enter_salaireAssureLPPRisque: 50_000,
    });
    expect(calcSalaireAssureRisqueLPP(c, legal())).toBe(50_000);
  });

  it("priorité 3 : certificat général (Enter_salaireAssureLPP)", () => {
    const c = client({ Enter_salaireAssureLPP: 55_000 });
    expect(calcSalaireAssureRisqueLPP(c, legal())).toBe(55_000);
  });

  it("priorité 4 : fallback légal si rien n'est fourni", () => {
    expect(calcSalaireAssureRisqueLPP(client({ Enter_salaireAnnuel: 60_000 }), legal())).toBe(33_540);
  });
});

describe("calcSalaireAssureEpargneLPP — mode split épargne", () => {
  it("certificat général prioritaire", () => {
    const c = client({ Enter_salaireAssureLPP: 55_000, Enter_salaireAssureLPPEpargne: 52_000 });
    expect(calcSalaireAssureEpargneLPP(c, legal())).toBe(55_000);
  });

  it("certificat SPLIT épargne si pas de général", () => {
    const c = client({ Enter_typeSalaireAssure: "split", Enter_salaireAssureLPPEpargne: 52_000 });
    expect(calcSalaireAssureEpargneLPP(c, legal())).toBe(52_000);
  });
});

describe("calcRenteVieillesseLPP — courbe dynamique par âge", () => {
  it("âge 65 par défaut", () => {
    expect(calcRenteVieillesseLPP(client({ Enter_rentevieillesseLPP65: 18_000 }))).toBe(18_000);
  });

  it("âge cible spécifique (60)", () => {
    const c = client({ Enter_rentevieillesseLPP60: 15_000, Enter_rentevieillesseLPP65: 18_000 });
    expect(calcRenteVieillesseLPP(c, 60)).toBe(15_000);
  });

  it("fallback sur 65 si l'âge cible n'a pas de valeur", () => {
    const c = client({ Enter_rentevieillesseLPP65: 18_000 });
    expect(calcRenteVieillesseLPP(c, 62)).toBe(18_000);
  });
});

describe("calcRenteInvaliditeLPP — règle accident → fallback maladie", () => {
  it("mode maladie : prend la valeur maladie", () => {
    expect(calcRenteInvaliditeLPP(client({ Enter_renteInvaliditeMaladie: 24_000 }), "maladie")).toBe(24_000);
  });

  it("mode accident, valeur ABSENTE → fallback maladie", () => {
    expect(calcRenteInvaliditeLPP(client({ Enter_renteInvaliditeMaladie: 24_000 }), "accident")).toBe(24_000);
  });

  it("mode accident, valeur présente → prend l'accident", () => {
    const c = client({ Enter_lppRenteInvaliditeAccident: 30_000, Enter_renteInvaliditeMaladie: 24_000 });
    expect(calcRenteInvaliditeLPP(c, "accident")).toBe(30_000);
  });

  it("mode accident, 0 EXPLICITE → reste 0 (non écrasé par ??)", () => {
    const c = client({ Enter_lppRenteInvaliditeAccident: 0, Enter_renteInvaliditeMaladie: 24_000 });
    expect(calcRenteInvaliditeLPP(c, "accident")).toBe(0);
  });

  it("aucune donnée → 0", () => {
    expect(calcRenteInvaliditeLPP(client(), "accident")).toBe(0);
  });
});

describe("calcRenteEnfantInvaliditeLPP — accident → fallback maladie", () => {
  it("accident absent → valeur enfant maladie", () => {
    const c = client({ Enter_renteEnfantInvalideMaladie: 4_800 });
    expect(calcRenteEnfantInvaliditeLPP(c, "accident")).toBe(4_800);
  });

  it("0 accident explicite → reste 0", () => {
    const c = client({ Enter_renteEnfantInvalideAccident: 0, Enter_renteEnfantInvalideMaladie: 4_800 });
    expect(calcRenteEnfantInvaliditeLPP(c, "accident")).toBe(0);
  });
});

describe("calcRenteConjointLPP / calcRenteOrphelinLPP — accident → fallback maladie + 0 préservé", () => {
  it("conjoint : accident absent → valeur maladie", () => {
    expect(calcRenteConjointLPP(client({ Enter_renteConjointLPP: 12_000 }), "accident")).toBe(12_000);
  });

  it("conjoint : 0 accident explicite → reste 0", () => {
    const c = client({ Enter_lppRenteConjointAccident: 0, Enter_renteConjointLPP: 12_000 });
    expect(calcRenteConjointLPP(c, "accident")).toBe(0);
  });

  it("orphelin : accident absent → valeur maladie", () => {
    expect(calcRenteOrphelinLPP(client({ Enter_renteOrphelinLPP: 6_000 }), "accident")).toBe(6_000);
  });

  it("orphelin : 0 accident explicite → reste 0", () => {
    const c = client({ Enter_lppRenteOrphelinAccident: 0, Enter_renteOrphelinLPP: 6_000 });
    expect(calcRenteOrphelinLPP(c, "accident")).toBe(0);
  });
});
