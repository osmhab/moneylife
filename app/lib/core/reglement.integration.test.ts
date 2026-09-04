// Épreuve de bout en bout sur la VRAIE sortie de l'IA.
//
// La fixture n'est pas écrite à la main : c'est la réponse réelle de Gemini au
// règlement Aevum du 1er janvier 2026 (53 pages), figée telle quelle. Des
// fixtures inventées ne prouveraient que la cohérence du code avec lui-même ;
// ici on vérifie que la chaîne encaisse la forme que l'IA produit vraiment.

import { describe, it, expect } from "vitest";
import brut from "./__fixtures__/reglement-aevum-2026.json";
import {
  cleReglement, memeCaisse, blocApplicable, appliquerCapitalDeces,
  montantCertificatCapitalDeces, estSourcee, type Reglement,
} from "./reglement";

const BLOC_VIDE = {
  retraite: null,
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};

/** Même normalisation que la route serveur. */
const reglement: Reglement = {
  cle: cleReglement(brut.caisse.nom, brut.caisse.enVigueurAu),
  caisse: brut.caisse.nom,
  enVigueurAu: brut.caisse.enVigueurAu,
  langue: brut.caisse.langue,
  plansDetectes: brut.plansDetectes,
  general: { ...BLOC_VIDE, ...(brut.general as object) },
  annexes: (brut.annexes ?? []) as Reglement["annexes"],
};

describe("règlement Aevum réel : de la sortie IA au plan du client", () => {
  it("identifie la caisse et son millésime", () => {
    expect(reglement.caisse).toContain("AEVUM");
    expect(reglement.cle).toBe("aevum-prevoyance-2026");
  });

  it("se rattache au certificat, qui n'imprime que « aevum »", () => {
    expect(memeCaisse("aevum", reglement.caisse)).toBe(true);
  });

  it("chaque règle appliquée porte sa source", () => {
    // Sans citation ni article, une règle n'est pas opposable au client.
    expect(estSourcee(reglement.general.capitalDeces)).toBe(true);
    expect(reglement.general.capitalDeces?.article).toMatch(/63/);
  });

  it("le cas de Laetitia : le capital décès du certificat n'est PAS dû", () => {
    // Certificat 2025, « Plan B », assurée mariée : la rente de partenaire est
    // échue (11'356.80/an), donc l'art. 63 al. 1 exclut le capital.
    const donneesCertificat = { Enter_CapitalPlusRenteMal: 19662.05 };
    const bloc = blocApplicable(reglement, "Plan B");

    const r = appliquerCapitalDeces(montantCertificatCapitalDeces(donneesCertificat), bloc);

    expect(r.automatique).toBe(true);
    // Le montant quitte la case « en plus de la rente »…
    expect(r.patch.Enter_CapitalPlusRenteMal).toBe(0);
    // …pour celle où il n'est dû qu'à défaut de rente.
    expect(r.patch.Enter_CapitalAucuneRenteMal).toBe(19662.05);
  });

  it("distingue les trois annexes qui se contredisent dans le même document", () => {
    const lu = (plan: string) => blocApplicable(reglement, plan).capitalDeces?.verse;
    expect(lu("Plan ex-PAT BVG")).toBe("TOUJOURS");
    expect(lu("Plan ex-Pensionskasse Spital Zofingen (PSZ)")).toBe("REDUIT_DU_FINANCEMENT_RENTE");
    expect(lu("Plan B")).toBe("SI_AUCUNE_RENTE_PARTENAIRE");     // partie générale
  });

  it("le plan PSZ n'est jamais reclassé automatiquement", () => {
    const r = appliquerCapitalDeces(19662.05, blocApplicable(reglement, "Plan ex-Pensionskasse Spital Zofingen (PSZ)"));
    expect(r.automatique).toBe(false);
    expect(r.patch).toEqual({});
  });
});
