// app/api/calculs/totaux/route.ts
//
// Totaux de prévoyance agrégés par catégorie (LPP / privé / global), pour
// alimenter les cartes du dashboard iOS — SOURCE UNIQUE : on rejoue ici, côté
// serveur, exactement le même calcul que le web (app/[locale]/dashboard/
// prevoyance/page.tsx → CategoryPage.totals), avec les mêmes fonctions moteur.
// Aucune logique actuarielle n'est portée en Swift (cf. CLAUDE.md §4).
//
// Sécurisé par jeton Firebase (requireAuth). Lit les plans du client appelant.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { db } from "@/lib/firebase/admin";
import {
  computeProjections3aAssurance,
  computeProjections3aBanque,
  computeProjectionsEpargneLibre,
  computeDeathBenefitAssurance,
} from "@/lib/calculs/3epilier";
import { computeLPPProjectionRetraite } from "@/lib/calculs/lpp";
import { isDeuxiemePilier, isDeuxiemePilierActif, isLibrePassage } from "@/lib/core/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Statut d'un champ « à vérifier » : hidden = non applicable à la catégorie ; known = valeur
// connue (même 0) → on l'affiche ; unknown = jamais captée (champ absent) → l'app affiche
// « À vérifier » (tap → ouvre le plan concerné à la hauteur du champ).
type FieldStatus = "hidden" | "known" | "unknown";

type Totals = {
  current: number;
  capital65: number;
  rente65: number;
  epl: number;
  rachat: number;
  invalidite: number;
  deces: number;
  eplStatus: FieldStatus;
  rachatStatus: FieldStatus;
  eplPlanId: string | null;    // plan à ouvrir pour renseigner l'EPL (si unknown)
  rachatPlanId: string | null; // plan à ouvrir pour renseigner le rachat (si unknown)
};

const EMPTY: Totals = {
  current: 0,
  capital65: 0,
  rente65: 0,
  epl: 0,
  rachat: 0,
  invalidite: 0,
  deces: 0,
  eplStatus: "hidden",
  rachatStatus: "hidden",
  eplPlanId: null,
  rachatPlanId: null,
};

/** Vrai si la valeur a été CAPTÉE (nombre fini, y compris 0). Absent/null/"" = non connu. */
function hasNum(v: any): boolean {
  return v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v));
}

// Calque EXACT du reduce du web (CategoryPage.totals). On garde volontairement
// les gardes `|| 0` autour des `Number(...)` (anti-NaN, cf. CLAUDE.md §2.2/§3).
function computeTotals(plans: any[], clientAge: number): Totals {
  // Comme l'app (isProposal = status "PROPOSITION") : on n'agrège que les plans EXISTANTS —
  // ni refusés, ni en attente, ni PROPOSITIONS (brouillons d'offre CreditX, qui n'ont pas de
  // champs de certificat → sinon détectés « inconnu » et pointés à tort par « À vérifier »).
  const active = plans.filter(
    (p) =>
      p.status !== "REJECTED_CLIENT" &&
      p.status !== "PENDING_CLIENT" &&
      p.status !== "PENDING_INSURANCE" &&
      p.status !== "PROPOSITION"
  );

  // Suivi « connu / inconnu » pour EPL (tous les plans contribuent) et rachat (LPP seulement).
  let eplContrib = false, eplAllKnown = true, eplUnknownId: string | null = null;
  let rachatLPP = false, rachatAllKnown = true, rachatUnknownId: string | null = null;

  const acc = active.reduce((acc: Totals, p: any) => {
    const d = p.data || {};
    const isLPP = isDeuxiemePilierActif(p.type); // base + complémentaire
    const isLP = isLibrePassage(p.type);         // libre passage → capital seul
    const isBank = p.type === "PILIER_3A_BANK" || p.type === "3A_BANQUE";
    // Épargne libre (cash) : décès = solde (succession), EPL = solde (100% dispo).
    const isCash = p.type === "EPARGNE_LIBRE";

    if (isLP) {
      // Libre passage : capital SEUL. Compte pour le capital retraite (projeté à 65) et le
      // capital décès (le solde est versé). Aucune rente / invalidité / EPL / rachat.
      const solde = Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      acc.current += solde;
      acc.capital65 +=
        Number(d.capitalRetraiteGlobal) ||
        Number(d.Enter_lppCapitalProjete65) ||
        solde * Math.pow(1.0125, Math.max(0, 65 - clientAge));
      acc.deces += solde;
    } else if (isLPP) {
      acc.current += Number(d.Enter_avoirVieillesseTotal) || 0;
      // Priorité au capital stocké (= projection figée au scan) ; à défaut, on
      // recalcule via le moteur (même valeur que la carte plan), au lieu de 0.
      acc.capital65 +=
        Number(d.capitalRetraiteGlobal) ||
        Number(d.Enter_lppCapitalProjete65) ||
        computeLPPProjectionRetraite(d, clientAge);
      acc.rente65 += Number(d.Enter_rentevieillesseLPP65) || 0;
      acc.epl += Number(d.Enter_lppEPLPossible) || 0;
      acc.rachat += Number(d.Enter_lppRachatPossible) || 0;
      acc.invalidite += Number(d.Enter_renteInvaliditeMaladie) || 0;
      // Capital décès = "plus rente" + capital INDÉPENDANT (versé toujours, en plus).
      acc.deces += (Number(d.Enter_CapitalPlusRenteMal) || 0) + (Number(d.Enter_CapitalDecesIndependantMal) || 0);
      // Connu ? (EPL + rachat LPP, via les champs du certificat)
      eplContrib = true;
      if (!hasNum(d.Enter_lppEPLPossible)) { eplAllKnown = false; if (!eplUnknownId) eplUnknownId = p.id; }
      rachatLPP = true;
      if (!hasNum(d.Enter_lppRachatPossible)) { rachatAllKnown = false; if (!rachatUnknownId) rachatUnknownId = p.id; }
    } else {
      acc.current += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      // Priorité à la projection AFFICHÉE (projection assureur, ou capital retraite
      // projeté figé/saisi sur l'offre) — comme la carte plan ; à défaut seulement,
      // calcul auto via le moteur. (Mêmes règles que la branche LPP ci-dessus.)
      acc.capital65 +=
        Number(d.projectionAssureur) ||
        Number(d.capitalRetraiteProjete) ||
        (isCash
          ? computeProjectionsEpargneLibre(d, clientAge)
          : isBank
          ? computeProjections3aBanque(d, clientAge)
          : computeProjections3aAssurance(d, clientAge));
      acc.epl += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      acc.invalidite += Number(d.renteInvalidite) || 0;
      if (isBank || isCash) {
        // Cash / 3a bancaire : le capital décès = le solde (revient aux proches).
        acc.deces += Number(d.soldeActuel) || 0;
      } else {
        acc.deces += computeDeathBenefitAssurance(d);
      }
      // EPL 3e = valeur de rachat (assurance) / solde (banque/cash). Rachat non applicable (abandonné).
      eplContrib = true;
      const eplKey = isBank || isCash ? "soldeActuel" : "valeurRachatActuelle";
      if (!hasNum(d[eplKey])) { eplAllKnown = false; if (!eplUnknownId) eplUnknownId = p.id; }
    }

    return acc;
  }, { ...EMPTY });

  // hidden = aucun plan contributeur ; sinon known (tout capté) / unknown (au moins un absent).
  acc.eplStatus = eplContrib ? (eplAllKnown ? "known" : "unknown") : "hidden";
  acc.eplPlanId = eplAllKnown ? null : eplUnknownId;
  acc.rachatStatus = rachatLPP ? (rachatAllKnown ? "known" : "unknown") : "hidden";
  acc.rachatPlanId = rachatAllKnown ? null : rachatUnknownId;
  return acc;
}

// Âge client depuis Enter_dateNaissance "jj.mm.aaaa" (défaut 35, comme le web).
function ageFromBirthdate(dateStr: unknown): number {
  if (typeof dateStr !== "string") return 35;
  const parts = dateStr.split(".");
  if (parts.length !== 3) return 35;
  const year = parseInt(parts[2], 10);
  if (!year) return 35;
  return new Date().getFullYear() - year;
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const [plansSnap, profileSnap] = await Promise.all([
      db.collection("clients").doc(uid).collection("plans").get(),
      db.collection("clients").doc(uid).collection("DonneePersonnelles").doc("current").get(),
    ]);

    const plans = plansSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const clientAge = ageFromBirthdate(profileSnap.data()?.Enter_dateNaissance);

    // Sous-ensembles : LPP / privé (3e pilier, hors épargne libre) / épargne libre
    // (cash, sa propre page) / global (tous, l'épargne libre y compte comme cash).
    // 2e pilier = base + complémentaire + libre passage (tous agrégés).
    const lppPlans = plans.filter((p) => isDeuxiemePilier(p.type));
    const epargneLibrePlans = plans.filter((p) => p.type === "EPARGNE_LIBRE");
    const privatePlans = plans.filter(
      (p) => !isDeuxiemePilier(p.type) && p.type !== "EPARGNE_LIBRE"
    );

    return NextResponse.json({
      clientAge,
      lpp: computeTotals(lppPlans, clientAge),
      prive: computeTotals(privatePlans, clientAge),
      epargneLibre: computeTotals(epargneLibrePlans, clientAge),
      global: computeTotals(plans, clientAge),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
