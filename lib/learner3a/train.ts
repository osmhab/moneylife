// lib/learner3a/train.ts
// ⚠️ Server-only (importé uniquement depuis une route API)

type RidgeModel = { beta: number[]; fallbackLogMean: number; nObs: number };

export type ProviderModelDoc = {
  provider: string;
  productName?: string;
  yieldMedian: number;
  recoveryMedian: number[];
  deathUnit: RidgeModel;
  disabilityUnit: RidgeModel;
  waiverRate: RidgeModel;
  smokerFloors: { death: number; disability: number; waiver: number };
  nBenchmarks: number;
};

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
  for (let i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
  return out;
}

// ---------- Ridge helpers (4x4) ----------
function solveLinearSystem(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

// Index de la feature "âge" dans les vecteurs [1, age, smoker, genderF, (deferral)].
const AGE_FEATURE = 1;

type FitOpts = {
  // Contrainte de MONOTONIE actuarielle : le coefficient d'âge ne peut pas être < 0.
  // Un risque (décès, invalidité) ne devient JAMAIS moins cher en vieillissant ; une pente
  // négative = artefact (confusion avec le tabac / gros capitaux jeunes). Si le fit non
  // contraint donne beta[age] < 0, on refait le fit en RETIRANT la colonne âge (age figé à 0)
  // → c'est exactement l'optimum ridge sous la contrainte beta[age] ≥ 0 (borne active à 0).
  enforceAgePositive?: boolean;
};

function fitRidgeLogModel(X: number[][], y: number[], lambda = 1.0, opts: FitOpts = {}): RidgeModel {
  const logs: number[] = [];
  const X2: number[][] = [];
  // Dimension attendue = longueur du 1er vecteur fourni (4 pour décès/libération, 5 pour
  // l'invalidité qui inclut le DIFFÉRÉ). On n'exige PLUS une longueur fixe de 4 : sinon tous
  // les vecteurs invalidité (5 features) étaient rejetés → modèle vide (nObs=0) → repli.
  const expectedP = X.find((r) => Array.isArray(r) && r.length > 0)?.length ?? 4;
  for (let i = 0; i < Math.min(X.length, y.length); i++) {
    const yi = y[i];
    if (!Number.isFinite(yi) || yi <= 0) continue;
    const row = X[i];
    if (!row || row.length !== expectedP) continue;
    logs.push(Math.log(yi));
    X2.push(row);
  }
  const p = X2[0]?.length ?? expectedP;
  if (logs.length < 6) {
    const m = median(logs.length ? logs : [Math.log(0.002)]);
    return { beta: [m, ...Array(Math.max(0, p - 1)).fill(0)], fallbackLogMean: m, nObs: logs.length };
  }

  // Résout la ridge sur un sous-ensemble de colonnes (les autres coefficients restent à 0),
  // puis ré-étale le résultat sur le vecteur beta complet (dimension p).
  const solveCols = (cols: number[]): number[] => {
    const k = cols.length;
    const XtX = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty = Array(k).fill(0);
    for (let i = 0; i < logs.length; i++) {
      const xi = X2[i];
      const yi = logs[i];
      for (let a = 0; a < k; a++) {
        Xty[a] += xi[cols[a]] * yi;
        for (let b = 0; b < k; b++) XtX[a][b] += xi[cols[a]] * xi[cols[b]];
      }
    }
    for (let j = 0; j < k; j++) XtX[j][j] += lambda;
    const sol = solveLinearSystem(XtX, Xty);
    const beta = Array(p).fill(0);
    cols.forEach((c, idx) => { beta[c] = sol[idx]; });
    return beta;
  };

  const allCols = Array.from({ length: p }, (_, i) => i);
  let beta = solveCols(allCols);

  // Contrainte de monotonie sur l'âge (décès/invalidité) : si la pente est négative, on
  // refait le fit sans la colonne âge (age figé à 0) → jamais « moins cher en vieillissant ».
  if (opts.enforceAgePositive && p > AGE_FEATURE && beta[AGE_FEATURE] < 0) {
    beta = solveCols(allCols.filter((c) => c !== AGE_FEATURE));
  }

  return { beta, fallbackLogMean: median(logs), nObs: logs.length };
}

function makeFeatures(b: any) {
  const age = safeNum(b.age, 0);
  const smoker = b.isSmoker ? 1 : 0;
  const genderF = b.gender === "F" ? 1 : 0;
  return [1, age, smoker, genderF];
}

// Features du modèle INVALIDITÉ : comme makeFeatures + le DIFFÉRÉ (années avant le 1er
// versement). Une rente différée coûte moins qu'une immédiate à montant égal ; sans cette
// dimension, mélanger des benchmarks différés et immédiats corromprait le taux. Le
// coefficient beta[4] n'est identifiable qu'une fois des benchmarks avec différé > 0 saisis
// (aujourd'hui tout est à 0 → colonne nulle → prédiction immédiate inchangée).
function makeFeaturesDisability(b: any) {
  return [...makeFeatures(b), safeNum(b.disabilityDeferralYears, 0)];
}

export function buildProviderModelsServer(allBenchmarks: any[]): Map<string, ProviderModelDoc> {
  const byProvider = new Map<string, any[]>();
  for (const b of allBenchmarks || []) {
    const provider = String(b.provider || "").trim();
    if (!provider) continue;
    if (!byProvider.has(provider)) byProvider.set(provider, []);
    byProvider.get(provider)!.push(b);
  }

  const out = new Map<string, ProviderModelDoc>();

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

      // DÉCÈS — on n'alimente le taux qu'avec des primes décès AUTONOMES et proportionnelles
      // au capital. Un décès EMBARQUÉ dans un produit d'épargne (isDeathIncludedInSavings)
      // est souvent un rider à prime FORFAITAIRE (ex. PAX TerzaFondsStar : ~197.- quel que
      // soit le capital) → deathPremium/deathCapital n'a alors aucun sens (taux qui BAISSE
      // quand le capital monte) et fait « gagner » l'assureur à tort. On l'exclut du fit décès
      // (le benchmark reste utilisé pour libération/invalidité).
      const deathCap = safeNum(b.deathCapital, 0);
      const deathPrem = safeNum(b.deathPremium, 0);
      if (deathCap > 0 && deathPrem > 0 && b.isDeathIncludedInSavings !== true) {
        X_death.push(feat);
        y_death.push(deathPrem / deathCap);
      }

      // Rente d'invalidité : niveaux différés (format AXA). Seul un benchmark à UN niveau
      // (rente différée unitaire) alimente le modèle de taux — la prime totale lui est alors
      // pleinement attribuable. Une grille MULTI-niveaux (>1) n'est pas décomposable en taux
      // unitaires → ignorée du fit (mais conservée en base). Rétro-compat : anciens champs scalaires.
      const disPrem = safeNum(b.disabilityPremium, 0);
      const levels = Array.isArray(b.disabilityLevels) ? b.disabilityLevels : [];
      if (levels.length === 1 && disPrem > 0) {
        const rente = safeNum(levels[0]?.amount, 0);
        const deferral = safeNum(levels[0]?.deferralYears, 0);
        if (rente > 0) {
          X_dis.push([...makeFeatures(b), deferral]);
          y_dis.push(disPrem / rente);
        }
      } else if (levels.length === 0) {
        const disRente = safeNum(b.disabilityRente, 0);
        if (disRente > 0 && disPrem > 0) {
          X_dis.push(makeFeaturesDisability(b)); // ancien format : lit b.disabilityDeferralYears
          y_dis.push(disPrem / disRente);
        }
      }

      const annTot = safeNum(b.annualPremiumTotal, 0);
      const waiverPrem = safeNum(b.premiumWaiverPremium, 0);
      // Dénominateur du taux libération : la prime totale si présente, sinon le "Montant
      // Libéré" (premiumWaiverValue) — permet une entrée benchmark "libération seule"
      // (couvertures modulaires) sans devoir renseigner une prime totale d'épargne.
      const waiverBase = annTot > 0 ? annTot : safeNum(b.premiumWaiverValue, 0);
      if (waiverBase > 0 && waiverPrem > 0) {
        X_waiver.push(feat);
        y_waiver.push(waiverPrem / waiverBase);
      }

      const yld = safeNum(b.userYieldRate, safeNum(b.historicalPerformance, NaN));
      if (Number.isFinite(yld)) yields.push(yld);

      const sv = Array.isArray(b.surrenderValues) ? b.surrenderValues : [];
      if (annTot > 0 && sv.length > 0) {
        for (let i = 0; i < sv.length; i++) {
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

    // Décès : contrainte de monotonie sur l'âge (jamais moins cher en vieillissant).
    const deathUnit = fitRidgeLogModel(X_death, y_death, 1.0, { enforceAgePositive: true });
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
      productName: offers.find(o => o.productName)?.productName,
      yieldMedian,
      recoveryMedian: enforceNonDecreasing(recoveryMedian),
      deathUnit,
      disabilityUnit,
      waiverRate,
      smokerFloors: { death: 1.25, disability: 1.15, waiver: 1.10 },
      nBenchmarks: offers.length
    });
  }

  return out;
}