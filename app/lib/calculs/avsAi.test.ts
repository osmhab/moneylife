import { describe, it, expect } from "vitest";
import {
  computeNbAnneesCotisationsCompletes,
  computeNbAnneesCotisationsEffectives,
  computeRevenuMoyen,
  getLegalRenteMinAvsMensuelle,
  getLegalRenteMaxAvsMensuelle,
  selectEchellePlancher,
  computeAvsCouple,
  computeAvsCoupleForClient,
  resolveRenteConjointMensuelle,
  isCoupleEtatCivil,
} from "./avsAi";
import type { ClientData, Legal_Settings, Legal_Echelle44Row } from "@/lib/core/types";

function client(over: Partial<ClientData> = {}): ClientData {
  return { ...over };
}

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
    Legal_BTE_AnnualCredit: 45_360,
    Legal_BTA_AnnualCredit: 45_360,
    Legal_BTE_SplitMarried: 0.5,
    ...over,
  };
}

// Échelle 44 synthétique (seules les colonnes utilisées sont renseignées).
const echelle = [
  { Legal_Income: 0, Legal_OldAgeInvalidity: 1_200, Legal_WidowWidowerSurvivor: 960 },
  { Legal_Income: 50_000, Legal_OldAgeInvalidity: 1_500, Legal_WidowWidowerSurvivor: 1_200 },
  { Legal_Income: 100_000, Legal_OldAgeInvalidity: 2_000, Legal_WidowWidowerSurvivor: 1_600 },
] as unknown as Legal_Echelle44Row[];

describe("computeNbAnneesCotisations*", () => {
  it("complètes = âge retraite - âge légal de cotisation (44)", () => {
    expect(computeNbAnneesCotisationsCompletes(legal())).toBe(44);
  });

  it("effectives par défaut = 44 (début à 21, aucune manquante)", () => {
    expect(computeNbAnneesCotisationsEffectives(client(), legal())).toBe(44);
  });

  it("effectives = brut - années manquantes (début 25, 2 manquantes → 38)", () => {
    const c = client({ Enter_ageDebutCotisationsAVS: 25, Enter_anneesManquantesAVS: [2020, 2021] });
    expect(computeNbAnneesCotisationsEffectives(c, legal())).toBe(38);
  });
});

describe("computeRevenuMoyen", () => {
  it("= salaire annuel × années effectives", () => {
    const c = client({ Enter_salaireAnnuel: 80_000 });
    // 80000 × 44 = 3 520 000
    expect(computeRevenuMoyen(c, legal())).toBe(3_520_000);
  });
});

describe("échelle 44 — rente min & sélecteur plancher", () => {
  it("rente min mensuelle = plus petit OldAgeInvalidity", () => {
    expect(getLegalRenteMinAvsMensuelle(echelle)).toBe(1_200);
  });

  it("plancher = la ligne de revenu la plus haute ≤ RAMD", () => {
    // 60000 → palier 50000
    expect(selectEchellePlancher(60_000, echelle)?.Legal_Income).toBe(50_000);
    // 100000 → palier 100000 exact
    expect(selectEchellePlancher(100_000, echelle)?.Legal_Income).toBe(100_000);
  });

  it("aucune ligne ≤ RAMD → undefined", () => {
    expect(selectEchellePlancher(-1, echelle)).toBeUndefined();
  });
});

describe("plafonnement des rentes de couple (150 %)", () => {
  // Échelle synthétique : max OldAgeInvalidity = 2000 → plafond couple = 3000.
  it("rente max mensuelle = plus grand OldAgeInvalidity", () => {
    expect(getLegalRenteMaxAvsMensuelle(echelle)).toBe(2_000);
  });

  it("somme sous le plafond → aucune réduction", () => {
    const r = computeAvsCouple(1_200, 1_500, echelle);
    expect(r.plafonnee).toBe(false);
    expect(r.facteurReduction).toBe(1);
    expect(r.renteAMensuelle).toBe(1_200);
    expect(r.renteBMensuelle).toBe(1_500);
    expect(r.renteCoupleMensuelle).toBe(2_700);
    expect(r.plafondMensuel).toBe(3_000);
  });

  it("somme au-dessus du plafond → réduction proportionnelle à 3000", () => {
    // 2000 + 2000 = 4000 > 3000 → facteur 0.75, chacun 1500.
    const r = computeAvsCouple(2_000, 2_000, echelle);
    expect(r.plafonnee).toBe(true);
    expect(r.facteurReduction).toBeCloseTo(0.75, 10);
    expect(r.renteAMensuelle).toBeCloseTo(1_500, 10);
    expect(r.renteBMensuelle).toBeCloseTo(1_500, 10);
    expect(r.renteCoupleMensuelle).toBe(3_000);
  });

  it("réduction proportionnelle asymétrique conserve les parts relatives", () => {
    // 2000 + 1000 = 3000 pile → pas de réduction (<=).
    expect(computeAvsCouple(2_000, 1_000, echelle).plafonnee).toBe(false);
    // 2000 + 1600 = 3600 > 3000 → facteur 3000/3600, parts conservées.
    const r = computeAvsCouple(2_000, 1_600, echelle);
    expect(r.renteAMensuelle).toBeCloseTo(2_000 * (3_000 / 3_600), 10);
    expect(r.renteBMensuelle).toBeCloseTo(1_600 * (3_000 / 3_600), 10);
    expect(r.renteAMensuelle / r.renteBMensuelle).toBeCloseTo(2_000 / 1_600, 10);
  });

  it("applyCap=false (un seul retraité) → jamais de plafonnement", () => {
    const r = computeAvsCouple(2_000, 2_000, echelle, { applyCap: false });
    expect(r.plafonnee).toBe(false);
    expect(r.renteCoupleMensuelle).toBe(4_000);
  });

  it("garde anti-NaN : rentes non finies ramenées à 0", () => {
    const r = computeAvsCouple(NaN, 1_500, echelle);
    expect(r.renteAMensuelle).toBe(0);
    expect(r.renteBMensuelle).toBe(1_500);
    expect(r.plafonnee).toBe(false);
  });

  it("échelle vide → plafond indisponible, pas de réduction", () => {
    const r = computeAvsCouple(2_000, 2_000, [] as unknown as typeof echelle);
    expect(r.plafondMensuel).toBeNull();
    expect(r.plafonnee).toBe(false);
    expect(r.renteCoupleMensuelle).toBe(4_000);
  });
});

describe("stratégie « les deux » — rente conjoint fournie sinon projetée", () => {
  it("isCoupleEtatCivil : marié (1) et partenariat (3) uniquement", () => {
    expect(isCoupleEtatCivil(1)).toBe(true);
    expect(isCoupleEtatCivil(3)).toBe(true);
    [0, 2, 4, 5].forEach((e) => expect(isCoupleEtatCivil(e as 0)).toBe(false));
    expect(isCoupleEtatCivil(undefined)).toBe(false);
  });

  it("rente conjoint FOURNIE est prioritaire", () => {
    const c = client({ Enter_spouseRenteAvsMensuelle: 1_800, Enter_spouseSalaireAnnuel: 120_000 });
    const r = resolveRenteConjointMensuelle(c, legal(), echelle);
    expect(r.source).toBe("fournie");
    expect(r.renteMensuelle).toBe(1_800);
  });

  it("sans rente fournie → projetée depuis le revenu (carrière complète)", () => {
    // Revenu 100k, carrière pleine → RAMD ≈ 100k → palier 100000 → 2000/mois.
    const c = client({ Enter_spouseSalaireAnnuel: 100_000 });
    const r = resolveRenteConjointMensuelle(c, legal(), echelle);
    expect(r.source).toBe("projetee");
    expect(r.renteMensuelle).toBe(2_000);
  });

  it("ni rente ni revenu → aucune", () => {
    const r = resolveRenteConjointMensuelle(client(), legal(), echelle);
    expect(r.source).toBe("aucune");
    expect(r.renteMensuelle).toBe(0);
  });

  it("couple marié : plafond appliqué sur rente perso + conjoint fournie", () => {
    // Perso : revenu 100k → rente 2000. Conjoint fourni 2000. Somme 4000 > 3000.
    const c = client({
      Enter_etatCivil: 1,
      Enter_salaireAnnuel: 100_000,
      Enter_spouseRenteAvsMensuelle: 2_000,
    });
    const r = computeAvsCoupleForClient(c, legal(), echelle);
    expect(r.estCouple).toBe(true);
    expect(r.sourceConjoint).toBe("fournie");
    expect(r.renteIndividuelleMensuelle).toBe(2_000);
    expect(r.renteConjointMensuelle).toBe(2_000);
    expect(r.plafonnee).toBe(true);
    expect(r.renteCoupleMensuelle).toBe(3_000);
    expect(r.renteAMensuelle).toBeCloseTo(1_500, 10);
  });

  it("célibataire : jamais de plafonnement même avec une rente conjoint saisie", () => {
    const c = client({
      Enter_etatCivil: 0,
      Enter_salaireAnnuel: 100_000,
      Enter_spouseRenteAvsMensuelle: 2_000,
    });
    const r = computeAvsCoupleForClient(c, legal(), echelle);
    expect(r.estCouple).toBe(false);
    expect(r.plafonnee).toBe(false);
    expect(r.renteCoupleMensuelle).toBe(4_000);
  });
});
