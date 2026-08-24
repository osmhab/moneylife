// Valide l'HYPOTHÈSE CENTRALE de l'outil conseiller : on peut faire tourner
// TOUTE l'analyse de prévoyance EN MÉMOIRE, en un seul passage synchrone, sans
// Firestore ni Cloud Function — exactement ce que fait /api/admin/analyse.
//
// Reproduit le pipeline de la route (matrices → computeSituationAnalysis) sur un
// client exemple et vérifie qu'on obtient une analyse cohérente.

import { describe, it, expect } from "vitest";
import {
  buildRetraiteMatrix,
  buildInvaliditeMaladieMatrix,
  buildInvaliditeAccidentMatrix,
  buildDecesMaladieMatrix,
  buildDecesAccidentMatrix,
} from "lib/shared/calculs/matrices";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { computePremierPilierSnapshot } from "@/lib/analysis/premierPilier";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

const legal = LEGAL_2025 as any;
const echelle44 = Legal_Echelle44_2025.rows as any;

// Client réaliste : 40 ans, marié, 2 enfants, 90'000 CHF, affilié LPP avec un
// certificat renseigné (comme un dossier scanné complet).
const client: any = {
  Enter_prenom: "Test",
  Enter_nom: "Conseiller",
  Enter_dateNaissance: "15.06.1985",
  Enter_salaireAnnuel: 90000,
  Enter_tauxOccupation: 100,
  Enter_etatCivil: 1, // marié
  Enter_enfants: [
    { Enter_dateNaissance: "01.01.2015" },
    { Enter_dateNaissance: "01.03.2018" },
  ],
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
    data: { Enter_lppCapitalProjete65: 400000, capitalRetraiteGlobal: 400000 },
  },
];

describe("Outil conseiller — analyse synchrone en mémoire", () => {
  it("produit une analyse complète et cohérente sans Firestore", () => {
    const projections = {
      retraite: buildRetraiteMatrix(client, legal, echelle44, plans),
      invalidite_maladie: buildInvaliditeMaladieMatrix(client, legal, echelle44, plans),
      invalidite_accident: buildInvaliditeAccidentMatrix(client, legal, echelle44, plans),
      deces_maladie: buildDecesMaladieMatrix(client, legal, echelle44, plans),
      deces_accident: buildDecesAccidentMatrix(client, legal, echelle44, plans),
    };

    const analysis = computeSituationAnalysis({
      cloudData: { ...client, projections },
      plans,
    });

    // L'hypothèse centrale : l'analyse existe (non null) sans passer par la Cloud Function.
    expect(analysis).not.toBeNull();
    const a = analysis!;

    // Les 4 cartes de risque sont présentes avec des montants numériques.
    for (const card of [a.retraite, a.invaliditeMaladie, a.invaliditeAccident, a.deces]) {
      expect(card).toBeTruthy();
      expect(typeof card.besoin).toBe("number");
      expect(typeof card.couverture).toBe("number");
      expect(typeof card.lacune).toBe("number");
      expect(card.besoin).toBeGreaterThan(0);
    }

    // Score global cohérent (0–100).
    expect(typeof a.totalScore).toBe("number");
    expect(a.totalScore).toBeGreaterThanOrEqual(0);
    expect(a.totalScore).toBeLessThanOrEqual(100);

    // Snapshot 1er pilier calculable.
    const pp = computePremierPilierSnapshot(client, legal, echelle44, new Date());
    expect(pp).toBeTruthy();

    // Trace lisible (montants mensuels) pour eyeball manuel de la plausibilité.
    console.log("── Analyse conseiller (client 40 ans, marié, 2 enfants, 90k, LPP) ──");
    console.log("Score global:", a.totalScore);
    console.log("Retraite   → besoin:", Math.round(a.retraite.besoin), "couverture:", Math.round(a.retraite.couverture), "lacune:", Math.round(a.retraite.lacune));
    console.log("Invalidité maladie → besoin:", Math.round(a.invaliditeMaladie.besoin), "couverture:", Math.round(a.invaliditeMaladie.couverture), "lacune:", Math.round(a.invaliditeMaladie.lacune));
    console.log("Décès      → besoin:", Math.round(a.deces.besoin), "couverture:", Math.round(a.deces.couverture), "lacune:", Math.round(a.deces.lacune));
  });

  it("intègre un 3e pilier (la couverture retraite augmente)", () => {
    const base: any = {
      Enter_dateNaissance: "15.06.1985",
      Enter_salaireAnnuel: 90000,
      Enter_etatCivil: 0,
    };
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
    // Plan 3a après normalisation route (capitalRetraiteProjete posé).
    const plan3a = {
      id: "p3a",
      type: "PILIER_3A_POLICE",
      status: "ACTIVE",
      data: { capitalRetraiteProjete: 150000, valeurRachatActuelle: 20000, capitalDecesFixe: 100000 },
    };
    const sans = analyse([])!;
    const avec = analyse([plan3a])!;
    // Le 3a réduit le capital manquant à la retraite.
    expect(avec.capManquantRetraite).toBeLessThan(sans.capManquantRetraite);
  });

  it("refuse une analyse sans salaire (garde-fou)", () => {
    const projections = {
      retraite: buildRetraiteMatrix({} as any, legal, echelle44, []),
      invalidite_maladie: buildInvaliditeMaladieMatrix({} as any, legal, echelle44, []),
      invalidite_accident: buildInvaliditeAccidentMatrix({} as any, legal, echelle44, []),
      deces_maladie: buildDecesMaladieMatrix({} as any, legal, echelle44, []),
      deces_accident: buildDecesAccidentMatrix({} as any, legal, echelle44, []),
    };
    const analysis = computeSituationAnalysis({ cloudData: { projections }, plans: [] });
    expect(analysis).toBeNull();
  });
});
