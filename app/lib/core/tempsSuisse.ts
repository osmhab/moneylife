// app/lib/core/tempsSuisse.ts
//
// Heures murales suisses ↔ instants.
//
// ⚠️ `new Date("2026-09-02T09:00:00")` est interprété dans le fuseau DU SERVEUR.
// En local c'est Europe/Zurich, sur Cloud Run c'est UTC : le même code place
// donc le créneau à 09:00 ici et à 11:00 là-bas en été. C'est le défaut de
// `/api/3a-simulator/slots`. On calcule ici l'écart réel de la zone à la date
// considérée (CET l'hiver, CEST l'été), sans dépendance ni fuseau serveur.
//
// Module volontairement SANS `googleapis` : ces conversions sont testables
// seules, et c'est là que se cachent les erreurs d'une heure.

export const TZ = "Europe/Zurich";

function decalageMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  // `hour` peut valoir "24" à minuit selon les moteurs : on ramène à 0.
  const h = Number(p.hour) % 24;
  const commeUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
  return commeUTC - instant.getTime();
}

/** L'instant correspondant à une heure murale suisse (ex. le 2 sept. à 09:00). */
export function instantSuisse(annee: number, mois: number, jour: number, h: number, min: number): Date {
  const mur = Date.UTC(annee, mois - 1, jour, h, min);
  // Deux passes : la première corrige l'écart, la seconde absorbe le cas rare
  // du changement d'heure survenant entre l'estimation et l'instant corrigé.
  let instant = mur;
  for (let i = 0; i < 2; i++) instant = mur - decalageMs(new Date(instant), TZ);
  return new Date(instant);
}

/** "2026-09-02" → [2026, 9, 2]. */
export function decoupeDate(iso: string): [number, number, number] {
  const [a, m, j] = String(iso).split("-").map(Number);
  return [a, m, j];
}

/** Heure murale suisse d'un instant, au format "HH:MM". */
export function heureSuisse(instant: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(instant);
}

/** Date murale suisse d'un instant, au format "AAAA-MM-JJ". */
export function jourSuisse(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
  return parts; // en-CA donne déjà AAAA-MM-JJ
}
