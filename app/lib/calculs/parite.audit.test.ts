import { describe, it, expect } from "vitest";
import * as APP from "./3epilier";
import * as SHARED from "../../../lib/shared/calculs/3epilier";
import * as APP_LPP from "./lpp";
import * as SHARED_LPP from "../../../lib/shared/calculs/lpp";
import { LEGAL_2025 } from "@/lib/core/legal";

// AUDIT DE PARITÉ — les deux copies du moteur doivent renvoyer les MÊMES nombres.
//
// `app/lib/calculs` sert l'écran conseiller ; `lib/shared/calculs` alimente la
// Cloud Function qui écrit l'analyse lue par l'app cliente et iOS. Une
// divergence signifie qu'un même client voit deux chiffres différents selon
// l'écran — le défaut le plus grave possible ici, et le plus silencieux.

const ages = [25, 40, 55, 64];
const occurrences = ["mois", "trimestre", "annee"] as const;

function assurances() {
  const out: any[] = [];
  for (const occ of occurrences)
    for (const rachat of [0, 12_500])
      for (const prime of [0, 300])
        for (const investi of [false, true])
          for (const fixe of [undefined, 0, 50_000])
            out.push({
              typeContrat: "3a", soldeActuel: 0, isRegulier: false, isInvesti: investi,
              profil: "equilibre", primeTotale: prime * 2, primeEpargne: prime,
              valeurRachatActuelle: rachat, hasLDP: false, renteInvalidite: 0,
              capitalDecesFixe: fixe as any, hasMandatGestion: false,
              occurrence: occ, dateDebut: "2018-04-01",
            });
  return out;
}

describe("parité moteur — 3e pilier", () => {
  it("computeProjections3aAssurance : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const d of assurances()) for (const age of ages) {
      const a = APP.computeProjections3aAssurance(d, age);
      const b = SHARED.computeProjections3aAssurance(d, age);
      if (a !== b) ecarts.push(`age ${age} occ ${d.occurrence} rachat ${d.valeurRachatActuelle} prime ${d.primeEpargne} → app ${a} / shared ${b}`);
    }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });

  it("computeDeathBenefitAssurance : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const d of assurances()) {
      const a = APP.computeDeathBenefitAssurance(d);
      const b = SHARED.computeDeathBenefitAssurance(d);
      if (a !== b) ecarts.push(`fixe=${d.capitalDecesFixe} occ=${d.occurrence} prime=${d.primeTotale} rachat=${d.valeurRachatActuelle} → app ${a} / shared ${b}`);
    }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });

  it("capitalDecesCouvert : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const type of [undefined, "fixe", "primes"] as const)
      for (const d of assurances()) {
        const x = { ...d, typeCapitalDeces: type };
        const a = APP.capitalDecesCouvert(x);
        const b = SHARED.capitalDecesCouvert(x);
        if (a !== b) ecarts.push(`type=${type} fixe=${d.capitalDecesFixe} → app ${a} / shared ${b}`);
      }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });

  it("computeProjections3aBanque : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const occ of occurrences)
      for (const solde of [0, 30_000])
        for (const reg of [0, 250])
          for (const investi of [false, true])
            for (const age of ages) {
              const d = { soldeActuel: solde, isRegulier: reg > 0, montantRegulier: reg, occurrence: occ, isInvesti: investi, profil: "equilibre" } as any;
              const a = APP.computeProjections3aBanque(d, age);
              const b = SHARED.computeProjections3aBanque(d, age);
              if (a !== b) ecarts.push(`age ${age} occ ${occ} solde ${solde} reg ${reg} investi ${investi} → app ${a} / shared ${b}`);
            }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });

  it("yearsToMaturity : même horizon", () => {
    const at = new Date("2026-09-03T12:00:00Z");
    const ecarts: string[] = [];
    for (const ech of [undefined, "", "2030-06-30", "15.03.2032", "pas-une-date"])
      for (const age of ages) {
        const a = APP.yearsToMaturity(ech as any, age, at);
        const b = SHARED_LPP ? SHARED.yearsToMaturity(ech as any, age, at) : a;
        if (Math.abs(a - b) > 1e-9) ecarts.push(`ech=${ech} age=${age} → app ${a} / shared ${b}`);
      }
    expect(ecarts).toEqual([]);
  });
});

describe("parité moteur — LPP", () => {
  const base: any = {
    Enter_dateNaissance: "1985-06-15", Enter_tauxActivite: 100, Enter_etatCivil: 1,
    Enter_lppCapitalProjete65: 0, Enter_avoirVieillesseActuel: 40_000,
  };

  it("salaire assuré (épargne et risque) : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const salaire of [30_000, 60_000, 85_000, 150_000])
      for (const fn of ["calcSalaireAssureEpargneLPP", "calcSalaireAssureRisqueLPP"] as const) {
        const c = { ...base, Enter_salaireBrut: salaire };
        const a = (APP_LPP as any)[fn](c, LEGAL_2025);
        const b = (SHARED_LPP as any)[fn](c, LEGAL_2025);
        if (a !== b) ecarts.push(`${fn}(${salaire}) → app ${a} / shared ${b}`);
      }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });

  it("rentes et capitaux décès : mêmes montants", () => {
    const fns = [
      "calcRenteVieillesseLPP", "calcRenteInvaliditeLPP", "calcRenteConjointLPP",
      "calcRenteOrphelinLPP", "calcRenteEnfantInvaliditeLPP", "calcRentePartenaireLPP",
      "calcCapitalDecesMaladiePlusRenteLPP", "calcCapitalDecesMaladieAucuneRenteLPP",
      "calcCapitalDecesAccidentPlusRenteLPP", "calcCapitalDecesAccidentAucuneRenteLAA",
    ];
    const ecarts: string[] = [];
    for (const salaire of [30_000, 85_000, 150_000])
      for (const capital of [0, 250_000])
        for (const fn of fns) {
          const c = { ...base, Enter_salaireBrut: salaire, Enter_lppCapitalProjete65: capital };
          let a: any, b: any;
          try { a = (APP_LPP as any)[fn](c); } catch (e: any) { a = "ERR " + e.message; }
          try { b = (SHARED_LPP as any)[fn](c); } catch (e: any) { b = "ERR " + e.message; }
          if (JSON.stringify(a) !== JSON.stringify(b))
            ecarts.push(`${fn} salaire=${salaire} capital=${capital} → app ${JSON.stringify(a)} / shared ${JSON.stringify(b)}`);
        }
    expect(ecarts.slice(0, 8)).toEqual([]);
  });

  it("projection retraite : mêmes montants", () => {
    const ecarts: string[] = [];
    for (const salaire of [30_000, 85_000, 150_000])
      for (const capital of [0, 250_000])
        for (const age of ages) {
          const c = { ...base, Enter_salaireBrut: salaire, Enter_lppCapitalProjete65: capital };
          const a = APP_LPP.computeLPPProjectionRetraite(c, age);
          const b = (SHARED_LPP as any).computeLPPProjectionRetraite(c, age);
          if (a !== b) ecarts.push(`salaire=${salaire} capital=${capital} age=${age} → app ${a} / shared ${b}`);
        }
    expect(ecarts.slice(0, 6)).toEqual([]);
  });
});
