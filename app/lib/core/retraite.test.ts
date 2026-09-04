import { describe, it, expect } from "vitest";
import {
  tauxConversionA, estTauxPlausible, renteAnnuelle, tauxImplicite,
  completerRetraite, tauxProjection,
} from "./retraite";
import type { BlocRegles } from "./reglement";

/** Barème réel du certificat Aevum : 5,35 % à 58 ans jusqu'à 6,40 % à 65. */
const AEVUM: BlocRegles = {
  retraite: {
    ageReference: 65,
    tauxConversion: [
      { age: 58, taux: 0.0535 }, { age: 62, taux: 0.0595 },
      { age: 64, taux: 0.0625 }, { age: 65, taux: 0.064 },
    ],
    tauxInteretProjection: 0.0125,
    anticipationDesAge: 58,
    article: "Annexe n° 4",
    citation: "Taux de conversion applicables selon l'âge de départ.",
  },
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};

const SANS_RETRAITE: BlocRegles = { ...AEVUM, retraite: null };

describe("taux de conversion", () => {
  it("se lit âge par âge", () => {
    expect(tauxConversionA(AEVUM, 65)).toBe(0.064);
    expect(tauxConversionA(AEVUM, 58)).toBe(0.0535);
  });

  it("ne DEVINE pas un âge absent du barème", () => {
    // Prendre le taux d'un âge voisin fausserait la rente de plusieurs
    // centaines de francs par mois, sans que rien ne le signale.
    expect(tauxConversionA(AEVUM, 63)).toBeNull();
    expect(tauxConversionA(SANS_RETRAITE, 65)).toBeNull();
    expect(tauxConversionA(null, 65)).toBeNull();
  });

  it("rejette une confusion d'unité", () => {
    // 6,4 au lieu de 0.064 donnerait une rente cent fois trop élevée.
    expect(estTauxPlausible(6.4)).toBe(false);
    expect(estTauxPlausible(0.064)).toBe(true);
    expect(estTauxPlausible(0.5)).toBe(false);
    expect(estTauxPlausible(null)).toBe(false);
  });
});

describe("calculs", () => {
  it("convertit un capital en rente annuelle", () => {
    expect(renteAnnuelle(127838.45, 0.064)).toBe(8182);
  });

  it("retrouve le taux appliqué par un certificat", () => {
    expect(tauxImplicite(350945, 21618)).toBeCloseTo(0.0616, 4);
  });

  it("ne calcule rien sur des valeurs absurdes", () => {
    expect(tauxImplicite(0, 21618)).toBeNull();
    expect(tauxImplicite(350945, 0)).toBeNull();
    expect(tauxImplicite(null, null)).toBeNull();
  });
});

describe("compléter les rentes manquantes", () => {
  it("calcule la rente quand le certificat ne donne que le capital", () => {
    const r = completerRetraite({ Enter_lppCapitalProjete65: 127838.45 }, AEVUM);
    expect(r.patch.Enter_rentevieillesseLPP65).toBe(8182);
    expect(r.automatique).toBe(true);
    expect(r.notes[0]).toContain("6.40 %");
  });

  it("n'écrase JAMAIS une rente déjà imprimée", () => {
    const r = completerRetraite(
      { Enter_lppCapitalProjete65: 127838.45, Enter_rentevieillesseLPP65: 8181.6 }, AEVUM);
    expect(r.patch.Enter_rentevieillesseLPP65).toBeUndefined();
  });

  it("complète aussi les âges de retraite anticipée", () => {
    const r = completerRetraite({ Enter_prestationCapital58: 79941.55 }, AEVUM);
    expect(r.patch.Enter_rentevieillesseLPP58).toBe(Math.round(79941.55 * 0.0535));
  });

  it("SIGNALE un écart sans rien corriger — cas réel du minimum LPP", () => {
    // Certificat AXA : 350'945 de capital, 21'618 de rente, soit 6,16 %, là où
    // le règlement annonce 5,6 %. Ce n'est pas une erreur : c'est le minimum
    // légal LPP qui relève la rente. La « corriger » retirerait au client une
    // garantie que la loi lui donne.
    const AXA: BlocRegles = {
      ...AEVUM,
      retraite: { ...AEVUM.retraite!, tauxConversion: [{ age: 65, taux: 0.056 }] },
    };
    const r = completerRetraite(
      { Enter_lppCapitalProjete65: 350945, Enter_rentevieillesseLPP65: 21618 }, AXA);
    expect(r.patch).toEqual({});
    expect(r.automatique).toBe(false);
    expect(r.notes[0]).toContain("minimum légal LPP");
  });

  it("ne signale rien quand le certificat colle au règlement", () => {
    const r = completerRetraite(
      { Enter_lppCapitalProjete65: 127838.45, Enter_rentevieillesseLPP65: 8181.6 }, AEVUM);
    expect(r.automatique).toBe(true);
    expect(r.notes).toEqual([]);
  });

  it("ne fait rien si le règlement est muet sur la retraite", () => {
    const r = completerRetraite({ Enter_lppCapitalProjete65: 127838.45 }, SANS_RETRAITE);
    expect(r.patch).toEqual({});
    expect(r.automatique).toBe(true);
  });

  it("n'applique pas une règle non sourcée", () => {
    const sansSource: BlocRegles = {
      ...AEVUM,
      retraite: { ...AEVUM.retraite!, article: null, citation: null },
    };
    expect(completerRetraite({ Enter_lppCapitalProjete65: 127838.45 }, sansSource).patch).toEqual({});
  });

  it("ignore un capital absent", () => {
    expect(completerRetraite({}, AEVUM).patch).toEqual({});
  });
});

describe("taux de projection", () => {
  it("remplace l'hypothèse codée en dur par le taux de la caisse", () => {
    expect(tauxProjection(AEVUM)).toBe(0.0125);
  });

  it("rejette une valeur hors de toute plausibilité", () => {
    const fou: BlocRegles = { ...AEVUM, retraite: { ...AEVUM.retraite!, tauxInteretProjection: 1.25 } };
    expect(tauxProjection(fou)).toBeNull();
    expect(tauxProjection(SANS_RETRAITE)).toBeNull();
  });
});

describe("barème à plusieurs entrées (cas réel AXA)", () => {
  /**
   * Annexe 1 du règlement AXA : le taux dépend de l'âge ET de l'année de départ.
   * À 65 ans : 6,300 % pour un départ en 2026, 5,600 % dès 2029 — onze pour cent
   * d'écart sur la rente.
   */
  const AXA: BlocRegles = {
    ...AEVUM,
    retraite: {
      ...AEVUM.retraite!,
      tauxConversion: [
        { age: 65, taux: 0.063, anneeDepart: 2026, regime: "enveloppant" },
        { age: 65, taux: 0.0605, anneeDepart: 2027, regime: "enveloppant" },
        { age: 65, taux: 0.058, anneeDepart: 2028, regime: "enveloppant" },
        { age: 65, taux: 0.056, anneeDepart: 2029, regime: "enveloppant" },
      ],
    },
  };

  it("retient le millésime du DÉPART, pas celui d'aujourd'hui", () => {
    expect(tauxConversionA(AXA, 65, { anneeDepart: 2027 })).toBe(0.0605);
  });

  it("applique la dernière ligne « à partir de » au-delà du barème", () => {
    expect(tauxConversionA(AXA, 65, { anneeDepart: 2040 })).toBe(0.056);
  });

  it("retient le plus ancien pour un départ antérieur au barème", () => {
    expect(tauxConversionA(AXA, 65, { anneeDepart: 2024 })).toBe(0.063);
  });

  it("ne choisit AUCUN taux sans année de départ connue", () => {
    // Prendre le millésime courant pour quelqu'un qui partira dans dix ans lui
    // promettrait une rente qu'il ne touchera jamais.
    expect(tauxConversionA(AXA, 65, {})).toBeNull();
  });

  it("ne tranche pas entre régime obligatoire et surobligatoire", () => {
    // Le taux dépend alors de la répartition de l'avoir, que seul le certificat
    // connaît : le plan part au conseiller plutôt que de recevoir un chiffre.
    const separe: BlocRegles = {
      ...AEVUM,
      retraite: {
        ...AEVUM.retraite!,
        tauxConversion: [
          { age: 65, taux: 0.063, anneeDepart: 2026, regime: "obligatoire" },
          { age: 65, taux: 0.048, anneeDepart: 2026, regime: "surobligatoire" },
        ],
      },
    };
    expect(tauxConversionA(separe, 65, { anneeDepart: 2026 })).toBeNull();
  });

  it("déduit l'année de départ de la date de naissance", () => {
    // Né en 1990 → 65 ans en 2055 → dernière ligne du barème.
    const r = completerRetraite(
      { Enter_dateNaissance: "29.01.1990", Enter_lppCapitalProjete65: 350945 }, AXA);
    expect(r.patch.Enter_rentevieillesseLPP65).toBe(Math.round(350945 * 0.056));
  });

  it("ne complète rien sans date de naissance sur un barème par millésime", () => {
    const r = completerRetraite({ Enter_lppCapitalProjete65: 350945 }, AXA);
    expect(r.patch).toEqual({});
  });
});

describe("plusieurs barèmes pour une même caisse", () => {
  it("ne choisit AUCUN taux quand deux barèmes se contredisent", () => {
    // Cas réel AXA : à 65 ans, départ 2026, le règlement publie 6,200 % et
    // 5,400 % selon la variante de plan. Rien n'indique laquelle concerne cet
    // assuré ; prendre le premier venu fausserait sa rente de plus de mille
    // francs par an, avec l'apparence d'une certitude.
    const ambigu: BlocRegles = {
      ...AEVUM,
      retraite: {
        ...AEVUM.retraite!,
        tauxConversion: [
          { age: 65, taux: 0.062, anneeDepart: 2026, regime: "enveloppant" },
          { age: 65, taux: 0.054, anneeDepart: 2026, regime: "enveloppant" },
        ],
      },
    };
    expect(tauxConversionA(ambigu, 65, { anneeDepart: 2026 })).toBeNull();
  });

  it("accepte un doublon qui porte le MÊME taux", () => {
    // Deux tables identiques sur ce point : aucune ambiguïté réelle.
    const double: BlocRegles = {
      ...AEVUM,
      retraite: {
        ...AEVUM.retraite!,
        tauxConversion: [
          { age: 65, taux: 0.062, anneeDepart: 2026, regime: "enveloppant" },
          { age: 65, taux: 0.062, anneeDepart: 2026, regime: "enveloppant" },
        ],
      },
    };
    expect(tauxConversionA(double, 65, { anneeDepart: 2026 })).toBe(0.062);
  });
});
