import { describe, it, expect } from "vitest";
import { versE164, messageRappel, momentDuRappel, rappelARattraper, motDuJour } from "./rappelRdv";

describe("versE164 — numéros suisses vers le format Twilio", () => {
  it("accepte les formes courantes de saisie", () => {
    for (const saisi of ["079 123 45 67", "0791234567", "079.123.45.67", "+41 79 123 45 67", "0041791234567"]) {
      expect(versE164(saisi)).toBe("+41791234567");
    }
  });

  it("refuse ce qui n'est pas exploitable plutôt que d'inventer un numéro", () => {
    for (const mauvais of ["", "   ", "12345", "pas un numéro", "079 123"]) {
      expect(versE164(mauvais)).toBeNull();
    }
  });
});

describe("messageRappel", () => {
  it("sans rappel documents : le bloc n'apparaît pas", () => {
    const m = messageRappel("14:30", false);
    expect(m).toContain("demain à 14:30");
    expect(m).not.toContain("Certificat de prévoyance");
    expect(m.endsWith("à bientôt.\nCreditX")).toBe(true);
  });

  it("avec rappel documents : les trois lignes sont présentes", () => {
    const m = messageRappel("09:00", true);
    expect(m).toContain("N'oubliez pas de prendre vos documents");
    expect(m).toContain("- Certificat de prévoyance");
    expect(m).toContain("- Polices / comptes de 3e pilier");
    expect(m).toContain("- tout autre document qui vous semble pertinent");
  });

  it("un rappel envoyé le jour même ne dit pas « demain »", () => {
    expect(messageRappel("16:30", false, "aujourd'hui")).toContain("aujourd'hui à 16:30");
  });
});

describe("moment du rappel et rattrapage", () => {
  // Le trou réel : rendez-vous le 02.09 à 16:30, posé le 01.09 à 16:32.
  // Le passage du 01.09 à 10:00 était fini ; celui du 02.09 regarde le 03.
  // Sans rattrapage, ce client n'aurait jamais rien reçu.
  const rdv = new Date("2026-09-02T14:30:00.000Z");        // 16:30 suisse

  it("le rappel est dû la veille à 10:00 (heure suisse)", () => {
    expect(momentDuRappel(rdv).toISOString()).toBe("2026-09-01T08:00:00.000Z"); // 10:00 CEST
  });

  it("posé APRÈS ce moment → à rattraper immédiatement", () => {
    expect(rappelARattraper(rdv, new Date("2026-09-01T14:32:00.000Z"))).toBe(true);
  });

  it("posé AVANT ce moment → le passage quotidien s'en charge", () => {
    expect(rappelARattraper(rdv, new Date("2026-08-30T09:00:00.000Z"))).toBe(false);
  });

  it("rendez-vous déjà commencé → on n'envoie plus rien", () => {
    expect(rappelARattraper(rdv, new Date("2026-09-02T15:00:00.000Z"))).toBe(false);
  });

  it("rendez-vous le jour même → le message dit « aujourd'hui »", () => {
    expect(motDuJour(rdv, new Date("2026-09-02T08:00:00.000Z"))).toBe("aujourd'hui");
    expect(motDuJour(rdv, new Date("2026-09-01T08:00:00.000Z"))).toBe("demain");
  });
});
