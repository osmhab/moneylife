/* =========================================================
 * MoneyLife — Helpers dates (format "dd.MM.yyyy")
 * Fichier : /lib/core/dates.ts
 * ---------------------------------------------------------
 * • Normalisation/validation du masque "dd.MM.yyyy"
 * • Conversions : mask ↔ Date ↔ ISO
 * • Calculs d’âge à une date de référence
 * • Outils pratiques : addYears, diffYearsExact, etc.
 * =======================================================*/

/* ============ Validation & normalisation ============ */

/** Regex de masque "dd.MM.yyyy" (souple côté parsing) */
export const SOFT_MASK = /^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/;

/** Masque strict "dd.MM.yyyy" */
export const STRICT_MASK = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** Transforme "01121998" ou "1.12.1998" → "01.12.1998" (sans valider le calendrier complet) */
export function normalizeDateMask(input: string | null | undefined): string {
  if (!input) return "";
  // Cas déjà avec séparateurs (., -, /, espace)
  const m = SOFT_MASK.exec(input.trim());
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3];
    return `${d}.${mo}.${y}`;
  }
  // Cas "01121998" (8 chiffres)
  const only = String(input).replace(/[^\d]/g, "");
  if (only.length === 8) {
    return `${only.slice(0,2)}.${only.slice(2,4)}.${only.slice(4,8)}`;
  }
  return input;
}

/** Vérifie le format ET la plausibilité (jours/mois). Années 1900–2100. */
export function isValidDateMask(mask: string | null | undefined): boolean {
  if (!mask) return false;
  const m = STRICT_MASK.exec(mask);
  if (!m) return false;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const d = new Date(yyyy, mm - 1, dd);
  return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}

/* ============ Conversions ============ */

/** "dd.MM.yyyy" -> Date (UTC-like, sans fuseau) ; retourne null si invalide */
export function maskToDate(mask: string): Date | null {
  if (!isValidDateMask(mask)) return null;
  const [dd, mm, yyyy] = mask.split(".");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

/** Date -> "dd.MM.yyyy" */
export function dateToMask(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** "dd.MM.yyyy" -> "yyyy-MM-dd" (ISO local) */
export function maskToISO(mask: string): string {
  const d = maskToDate(mask);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "yyyy-MM-dd" -> "dd.MM.yyyy" */
export function isoToMask(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dateToMask(d);
}

/* ============ Calculs d’âge ============ */

/** Âge (années entières) à une date de référence (mask naissance + ref en Date) */
export function computeAgeOn(birthMask: string | null | undefined, at: Date): number {
  const birth = maskToDate(birthMask || "");
  if (!birth) return 0;
  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age--;
  return age;
}

/** Âge aujourd’hui */
export function computeAgeToday(birthMask: string | null | undefined): number {
  return computeAgeOn(birthMask, new Date());
}

/** Calcule l'année de début de cotisations AVS à partir de l'âge saisi (ex. 21) */
export function computeAvsStartYearFromAge(birthMask: string, avsStartAge: number): number | null {
  const d = maskToDate(birthMask);
  if (!d || !Number.isFinite(avsStartAge)) return null;
  return d.getFullYear() + Math.max(0, Math.floor(avsStartAge));
}

/** Est-ce que la personne a < N ans à la date de ref ? (ex: enfant <18) */
export function isYoungerThan(
  birthMask: string | null | undefined,
  years: number,
  at: Date
): boolean {
  return computeAgeOn(birthMask, at) < years;
}

/** Vérifie que l'âge AVS saisi est compris entre 18 et l'âge actuel */
export function isPlausibleAvsStartAge(birthMask: string, avsStartAge: number, ref = new Date()): boolean {
  const ageToday = computeAgeOn(birthMask, ref);
  return Number.isFinite(avsStartAge) && avsStartAge >= 18 && avsStartAge <= ageToday;
}

/** Date du N-ième anniversaire (ex: 18 ans) */
export function nthBirthday(birthMask: string, n: number): string {
  const d = maskToDate(birthMask);
  if (!d) return "";
  const dt = new Date(d);
  dt.setFullYear(dt.getFullYear() + n);
  return dateToMask(dt);
}

/* ============ Outils de calcul temporel ============ */

/** Ajoute des années à une date (immutabilité respectée) */
export function addYears(d: Date, years: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}

/** Ajoute des mois à une date */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/** Différence exacte en années (valeur décimale) entre deux dates */
export function diffYearsExact(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (365.2425 * 24 * 3600 * 1000);
}

/** Renvoie la plus tôt (min) des deux dates (null-safe) */
export function minDate(a?: Date | null, b?: Date | null): Date | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a!;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Renvoie la plus tard (max) des deux dates (null-safe) */
export function maxDate(a?: Date | null, b?: Date | null): Date | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a!;
  return a.getTime() >= b.getTime() ? a : b;
}

/* ============ Aides “prévoyance” usuelles ============ */

/** Est enfant <18 à la date de référence ? */
export function isChildUnder18At(birthMask: string | undefined, at: Date): boolean {
  if (!birthMask) return false;
  return isYoungerThan(birthMask, 18, at);
}

/** Est enfant <25 (études) à la date de référence ? */
export function isChildUnder25At(birthMask: string | undefined, at: Date): boolean {
  if (!birthMask) return false;
  return isYoungerThan(birthMask, 25, at);
}

/** Date de fin de rente enfant (18 ans par défaut, 25 si en formation) */
export function childRenteEndDate(birthMask: string, inEducation: boolean): string {
  return nthBirthday(birthMask, inEducation ? 25 : 18);
}
