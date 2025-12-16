//app/lib/core/format.ts
/* =========================================================
 * MoneyLife — Helpers de formatage (dates & montants)
 * Fichier : /lib/core/format.ts
 * ---------------------------------------------------------
 * Règles MoneyLife :
 * - Saisie montants : accepte espaces, apostrophes, virgule ou point.
 * - Affichage montants : milliers avec espaces "60 000", décimales avec point.
 * - Sauvegarde montants : toujours décimales avec point (string).
 * - Dates : on centralise la logique dans /lib/core/dates.ts et on re-exporte ici.
 * - Conversions utiles : annuel <-> mensuel.
 * =======================================================*/

/* =========================
 * ------- (RE)EXPORTS -----
 * ========================= */
// ⚠️ Re-exports (pas d'import local + export simultané pour éviter TS2440)
export {
  normalizeDateMask,
  isValidDateMask,
  maskToISO as dateMaskToISO,
  computeAgeToday as computeAgeFromMask,
} from "@/lib/core/dates";

/* =========================
 * ------- MONTANTS --------
 * ========================= */

/**
 * Nettoie une saisie utilisateur en nombre.
 * - enlève espaces, apostrophes et autres séparateurs de milliers
 * - garde le premier séparateur décimal (',' ou '.')
 * - convertit la virgule en point
 * - renvoie NaN si rien d'exploitable
 */
export function normalizeNumberInput(input: string | number | null | undefined): number {
  if (typeof input === "number") return input;
  if (!input) return NaN;
  let s = String(input).trim();

  // Retirer espaces, insécables, apostrophes, underscores
  s = s.replace(/[\s\u00A0'\u2019_]/g, "");

  // Si plusieurs séparateurs décimaux, ne garder que le premier
  const firstDecIdx = s.search(/[.,]/);
  if (firstDecIdx >= 0) {
    const left = s.slice(0, firstDecIdx).replace(/[.,]/g, "");
    const right = s.slice(firstDecIdx + 1).replace(/[.,]/g, "");
    s = `${left}.${right}`; // toujours '.'
  } else {
    // aucun séparateur → retirer tout ce qui n'est pas chiffre
    s = s.replace(/[^\d-]/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parse un montant saisi et renvoie un nombre (CHF).
 * Exemples:
 *  - "60 000" -> 60000
 *  - "699,95" -> 699.95
 *  - "6'500.2" -> 6500.2
 */
export function parseMoneyToNumber(input: string | number | null | undefined): number {
  return normalizeNumberInput(input);
}

/**
 * Formatte un nombre pour l'AFFICHAGE : milliers avec espaces, décimales avec point.
 * - decimals: nb de décimales affichées (par défaut auto : 0 si entier, sinon max 2)
 * - zeroAsEmpty: si true, affiche "" pour 0/NaN
 */
export function formatMoneyDisplay(
  value: number | null | undefined,
  opts?: { decimals?: number | "auto"; zeroAsEmpty?: boolean }
): string {
  const decimals = opts?.decimals ?? "auto";
  const n = typeof value === "number" ? value : normalizeNumberInput(value as any);

  if (!Number.isFinite(n) || n === null) return opts?.zeroAsEmpty ? "" : "";
  if (opts?.zeroAsEmpty && n === 0) return "";

  const fixed =
    decimals === "auto"
      ? (Number.isInteger(n) ? n.toString() : n.toFixed(2))
      : n.toFixed(typeof decimals === "number" ? decimals : 0);

  // Séparer entier / décimales avec '.' comme séparateur
  const [intPartRaw, fracPart = ""] = fixed.split(".");
  const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Formatte un nombre pour la SAUVEGARDE (string) :
 * - pas de séparateur de milliers
 * - décimales avec point
 * - nb de décimales paramétrable (par défaut 2 si non entier)
 */
export function formatMoneySave(
  value: number | string | null | undefined,
  decimals?: number
): string {
  const n = typeof value === "number" ? value : normalizeNumberInput(value as any);
  if (!Number.isFinite(n)) return "";
  const d =
    typeof decimals === "number"
      ? decimals
      : Number.isInteger(n)
      ? 0
      : 2;
  return n.toFixed(d);
}

/** Ajoute des espaces en milliers à un entier (sans décimales) */
export function formatIntegerWithSpaces(value: number | string): string {
  const n = typeof value === "number" ? value : normalizeNumberInput(value);
  if (!Number.isFinite(n)) return "";
  const s = Math.round(n).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/* ==================================
 * ---- CONVERSIONS MENSUEL/ANNUEL ---
 * ================================== */

/** Convertit un montant annuel en mensuel (arrondi à 2 décimales) */
export function annualToMonthly(amount: number | string): number {
  const n = typeof amount === "number" ? amount : normalizeNumberInput(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 12) * 100) / 100;
}

/** Convertit un montant mensuel en annuel (arrondi à 2 décimales) */
export function monthlyToAnnual(amount: number | string): number {
  const n = typeof amount === "number" ? amount : normalizeNumberInput(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n * 12) * 100) / 100;
}

/** Convertit un salaire mensuel avec multiplicateur (12/13) en annuel */
export function monthlyWithMultiplierToAnnual(
  monthly: number | string,
  multiplier: 12 | 13
): number {
  const n = typeof monthly === "number" ? monthly : normalizeNumberInput(monthly);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n * multiplier) * 100) / 100;
}