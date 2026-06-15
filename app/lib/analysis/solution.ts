// app/lib/analysis/solution.ts
//
// Couche PRICING : à partir des lacunes (analyse) + des modèles assureurs (benchmarks ML),
// propose la prime de la solution CreditX (retraite / invalidité / décès / exonération),
// le meilleur provider par risque, le split 3a/3b et le gain fiscal.
// Port de la partie "sol" de usePrevoyanceAnalysis. Réutilise predictLog (threeA-engine).

import { predictLog, type ProviderModelDoc } from "lib/engines/threeA-engine";
import type { SituationAnalysis } from "./situation";

export interface Solution {
  priceRetMensuel: number;
  priceIncMensuel: number;
  priceDecMensuel: number;
  pricePayMensuel: number;
  totalMensuel: number;
  split3aMensuel: number;
  split3bMensuel: number;
  gainFiscalMensuel: number;
  providers: { retraite: string | null; invalidite: string | null; deces: string | null };
}

export function computeSolution(opts: {
  situation: SituationAnalysis;
  clientAge: number;
  genderF: number; // 1 = femme, 0 = homme
  benchmarks: ProviderModelDoc[];
}): Solution {
  const { situation, clientAge, genderF, benchmarks } = opts;

  const lacuneDeces = situation.deces.lacune; // capital
  const maxLacuneIG = situation.invaliditeMaladie.lacune; // mensuel
  const capManquant = situation.capManquantRetraite;
  const salaireAnnuel = situation.salaireMensuel * 12;
  const cotisations3a = situation.fiscal.investi3aAnnuel;
  const PLAFOND_3A = situation.fiscal.plafond3a;

  const x = [1, clientAge, 0, genderF];
  const duration = 65 - clientAge;

  let bestDec = { price: Infinity, provider: "" };
  let bestInc = { price: Infinity, provider: "" };
  let bestRet = { price: Infinity, provider: "" };

  for (const m of benchmarks) {
    const name = m.provider || "Inconnu";

    if (lacuneDeces > 0) {
      const p = (lacuneDeces * Math.exp(predictLog(m.deathUnit, x))) / 12;
      if (p > 0 && p < bestDec.price) bestDec = { price: p, provider: name };
    }

    const lacuneIGAnnuelle = Math.max(0, maxLacuneIG * 12);
    if (lacuneIGAnnuelle > 0) {
      const dis = Math.exp(predictLog(m.disabilityUnit, x));
      const wai = Math.exp(predictLog(m.waiverRate, x));
      const p = (lacuneIGAnnuelle * dis + 150 * wai) / 12;
      if (p > 0 && p < bestInc.price) bestInc = { price: p, provider: name };
    }

    if (capManquant > 5000 && duration > 0) {
      const r = (m.yieldMedian || 1.75) / 100;
      const p = (capManquant * r) / ((Math.pow(1 + r, duration) - 1) * (1 + r) * 12);
      if (p > 0 && p < bestRet.price) bestRet = { price: p, provider: name };
    }
  }

  const priceRet = bestRet.price === Infinity ? 0 : bestRet.price;
  const priceInc = bestInc.price === Infinity ? 0 : bestInc.price;
  const priceDec = bestDec.price === Infinity ? 0 : bestDec.price;

  let minWaiverRate = 0;
  if (benchmarks.length > 0) {
    minWaiverRate = Math.min(...benchmarks.map((m) => Math.exp(predictLog(m.waiverRate, x))));
  }
  const basePourExo = priceRet + priceInc + priceDec;
  const pricePay = basePourExo > 0 ? basePourExo * minWaiverRate : 0;

  const totalMensuel = priceRet + priceInc + priceDec + pricePay;
  const nouvellePrimeAnnuelle = totalMensuel * 12;

  // Répartition 3a (jusqu'au plafond) / 3b (au-delà).
  const potentielRestant = Math.max(0, PLAFOND_3A - cotisations3a);
  const SEUIL_3A = 600;
  let part3a = 0;
  let part3b = 0;
  if (potentielRestant >= SEUIL_3A) {
    part3a = Math.min(nouvellePrimeAnnuelle, potentielRestant);
    part3b = Math.max(0, nouvellePrimeAnnuelle - part3a);
  } else {
    part3b = nouvellePrimeAnnuelle;
  }

  const tauxFisc = salaireAnnuel > 150000 ? 0.3 : salaireAnnuel > 80000 ? 0.25 : 0.2;
  const gainFiscalMensuel = (part3a * tauxFisc) / 12;

  return {
    priceRetMensuel: priceRet,
    priceIncMensuel: priceInc,
    priceDecMensuel: priceDec,
    pricePayMensuel: pricePay,
    totalMensuel,
    split3aMensuel: part3a / 12,
    split3bMensuel: part3b / 12,
    gainFiscalMensuel,
    providers: {
      retraite: bestRet.provider || null,
      invalidite: bestInc.provider || null,
      deces: bestDec.provider || null,
    },
  };
}
