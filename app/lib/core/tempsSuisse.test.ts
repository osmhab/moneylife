import { describe, it, expect } from "vitest";
import { instantSuisse, heureSuisse, jourSuisse } from "./tempsSuisse";

// Ces tests attrapent l'erreur d'une heure : celle qui ne se voit ni en local
// (serveur déjà en Europe/Zurich) ni à la relecture, seulement en production.
describe("tempsSuisse — heures murales suisses", () => {
  it("heure d'ÉTÉ (CEST, UTC+2) : 09:00 suisse = 07:00 UTC", () => {
    expect(instantSuisse(2026, 7, 15, 9, 0).toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("heure d'HIVER (CET, UTC+1) : 09:00 suisse = 08:00 UTC", () => {
    expect(instantSuisse(2026, 1, 15, 9, 0).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("relit l'heure murale qu'on a demandée, été comme hiver", () => {
    for (const [mois, jour] of [[1, 15], [7, 15], [3, 29], [10, 25]] as const) {
      expect(heureSuisse(instantSuisse(2026, mois, jour, 14, 30))).toBe("14:30");
    }
  });

  it("le jour suisse ne glisse pas sur un créneau de fin de journée", () => {
    // 23:30 suisse tombe le lendemain en UTC : le jour affiché doit rester le bon.
    const t = instantSuisse(2026, 7, 15, 23, 30);
    expect(t.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(jourSuisse(t)).toBe("2026-07-15");
  });

  it("passage à l'heure d'été 2026 (29 mars) : avant et après la bascule", () => {
    // 02:00 → 03:00 le 29 mars 2026. 01:30 est encore CET, 03:30 déjà CEST.
    expect(instantSuisse(2026, 3, 29, 1, 30).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(instantSuisse(2026, 3, 29, 3, 30).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});
