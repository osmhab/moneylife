import { describe, it, expect } from "vitest";
import {
  plafondSurindemnisation, reduireSiSurindemnise, estSurindemnise,
  reduireScenario, plafondMensuel,
} from "./surindemnisation";
import type { BlocRegles } from "./reglement";

/** Chiffre 73 du règlement AXA : 90 % du gain présumé perdu. */
const bloc = (r: Record<string, unknown> | null): BlocRegles => ({
  retraitCapital: null,
  surindemnisation: r && {
    plafondPct: 90, concerneInvalidite: true, concerneSurvivants: true,
    article: "Chiffre 73.1",
    citation: "…excèdent 90 % du gain dont on peut présumer que la personne ayant droit est privée.",
    ...r,
  } as BlocRegles["surindemnisation"],
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
});

const AXA = bloc({});

describe("lecture du plafond", () => {
  it("rend une fraction, pas un pourcentage", () => {
    expect(plafondSurindemnisation(AXA)).toBe(0.9);
  });

  it("ne rabote RIEN quand le règlement est muet", () => {
    // Appliquer un plafond supposé retrancherait à un client une rente qu'il
    // touchera peut-être en entier.
    expect(plafondSurindemnisation(bloc(null))).toBeNull();
    expect(plafondSurindemnisation(bloc({ plafondPct: null }))).toBeNull();
    expect(plafondSurindemnisation(null)).toBeNull();
  });

  it("n'applique pas une règle non sourcée", () => {
    expect(plafondSurindemnisation(bloc({ article: null, citation: null }))).toBeNull();
  });

  it("écarte une valeur invraisemblable", () => {
    // Un plafond lu à 9 % raboterait presque toute la rente.
    expect(plafondSurindemnisation(bloc({ plafondPct: 9 }))).toBeNull();
    expect(plafondSurindemnisation(bloc({ plafondPct: 900 }))).toBeNull();
  });
});

describe("réduction effective", () => {
  it("ne touche à rien tant que le cumul reste sous le plafond", () => {
    // Salaire 144'000 → plafond 129'600. AI 29'400 + LPP 86'400 = 115'800.
    const r = reduireSiSurindemnise(
      { gainPresume: 144000, rentesTierces: 29400, renteCaisse: 86400 }, AXA);
    expect(r.reduction).toBe(0);
    expect(r.renteReduite).toBe(86400);
    expect(r.plafond).toBe(129600);
  });

  it("rabote l'excédent — le cas que le certificat ne montre pas", () => {
    // Salaire 80'000 → plafond 72'000. AI 30'000 + LPP 50'000 = 80'000.
    // Le certificat annonce 50'000 ; le client en touchera 42'000.
    const r = reduireSiSurindemnise(
      { gainPresume: 80000, rentesTierces: 30000, renteCaisse: 50000 }, AXA);
    expect(r.reduction).toBe(8000);
    expect(r.renteReduite).toBe(42000);
    expect(r.notes[0]).toContain("Chiffre 73.1");
  });

  it("ne réduit JAMAIS en dessous de zéro", () => {
    // Les rentes de tiers dépassent à elles seules le plafond : la caisse ne
    // peut pas réduire l'AI, qui est due par la Confédération.
    const r = reduireSiSurindemnise(
      { gainPresume: 60000, rentesTierces: 60000, renteCaisse: 20000 }, AXA);
    expect(r.renteReduite).toBe(0);
    expect(r.reduction).toBe(20000);
  });

  it("ne rabote rien sans règlement connu", () => {
    const r = reduireSiSurindemnise(
      { gainPresume: 80000, rentesTierces: 30000, renteCaisse: 50000 }, bloc(null));
    expect(r.renteReduite).toBe(50000);
    expect(r.reduction).toBe(0);
  });

  it("signale un revenu manquant plutôt que de deviner", () => {
    // Sans revenu, le plafond n'est pas calculable : c'est une donnée à
    // compléter, pas une absence de règle.
    const r = reduireSiSurindemnise(
      { gainPresume: null, rentesTierces: 30000, renteCaisse: 50000 }, AXA);
    expect(r.reduction).toBe(0);
    expect(r.automatique).toBe(false);
    expect(r.notes[0]).toContain("revenu annuel");
  });

  it("répond à la question posée au conseiller", () => {
    expect(estSurindemnise({ gainPresume: 80000, rentesTierces: 30000, renteCaisse: 50000 }, AXA)).toBe(true);
    expect(estSurindemnise({ gainPresume: 144000, rentesTierces: 29400, renteCaisse: 86400 }, AXA)).toBe(false);
  });
});

describe("application à un scénario de rentes", () => {
  /** Salaire 80'000 → plafond annuel 72'000, soit 6'000/mois. */
  const PLAFOND = 6000;

  const scenario = (n: number) => ({
    adulte: { avs: 2000, lpp: 4000 },
    parEnfant: { avs: 800, lpp: 800 },
    nbEnfants: n,
    total: 2000 + 4000 + n * (800 + 800),
  });

  it("ne touche à rien sous le plafond", () => {
    const r = reduireScenario(scenario(0), PLAFOND);
    expect(r.total).toBe(6000);
    expect(r.reductionSurindemnisation).toBe(0);
  });

  it("rabote la part LPP du dépassement, sans toucher à l'AVS/AI", () => {
    // Deux enfants : 9'200/mois contre 6'000 de plafond → 3'200 de trop.
    const r = reduireScenario(scenario(2), PLAFOND);
    expect(r.reductionSurindemnisation).toBe(3200);
    expect(r.adulte.avs).toBe(2000);          // intouchée
    expect(r.parEnfant.avs).toBe(800);        // intouchée
    expect(r.total).toBe(6000);
  });

  it("réduit adulte et enfants au prorata", () => {
    // LPP total 5'600 (4'000 + 2×800), on en retire 3'200 → il reste 42,857 %.
    const r = reduireScenario(scenario(2), PLAFOND);
    expect(r.adulte.lpp).toBe(Math.round(4000 * (1 - 3200 / 5600)));
    expect(r.parEnfant.lpp).toBe(Math.round(800 * (1 - 3200 / 5600)));
  });

  it("ne descend jamais sous zéro", () => {
    // Rentes de tiers supérieures au plafond à elles seules.
    const r = reduireScenario(
      { adulte: { avs: 7000, lpp: 1000 }, parEnfant: { avs: 0, lpp: 0 }, nbEnfants: 0, total: 8000 },
      PLAFOND);
    expect(r.adulte.lpp).toBe(0);
    expect(r.total).toBe(7000);               // l'AI reste due
  });

  it("ne rabote rien sans plafond connu", () => {
    expect(reduireScenario(scenario(2), null).total).toBe(9200);
  });

  it("calcule le plafond mensuel depuis le revenu et le règlement", () => {
    expect(plafondMensuel(80000, AXA)).toBe(6000);
    expect(plafondMensuel(null, AXA)).toBeNull();
    expect(plafondMensuel(80000, bloc(null))).toBeNull();
  });
});
