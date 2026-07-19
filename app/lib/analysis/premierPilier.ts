// app/lib/analysis/premierPilier.ts
//
// Snapshot « PHOTO D'AUJOURD'HUI » des prestations du 1er pilier (AVS/AI) + LAA.
// Contrairement aux matrices de projection (qui déroulent chaque année jusqu'à 65),
// on calcule ici une seule photo à la date `at` (= aujourd'hui) : c'est ce qu'on
// afficherait « si l'événement survenait maintenant », avec les enfants ACTUELLEMENT
// à charge (règle unique isEnfantRenteEligible : < 18, ou < 25 en formation).
//
// Source unique consommée par l'onglet 1er pilier de l'app iOS. Aucune actuariat
// n'est réécrit : on réutilise exactement les mêmes fonctions moteur que les matrices.

import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { computeRetraite } from "@/lib/calculs/events/retraite";
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import type { PremierPilierPrestations } from "./situation";

// Le type des lignes d'échelle 44 sans l'importer directement (dérivé de la signature moteur).
type Echelle44Rows = Parameters<typeof computeRetraite>[2];

/** annuel → mensuel, robuste au NaN. */
const mens = (annuel: number): number => (Number.isFinite(annuel) ? annuel / 12 : 0);

/**
 * Calcule les rentes 1er pilier (mensuelles) à la date `at`.
 * Lève si le profil est trop incomplet (le moteur peut throw) → l'appelant
 * (route) attrape et laisse `premierPilier` absent (empty state côté iOS).
 */
export function computePremierPilierSnapshot(
  client: ClientData,
  legal: Legal_Settings,
  echelle44: Echelle44Rows,
  at: Date
): PremierPilierPrestations {
  const ret = computeRetraite(client, legal, echelle44);
  const invM = computeInvaliditeMaladie(at, client, legal, echelle44);
  const invA = computeInvaliditeAccident(client, legal, echelle44, { referenceDate: at });
  const decM = computeDecesMaladie(at, client, legal, echelle44, { paymentRef: at });
  const decA = computeDecesAccident(at, client, legal, echelle44, { paymentRef: at });

  // AI = adulte + enfants (rente pour enfant d'invalide = 40 %/enfant éligible).
  const invMAvs = (invM.phaseRente.annual as any).aiTotal ?? (invM.phaseRente.annual as any).ai ?? 0;
  const invAAvs = (invA.phaseRente.annual as any).aiTotal ?? 0;
  const invALaa = (invA.phaseRente.annual as any).laaAfterCap ?? 0;

  return {
    retraite: { avs: mens(ret.annual.avs) },
    invaliditeMaladie: { avs: mens(invMAvs) },
    invaliditeAccident: { avs: mens(invAAvs), laa: mens(invALaa) },
    // Décès : rentes de survivants AVS (veuf·ve + orphelins) à la date `at`.
    decesMaladie: { avs: mens(decM.annual.avs) },
    decesAccident: { avs: mens(decA.annual.avs), laa: mens((decA.annual as any).laaAfterCap ?? 0) },
  };
}
