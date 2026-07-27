import { describe, it, expect } from "vitest";
import { buildDecesMaladieMatrix } from "./matrices";
import { Legal_Echelle44_2025_Rows } from "../registry/echelle44";
import type { ClientData, Legal_Settings } from "../core/types";

const legal: Legal_Settings = {
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
  Legal_BTE_AnnualCredit: 45_360,
  Legal_BTA_AnnualCredit: 45_360,
  Legal_BTE_SplitMarried: 0.5,
} as Legal_Settings;

const client: ClientData = {
  Enter_salaireAnnuel: 144_000,
  Enter_dateNaissance: "29.01.1990",
  Enter_etatCivil: 1, // marié
} as unknown as ClientData;

// Un plan LPP AXA type : capital "plus rente" 432'000 + capital indépendant 432'000.
const planBase = {
  type: "LPP_BASE",
  institutionName: "AXA",
  data: {
    Enter_renteConjointLPP: 57_600,
    Enter_renteOrphelinLPP: 21_600,
    Enter_CapitalPlusRenteMal: 432_000,
  },
};

const capitalCol0 = (m: ReturnType<typeof buildDecesMaladieMatrix>) =>
  Number(m.rows.find((r) => r.label === "Prestations en capital / indemnité unique")?.cells?.[0]) || 0;

describe("buildDecesMaladieMatrix — capital décès indépendant", () => {
  it("ajoute le capital indépendant (versé toujours) au capital décès total", () => {
    const sans = capitalCol0(buildDecesMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase]));
    const avec = capitalCol0(
      buildDecesMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [
        { ...planBase, data: { ...planBase.data, Enter_CapitalDecesIndependantMal: 432_000 } },
      ])
    );
    expect(sans).toBe(432_000);
    expect(avec).toBe(864_000);
    expect(avec - sans).toBe(432_000);
  });
});
