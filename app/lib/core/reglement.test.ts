import { describe, it, expect } from "vitest";
import {
  normaliserCaisse, memeCaisse, cleReglement,
  blocApplicable, trouverAnnexe, caseCapitalDeces, estSourcee,
  appliquerCapitalDeces, montantCertificatCapitalDeces, certificatDistingueDeuxCapitaux,
  dateEnVigueur, estPlusRecent,
  type Reglement, type BlocRegles,
} from "./reglement";

/** Règles réellement extraites du règlement Aevum du 1er janvier 2026. */
const AEVUM: Reglement = {
  cle: "aevum-prevoyance-2026",
  caisse: "AEVUM FONDATION DE PRÉVOYANCE",
  enVigueurAu: "1er janvier 2026",
  langue: "français",
  plansDetectes: ["Plans cadres", "Plan ex-PAT BVG"],
  general: {
    retraite: null,
    capitalDeces: {
      verse: "SI_AUCUNE_RENTE_PARTENAIRE",
      base: "capital de prévoyance",
      limiteHeritiersLegaux: 0.5,
      avantRetraiteUniquement: null,
      article: "Article 63, al. 1",
      citation: "Un capital est versé en cas de décès d'un assuré si aucune rente de partenaire n'est échue.",
    },
    capitalDecesSupplementaire: null,
    rentePartenaire: null,
    renteInvalidite: null,
    renteOrphelin: null,
  },
  annexes: [
    {
      nom: "Plan ex-PAT BVG",
      sappliqueA: "assurés préalablement assurés auprès de PAT BVG",
      surcharges: {
        capitalDeces: {
          verse: "TOUJOURS",
          base: "avoir de vieillesse accumulé",
          limiteHeritiersLegaux: null,
          avantRetraiteUniquement: null,
          article: "Annexe no 8, Article 6, al. 1",
          citation: "Le capital décès assuré s'élève à l'avoir de vieillesse accumulé, il est versé dans tous les cas.",
        },
      },
    },
    {
      nom: "Plan ex-Pensionskasse Spital Zofingen (PSZ)",
      sappliqueA: "assurés préalablement assurés auprès de la Pensionskasse Spital Zofingen",
      surcharges: {
        capitalDeces: {
          verse: "REDUIT_DU_FINANCEMENT_RENTE",
          base: "épargne disponible",
          limiteHeritiersLegaux: null,
          avantRetraiteUniquement: true,
          article: "Annexe no 7, Article 10, al. 1",
          citation: "…correspond à 100 % de l'épargne disponible, déduction faite du montant nécessaire au financement de la rente de partenaire.",
        },
      },
    },
  ],
};

describe("identité d'une caisse", () => {
  it("reconnaît la même caisse malgré la casse et les accents", () => {
    expect(memeCaisse("Aevum Fondation de Prévoyance", "AEVUM FONDATION DE PREVOYANCE")).toBe(true);
  });

  it("reconnaît un nom abrégé sur le certificat", () => {
    // Le certificat imprime « aevum » seul dans son en-tête.
    expect(memeCaisse("aevum", "Aevum Fondation de Prévoyance")).toBe(true);
  });

  it("ne confond pas deux caisses différentes", () => {
    expect(memeCaisse("Aevum Fondation de Prévoyance", "Publica")).toBe(false);
    expect(memeCaisse("Profond", "Proparis")).toBe(false);
  });

  it("rattache « AXA », tel qu'imprimé sur un certificat réel", () => {
    // Cas vécu : le certificat porte institutionName = "AXA" et le règlement
    // « AXA Fondation LPP Suisse romande, Winterthur ». Avec un seuil à quatre
    // caractères, le plan du client n'était rattaché à RIEN, sans un mot.
    expect(memeCaisse("AXA", "AXA Fondation LPP Suisse romande, Winterthur")).toBe(true);
  });

  it("ne s'accroche pas à un nom qui commence pareil", () => {
    // La frontière de mot évite « axa » ↔ « Axalp ».
    expect(memeCaisse("AXA", "Axalp Vorsorge")).toBe(false);
  });

  it("ne rapproche pas deux caisses sur une abréviation trop courte", () => {
    // « PK » ou « CP » précèdent des dizaines de caisses : les accepter
    // appliquerait le règlement d'une caisse aux assurés d'une autre.
    expect(memeCaisse("PK", "PK Muster")).toBe(false);
  });

  it("ignore la forme juridique et les mots de liaison", () => {
    expect(normaliserCaisse("Aevum Fondation de Prévoyance")).toBe("aevum prevoyance");
  });

  it("range le millésime dans la clé : les règles changent chaque année", () => {
    expect(cleReglement("Aevum Fondation de Prévoyance", "1er janvier 2026")).toBe("aevum-prevoyance-2026");
    expect(cleReglement("Aevum Fondation de Prévoyance", "01.01.2025")).toBe("aevum-prevoyance-2025");
  });
});

describe("quelles règles s'appliquent à ce plan", () => {
  it("sans annexe correspondante, applique la partie générale", () => {
    // Le « Plan B » de Laetitia n'a pas d'annexe propre.
    expect(blocApplicable(AEVUM, "Plan B").capitalDeces?.verse).toBe("SI_AUCUNE_RENTE_PARTENAIRE");
    expect(blocApplicable(AEVUM, null).capitalDeces?.verse).toBe("SI_AUCUNE_RENTE_PARTENAIRE");
  });

  it("une annexe surcharge la partie générale", () => {
    expect(blocApplicable(AEVUM, "Plan ex-PAT BVG").capitalDeces?.verse).toBe("TOUJOURS");
  });

  it("une annexe muette sur un point n'efface pas la règle générale", () => {
    const general: BlocRegles = {
      ...AEVUM.general,
      renteOrphelin: { pourcentage: 0.2, base: "rente d'invalidité", article: "Art. 70", citation: "20 %" },
    };
    const bloc = blocApplicable({ ...AEVUM, general }, "Plan ex-PAT BVG");
    expect(bloc.capitalDeces?.verse).toBe("TOUJOURS");          // surchargé
    expect(bloc.renteOrphelin?.pourcentage).toBe(0.2);          // conservé
  });

  it("rattache même quand l'IA nomme l'annexe par son NUMÉRO", () => {
    // Vu en conditions réelles : une exécution rend « Plan ex-PAT BVG », une
    // autre « Annexe no 8 ». Un numéro ne figure pas sur le certificat de
    // l'assuré — sans repli sur `sappliqueA`, le rattachement échouerait en
    // silence et l'assuré se verrait appliquer la règle générale.
    const parNumero: Reglement = {
      ...AEVUM,
      annexes: [{
        nom: "Annexe no 8",
        sappliqueA: "Plan ex-PAT BVG : assurés préalablement assurés auprès de PAT BVG",
        surcharges: AEVUM.annexes[0].surcharges,
      }],
    };
    expect(blocApplicable(parNumero, "Plan ex-PAT BVG").capitalDeces?.verse).toBe("TOUJOURS");
  });

  it("ne rattache pas sur un nom de plan trop court", () => {
    // « B » seul rapprocherait n'importe quelle annexe.
    expect(trouverAnnexe(AEVUM, "B")).toBeNull();
  });

  it("trouve l'annexe par correspondance de nom", () => {
    expect(trouverAnnexe(AEVUM, "ex-PAT BVG")?.nom).toBe("Plan ex-PAT BVG");
    expect(trouverAnnexe(AEVUM, "Plan B")).toBeNull();
  });
});

describe("routage du capital décès", () => {
  it("associe chaque mode à la bonne case du moteur", () => {
    expect(caseCapitalDeces("TOUJOURS")).toBe("PLUS_RENTE");
    expect(caseCapitalDeces("SI_AUCUNE_RENTE_PARTENAIRE")).toBe("AUCUNE_RENTE");
    expect(caseCapitalDeces("NON_PREVU")).toBe("AUCUNE");
    expect(caseCapitalDeces("REDUIT_DU_FINANCEMENT_RENTE")).toBe("A_VERIFIER");
    expect(caseCapitalDeces(null)).toBe("A_VERIFIER");
  });

  it("cas réel Aevum : les 19'662.05 ne valent QUE si aucune rente n'est due", () => {
    const bloc = blocApplicable(AEVUM, "Plan B");
    const r = appliquerCapitalDeces(19662.05, bloc);
    expect(r.automatique).toBe(true);
    expect(r.patch.Enter_CapitalAucuneRenteMal).toBe(19662.05);
    expect(r.patch.Enter_CapitalPlusRenteMal).toBe(0);
    expect(r.notes[0]).toContain("Article 63");
  });

  it("plan ex-PAT BVG : le même montant s'ajoute à la rente", () => {
    const r = appliquerCapitalDeces(19662.05, blocApplicable(AEVUM, "Plan ex-PAT BVG"));
    expect(r.patch.Enter_CapitalPlusRenteMal).toBe(19662.05);
    expect(r.patch.Enter_CapitalAucuneRenteMal).toBe(0);
  });

  it("neutralise les champs génériques, sinon le montant fuite dans le calcul accident", () => {
    const r = appliquerCapitalDeces(19662.05, blocApplicable(AEVUM, "Plan B"));
    expect(r.patch.Enter_CapitalAucuneRente).toBeNull();
    expect(r.patch.Enter_CapitalPlusRente).toBeNull();
    // L'accident suit la même règle que la maladie.
    expect(r.patch.Enter_CapitalAucuneRenteAcc).toBe(19662.05);
    expect(r.patch.Enter_CapitalPlusRenteAcc).toBe(0);
  });

  it("ne devine pas un capital sous déduction du financement de la rente", () => {
    // Le règlement ne donne pas les tarifs actuariels : deviner ici afficherait
    // au client un montant de prévoyance inventé.
    const r = appliquerCapitalDeces(19662.05, blocApplicable(AEVUM, "Plan ex-Pensionskasse Spital Zofingen (PSZ)"));
    expect(r.automatique).toBe(false);
    expect(r.patch).toEqual({});
    expect(r.notes[0]).toContain("conseiller");
  });

  it("n'applique jamais une règle sans source", () => {
    const sansSource: BlocRegles = {
      ...AEVUM.general,
      capitalDeces: { verse: "TOUJOURS", base: null, limiteHeritiersLegaux: null, avantRetraiteUniquement: null, article: null, citation: null },
    };
    expect(estSourcee(sansSource.capitalDeces)).toBe(false);
    const r = appliquerCapitalDeces(19662.05, sansSource);
    expect(r.automatique).toBe(false);
    expect(r.patch).toEqual({});
  });

  it("un certificat sans capital décès ne fabrique aucun montant", () => {
    const r = appliquerCapitalDeces(null, blocApplicable(AEVUM, "Plan B"));
    expect(r.patch).toEqual({});
    expect(r.automatique).toBe(true);
  });

  it("un règlement sans capital décès met les deux cases à zéro", () => {
    const aucun: BlocRegles = {
      ...AEVUM.general,
      capitalDeces: { ...AEVUM.general.capitalDeces!, verse: "NON_PREVU" },
    };
    const r = appliquerCapitalDeces(19662.05, aucun);
    expect(r.patch.Enter_CapitalAucuneRenteMal).toBe(0);
    expect(r.patch.Enter_CapitalPlusRenteMal).toBe(0);
  });
});

describe("certificat qui distingue déjà deux capitaux", () => {
  it("le détecte quand les deux cases portent des montants DIFFÉRENTS", () => {
    expect(certificatDistingueDeuxCapitaux({
      Enter_CapitalPlusRenteMal: 100000, Enter_CapitalAucuneRenteMal: 432000,
    })).toBe(true);
  });

  it("le détecte AUSSI quand les deux montants sont égaux", () => {
    // Cas réel du certificat AXA du 30.04.2026 : les deux scénarios valent
    // 432'000. En n'intervenant que sur des montants divergents, la première
    // version a laissé mettre à zéro le scénario « aucune rente » — un
    // célibataire y perdait toute sa couverture décès.
    expect(certificatDistingueDeuxCapitaux({
      Enter_CapitalPlusRenteMal: 432000, Enter_CapitalAucuneRenteMal: 432000,
    })).toBe(true);
  });

  it("ne le voit pas quand une seule case est remplie", () => {
    expect(certificatDistingueDeuxCapitaux({ Enter_CapitalPlusRenteMal: 432000 })).toBe(false);
    expect(certificatDistingueDeuxCapitaux({})).toBe(false);
  });

  it("NE RECLASSE RIEN quand le certificat a déjà tranché", () => {
    // Le document distingue mieux que nous : reclasser écraserait l'un des deux
    // capitaux, donc ferait disparaître une couverture réelle du client.
    const donnees = { Enter_CapitalPlusRenteMal: 100000, Enter_CapitalAucuneRenteMal: 432000 };
    const r = appliquerCapitalDeces(100000, blocApplicable(AEVUM, "Plan B"), donnees);
    expect(r.patch).toEqual({});
    // Le plan reste VÉRIFIÉ : le règlement a été lu, il n'y avait rien à
    // reclasser. Le marquer « non vérifié » pousserait le client vers un
    // Contrôle Expert payant sans objet.
    expect(r.automatique).toBe(true);
    expect(r.notes[0]).toContain("conservés");
  });
});

describe("retrouver le montant du certificat", () => {
  it("lit le montant quelle que soit la case où le scan l'avait rangé", () => {
    expect(montantCertificatCapitalDeces({ Enter_CapitalPlusRenteMal: 19662.05 })).toBe(19662.05);
    expect(montantCertificatCapitalDeces({ Enter_CapitalAucuneRenteMal: 19662.05 })).toBe(19662.05);
    expect(montantCertificatCapitalDeces({ Enter_CapitalAucuneRente: 19662.05 })).toBe(19662.05);
  });

  it("passe un 0 explicite pour trouver le vrai montant rangé ailleurs", () => {
    expect(montantCertificatCapitalDeces({
      Enter_CapitalPlusRenteMal: 0, Enter_CapitalAucuneRenteMal: 19662.05,
    })).toBe(19662.05);
  });

  it("accepte un montant saisi avec apostrophe de milliers", () => {
    expect(montantCertificatCapitalDeces({ Enter_CapitalPlusRenteMal: "19'662.05" })).toBe(19662.05);
  });

  it("ignore le capital décès INDÉPENDANT (troisième capital, non conditionnel)", () => {
    expect(montantCertificatCapitalDeces({ Enter_CapitalDecesIndependantMal: 50000 })).toBeNull();
  });

  it("rend null quand le certificat ne porte aucun capital", () => {
    expect(montantCertificatCapitalDeces({})).toBeNull();
  });
});

describe("millésimes", () => {
  it("lit les formats numériques", () => {
    expect(dateEnVigueur("01.01.2026")).toBe(20260101);
    expect(dateEnVigueur("2026-07-15")).toBe(20260715);
  });

  it("lit les mois en toutes lettres, dans les trois langues", () => {
    expect(dateEnVigueur("1er janvier 2026")).toBe(20260101);
    expect(dateEnVigueur("1. Januar 2026")).toBe(20260101);
    expect(dateEnVigueur("1° gennaio 2026")).toBe(20260101);
  });

  it("retombe sur l'année seule quand le mois est illisible", () => {
    expect(dateEnVigueur("en vigueur en 2026")).toBe(20260101);
    expect(dateEnVigueur("sans date")).toBeNull();
  });

  it("compare des formes différentes de la MÊME date", () => {
    // L'IA rend « 01.01.2026 » un jour, « 1er janvier 2026 » le lendemain :
    // une comparaison de chaînes conclurait à tort à une nouvelle version.
    expect(estPlusRecent("1er janvier 2026", "01.01.2026")).toBe(false);
    expect(estPlusRecent("01.01.2026", "1er janvier 2026")).toBe(false);
  });

  it("remplace sur une version réellement plus récente", () => {
    expect(estPlusRecent("01.01.2027", "01.01.2026")).toBe(true);
    expect(estPlusRecent("01.07.2026", "01.01.2026")).toBe(true);
  });

  it("garde l'existant à date égale ou antérieure", () => {
    expect(estPlusRecent("01.01.2025", "01.01.2026")).toBe(false);
    expect(estPlusRecent("01.01.2026", "01.01.2026")).toBe(false);
  });

  it("ne remplace JAMAIS sur une date illisible", () => {
    // Sinon un document mal daté écraserait une version vérifiée.
    expect(estPlusRecent(null, "01.01.2026")).toBe(false);
    expect(estPlusRecent("sans date", "01.01.2026")).toBe(false);
  });

  it("accepte un premier règlement quand rien n'est connu", () => {
    expect(estPlusRecent("01.01.2026", null)).toBe(true);
  });
});

describe("fondations à plusieurs caisses", () => {
  const CPO = "Caisse de prévoyance du Canton du Valais – Caisse de prévoyance ouverte (CPO)";
  const CPF = "Caisse de prévoyance du Canton du Valais – Caisse de prévoyance fermée (CPF)";

  it("rattache l'extrait imprimé sur le certificat au règlement complet", () => {
    // Cas réel : quatre clients CPVAL, dont le certificat imprime « Caisse
    // ouverte CPO ». Ni égalité ni préfixe — et pourtant la même caisse.
    expect(memeCaisse("Caisse ouverte CPO", CPO)).toBe(true);
  });

  it("NE confond PAS la caisse ouverte et la caisse fermée", () => {
    // Deux caisses distinctes, deux règlements, deux jeux de prestations :
    // appliquer le mauvais fausserait l'analyse de l'assuré.
    expect(memeCaisse("Caisse ouverte CPO", CPF)).toBe(false);
    expect(memeCaisse("Caisse fermée CPF", CPO)).toBe(false);
  });

  it("exige DEUX mots distinctifs, pas un seul", () => {
    // « ouverte » seul rapprocherait deux fondations sans rapport.
    expect(memeCaisse("Caisse ouverte", CPO)).toBe(false);
    expect(memeCaisse("prévoyance", CPO)).toBe(false);
  });

  it("ne rapproche pas deux caisses par leurs mots banals", () => {
    expect(memeCaisse("Caisse de prévoyance suisse", CPO)).toBe(false);
  });
});
