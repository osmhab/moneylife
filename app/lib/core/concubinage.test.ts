import { describe, it, expect } from "vitest";
import {
  anneesViecommune, dureeExigeeParReglement, droitPartenaireConcubinage,
  doitAlerterClause, afficherAvertissementPartenaire, nomPartenaire, estConcubinage,
  type SituationConcubinage,
} from "./concubinage";
import type { BlocRegles } from "./reglement";

const ANNEE = 2026;

/** Caisse exigeant cinq ans de vie commune, telle que l'IA l'extrait. */
const REGLE_5_ANS: BlocRegles = {
  capitalDeces: null, capitalDecesSupplementaire: null, renteInvalidite: null, renteOrphelin: null,
  rentePartenaire: {
    pourcentage: 0.65, base: "rente d'invalidité", dureeViecommuneAns: 5,
    conditions: "Le partenaire doit avoir été désigné par écrit et avoir fait ménage commun durant les cinq ans précédant le décès.",
    article: "Article 68", citation: "…durant les cinq ans précédant le décès.",
  },
};

const REGLE_2_ANS: BlocRegles = {
  ...REGLE_5_ANS,
  rentePartenaire: { ...REGLE_5_ANS.rentePartenaire!, dureeViecommuneAns: 2 },
};

const CONCUBIN = (extra: Partial<SituationConcubinage> = {}): SituationConcubinage =>
  ({ etatCivil: 4, ...extra });

describe("durée de vie commune", () => {
  it("compte les années révolues", () => {
    expect(anneesViecommune(2018, ANNEE)).toBe(8);
    expect(anneesViecommune(2026, ANNEE)).toBe(0);
  });

  it("ignore une année absente ou aberrante", () => {
    // Une année future donnerait une durée négative et des verdicts absurdes.
    expect(anneesViecommune(null, ANNEE)).toBeNull();
    expect(anneesViecommune(2030, ANNEE)).toBeNull();
    expect(anneesViecommune(1800, ANNEE)).toBeNull();
  });
});

describe("durée exigée par le règlement", () => {
  it("lit le champ structuré", () => {
    expect(dureeExigeeParReglement(REGLE_5_ANS)).toBe(5);
    expect(dureeExigeeParReglement(REGLE_2_ANS)).toBe(2);
  });

  it("ne l'invente pas quand le règlement est muet", () => {
    expect(dureeExigeeParReglement(null)).toBeNull();
    expect(dureeExigeeParReglement({ ...REGLE_5_ANS, rentePartenaire: null })).toBeNull();
  });

  it("ne DÉDUIT JAMAIS la durée de la prose des conditions", () => {
    // Erreur réellement survenue : le texte d'Aevum commence par « 20 ans plus
    // jeune que l'assuré » — une différence d'ÂGE. En la lisant comme une durée
    // de vie commune, on exigeait vingt ans, on supprimait la rente d'un couple
    // qui y avait droit, et on étouffait l'alerte censée le prévenir.
    const prose: BlocRegles = {
      ...REGLE_5_ANS,
      rentePartenaire: {
        pourcentage: 0.65, base: "rente d'invalidité", dureeViecommuneAns: null,
        conditions: "Si le partenaire survivant est plus de 20 ans plus jeune que l'assuré décédé, la rente est réduite de 5% par année.",
        article: "Article 68", citation: "…",
      },
    };
    expect(dureeExigeeParReglement(prose)).toBeNull();
  });

  it("ignore une durée aberrante plutôt que de la propager", () => {
    const fou = (n: number): BlocRegles => ({
      ...REGLE_5_ANS,
      rentePartenaire: { ...REGLE_5_ANS.rentePartenaire!, dureeViecommuneAns: n },
    });
    expect(dureeExigeeParReglement(fou(0))).toBeNull();
    expect(dureeExigeeParReglement(fou(45))).toBeNull();
  });
});

describe("droit du partenaire en concubinage", () => {
  it("est refusé si le partenaire n'est pas désigné", () => {
    // Le cas coûteux : quinze ans de vie commune, et rien pour le survivant.
    const r = droitPartenaireConcubinage(CONCUBIN({ concubinageDepuis: 2011, clauseBeneficiaire: "NON" }), REGLE_5_ANS, ANNEE);
    expect(r.verdict).toBe("NON");
    expect(r.motif).toContain("clause bénéficiaire");
  });

  it("est refusé si la durée exigée n'est pas atteinte", () => {
    const r = droitPartenaireConcubinage(CONCUBIN({ concubinageDepuis: 2024, clauseBeneficiaire: "OUI" }), REGLE_5_ANS, ANNEE);
    expect(r.verdict).toBe("NON");
    expect(r.motif).toContain("2 ans");
  });

  it("est acquis si désigné ET durée atteinte", () => {
    expect(droitPartenaireConcubinage(CONCUBIN({ concubinageDepuis: 2018, clauseBeneficiaire: "OUI" }), REGLE_5_ANS, ANNEE).verdict).toBe("OUI");
  });

  it("ne conclut PAS sur une hypothèse de cinq ans quand le règlement est inconnu", () => {
    // Supprimer une rente faute de règlement priverait le client d'une
    // couverture qu'il a peut-être : on demande à vérifier.
    const r = droitPartenaireConcubinage(CONCUBIN({ concubinageDepuis: 2024, clauseBeneficiaire: "OUI" }), null, ANNEE);
    expect(r.verdict).toBe("A_VERIFIER");
  });

  it("reste à vérifier tant que la désignation est inconnue", () => {
    expect(droitPartenaireConcubinage(CONCUBIN({ concubinageDepuis: 2015 }), REGLE_5_ANS, ANNEE).verdict).toBe("A_VERIFIER");
  });

  it("reste à vérifier tant que l'année de vie commune manque", () => {
    const r = droitPartenaireConcubinage(CONCUBIN({}), REGLE_5_ANS, ANNEE);
    expect(r.verdict).toBe("A_VERIFIER");
    expect(r.motif).toContain("durée");
  });
});

describe("dispense pour enfants communs (Aevum, art. 57)", () => {
  /** « … d'au moins cinq ans OU … subvenir à l'entretien d'enfants communs ». */
  const AVEC_DISPENSE: BlocRegles = {
    ...REGLE_5_ANS,
    rentePartenaire: { ...REGLE_5_ANS.rentePartenaire!, enfantsCommunsRemplacentDuree: true },
  };

  it("ne refuse PAS un couple récent qui élève des enfants communs", () => {
    // Deux ans de vie commune seulement, mais le « ou » de l'art. 57 s'applique.
    const r = droitPartenaireConcubinage(
      CONCUBIN({ concubinageDepuis: 2024, clauseBeneficiaire: "OUI", nombreEnfants: 2 }), AVEC_DISPENSE, ANNEE);
    expect(r.verdict).toBe("OUI");
    expect(r.motif).toContain("enfants communs");
  });

  it("refuse toujours le même couple SANS enfant", () => {
    const r = droitPartenaireConcubinage(
      CONCUBIN({ concubinageDepuis: 2024, clauseBeneficiaire: "OUI", nombreEnfants: 0 }), AVEC_DISPENSE, ANNEE);
    expect(r.verdict).toBe("NON");
  });

  it("refuse si le règlement ne prévoit PAS cette dispense", () => {
    const r = droitPartenaireConcubinage(
      CONCUBIN({ concubinageDepuis: 2024, clauseBeneficiaire: "OUI", nombreEnfants: 2 }), REGLE_5_ANS, ANNEE);
    expect(r.verdict).toBe("NON");
  });
});

describe("faut-il alerter le client", () => {
  it("oui dès que la durée usuelle est atteinte sans désignation confirmée", () => {
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2018 }), null, ANNEE)).toBe(true);
  });

  it("non tant que la durée n'est pas atteinte : il n'y a rien à faire", () => {
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2024 }), null, ANNEE)).toBe(false);
  });

  it("suit la durée du règlement quand elle est connue", () => {
    // Caisse à 2 ans : l'alerte doit venir plus tôt que l'usage à 5 ans.
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2023 }), REGLE_2_ANS, ANNEE)).toBe(true);
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2023 }), REGLE_5_ANS, ANNEE)).toBe(false);
  });

  it("non si le client a répondu qu'il l'a fait", () => {
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2010, clauseBeneficiaire: "OUI" }), null, ANNEE)).toBe(false);
  });

  it("non si le client a demandé à ne plus voir le message", () => {
    // Le respecter est la condition pour être écouté le jour où l'on a
    // vraiment quelque chose à dire.
    expect(doitAlerterClause(CONCUBIN({ concubinageDepuis: 2010, clauseBeneficiaire: "NON", rappelMasque: true }), null, ANNEE)).toBe(false);
  });

  it("non hors concubinage", () => {
    expect(doitAlerterClause({ etatCivil: 1, concubinageDepuis: 2010 }, null, ANNEE)).toBe(false);
    expect(estConcubinage(1)).toBe(false);
  });

  it("non tant qu'on ignore depuis quand", () => {
    expect(doitAlerterClause(CONCUBIN({}), null, ANNEE)).toBe(false);
  });
});

describe("triangle d'avertissement du dossier", () => {
  it("s'affiche tant que la désignation n'est pas renseignée", () => {
    expect(afficherAvertissementPartenaire(CONCUBIN({}))).toBe(true);
  });

  it("disparaît dès que le client a répondu, quelle que soit sa réponse", () => {
    // C'est un état de complétude du dossier, pas une sollicitation : il ne
    // dépend ni de la durée ni du « ne plus voir ».
    expect(afficherAvertissementPartenaire(CONCUBIN({ clauseBeneficiaire: "OUI" }))).toBe(false);
    expect(afficherAvertissementPartenaire(CONCUBIN({ clauseBeneficiaire: "NON" }))).toBe(false);
    expect(afficherAvertissementPartenaire(CONCUBIN({ clauseBeneficiaire: "NON", rappelMasque: true }))).toBe(false);
  });

  it("ne concerne pas un client marié", () => {
    expect(afficherAvertissementPartenaire({ etatCivil: 1 })).toBe(false);
  });
});

describe("nom du partenaire", () => {
  it("compose prénom et nom pour les messages adressés au client", () => {
    expect(nomPartenaire({ partenairePrenom: "Marie", partenaireNom: "Dupont" })).toBe("Marie Dupont");
    expect(nomPartenaire({ partenairePrenom: " Marie " })).toBe("Marie");
    expect(nomPartenaire({})).toBe("");
  });
});
