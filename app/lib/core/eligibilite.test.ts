import { describe, it, expect } from "vitest";
import {
  droitRenteConjoint, droitPrestationsEnfants, droitPrestationsAccident,
  droitCapitalDeces, evaluerPrestationsLPP, verdictDe, prestationsAEcarter,
  type SituationClient,
} from "./eligibilite";
import type { BlocRegles } from "./reglement";

/** Règle réelle du règlement Aevum (art. 63) : capital dû À DÉFAUT de rente. */
const AEVUM_CONDITIONNEL: BlocRegles = {
  capitalDeces: {
    verse: "SI_AUCUNE_RENTE_PARTENAIRE", base: "capital de prévoyance",
    limiteHeritiersLegaux: 0.5, avantRetraiteUniquement: null,
    article: "Article 63, al. 1",
    citation: "Un capital est versé en cas de décès d'un assuré si aucune rente de partenaire n'est échue.",
  },
  capitalDecesSupplementaire: null, rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};

const AEVUM_TOUJOURS: BlocRegles = {
  ...AEVUM_CONDITIONNEL,
  capitalDeces: { ...AEVUM_CONDITIONNEL.capitalDeces!, verse: "TOUJOURS", article: "Annexe no 8, Article 6" },
};

const MARIEE: SituationClient = { etatCivil: 1, nombreEnfants: 0, statutProfessionnel: 0 };
const CELIBATAIRE: SituationClient = { etatCivil: 0, nombreEnfants: 0, statutProfessionnel: 0 };

describe("rente de conjoint", () => {
  it("est due au marié et au partenaire enregistré", () => {
    expect(droitRenteConjoint({ etatCivil: 1 }).verdict).toBe("OUI");
    expect(droitRenteConjoint({ etatCivil: 3 }).verdict).toBe("OUI");
  });

  it("n'est pas due au célibataire, au divorcé ni au veuf", () => {
    for (const e of [0, 2, 5]) expect(droitRenteConjoint({ etatCivil: e }).verdict).toBe("NON");
  });

  it("reste à vérifier en concubinage", () => {
    // Le concubinage n'est jamais assimilé d'office : chaque caisse pose ses
    // conditions (durée de vie commune, désignation écrite).
    expect(droitRenteConjoint({ etatCivil: 4 }).verdict).toBe("A_VERIFIER");
  });

  it("ne tranche pas sans état civil renseigné", () => {
    // Un profil incomplet ne doit pas faire disparaître la rente de conjoint :
    // « inconnu » n'est pas « célibataire ».
    expect(droitRenteConjoint({}).verdict).toBe("A_VERIFIER");
  });
});

describe("prestations liées aux enfants", () => {
  it("suivent le nombre d'enfants à charge", () => {
    expect(droitPrestationsEnfants({ nombreEnfants: 2 }, "renteOrphelin").verdict).toBe("OUI");
    expect(droitPrestationsEnfants({ nombreEnfants: 0 }, "renteOrphelin").verdict).toBe("NON");
    expect(droitPrestationsEnfants({}, "renteEnfantInvalide").verdict).toBe("NON");
  });
});

describe("prestations d'accident (LAA)", () => {
  it("sont acquises au salarié", () => {
    expect(droitPrestationsAccident({ statutProfessionnel: 0 }, "renteDecesAccident").verdict).toBe("OUI");
  });

  it("ne sont pas acquises d'office à l'indépendant", () => {
    // L'exemple donné : « Rente décès accident : 1'400'000 : Non ». La compter
    // gonflerait la couverture d'un montant auquel il n'a aucun droit.
    expect(droitPrestationsAccident({ statutProfessionnel: 1 }, "renteDecesAccident").verdict).toBe("A_VERIFIER");
  });
});

describe("capital décès : situation ET règlement", () => {
  it("ne tranche pas tant que le règlement est inconnu", () => {
    const r = droitCapitalDeces(MARIEE, null);
    expect(r.verdict).toBe("A_VERIFIER");
    expect(r.motif).toContain("règlement");
  });

  it("cas Aevum : une assurée mariée n'y a PAS droit", () => {
    // Le certificat affiche pourtant 19'662.05. L'annoncer serait promettre une
    // couverture décès qui n'existe pas.
    const r = droitCapitalDeces(MARIEE, AEVUM_CONDITIONNEL);
    expect(r.verdict).toBe("NON");
    expect(r.source).toBe("reglement");
    expect(r.motif).toContain("Article 63");
  });

  it("le même règlement l'accorde à une célibataire", () => {
    expect(droitCapitalDeces(CELIBATAIRE, AEVUM_CONDITIONNEL).verdict).toBe("OUI");
  });

  it("une annexe « dans tous les cas » l'accorde même mariée", () => {
    expect(droitCapitalDeces(MARIEE, AEVUM_TOUJOURS).verdict).toBe("OUI");
  });

  it("reste à vérifier quand le droit à la rente l'est aussi", () => {
    // Concubinage : on ignore si la rente est due, donc si le capital l'est.
    expect(droitCapitalDeces({ etatCivil: 4 }, AEVUM_CONDITIONNEL).verdict).toBe("A_VERIFIER");
  });

  it("un règlement sans capital décès dit non", () => {
    const aucun: BlocRegles = {
      ...AEVUM_CONDITIONNEL,
      capitalDeces: { ...AEVUM_CONDITIONNEL.capitalDeces!, verse: "NON_PREVU" },
    };
    expect(droitCapitalDeces(CELIBATAIRE, aucun).verdict).toBe("NON");
  });
});

describe("vue d'ensemble d'un plan", () => {
  it("rend un verdict pour chaque prestation", () => {
    const p = evaluerPrestationsLPP(MARIEE, AEVUM_CONDITIONNEL);
    expect(p.map((x) => x.cle)).toEqual([
      "capitalRetraite", "renteVieillesse", "renteInvalidite", "renteEnfantInvalide",
      "renteConjoint", "renteOrphelin", "capitalDeces", "renteDecesAccident",
    ]);
  });

  it("retraite et invalidité ne dépendent pas de la situation familiale", () => {
    const p = evaluerPrestationsLPP(CELIBATAIRE, null);
    expect(verdictDe(p, "capitalRetraite")).toBe("OUI");
    expect(verdictDe(p, "renteInvalidite")).toBe("OUI");
  });

  it("écarte de l'analyse ce à quoi le client n'a pas droit", () => {
    // Assurée mariée sans enfant : pas d'orphelin, pas de capital décès.
    const aEcarter = prestationsAEcarter(evaluerPrestationsLPP(MARIEE, AEVUM_CONDITIONNEL));
    expect(aEcarter).toContain("renteOrphelin");
    expect(aEcarter).toContain("capitalDeces");
    expect(aEcarter).not.toContain("renteConjoint");
  });

  it("ne retire JAMAIS une prestation seulement douteuse", () => {
    // Retirer en silence ce dont on n'est pas sûr priverait le client d'une
    // couverture qu'il a peut-être — l'erreur inverse, mais aussi grave.
    const p = evaluerPrestationsLPP({ etatCivil: 4, nombreEnfants: 0, statutProfessionnel: 1 }, AEVUM_CONDITIONNEL);
    expect(verdictDe(p, "renteConjoint")).toBe("A_VERIFIER");
    expect(prestationsAEcarter(p)).not.toContain("renteConjoint");
    expect(prestationsAEcarter(p)).not.toContain("renteDecesAccident");
  });
});
