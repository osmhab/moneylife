import { describe, it, expect } from "vitest";
import { partMaxEnCapital, contrainteRetrait } from "./retraitCapital";
import type { BlocRegles } from "./reglement";

const bloc = (r: Partial<NonNullable<BlocRegles["retraitCapital"]>> | null): BlocRegles => ({
  retraitCapital: r && {
    partMaxPct: null, delaiAnnonceMois: null, consentementConjoint: null,
    anticipationDesAge: null, blocageApresRachatAns: null,
    article: "Chiffre 43", citation: "…", ...r,
  },
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
});

describe("plafond de retrait en capital", () => {
  it("lit le plafond du règlement", () => {
    expect(partMaxEnCapital(bloc({ partMaxPct: 25 }))).toBe(25);
    expect(partMaxEnCapital(bloc({ partMaxPct: 100 }))).toBe(100);
  });

  it("ne borne RIEN quand le règlement est muet ou inconnu", () => {
    // Ne pas savoir n'est pas savoir que c'est limité : restreindre un client
    // sur une supposition lui ferait renoncer à un droit qu'il a peut-être.
    expect(partMaxEnCapital(bloc({ partMaxPct: null }))).toBeNull();
    expect(partMaxEnCapital(bloc(null))).toBeNull();
    expect(partMaxEnCapital(null)).toBeNull();
  });

  it("n'applique pas une règle non sourcée", () => {
    expect(partMaxEnCapital(bloc({ partMaxPct: 25, article: null, citation: null }))).toBeNull();
  });

  it("écarte une valeur hors de toute plausibilité", () => {
    expect(partMaxEnCapital(bloc({ partMaxPct: 250 }))).toBeNull();
    expect(partMaxEnCapital(bloc({ partMaxPct: -10 }))).toBeNull();
  });
});

describe("contrainte posée sur le plan", () => {
  it("annonce un plafond partiel en clair", () => {
    const c = contrainteRetrait(bloc({ partMaxPct: 25 }));
    expect(c.partMaxPct).toBe(25);
    expect(c.notes[0]).toContain("limité à 25 %");
  });

  it("distingue le capital intégral", () => {
    expect(contrainteRetrait(bloc({ partMaxPct: 100 })).notes[0]).toContain("intégralement");
  });

  it("signale les démarches à engager à l'avance", () => {
    // Un préavis de trois ans découvert trop tard coûte le bénéfice de la règle.
    const c = contrainteRetrait(bloc({ partMaxPct: 50, delaiAnnonceMois: 36, consentementConjoint: true }));
    expect(c.notes.some((n) => n.includes("36 mois"))).toBe(true);
    expect(c.notes.some((n) => n.includes("conjoint"))).toBe(true);
  });

  it("ne dit rien quand le règlement ne dit rien", () => {
    expect(contrainteRetrait(bloc(null))).toEqual({ partMaxPct: null, notes: [] });
  });
});

describe("zéro explicite contre absence d'information", () => {
  it("conserve un 0 % assumé : certaines caisses excluent le capital", () => {
    expect(partMaxEnCapital(bloc({ partMaxPct: 0 }))).toBe(0);
    expect(contrainteRetrait(bloc({ partMaxPct: 0 })).notes[0]).toContain("limité à 0 %");
  });
});

describe("blocage après un rachat", () => {
  it("prévient qu'un rachat ferme l'accès au capital", () => {
    // Chiffre 43.4 du règlement AXA : trois ans. Un client qui rachète pour
    // optimiser sa fiscalité puis demande son capital se le voit refuser — il
    // faut le lui dire AVANT le rachat.
    const c = contrainteRetrait(bloc({ partMaxPct: 100, blocageApresRachatAns: 3 }));
    expect(c.notes.some((n) => n.includes("3 ans"))).toBe(true);
  });

  it("ne dit rien quand le règlement ne prévoit aucun blocage", () => {
    const c = contrainteRetrait(bloc({ partMaxPct: 100 }));
    expect(c.notes.some((n) => n.includes("rachat"))).toBe(false);
  });
});
