// app/lib/analysis/detailRentes.ts
//
// Détail des rentes RÉGULIÈRES (mensuelles) pour la présentation client, avec :
//  • le détail PAR PILIER (1er = AVS/AI, 2e = LPP) : rente adulte + rente PAR ENFANT ;
//  • des SCÉNARIOS par nombre d'enfants à charge (0..N) — recalculés par le moteur
//    pour refléter le plafond familial AVS quand on retire un enfant ;
//  • les années de FIN DE CHARGE de chaque enfant (18 ans) → sert à tracer la
//    baisse du total dans le temps, jusqu'à la retraite.
//
// ⚠️ Lu depuis les CHAMPS CLIENT (les fonctions d'événement lisent la LPP via
// `Enter_*`) → l'appelant fournit un client « effectif » portant les rentes LPP.

import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";

const m12 = (annual: any) => Math.round((Number(annual) || 0) / 12);

/** Un scénario de rentes pour un nombre donné d'enfants à charge. */
export type RenteScenario = {
  adulte: { avs: number; lpp: number };
  parEnfant: { avs: number; lpp: number };
  nbEnfants: number;
  total: number;
};

export type DetailRentes = {
  currentYear: number;
  retirementYear: number;
  maxEnfants: number;
  /** Année de fin de charge (18 ans) de chaque enfant actuellement à charge, triées. */
  childrenEndYears: number[];
  /** Scénarios indexés par nombre d'enfants à charge (0..maxEnfants). */
  deces: RenteScenario[];
  invalidite: RenteScenario[];
};

function parseAnnee(d: any): number {
  const s = String(d ?? "").trim();
  const dot = s.split(".");
  if (dot.length === 3 && dot[2].length === 4) return Number(dot[2]);
  const dash = s.split("-");
  if (dash.length === 3 && dash[0].length === 4) return Number(dash[0]);
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : NaN;
}

/** Client avec exactement `n` enfants à charge (enfants synthétiques éligibles). */
function withNChildren(client: any, n: number, currentYear: number) {
  const kids = Array.from({ length: n }, () => ({ Enter_dateNaissance: `01.01.${currentYear - 5}` }));
  return { ...client, Enter_enfants: kids };
}

function decesScenario(client: any, legal: any, echelle44: any, now: Date, n: number): RenteScenario {
  const c = withNChildren(client, n, now.getFullYear());
  const r = computeDecesMaladie(now, c, legal, echelle44, { paymentRef: now });
  const avs = r.meta.breakdown.avs;
  const lpp = r.meta.breakdown.lpp;
  const adulte = { avs: Math.round(avs.widowMonthly || 0), lpp: m12(lpp.spouseOrPartnerAnnual) };
  const parEnfant = { avs: Math.round(avs.orphanMonthlyPerChild || 0), lpp: m12(lpp.perChildAnnual) };
  const total = adulte.avs + adulte.lpp + n * (parEnfant.avs + parEnfant.lpp);
  return { adulte, parEnfant, nbEnfants: n, total };
}

function invaliditeScenario(client: any, legal: any, echelle44: any, now: Date, n: number): RenteScenario {
  const c = withNChildren(client, n, now.getFullYear());
  const r = computeInvaliditeMaladie(now, c, legal, echelle44);
  const child = r.phaseRente.metaChildren;
  const monthly = r.phaseRente.monthly as any;
  const adulte = { avs: Math.round(monthly.aiAdult || 0), lpp: Math.round(monthly.lppInvalidite || 0) };
  const parEnfant = { avs: m12(child.perChildAnnual), lpp: m12(child.perChildLppAnnual) };
  const total = adulte.avs + adulte.lpp + n * (parEnfant.avs + parEnfant.lpp);
  return { adulte, parEnfant, nbEnfants: n, total };
}

export function computeDetailRentes(
  client: any,
  legal: any,
  echelle44: any,
  now: Date = new Date()
): DetailRentes {
  const currentYear = now.getFullYear();
  const birthYear = parseAnnee(client.Enter_dateNaissance);
  const retirementYear = Number.isNaN(birthYear) ? currentYear + 40 : birthYear + 65;

  // Fin de charge (18 ans) de chaque enfant ENCORE à charge aujourd'hui.
  const enfants: any[] = Array.isArray(client.Enter_enfants) ? client.Enter_enfants : [];
  const childrenEndYears = enfants
    .map((e) => parseAnnee(e?.Enter_dateNaissance) + 18)
    .filter((y) => !Number.isNaN(y) && y > currentYear)
    .sort((a, b) => a - b);

  const maxEnfants = childrenEndYears.length;

  const deces: RenteScenario[] = [];
  const invalidite: RenteScenario[] = [];
  for (let n = 0; n <= maxEnfants; n++) {
    deces.push(decesScenario(client, legal, echelle44, now, n));
    invalidite.push(invaliditeScenario(client, legal, echelle44, now, n));
  }

  return { currentYear, retirementYear, maxEnfants, childrenEndYears, deces, invalidite };
}
