import { describe, it, expect } from "vitest";
import { estLienDeReglement, extraireLiensPdf, reglementsCandidats, aRevisiter, normaliser } from "./veille";

describe("reconnaître un règlement de prévoyance", () => {
  it("accepte les intitulés des trois langues", () => {
    expect(estLienDeReglement("Règlement de prévoyance 2026", "/doc_4471.pdf")).toBe(true);
    expect(estLienDeReglement("Vorsorgereglement", "/x.pdf")).toBe(true);
    expect(estLienDeReglement("Regolamento di previdenza", "/y.pdf")).toBe(true);
  });

  it("accepte les intitulés RÉELS, qui ne disent pas « prévoyance »", () => {
    // Constaté sur le site de CPVAL : leur règlement s'appelle « Règlement
    // actualisé ». Une liste exigeant « règlement de prévoyance » ratait le
    // seul document qui compte, sur un site pourtant parfaitement lisible.
    expect(estLienDeReglement("Règlement actualisé", "/doc.pdf")).toBe(true);
    expect(estLienDeReglement("Règlement 2026", "/doc.pdf")).toBe(true);
  });

  it("se rattrape sur le nom du fichier quand l'intitulé est muet", () => {
    expect(estLienDeReglement("Télécharger", "/files/2026_reglement_de_prevoyance.pdf")).toBe(true);
  });

  it("ÉCARTE les autres règlements d'une caisse", () => {
    // Le piège : une caisse en publie beaucoup, tous nommés « règlement ».
    // Les ingérer remplirait la bibliothèque de politiques de placement.
    for (const t of [
      "Règlement de placement", "Anlagereglement", "Règlement d'organisation",
      "Règlement de liquidation partielle", "Teilliquidationsreglement",
      "Règlement sur les frais", "Règlement des provisions",
    ]) {
      expect(estLienDeReglement(t, "/x.pdf")).toBe(false);
    }
  });

  it("l'exclusion l'emporte quand les deux mots sont présents", () => {
    // « Règlement de placement de la Fondation de prévoyance » contient les deux.
    expect(estLienDeReglement("Règlement de placement de la fondation de prévoyance", "/x.pdf")).toBe(false);
  });

  it("refuse ce qui ne ressemble à rien de connu", () => {
    expect(estLienDeReglement("Rapport annuel 2025", "/rapport.pdf")).toBe(false);
    expect(estLienDeReglement("", "/doc.pdf")).toBe(false);
  });

  it("ignore les accents et la casse", () => {
    expect(normaliser("Règlement de Prévoyance")).toBe("reglement de prevoyance");
  });
});

describe("extraction des liens PDF", () => {
  const html = `
    <a href="/docs/reglement-de-prevoyance-2026.pdf">Règlement de prévoyance</a>
    <a href="https://cdn.caisse.ch/anlagereglement.pdf">Anlagereglement</a>
    <a href="/rapport.html">Rapport annuel</a>
    <a href="/docs/reglement-de-prevoyance-2026.pdf">Doublon</a>
    <a href="/x.pdf"><span class="ico"></span> Vorsorgereglement 2026</a>
  `;

  it("ne retient que les PDF, et rend les adresses absolues", () => {
    const l = extraireLiensPdf(html, "https://caisse.ch/documents/");
    expect(l).toHaveLength(3);
    expect(l[0].url).toBe("https://caisse.ch/docs/reglement-de-prevoyance-2026.pdf");
  });

  it("dédoublonne les liens identiques", () => {
    expect(extraireLiensPdf(html, "https://caisse.ch/").filter((x) => x.url.includes("prevoyance-2026"))).toHaveLength(1);
  });

  it("nettoie les balises dans l'intitulé", () => {
    const l = extraireLiensPdf(html, "https://caisse.ch/");
    expect(l.find((x) => x.url.endsWith("/x.pdf"))?.texte).toBe("Vorsorgereglement 2026");
  });

  it("ne garde en candidats que les règlements de prévoyance", () => {
    const c = reglementsCandidats(html, "https://caisse.ch/");
    expect(c.map((x) => x.texte)).toEqual(["Règlement de prévoyance", "Vorsorgereglement 2026"]);
  });

  it("ne rend rien sur une page sans lien exploitable", () => {
    expect(reglementsCandidats("<p>Nos documents arrivent bientôt.</p>", "https://caisse.ch/")).toEqual([]);
  });
});

describe("rythme des visites", () => {
  const JOUR = 24 * 3600 * 1000;

  it("visite en priorité une caisse jamais vue", () => {
    expect(aRevisiter(null)).toBe(true);
  });

  it("espace les passages : un règlement change au plus une fois l'an", () => {
    const now = Date.now();
    expect(aRevisiter(now - 5 * JOUR, now)).toBe(false);
    expect(aRevisiter(now - 31 * JOUR, now)).toBe(true);
  });
});

describe("documents de gouvernance", () => {
  it("écarte le règlement de l'assemblée des délégués", () => {
    // Vécu : la page d'accueil de CPVAL pointe un « Règlement actualisé » qui
    // est celui de l'assemblée des délégués — cinq pages de gouvernance. La
    // passe d'identification l'aurait rejeté, mais autant ne pas le télécharger.
    expect(estLienDeReglement("Règlement actualisé", "/26-05-01-Reglement-AD_VF.pdf")).toBe(true);
    expect(estLienDeReglement("Règlement de l'assemblée des délégués", "/x.pdf")).toBe(false);
    expect(estLienDeReglement("Reglement du conseil de fondation", "/y.pdf")).toBe(false);
  });
});
