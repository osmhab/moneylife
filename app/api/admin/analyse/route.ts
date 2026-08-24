// app/api/admin/analyse/route.ts
//
// Analyse prévoyance SYNCHRONE et SANS ÉTAT, pour l'outil conseiller (CRM + mode
// « express »). Contrairement à /api/analysis/situation (qui LIT le doc async
// Analyse/current écrit par la Cloud Function), cette route CONSTRUIT les 5
// matrices de projection EN MÉMOIRE à partir du { client, plans } reçu dans le
// corps, puis calcule les lacunes/scores. Aucun accès Firestore, aucune attente
// de la Cloud Function : le conseiller obtient l'analyse en direct, même sur un
// prospect sans compte.
//
// Réservé aux collaborateurs (requireInternal : email @creditx.ch/@moneylife.ch
// ou UID interne) — même politique que /api/admin/clients/*.

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/server/requireInternal";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { computePremierPilierSnapshot } from "@/lib/analysis/premierPilier";
import { computeAvsCoupleForClient, isCoupleEtatCivil } from "@/lib/calculs/avsAi";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import { computeMinimalLPP, buildMinimalLPPPlan } from "@/lib/calculs/lppMinimum";
import { computeDetailRentes } from "@/lib/analysis/detailRentes";
// Les agrégateurs de matrices vivent dans la copie « shared » (celle qu'utilise
// la Cloud Function). Types censés identiques à app/lib → on caste au passage
// de frontière pour éviter la friction des deux copies (dette connue).
import {
  buildRetraiteMatrix,
  buildInvaliditeMaladieMatrix,
  buildInvaliditeAccidentMatrix,
  buildDecesMaladieMatrix,
  buildDecesAccidentMatrix,
} from "lib/shared/calculs/matrices";

export const dynamic = "force-dynamic";

const echelle44 = Legal_Echelle44_2025.rows as any;
const legal = LEGAL_2025 as any;

const LPP_RENTE_FIELDS = [
  "Enter_rentevieillesseLPP65",
  "Enter_renteInvaliditeMaladie",
  "Enter_renteEnfantInvalideMaladie",
  "Enter_renteConjointLPP",
  "Enter_renteOrphelinLPP",
];

export async function POST(req: NextRequest) {
  // Auth interne
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  // Corps : le client (forme DonneePersonnelles, champs Enter_*) + ses plans +
  // un éventuel override d'allocation retraite (preview des sliders).
  let client: any;
  let plans: any[];
  let allocations: Record<string, number> | undefined;
  let lppMinimum = false;
  try {
    const body = await req.json();
    client = body?.client ?? {};
    plans = Array.isArray(body?.plans) ? body.plans : [];
    lppMinimum = !!body?.lppMinimum;
    if (body?.allocations && typeof body.allocations === "object") {
      allocations = body.allocations;
    }
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!client?.Enter_salaireAnnuel) {
    return NextResponse.json(
      { error: "Salaire annuel requis pour lancer l'analyse (Enter_salaireAnnuel)" },
      { status: 422 }
    );
  }

  // ── LPP MINIMUM LÉGAL (certificat absent) ────────────────────────────────
  // Estime un plan LPP_BASE synthétique à partir de salaire + naissance + début
  // d'activité, et l'AJOUTE aux plans (les matrices lisent la LPP via les plans).
  let lppEstimation: any = null;
  if (lppMinimum) {
    try {
      const res = computeMinimalLPP(
        {
          salaireAnnuel: Number(client.Enter_salaireAnnuel) || 0,
          dateNaissance: client.Enter_dateNaissance,
          anneeDebutActivite: Number(client.Enter_anneeDebutActivite) || 0,
          ageDebutActivite: Number(client.Enter_ageDebutActivite) || 0,
        },
        LEGAL_2025 as any
      );
      lppEstimation = res;
      const plan = buildMinimalLPPPlan(res);
      if (plan) plans = [...plans, plan];
    } catch {
      /* estimation impossible → on continue sans LPP */
    }
  }

  // ── NORMALISATION LPP ─────────────────────────────────────────────────────
  // Incohérence connue du moteur : les MATRICES lisent la LPP depuis les PLANS
  // (sumFromPlans), mais les FONCTIONS D'ÉVÉNEMENT (détail des rentes, 1er pilier)
  // la lisent depuis les CHAMPS CLIENT. On alimente donc les DEUX depuis une
  // source unique : si un certificat est saisi côté client sans plan, on
  // synthétise un plan LPP_BASE ; puis on reporte les rentes du plan sur le client.
  let lppPlan = plans.find((p: any) => p?.type === "LPP_BASE");
  const clientHasCert =
    (client.Enter_Affilie_LPP && LPP_RENTE_FIELDS.some((f) => Number(client[f]) > 0)) ||
    Number(client.Enter_lppCapitalProjete65) > 0;
  if (!lppPlan && clientHasCert) {
    lppPlan = {
      id: "lpp-saisie",
      type: "LPP_BASE",
      status: "ACTIVE",
      data: {
        Enter_rentevieillesseLPP65: client.Enter_rentevieillesseLPP65,
        capitalRetraiteGlobal: client.Enter_lppCapitalProjete65,
        Enter_lppCapitalProjete65: client.Enter_lppCapitalProjete65,
        Enter_renteInvaliditeMaladie: client.Enter_renteInvaliditeMaladie,
        Enter_renteEnfantInvalideMaladie:
          client.Enter_renteEnfantInvalideMaladie ?? client.Enter_renteOrphelinLPP,
        Enter_renteConjointLPP: client.Enter_renteConjointLPP,
        Enter_renteOrphelinLPP: client.Enter_renteOrphelinLPP,
      },
    };
    plans = [...plans, lppPlan];
  }
  const lppSrc: any = lppPlan ? { ...lppPlan, ...(lppPlan.data || {}) } : {};
  const effectiveClient: any = { ...client };
  if (lppPlan) effectiveClient.Enter_Affilie_LPP = true; // requis par les gardes LPP (rente conjoint)
  for (const f of LPP_RENTE_FIELDS) {
    if (lppSrc[f] != null) effectiveClient[f] = lppSrc[f];
  }
  if (lppSrc.Enter_lppCapitalProjete65 != null) {
    effectiveClient.Enter_lppCapitalProjete65 = lppSrc.Enter_lppCapitalProjete65;
  }

  try {
    // ── COUCHE A : les 5 matrices de projection, calculées EN MÉMOIRE ────────
    // (ce que la Cloud Function écrirait dans Analyse/current, mais en direct).
    const c = effectiveClient;
    const projections = {
      retraite: buildRetraiteMatrix(c, legal, echelle44, plans),
      invalidite_maladie: buildInvaliditeMaladieMatrix(c, legal, echelle44, plans),
      invalidite_accident: buildInvaliditeAccidentMatrix(c, legal, echelle44, plans),
      deces_maladie: buildDecesMaladieMatrix(c, legal, echelle44, plans),
      deces_accident: buildDecesAccidentMatrix(c, legal, echelle44, plans),
    };

    // Fusion projections + données perso, comme le hook et la route iOS.
    const cloudData = { ...effectiveClient, projections };

    // Plafond couple AVS (affichage seul) — même logique que /api/analysis/situation.
    let avsCouplePlafondMensuel: number | undefined;
    try {
      if (isCoupleEtatCivil(effectiveClient.Enter_etatCivil)) {
        const clientForCouple = {
          ...effectiveClient,
          Enter_spouseSalaireAnnuel:
            Number(effectiveClient.Enter_spouseSalaireAnnuel) > 0
              ? effectiveClient.Enter_spouseSalaireAnnuel
              : effectiveClient.Enter_salaireAnnuel,
        };
        const couple = computeAvsCoupleForClient(clientForCouple, legal, echelle44);
        if (couple.renteCoupleMensuelle > 0) {
          avsCouplePlafondMensuel = couple.renteCoupleMensuelle;
        }
      }
    } catch {
      /* profil incomplet → pas de plafond affiché */
    }

    // ── COUCHE B : lacunes + scores (fonction pure) ──────────────────────────
    const analysis = computeSituationAnalysis({
      cloudData,
      plans,
      allocations,
      avsCouplePlafondMensuel,
    });
    if (!analysis) {
      return NextResponse.json(
        { error: "Analyse indisponible (données insuffisantes)" },
        { status: 404 }
      );
    }

    // Snapshot 1er pilier (AVS/AI + LAA) — non bloquant.
    try {
      analysis.premierPilier = computePremierPilierSnapshot(effectiveClient, legal, echelle44, new Date());
    } catch {
      /* profil incomplet → premierPilier absent */
    }

    // Détail des rentes régulières (survivants + enfants), 1er & 2e pilier — non bloquant.
    let detailRentes: any = null;
    try {
      detailRentes = computeDetailRentes(effectiveClient, legal, echelle44);
    } catch {
      /* profil incomplet → pas de détail rentes */
    }

    return NextResponse.json({ analysis, lppEstimation, detailRentes });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
