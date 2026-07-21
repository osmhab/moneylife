// lib/engines/threeA-engine.ts
// V2.2 patch: yield gelé par provider + monotonie fumeur (évite "fumeur > non-fumeur" à critères égaux)

export interface ClientProfile {
  age: number;
  gender: "M" | "F";
  isSmoker: boolean;
  targetMonthlyPremium: number;
  retirementAge: number;
  desiredDeathCapital?: number;
  desiredDisabilityRente?: number;
  initialCapital?: number;
}

export interface SimulationResult {
  provider: string;
  productName: string;
  monthlyPremium: number;
  annualSavings: number;
  annualRiskTotal: number;
  deathCapital: number;
  disabilityRente: number;
  projectedCapital: number;
  breakEvenYear: number | null;
  surrenderCurve: number[];
  yieldUsed: number;
  moneyLifeScore: number;
  scores: {
    performance: number;
    liquidity: number;
  };
  ratios: {
    riskCost: number;
    savingsEfficiency: number;
  };
}

/* =========================================================
   Utils
========================================================= */

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : fallback;
}

function median(values: number[]) {
  const arr = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function enforceNonDecreasing(arr: number[]) {
  const out = arr.slice();
  for (let i = 1; i < out.length; i++) {
    if (out[i] < out[i - 1]) out[i] = out[i - 1];
  }
  return out;
}

function computeFVAnnuityDue(paymentAnnual: number, r: number, n: number) {
  // Annuity due: payment at beginning of period
  if (n <= 0) return 0;
  if (Math.abs(r) < 1e-12) return paymentAnnual * n;
  return paymentAnnual * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

/* =========================================================
   Ridge regression (small, 4 features)
   We model: log(y) = X * beta
   Features: [1, age, smoker(0/1), genderF(0/1)]
========================================================= */

type RidgeModel = {
  beta: number[]; // length = 4
  fallbackLogMean: number;
  nObs: number;
};

// ==============================
// Persisted provider model doc
// (from Firestore: learner_models_3a/{provider})
// ==============================
export type ProviderModelDoc = {
  provider: string;
  productName?: string;

  yieldMedian: number;
  recoveryMedian: number[];

  deathUnit: RidgeModel;
  disabilityUnit: RidgeModel;
  waiverRate: RidgeModel;

  smokerFloors?: { death: number; disability: number; waiver: number };

  trainedAt?: any;
  version?: number;
};

function solveLinearSystem(A: number[][], b: number[]) {
  // Gaussian elimination (small 4x4)
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));

  for (let col = 0; col < n; col++) {
    // pivot
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    // normalize
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;

    // eliminate
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map(row => row[n]);
}

function fitRidgeLogModel(
  X: number[][], // rows, 4 cols
  y: number[],   // raw positive
  lambda = 1.0
): RidgeModel {
  const nObs = Math.min(X.length, y.length);
  const logs: number[] = [];
  const X2: number[][] = [];

  for (let i = 0; i < nObs; i++) {
    const yi = y[i];
    if (!Number.isFinite(yi) || yi <= 0) continue;
    const row = X[i];
    if (!row || row.length !== 4) continue;
    logs.push(Math.log(yi));
    X2.push(row);
  }

  if (logs.length < 6) {
    const m = median(logs.length ? logs : [Math.log(0.002)]);
    return { beta: [m, 0, 0, 0], fallbackLogMean: m, nObs: logs.length };
  }

  // Build XtX + lambdaI, Xty
  const p = 4;
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);

  for (let i = 0; i < logs.length; i++) {
    const xi = X2[i];
    const yi = logs[i];
    for (let a = 0; a < p; a++) {
      Xty[a] += xi[a] * yi;
      for (let b = 0; b < p; b++) XtX[a][b] += xi[a] * xi[b];
    }
  }

  for (let j = 0; j < p; j++) XtX[j][j] += lambda;

  const beta = solveLinearSystem(XtX, Xty);
  const fallbackLogMean = median(logs);

  return { beta, fallbackLogMean, nObs: logs.length };
}

export function predictLog(model: RidgeModel, x: number[]) {
  if (!model || !model.beta || model.beta.length !== 4) return model?.fallbackLogMean ?? Math.log(0.002);
  let s = 0;
  for (let i = 0; i < 4; i++) s += (model.beta[i] ?? 0) * (x[i] ?? 0);
  return clamp(s, Math.log(1e-6), Math.log(0.2)); // safety clamp
}

/* =========================================================
   Provider model building
========================================================= */

type ProviderModels = {
  provider: string;
  deathUnit: RidgeModel;       // CHF premium per CHF capital
  disabilityUnit: RidgeModel;  // CHF premium per CHF rente
  waiverRate: RidgeModel;      // waiverPremium / annualPremiumTotal
  yieldMedian: number;         // yield rate %
  recoveryMedian: number[];    // per year recovery rate
  bestProductName?: string;
};

function makeFeatures(b: any) {
  const age = safeNum(b.age, 0);
  const smoker = b.isSmoker ? 1 : 0;
  const genderF = b.gender === "F" ? 1 : 0;
  return [1, age, smoker, genderF];
}

function buildProviderModels(allBenchmarks: any[]): Map<string, ProviderModels> {
  const byProvider = new Map<string, any[]>();
  for (const b of allBenchmarks || []) {
    const provider = String(b.provider || "").trim();
    if (!provider) continue;
    if (!byProvider.has(provider)) byProvider.set(provider, []);
    byProvider.get(provider)!.push(b);
  }

  const out = new Map<string, ProviderModels>();

  for (const [provider, offers] of byProvider.entries()) {
    const X_death: number[][] = [];
    const y_death: number[] = [];
    const X_dis: number[][] = [];
    const y_dis: number[] = [];
    const X_waiver: number[][] = [];
    const y_waiver: number[] = [];
    const yields: number[] = [];

    const recoveryByYear: number[][] = [];

    for (const b of offers) {
      const feat = makeFeatures(b);

      const deathCap = safeNum(b.deathCapital, 0);
      const deathPrem = safeNum(b.deathPremium, 0);
      if (deathCap > 0 && deathPrem > 0) {
        X_death.push(feat);
        y_death.push(deathPrem / deathCap);
      }

      const disRente = safeNum(b.disabilityRente, 0);
      const disPrem = safeNum(b.disabilityPremium, 0);
      if (disRente > 0 && disPrem > 0) {
        X_dis.push(feat);
        y_dis.push(disPrem / disRente);
      }

      const annTot = safeNum(b.annualPremiumTotal, 0);
      const waiverPrem = safeNum(b.premiumWaiverPremium, 0);
      if (annTot > 0 && waiverPrem > 0) {
        X_waiver.push(feat);
        y_waiver.push(waiverPrem / annTot);
      }

      const yld = safeNum(b.userYieldRate, safeNum(b.historicalPerformance, NaN));
      if (Number.isFinite(yld)) yields.push(yld);

      const sv = Array.isArray(b.surrenderValues) ? b.surrenderValues : [];
      const maxYears = sv.length;
      if (annTot > 0 && maxYears > 0) {
        for (let i = 0; i < maxYears; i++) {
          const year = i + 1;
          const val = safeNum(sv[i], 0);
          if (val <= 0) continue;
          const totalPaid = annTot * year;
          if (totalPaid <= 0) continue;
          let rate = val / totalPaid;
          rate = clamp(rate, 0, 1.2);
          if (!recoveryByYear[i]) recoveryByYear[i] = [];
          recoveryByYear[i].push(rate);
        }
      }
    }

    const yieldMedian = yields.length ? median(yields) : 1.75;

    const deathUnit = fitRidgeLogModel(X_death, y_death, 1.0);
    const disabilityUnit = fitRidgeLogModel(X_dis, y_dis, 1.0);
    const waiverRate = fitRidgeLogModel(X_waiver, y_waiver, 2.0);

    const YEARS = Math.max(10, recoveryByYear.length || 0);
    const recoveryMedian: number[] = [];
    for (let i = 0; i < YEARS; i++) {
      const rates = recoveryByYear[i] || [];
      const fallback = [0, 0.5, 0.65, 0.75, 0.8, 0.85, 0.9, 0.93, 0.96, 0.98][i] ?? 0.98;
      const m = rates.length ? median(rates) : fallback;
      recoveryMedian.push(clamp(m, 0, 1.2));
    }

    out.set(provider, {
      provider,
      deathUnit,
      disabilityUnit,
      waiverRate,
      yieldMedian,
      recoveryMedian: enforceNonDecreasing(recoveryMedian),
      bestProductName: offers.find(o => o.productName)?.productName
    });
  }

  return out;
}

/* =========================================================
   Nearest benchmark helper (kept for "death included" + productName display)
========================================================= */

function pickNearestBenchmark(providerOffers: any[], profile: ClientProfile) {
  if (!providerOffers || providerOffers.length === 0) return null;
  const sameAll = providerOffers.filter(b => b.gender === profile.gender && !!b.isSmoker === !!profile.isSmoker);
  const pool = sameAll.length ? sameAll : providerOffers;

  let best: any = null;
  let bestScore = Infinity;

  for (const b of pool) {
    const age = safeNum(b.age, 0);
    const dAge = Math.abs(age - profile.age);
    const dGender = (b.gender === profile.gender) ? 0 : 5;
    const dSmoke = (!!b.isSmoker === !!profile.isSmoker) ? 0 : 3;
    const score = dAge + dGender + dSmoke;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

/* =========================================================
   Main simulation
========================================================= */

export function simulateThreeA(profile: ClientProfile, allBenchmarks: any[]): SimulationResult[] {
  const targetAnnualTotal = safeNum(profile.targetMonthlyPremium, 0) * 12;
  if (targetAnnualTotal <= 0) return [];
  const duration = safeNum(profile.retirementAge, 65) - safeNum(profile.age, 0);
  if (duration <= 0) return [];

  const providerModels = buildProviderModels(allBenchmarks);
  const providers = [...providerModels.keys()];
  if (providers.length === 0) return [];

  const offersByProvider = new Map<string, any[]>();
  for (const b of allBenchmarks || []) {
    const p = String(b.provider || "").trim();
    if (!p) continue;
    if (!offersByProvider.has(p)) offersByProvider.set(p, []);
    offersByProvider.get(p)!.push(b);
  }

  const genderF = profile.gender === "F" ? 1 : 0;
  const smoker = profile.isSmoker ? 1 : 0;
  const x = [1, profile.age, smoker, genderF];

  const raw = providers.map(provider => {
    const model = providerModels.get(provider)!;
    const providerOffers = offersByProvider.get(provider) || [];
    const nearest = pickNearestBenchmark(providerOffers, profile);

    // Predict units (base)
    let deathUnit = Math.exp(predictLog(model.deathUnit, x));       // premium per CHF capital
    let disUnit = Math.exp(predictLog(model.disabilityUnit, x));   // premium per CHF rente
    let waiverRate = Math.exp(predictLog(model.waiverRate, x));    // waiver premium / annualPremiumTotal

    // --- Monotonie métier: fumeur ne doit JAMAIS coûter moins cher ---
    // (Planchers simples pour stabiliser, à remplacer plus tard par ratios appris par provider.)
    if (profile.isSmoker) {
      deathUnit *= 1.25;   // décès: +25% minimum
      disUnit *= 1.15;     // invalidité: +15% minimum
      waiverRate *= 1.10;  // libération: +10% minimum
    }

    // Desired coverages
    const deathCapital = safeNum(profile.desiredDeathCapital, 0);
    const disabilityRente = safeNum(profile.desiredDisabilityRente, 0);

    // Some products “include” death inside savings; keep math consistent
    const isDeathIncluded = !!nearest?.isDeathIncludedInSavings;

    const deathCostTheoretical = deathCapital > 0 ? (deathCapital * deathUnit) : 0;
    const disabilityPremium = disabilityRente > 0 ? (disabilityRente * disUnit) : 0;
    const waiverPremium = targetAnnualTotal * waiverRate;

    // Use theoretical total for economics (even if death "included")
    const annualRiskTotalForMath = clamp(
      deathCostTheoretical + disabilityPremium + waiverPremium,
      0,
      targetAnnualTotal * 0.55
    );

    const annualSavings = Math.max(0, targetAnnualTotal - annualRiskTotalForMath);

    // --- Yield gelé par provider (NE PAS dépendre du nearest) ---
    const yieldUsed = model.yieldMedian;
    const r = clamp(yieldUsed, -1, 8) / 100;

    // FV
    const fvFlows = computeFVAnnuityDue(annualSavings, r, duration);
    const initCap = safeNum(profile.initialCapital, 0);
    const fvInit = initCap > 0 ? initCap * Math.pow(1 + r, duration) : 0;
    const projectedCapital = fvFlows + fvInit;

    // Surrender curve: use provider median only (stable)
    const providerRecovery = model.recoveryMedian.length
      ? model.recoveryMedian.slice(0, 10)
      : [0, 0.5, 0.65, 0.75, 0.8, 0.85, 0.9, 0.93, 0.96, 0.98];

    const surrenderCurve = providerRecovery.map((rate, idx) => {
      const year = idx + 1;
      return (targetAnnualTotal * year) * clamp(rate, 0, 1.2);
    });

    // "Année où l'épargne devient rentable": compare rachat vs épargne réellement investie
    let breakEvenYear: number | null = null;
    for (let i = 0; i < surrenderCurve.length; i++) {
      const invested = annualSavings * (i + 1);
      if (invested <= 0) continue;
      if (surrenderCurve[i] >= invested * 1.01) {
        breakEvenYear = i + 1;
        break;
      }
    }
    const effectiveBreakEven = breakEvenYear ?? 11;

    const productName = String(nearest?.productName || model.bestProductName || provider);

    const annualRiskTotal = annualRiskTotalForMath;

    return {
      provider,
      productName,
      monthlyPremium: profile.targetMonthlyPremium,
      annualSavings,
      annualRiskTotal,
      deathCapital,
      disabilityRente,
      projectedCapital,
      breakEvenYear: effectiveBreakEven,
      surrenderCurve,
      yieldUsed,
      moneyLifeScore: 0,
      scores: { performance: 0, liquidity: 0 },
      ratios: {
        riskCost: (annualRiskTotal / targetAnnualTotal) * 100,
        savingsEfficiency: (annualSavings / targetAnnualTotal) * 100
      }
    } as SimulationResult;
  }).filter(Boolean);

  if (raw.length === 0) return [];

  // Scoring
  const maxCap = Math.max(...raw.map(r => r.projectedCapital));
  return raw.map(res => {
    const performanceScore = maxCap > 0 ? (res.projectedCapital / maxCap) * 100 : 0;

    // Liquidité: plus vite l'épargne devient "rentable", plus le score est haut
    const yearsToWait = res.breakEvenYear ?? 20;
    const liquidityScore = Math.max(0, 100 - ((yearsToWait - 1) * 5));

    const weighted = (performanceScore * 0.8) + (liquidityScore * 0.2);

    return {
      ...res,
      moneyLifeScore: Math.round(weighted),
      scores: {
        performance: Math.round(performanceScore),
        liquidity: Math.round(liquidityScore)
      }
    };
  });
}

/**
 * Persisted simulation:
 * - uses Firestore models from learner_models_3a (already trained server-side)
 * - no refit on client
 */
export function simulateThreeAFromModels(
  profile: ClientProfile,
  models: ProviderModelDoc[]
): SimulationResult[] {
  const targetAnnualTotal = safeNum(profile.targetMonthlyPremium, 0) * 12;
  if (targetAnnualTotal <= 0) return [];

  const duration = safeNum(profile.retirementAge, 65) - safeNum(profile.age, 0);
  if (duration <= 0) return [];

  const genderF = profile.gender === "F" ? 1 : 0;
  const smoker = profile.isSmoker ? 1 : 0;
  const x = [1, safeNum(profile.age, 0), smoker, genderF];

  const raw = (models || []).map((m) => {
    // Predict units (base)
    let deathUnit = Math.exp(predictLog(m.deathUnit, x));
    let disUnit = Math.exp(predictLog(m.disabilityUnit, x));
    let waiverRate = Math.exp(predictLog(m.waiverRate, x));

    // Monotonie fumeur (floors persistés ou défaut)
    if (profile.isSmoker) {
      const floors = m.smokerFloors || { death: 1.25, disability: 1.15, waiver: 1.10 };
      deathUnit *= floors.death;
      disUnit *= floors.disability;
      waiverRate *= floors.waiver;
    }

    // Desired coverages
    const deathCapital = safeNum(profile.desiredDeathCapital, 0);
    const disabilityRente = safeNum(profile.desiredDisabilityRente, 0);

    const deathCost = deathCapital > 0 ? deathCapital * deathUnit : 0;
    const disabilityPremium = disabilityRente > 0 ? disabilityRente * disUnit : 0;
    const waiverPremium = targetAnnualTotal * waiverRate;

    const annualRiskTotal = clamp(deathCost + disabilityPremium + waiverPremium, 0, targetAnnualTotal * 0.55);
    const annualSavings = Math.max(0, targetAnnualTotal - annualRiskTotal);

    // Yield (frozen per provider model)
    const yieldUsed = safeNum(m.yieldMedian, 1.75);
    const r = clamp(yieldUsed, -1, 8) / 100;

    // FV
    const fvFlows = computeFVAnnuityDue(annualSavings, r, duration);
    const initCap = safeNum(profile.initialCapital, 0);
    const fvInit = initCap > 0 ? initCap * Math.pow(1 + r, duration) : 0;
    const projectedCapital = fvFlows + fvInit;

    // Recovery curve (provider model)
    const providerRecovery = (m.recoveryMedian?.length ? m.recoveryMedian : [0, 0.5, 0.65, 0.75, 0.8, 0.85, 0.9, 0.93, 0.96, 0.98]).slice(0, 10);
    const surrenderCurve = providerRecovery.map((rate, idx) => {
      const year = idx + 1;
      return (targetAnnualTotal * year) * clamp(rate, 0, 1.2);
    });

    // "Année où l'épargne devient rentable": compare rachat vs épargne investie
    let breakEvenYear: number | null = null;
    for (let i = 0; i < surrenderCurve.length; i++) {
      const invested = annualSavings * (i + 1);
      if (invested <= 0) continue;
      if (surrenderCurve[i] >= invested * 1.01) { breakEvenYear = i + 1; break; }
    }
    const effectiveBreakEven = breakEvenYear ?? 11;

    return {
      provider: m.provider,
      productName: m.productName || m.provider,
      monthlyPremium: profile.targetMonthlyPremium,
      annualSavings,
      annualRiskTotal,
      deathCapital,
      disabilityRente,
      projectedCapital,
      breakEvenYear: effectiveBreakEven,
      surrenderCurve,
      yieldUsed,
      moneyLifeScore: 0,
      scores: { performance: 0, liquidity: 0 },
      ratios: {
        riskCost: (annualRiskTotal / targetAnnualTotal) * 100,
        savingsEfficiency: (annualSavings / targetAnnualTotal) * 100
      }
    } as SimulationResult;
  }).filter(Boolean);

  if (raw.length === 0) return [];

  // Scoring (identique)
  const maxCap = Math.max(...raw.map(r => r.projectedCapital));
  return raw.map(res => {
    const performanceScore = maxCap > 0 ? (res.projectedCapital / maxCap) * 100 : 0;
    const yearsToWait = res.breakEvenYear ?? 20;
    const liquidityScore = Math.max(0, 100 - ((yearsToWait - 1) * 5));
    const weighted = (performanceScore * 0.8) + (liquidityScore * 0.2);

    return {
      ...res,
      moneyLifeScore: Math.round(weighted),
      scores: {
        performance: Math.round(performanceScore),
        liquidity: Math.round(liquidityScore)
      }
    };
  });
}