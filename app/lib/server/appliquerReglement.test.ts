import { describe, it, expect } from "vitest";
import { aChange } from "./appliquerReglement";

describe("n'écrire que si quelque chose change", () => {
  const plan = {
    data: { Enter_CapitalPlusRenteMal: 432000, Enter_surindemnisationPlafond: 0.9 },
    metadata: {
      reglementCle: "axa-2026", reglementStatut: "VERIFIE",
      reglementNotes: ["Capital versé en plus de la rente (art. 62)."],
      retraitCapitalMaxPct: 100,
    },
  };

  it("ne réécrit pas des valeurs identiques", () => {
    // Chaque écriture relance le recalcul complet de l'analyse du client :
    // redéposer un règlement déjà connu ne doit rien coûter.
    expect(aChange(plan, {
      "metadata.reglementCle": "axa-2026",
      "metadata.reglementStatut": "VERIFIE",
      "metadata.retraitCapitalMaxPct": 100,
      "data.Enter_surindemnisationPlafond": 0.9,
    })).toBe(false);
  });

  it("ignore l'horodatage, qui n'est jamais un motif d'écrire", () => {
    expect(aChange(plan, {
      "metadata.reglementApplique": "peu importe",
      "metadata.reglementStatut": "VERIFIE",
    })).toBe(false);
  });

  it("détecte une valeur réellement différente", () => {
    expect(aChange(plan, { "metadata.retraitCapitalMaxPct": 50 })).toBe(true);
    expect(aChange(plan, { "data.Enter_surindemnisationPlafond": 1 })).toBe(true);
  });

  it("détecte un champ nouvellement rempli", () => {
    expect(aChange(plan, { "data.Enter_CapitalAucuneRenteMal": 432000 })).toBe(true);
  });

  it("compare les valeurs composées sur leur contenu", () => {
    expect(aChange(plan, {
      "metadata.reglementNotes": ["Capital versé en plus de la rente (art. 62)."],
    })).toBe(false);
    expect(aChange(plan, { "metadata.reglementNotes": ["Autre chose."] })).toBe(true);
  });

  it("traite « absent » et « null » comme le même état", () => {
    // Un champ jamais écrit et un champ remis à null décrivent la même chose :
    // les distinguer provoquerait une écriture à chaque passage.
    expect(aChange(plan, { "data.Enter_CapitalPlusRente": null })).toBe(false);
  });
});
