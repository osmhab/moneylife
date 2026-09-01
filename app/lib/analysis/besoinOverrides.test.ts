// Besoins forcés par le conseiller : le besoin affiché, la lacune et le capital
// manquant se recalent sur la valeur imposée, SANS toucher au calcul par défaut.
//
// Ce module est partagé avec l'app cliente : la garantie la plus importante ici
// est la première — sans override, l'analyse est bit-à-bit identique.

import { describe, it, expect } from "vitest";
import {
  buildRetraiteMatrix,
  buildInvaliditeMaladieMatrix,
  buildInvaliditeAccidentMatrix,
  buildDecesMaladieMatrix,
  buildDecesAccidentMatrix,
} from "lib/shared/calculs/matrices";
import { computeSituationAnalysis, type BesoinOverrides } from "@/lib/analysis/situation";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

const legal = LEGAL_2025 as any;
const echelle44 = Legal_Echelle44_2025.rows as any;

const client: any = {
  Enter_prenom: "Test",
  Enter_nom: "Besoins",
  Enter_dateNaissance: "15.06.1985",
  Enter_salaireAnnuel: 90000,
  Enter_tauxOccupation: 100,
  Enter_etatCivil: 1, // marié
  Enter_enfants: [{ Enter_dateNaissance: "01.01.2015" }, { Enter_dateNaissance: "01.03.2018" }],
  Enter_Affilie_LPP: true,
  Enter_avoirVieillesseTotal: 150000,
  Enter_lppCapitalProjete65: 400000,
  Enter_rentevieillesseLPP65: 27000,
  Enter_renteInvaliditeMaladie: 45000,
  Enter_renteConjointLPP: 27000,
  Enter_renteOrphelinLPP: 9000,
};

const plans: any[] = [
  {
    id: "lpp1",
    type: "LPP_BASE",
    status: "ACTIVE",
    data: {
      Enter_lppCapitalProjete65: 400000,
      capitalRetraiteGlobal: 400000,
      // Capital décès, pour que le score décès soit non nul et l'assertion porteuse.
      Enter_CapitalPlusRenteMal: 200000,
    },
  },
];

function analyse(besoinOverrides?: BesoinOverrides) {
  const projections = {
    retraite: buildRetraiteMatrix(client, legal, echelle44, plans),
    invalidite_maladie: buildInvaliditeMaladieMatrix(client, legal, echelle44, plans),
    invalidite_accident: buildInvaliditeAccidentMatrix(client, legal, echelle44, plans),
    deces_maladie: buildDecesMaladieMatrix(client, legal, echelle44, plans),
    deces_accident: buildDecesAccidentMatrix(client, legal, echelle44, plans),
  };
  return computeSituationAnalysis({ cloudData: { ...client, projections }, plans, besoinOverrides })!;
}

describe("Besoins forcés par le conseiller", () => {
  it("sans override, l'analyse est identique à l'existante", () => {
    expect(JSON.stringify(analyse())).toBe(JSON.stringify(analyse({})));
  });

  it("décès : le besoin imposé pilote la lacune ET le score (formule basée sur le besoin)", () => {
    const auto = analyse();
    const forced = analyse({ deces: { valeur: 600000, libelle: "Dette hypothécaire de 600'000" } });

    expect(forced.deces.besoin).toBe(600000);
    expect(forced.deces.besoinAuto).toBe(auto.deces.besoin);
    expect(forced.deces.besoinForce).toBe(true);
    expect(forced.deces.besoinLibelle).toBe("Dette hypothécaire de 600'000");

    // La couverture ne bouge pas : seule la cible change, donc la lacune s'ouvre.
    expect(forced.deces.couverture).toBe(auto.deces.couverture);
    expect(forced.deces.lacune).toBe(Math.max(0, 600000 - forced.deces.couverture));
    expect(forced.deces.lacune).toBeGreaterThan(auto.deces.lacune);
    // Le score décès dérive du besoin → il baisse quand la cible monte.
    expect(forced.deces.score).toBeLessThan(auto.deces.score);
  });

  it("retraite : le besoin imposé pilote la lacune et le capital manquant", () => {
    const auto = analyse();
    const cible = Math.round(auto.retraite.besoin) + 1500;
    const forced = analyse({ retraite: { valeur: cible } });

    expect(Math.round(forced.retraite.besoin)).toBe(cible);
    expect(forced.retraite.lacune).toBeGreaterThan(auto.retraite.lacune);
    // Le capital manquant se recale : 25 ans de rente supplémentaire.
    expect(forced.capManquantRetraite).toBeGreaterThan(auto.capManquantRetraite);
    // ⚠️ Comportement assumé : le score retraite se mesure au SALAIRE, pas à la
    // cible — il ne bouge donc pas. Redéfinir la formule changerait la
    // signification du score dans l'app cliente.
    expect(forced.retraite.score).toBe(auto.retraite.score);
  });

  it("invalidité : maladie et accident se règlent séparément", () => {
    const auto = analyse();
    const forced = analyse({ invaliditeMaladie: { valeur: 9000 } });

    expect(Math.round(forced.invaliditeMaladie.besoin)).toBe(9000);
    expect(forced.invaliditeMaladie.lacune).toBeGreaterThan(auto.invaliditeMaladie.lacune);
    // L'accident garde sa cible automatique : les deux cartes sont indépendantes.
    expect(forced.invaliditeAccident.besoin).toBe(auto.invaliditeAccident.besoin);
    expect(forced.invaliditeAccident.lacune).toBe(auto.invaliditeAccident.lacune);
  });

  it("une valeur vide, nulle ou négative retombe sur le calcul automatique", () => {
    const auto = analyse();
    for (const valeur of [null, undefined, 0, -5, NaN] as any[]) {
      const r = analyse({ deces: { valeur, libelle: "note seule" } });
      expect(r.deces.besoin).toBe(auto.deces.besoin);
      expect(r.deces.besoinForce).toBeUndefined();
      // Le libellé reste exploitable même sans montant imposé.
      expect(r.deces.besoinLibelle).toBe("note seule");
    }
  });
});
