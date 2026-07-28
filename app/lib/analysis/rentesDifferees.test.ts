import { describe, it, expect } from "vitest";
import { computeRentesDifferees } from "./rentesDifferees";

// Profil réel (Osmani, salaire 144k, cible IG 10'800/mois) : 2 enfants (2016, 2019).
// La lacune n'apparaît qu'une fois les DEUX enfants sortis → une seule rente différée.
const situation: any = {
  invaliditeMaladie: {
    igSteps: [
      { fromYear: 2028, nbEnfants: 2, couverture: 15336, lacune: 0, layers: [] },
      { fromYear: 2034, nbEnfants: 1, couverture: 12528, lacune: 0, layers: [] },
      { fromYear: 2038, nbEnfants: 0, couverture: 9720, lacune: 1080, layers: [] },
    ],
  },
};
const enfants = [
  { Enter_dateNaissance: "01.01.2016", Enter_enFormation: false },
  { Enter_dateNaissance: "02.06.2019", Enter_enFormation: false },
];
const today = new Date(2026, 6, 1); // 01.07.2026

describe("computeRentesDifferees", () => {
  it("ne propose une rente QUE lorsque la lacune apparaît (enfants partis)", () => {
    const r = computeRentesDifferees(situation, enfants, "29.01.1990", today);
    expect(r.eligible).toBe(true);
    expect(r.paliers.length).toBe(1); // les périodes à lacune 0 ne créent pas de palier
    expect(r.paliers[0].montantMensuel).toBe(1080);
    expect(r.paliers[0].nbEnfants).toBe(0);
    expect(r.paliers[0].fromYear).toBe(2037); // 2e enfant (né 2019) → 18 ans en 2037
    expect(r.paliers[0].fromISO).toBe("2037-06-01"); // précision au mois (né 02.06)
  });

  it("écarte tout (aucune rente) si trop proche de 65 ans", () => {
    // Né en 1963 → 65 ans début 2028 ; aujourd'hui (2026) + 24 mois = mi-2028 > âge terme.
    const r = computeRentesDifferees(situation, enfants, "29.01.1963", today);
    expect(r.eligible).toBe(false);
    expect(r.paliers.length).toBe(0);
  });

  it("gère une rente croissante multi-paliers (lacunes qui grandissent)", () => {
    const sit: any = {
      invaliditeMaladie: {
        igSteps: [
          { fromYear: 2028, nbEnfants: 2, couverture: 0, lacune: 0, layers: [] },
          { fromYear: 2034, nbEnfants: 1, couverture: 0, lacune: 950, layers: [] },
          { fromYear: 2038, nbEnfants: 0, couverture: 0, lacune: 1250, layers: [] },
        ],
      },
    };
    const r = computeRentesDifferees(sit, enfants, "29.01.1990", today);
    expect(r.paliers.map((p) => p.montantMensuel)).toEqual([950, 1250]); // croissant
    expect(r.paliers[0].fromYear).toBe(2034); // 1er enfant (2016) → 18 ans en 2034
    expect(r.paliers[1].fromYear).toBe(2037);
  });
});
