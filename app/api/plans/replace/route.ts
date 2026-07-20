// app/api/plans/replace/route.ts
//
// REMPLACEMENT ANNUEL d'un plan scanné (certificat LPP, police 3a/3b).
//
// Un certificat LPP est réémis chaque année : primes, prestations, parfois la
// caisse elle-même changent. Sans remplacement, le client consulte indéfiniment
// des chiffres périmés — et le moteur calcule ses lacunes dessus.
//
// POURQUOI ÉCRASER SUR PLACE plutôt que supprimer puis recréer :
// les allocations de capital retraite sont indexées PAR planId
// (cf. situation.ts:116). Un nouveau document ferait perdre au client les
// réglages de ses curseurs, sans qu'il comprenne pourquoi. On garde donc le
// même identifiant et on réécrit le contenu.
//
// L'ancienne version est archivée dans `plans/{id}/versions/{autoId}` :
// invisible pour le client aujourd'hui, mais c'est ce qui permettra plus tard
// d'afficher une progression d'une année sur l'autre. Le PDF d'origine, lui,
// reste au coffre-fort (`clients/{uid}/documents`), qui est une collection
// distincte — rien de ce qui s'y trouve n'est touché ici.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth } from "@/lib/server/requireAuth";
import { buildSourceDocTitle } from "@/lib/core/documentTypes";

export const dynamic = "force-dynamic";

/** Types de plans remplaçables : ceux qui viennent d'un document du client. */
// Types reellement presents en base (verifie) : LPP_BASE, PILIER_3A_POLICE,
// PILIER_3B — et NON "PILIER_3B_POLICE", qui n'existe pas. Un plan bancaire
// (PILIER_3A_BANK) n'a pas de document a rescanner, il est exclu.
const REPLACEABLE_TYPES = ["LPP_BASE", "LPP_COMPL", "PILIER_3A_POLICE", "PILIER_3B"];

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { planId, data, institutionName, sourceFileUrl, sourceDoc } = body ?? {};

    if (!planId || !data || typeof data !== "object") {
      return NextResponse.json({ error: "planId et data requis" }, { status: 400 });
    }

    const ref = db.collection("clients").doc(uid).collection("plans").doc(planId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Plan introuvable" }, { status: 404 });
    }

    const current = snap.data() as any;

    // Un contrat SOUSCRIT CHEZ CREDITX n'est pas remplaçable par le client :
    // nous en connaissons les termes et en maîtrisons le cycle de vie. Le laisser
    // écraser par un scan exposerait à des données contradictoires avec la police
    // que nous avons nous-mêmes émise.
    if (current.origin === "creditx") {
      return NextResponse.json(
        { error: "Un contrat souscrit chez CreditX ne peut pas être remplacé par un scan. Contactez votre conseiller." },
        { status: 409 }
      );
    }

    if (!REPLACEABLE_TYPES.includes(current.type)) {
      return NextResponse.json(
        { error: `Ce type de plan (${current.type}) n'est pas remplaçable.` },
        { status: 409 }
      );
    }

    const previousYear = current.data?.Enter_anneeCertificat ?? null;

    // 1. ARCHIVAGE de la version courante, AVANT toute écriture.
    //    Si l'archivage échoue, on n'a rien écrasé.
    await ref.collection("versions").add({
      archivedAt: FieldValue.serverTimestamp(),
      replacedBy: uid,
      certYear: previousYear,
      institutionName: current.institutionName ?? null,
      type: current.type ?? null,
      data: current.data ?? {},
      // On conserve le lien vers le PDF de l'époque : le coffre-fort le garde,
      // mais retrouver LEQUEL correspond à cette version serait sinon impossible.
      sourceFileUrl: current.metadata?.sourceFileUrl ?? null,
    });

    // 2. ÉCRASEMENT sur place.
    //    `data` est remplacé INTÉGRALEMENT (et non fusionné) : une prestation
    //    supprimée du nouveau certificat doit disparaître, pas survivre à la
    //    fusion avec l'ancienne valeur.
    const patch: Record<string, any> = {
      data,
      "metadata.updatedAt": FieldValue.serverTimestamp(),
      "metadata.replacedAt": FieldValue.serverTimestamp(),
      "metadata.previousCertYear": previousYear,
    };
    if (institutionName) patch.institutionName = institutionName;
    if (sourceFileUrl) patch["metadata.sourceFileUrl"] = sourceFileUrl;
    if (sourceDoc?.type) patch["metadata.sourceDocType"] = sourceDoc.type;
    if (Array.isArray(sourceDoc?.tags)) patch["metadata.sourceDocTags"] = sourceDoc.tags;
    if (Array.isArray(sourceDoc?.keywords)) patch["metadata.sourceDocKeywords"] = sourceDoc.keywords;

    // TITRE du document au coffre-fort. Reconstruit ICI quand l'appelant n'en
    // fournit pas : l'endpoint de scan utilisé par l'iOS (/api/lpp/parse-image)
    // n'extrait aucune classification, contrairement à celui du web. Sans ce
    // repli, un client changeant de caisse garderait « Certificat de caisse de
    // pension - CPVAL » sur un document désormais émis par AXA.
    // Le titre dépend de l'institution : on le recalcule dès qu'elle change.
    const finalInstitution = institutionName || current.institutionName;
    patch["metadata.sourceDocTitle"] =
      sourceDoc?.title || buildSourceDocTitle(current.type, finalInstitution);

    // Le rappel annuel est reconduit : en effaçant les drapeaux, le client sera
    // de nouveau relancé l'an prochain. Sans ça, un remplacement en 2027
    // supprimerait le rappel de 2028.
    patch["metadata.reminders"] = FieldValue.delete();

    await ref.update(patch);

    // 3. Recalcul de l'analyse : les chiffres du dashboard doivent refléter le
    //    nouveau certificat immédiatement, pas au prochain écran ouvert.
    await db
      .doc(`clients/${uid}/DonneePersonnelles/current`)
      .set({ _lastPlanUpdateTrigger: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({
      ok: true,
      planId,
      previousCertYear: previousYear,
      newCertYear: data.Enter_anneeCertificat ?? null,
    });
  } catch (e: any) {
    console.error("[plans/replace]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
