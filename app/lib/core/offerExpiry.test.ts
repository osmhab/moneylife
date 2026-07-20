import { describe, it, expect } from "vitest";
import {
  isOfferExpired,
  daysUntilExpiry,
  reachedMilestone,
  offerExpiryInstant,
} from "./offerExpiry";

// Milieu de journée : permet de verifier qu'une offre expirant AUJOURD'HUI
// est toujours signable, ce qu'un test a minuit masquerait.
const NOW = new Date(2026, 7, 15, 14, 30); // 15 août 2026, 14h30

describe("offerExpiryInstant", () => {
  it("place l'expiration à la FIN du jour indiqué", () => {
    const d = offerExpiryInstant("15.08.2026")!;
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getDate()).toBe(15);
  });

  it("accepte les deux formats de date", () => {
    expect(offerExpiryInstant("2026-08-15")!.getTime())
      .toBe(offerExpiryInstant("15.08.2026")!.getTime());
  });

  it("renvoie null sur une date absente ou illisible", () => {
    expect(offerExpiryInstant(undefined)).toBeNull();
    expect(offerExpiryInstant("")).toBeNull();
    expect(offerExpiryInstant("bientôt")).toBeNull();
  });
});

describe("isOfferExpired", () => {
  it("reste signable pendant TOUTE la journée d'expiration", () => {
    // Le cas qui casse si on compare a minuit.
    expect(isOfferExpired("15.08.2026", NOW)).toBe(false);
    expect(isOfferExpired("15.08.2026", new Date(2026, 7, 15, 23, 59, 0))).toBe(false);
  });

  it("expire au lendemain", () => {
    expect(isOfferExpired("15.08.2026", new Date(2026, 7, 16, 0, 1))).toBe(true);
  });

  it("n'expire jamais une offre SANS date", () => {
    // Les offres anterieures a ce champ ne doivent pas se bloquer d'un coup.
    expect(isOfferExpired(undefined, NOW)).toBe(false);
    expect(isOfferExpired("", NOW)).toBe(false);
  });

  it("considère expirée une offre passée", () => {
    expect(isOfferExpired("01.08.2026", NOW)).toBe(true);
  });
});

describe("daysUntilExpiry", () => {
  it("renvoie 0 le jour même", () => {
    expect(daysUntilExpiry("15.08.2026", NOW)).toBe(0);
  });

  it("compte les jours restants indépendamment de l'heure d'appel", () => {
    const matin = daysUntilExpiry("22.08.2026", new Date(2026, 7, 15, 6, 0));
    const soir = daysUntilExpiry("22.08.2026", new Date(2026, 7, 15, 22, 0));
    expect(matin).toBe(7);
    expect(soir).toBe(7);
  });

  it("devient négatif après expiration", () => {
    expect(daysUntilExpiry("10.08.2026", NOW)).toBe(-5);
  });

  it("renvoie null sans date", () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe("reachedMilestone", () => {
  it("détecte les jalons exacts", () => {
    expect(reachedMilestone("22.08.2026", NOW)).toBe(7);
    expect(reachedMilestone("16.08.2026", NOW)).toBe(1);
    expect(reachedMilestone("30.08.2026", NOW)).toBe(15);
  });

  it("ne renvoie rien entre deux jalons", () => {
    // 5 jours restants : entre les jalons 7 et 3, aucun envoi.
    expect(reachedMilestone("20.08.2026", NOW)).toBeNull();
  });

  it("ne renvoie rien le jour de l'expiration ni après", () => {
    expect(reachedMilestone("15.08.2026", NOW)).toBeNull();
    expect(reachedMilestone("01.08.2026", NOW)).toBeNull();
  });
});
