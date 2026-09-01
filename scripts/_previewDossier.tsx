// Rend le dossier PDF HORS NAVIGATEUR, sur un client d'exemple réaliste, pour
// pouvoir l'inspecter page par page pendant le travail de mise en page.
//
// Utilitaire de développement : à supprimer une fois la refonte terminée.
//   npx tsx scripts/_previewDossier.tsx <chemin-de-sortie.pdf>

import path from "node:path";
import { renderToFile } from "@react-pdf/renderer";
import React from "react";
import {
  buildRetraiteMatrix,
  buildInvaliditeMaladieMatrix,
  buildInvaliditeAccidentMatrix,
  buildDecesMaladieMatrix,
  buildDecesAccidentMatrix,
} from "../lib/shared/calculs/matrices";
import { computeSituationAnalysis } from "../app/lib/analysis/situation";
import { computePremierPilierSnapshot } from "../app/lib/analysis/premierPilier";
import { LEGAL_2025 } from "../app/lib/core/legal";
import { Legal_Echelle44_2025 } from "../app/lib/registry/echelle44";
import DossierPDF from "../app/[locale]/admin/clients/[uid]/_client/DossierPDF";

const legal = LEGAL_2025 as any;
const echelle44 = Legal_Echelle44_2025.rows as any;

// Dossier représentatif : 40 ans, marié, 2 enfants, 90 000 CHF, LPP + 3a + épargne.
const STRESS = !!process.env.PREVIEW_STRESS;

const client: any = {
  Enter_prenom: STRESS ? "Jean-Christophe" : "Camille",
  Enter_nom: STRESS ? "Delacombaz-Vonlanthen" : "Rossier",
  Enter_dateNaissance: "15.06.1985",
  Enter_salaireAnnuel: 90000,
  Enter_tauxOccupation: 100,
  Enter_etatCivil: 1,
  Enter_statutProfessionnel: 0,
  Enter_enfants: [{ Enter_dateNaissance: "01.01.2015" }, { Enter_dateNaissance: "01.03.2018" }],
  Enter_Affilie_LPP: true,
  Enter_avoirVieillesseTotal: 150000,
  Enter_lppCapitalProjete65: 400000,
  Enter_rentevieillesseLPP65: 27000,
  Enter_renteInvaliditeMaladie: 45000,
  Enter_renteConjointLPP: 27000,
  Enter_renteOrphelinLPP: 9000,
};

const extraPlans: any[] = STRESS
  ? Array.from({ length: 7 }).map((_, i) => ({
      id: `x${i}`,
      type: i % 2 ? "PILIER_3A_POLICE" : "LPP_COMPL",
      label: `Institution ${i + 1}`,
      status: "ACTIVE",
      data: {
        capitalRetraiteProjete: 50000 + i * 1000,
        capitalRetraiteGlobal: 50000 + i * 1000,
        primeTotale: 1200,
        occurrence: "annee",
        renteInvalidite: 12000,
        capitalDecesFixe: 40000,
        Enter_rentevieillesseLPP65: 6000,
      },
    }))
  : [];

const plans: any[] = [
  {
    id: "lpp1",
    type: "LPP_BASE",
    label: "CPVAL",
    status: "ACTIVE",
    data: {
      Enter_lppCapitalProjete65: 400000,
      capitalRetraiteGlobal: 400000,
      Enter_rentevieillesseLPP65: 27000,
      Enter_renteInvaliditeMaladie: 45000,
      Enter_renteConjointLPP: 27000,
      Enter_CapitalPlusRenteMal: 150000,
    },
  },
  {
    id: "p3a",
    type: "PILIER_3A",
    label: "AXA",
    status: "ACTIVE",
    data: {
      typeContrat: "3a",
      capitalRetraiteProjete: 180000,
      capitalRetraiteGlobal: 180000,
      primeTotale: 3600,
      occurrence: "annee",
      renteInvalidite: 24000,
      capitalDecesFixe: 100000,
      valeurRachatActuelle: 22000,
    },
  },
  {
    id: "ep1",
    type: "EPARGNE_LIBRE",
    label: "Compte épargne",
    status: "ACTIVE",
    data: { soldeActuel: 35000 },
  },
];

async function main() {
  const out = process.argv[2] || "/tmp/dossier.pdf";

  plans.push(...extraPlans);

  const projections = {
    retraite: buildRetraiteMatrix(client, legal, echelle44, plans),
    invalidite_maladie: buildInvaliditeMaladieMatrix(client, legal, echelle44, plans),
    invalidite_accident: buildInvaliditeAccidentMatrix(client, legal, echelle44, plans),
    deces_maladie: buildDecesMaladieMatrix(client, legal, echelle44, plans),
    deces_accident: buildDecesAccidentMatrix(client, legal, echelle44, plans),
  };

  const analysis: any = computeSituationAnalysis({
    cloudData: { ...client, projections },
    plans,
    // Un besoin forcé, pour vérifier le rendu de la justification dans le document.
    besoinOverrides: { deces: { valeur: 600000, libelle: "Dette hypothécaire de 600'000" } },
  });
  analysis.premierPilier = computePremierPilierSnapshot(client, legal, echelle44, new Date());

  await renderToFile(
    // Le logo est chargé depuis le disque : en Node, une URL « /fichier.png » ne résout pas.
    React.createElement(DossierPDF as any, {
      client,
      plans,
      analysis,
      advisor: STRESS
        ? { nom: "Jean-Christophe Delacombaz", fonction: "Responsable prévoyance et planification patrimoniale", agence: "Agence de Sion — Place de l'Aubade" }
        : { nom: "Habib Osmani", fonction: "Spécialiste en prévoyance", agence: "Agence de Sion" },
      today: "31 août 2026",
      logoSrc: path.resolve(process.cwd(), "public/creditx-logo-black.png"),
      // Image repère + recadrages distincts, pour vérifier que `objectPosition`
      // est bien appliqué emplacement par emplacement.
      images: process.env.PREVIEW_GRID
        ? {
            cover: { src: process.env.PREVIEW_GRID, x: 0, y: 0 },
            retraite: { src: process.env.PREVIEW_GRID, x: 50, y: 50 },
            invalidite: { src: process.env.PREVIEW_GRID, x: 100, y: 100 },
            deces: { src: process.env.PREVIEW_GRID, x: 0, y: 100 },
            closing: { src: process.env.PREVIEW_GRID, x: 100, y: 0 },
          }
        : {},
      // Notes saisies par le conseiller (variable d'environnement pour l'essai).
      notes: process.env.PREVIEW_NOTES || undefined,
    }) as any,
    out,
  );
  console.log("PDF écrit :", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
