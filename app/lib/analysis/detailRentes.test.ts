import { describe, it, expect } from "vitest";
import { computeDetailRentes } from "./detailRentes";
import { computeMinimalLPP, buildMinimalLPPPlan } from "@/lib/calculs/lppMinimum";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";

const legal = LEGAL_2025 as any;
const echelle44 = Legal_Echelle44_2025.rows as any;

describe("Détail des rentes (scénarios par enfant, 1er & 2e pilier)", () => {
  it("expose des scénarios 0..N enfants + fins de charge, AVS et LPP", () => {
    const res = computeMinimalLPP(
      { salaireAnnuel: 90000, dateNaissance: "15.06.1985", anneeDebutActivite: 2010 },
      LEGAL_2025,
      2025
    );
    const lppPlan = buildMinimalLPPPlan(res)!;

    const client: any = {
      Enter_dateNaissance: "15.06.1985",
      Enter_salaireAnnuel: 90000,
      Enter_etatCivil: 1,
      Enter_Affilie_LPP: true,
      Enter_spouseSexe: 1,
      Enter_spouseDateNaissance: "10.10.1987",
      Enter_enfants: [
        { Enter_dateNaissance: "01.01.2016" }, // fin de charge 2034
        { Enter_dateNaissance: "01.03.2019" }, // fin de charge 2037
      ],
      Enter_renteInvaliditeMaladie: lppPlan.data.Enter_renteInvaliditeMaladie,
      Enter_renteEnfantInvalideMaladie: lppPlan.data.Enter_renteEnfantInvalideMaladie,
      Enter_renteConjointLPP: lppPlan.data.Enter_renteConjointLPP,
      Enter_renteOrphelinLPP: lppPlan.data.Enter_renteOrphelinLPP,
    };

    const d = computeDetailRentes(client, legal, echelle44, new Date("2025-06-01"));

    // 2 enfants à charge → scénarios 0,1,2.
    expect(d.maxEnfants).toBe(2);
    expect(d.deces).toHaveLength(3);
    expect(d.invalidite).toHaveLength(3);
    expect(d.childrenEndYears).toEqual([2034, 2037]);
    expect(d.retirementYear).toBe(2050);

    // Le total décès augmente avec le nombre d'enfants.
    expect(d.deces[2].total).toBeGreaterThan(d.deces[1].total);
    expect(d.deces[1].total).toBeGreaterThan(d.deces[0].total);

    // Rentes par enfant présentes (AVS + LPP) dans le scénario à 2 enfants.
    expect(d.deces[2].parEnfant.avs).toBeGreaterThan(0);
    expect(d.deces[2].parEnfant.lpp).toBeGreaterThan(0);
    expect(d.invalidite[2].parEnfant.avs).toBeGreaterThan(0);
    expect(d.invalidite[2].parEnfant.lpp).toBeGreaterThan(0);
    expect(d.deces[2].adulte.lpp).toBeGreaterThan(0);

    console.log("── Scénarios décès (total/mois) ──", d.deces.map((s) => s.total));
    console.log("── Scénarios invalidité (total/mois) ──", d.invalidite.map((s) => s.total));
    console.log("Décès 2 enfants:", JSON.stringify(d.deces[2]));
  });
});
