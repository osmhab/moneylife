import { describe, it, expect } from "vitest";
import { buildDecesMaladieMatrix, buildRetraiteMatrix, buildInvaliditeMaladieMatrix } from "./matrices";
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
  Enter_salaireAnnuel: 103_000,
  Enter_dateNaissance: "22.03.1984", // ~ Isabelle O.
  Enter_etatCivil: 1,
} as unknown as ClientData;

// Base (CPVAL) : capital décès "plus rente".
const planBase = { type: "LPP_BASE", institutionName: "CPVAL", data: { Enter_CapitalPlusRenteMal: 400_000 } };
// Complémentaire (Profelia) : plan surobligatoire distinct, mêmes champs Enter_*.
const planCompl = { type: "LPP_COMPL", institutionName: "Profelia", data: { Enter_CapitalPlusRenteMal: 100_000 } };
// Libre passage compte (banque) : capital seul.
const planLP = { type: "LIBRE_PASSAGE_COMPTE", institutionName: "Fondation LP", data: { soldeActuel: 60_000, capitalRetraiteGlobal: 80_000 } };

const capital0 = (m: { rows: { label: string; cells: any[] }[] }) =>
  Number(m.rows.find((r) => r.label === "Prestations en capital / indemnité unique")?.cells?.[0]) || 0;
const lppRowSum = (m: { rows: { label: string; cells: any[] }[] }) =>
  (m.rows.find((r) => r.label === "LPP")?.cells ?? []).reduce((a: number, c: any) => a + (Number(c) || 0), 0);

describe("2e pilier multiple — agrégation base + complémentaire + libre passage", () => {
  it("décès : le capital du plan COMPLÉMENTAIRE s'additionne à celui de la BASE", () => {
    const base = capital0(buildDecesMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase]));
    const baseCompl = capital0(buildDecesMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase, planCompl]));
    expect(base).toBe(400_000);
    expect(baseCompl).toBe(500_000); // 400k (base) + 100k (complémentaire)
  });

  it("décès : le SOLDE du libre passage s'ajoute au capital décès (versé), sans rente", () => {
    const avecLP = capital0(buildDecesMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase, planLP]));
    expect(avecLP).toBe(460_000); // 400k (base) + 60k (solde LP)
  });

  it("retraite : le capital projeté du libre passage compte dans le capital 2e pilier", () => {
    const sansLP = capital0(buildRetraiteMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase]));
    const avecLP = capital0(buildRetraiteMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase, planLP]));
    expect(avecLP - sansLP).toBe(80_000); // capitalRetraiteGlobal du LP
  });

  it("invalidité : le libre passage n'apporte AUCUNE rente (capital seul)", () => {
    const sansLP = lppRowSum(buildInvaliditeMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase]));
    const avecLP = lppRowSum(buildInvaliditeMaladieMatrix(client, legal, Legal_Echelle44_2025_Rows, [planBase, planLP]));
    expect(avecLP).toBe(sansLP); // le LP ne change rien à l'invalidité
  });
});
