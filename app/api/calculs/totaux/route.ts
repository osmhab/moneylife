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
  computeDeathBenefitAssurance,
} from "@/lib/calculs/3epilier";
import { computeLPPProjectionRetraite } from "@/lib/calculs/lpp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Totals = {
  current: number;
  capital65: number;
  rente65: number;
  epl: number;
  rachat: number;
  invalidite: number;
  deces: number;
};

const EMPTY: Totals = {
  current: 0,
  capital65: 0,
  rente65: 0,
  epl: 0,
  rachat: 0,
  invalidite: 0,
  deces: 0,
};

// Calque EXACT du reduce du web (CategoryPage.totals). On garde volontairement
// les gardes `|| 0` autour des `Number(...)` (anti-NaN, cf. CLAUDE.md §2.2/§3).
function computeTotals(plans: any[], clientAge: number): Totals {
  // Comme le web : on n'agrège que les plans actifs (ni refusés, ni en attente).
  const active = plans.filter(
    (p) =>
      p.status !== "REJECTED_CLIENT" &&
      p.status !== "PENDING_CLIENT" &&
      p.status !== "PENDING_INSURANCE"
  );

  return active.reduce((acc: Totals, p: any) => {
    const d = p.data || {};
    const isLPP = p.type === "LPP_BASE";
    const isBank = p.type === "PILIER_3A_BANK" || p.type === "3A_BANQUE";

    if (isLPP) {
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
      acc.deces += Number(d.Enter_CapitalPlusRenteMal) || 0;
    } else {
      acc.current += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      // Priorité à la projection AFFICHÉE (projection assureur, ou capital retraite
      // projeté figé/saisi sur l'offre) — comme la carte plan ; à défaut seulement,
      // calcul auto via le moteur. (Mêmes règles que la branche LPP ci-dessus.)
      acc.capital65 +=
        Number(d.projectionAssureur) ||
        Number(d.capitalRetraiteProjete) ||
        (isBank
          ? computeProjections3aBanque(d, clientAge)
          : computeProjections3aAssurance(d, clientAge));
      acc.epl += Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      acc.invalidite += Number(d.renteInvalidite) || 0;
      if (isBank) {
        acc.deces += Number(d.soldeActuel) || 0;
      } else {
        acc.deces += computeDeathBenefitAssurance(d);
      }
    }

    return acc;
  }, { ...EMPTY });
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

    // Mêmes sous-ensembles que le web : LPP / privé (≠ LPP) / global (tous).
    const lppPlans = plans.filter((p) => p.type === "LPP_BASE");
    const privatePlans = plans.filter((p) => p.type !== "LPP_BASE");

    return NextResponse.json({
      clientAge,
      lpp: computeTotals(lppPlans, clientAge),
      prive: computeTotals(privatePlans, clientAge),
      global: computeTotals(plans, clientAge),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
