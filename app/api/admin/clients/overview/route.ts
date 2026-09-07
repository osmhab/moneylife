import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { droitPartenaireConcubinage, anneesViecommune, dureeExigeeParReglement, estConcubinage } from "app/lib/core/concubinage";
import { reglementConnuPour } from "app/lib/server/appliquerReglement";

export async function GET(req: Request) {
  try {
    // 1. Garde COLLABORATEUR.
    // Cette route se contentait de vérifier que le jeton était valide : n'importe
    // quel compte client authentifié pouvait donc lire la fiche de n'importe quel
    // autre client. `requireInternal.ts` la citait même en contre-exemple. Le
    // payload transportant désormais l'e-mail et l'état civil, la garde devenait
    // indispensable.
    try {
      await requireInternal(req);
    } catch (e: any) {
      const status = e?.message === "FORBIDDEN" ? 403 : 401;
      return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
    }

    // 2. Récupération de l'UID dans l'URL
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "Missing UID" }, { status: 400 });

    // 3. Récupération du document racine du client
    const clientDoc = await db.collection("clients").doc(uid).get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }
    const mainData = clientDoc.data();

    // 4. RÉCUPÉRATION DU SOUS-DOCUMENT DES DONNÉES PERSONNELLES
    // C'est ici que se trouvent les adresses (Enter_adresse, etc.)
    const dpDoc = await db
      .collection("clients")
      .doc(uid)
      .collection("DonneePersonnelles")
      .doc("current")
      .get();
    
    const dpData = dpDoc.exists ? dpDoc.data() : null;

    // 4bis. CONCUBINAGE — le seul cas où une prestation de survivant dépend
    // d'une DÉMARCHE que le client doit avoir faite lui-même. Le conseiller doit
    // le voir : sans désignation écrite auprès de la caisse, le partenaire peut
    // ne rien percevoir, et personne ne s'en apercevra avant qu'il soit trop tard.
    let concubinage: Record<string, unknown> | null = null;
    if (estConcubinage(dpData?.Enter_etatCivil)) {
      const enfants = Array.isArray(dpData?.Enter_enfants) ? dpData!.Enter_enfants : [];
      const situation = {
        etatCivil: dpData?.Enter_etatCivil,
        concubinageDepuis: typeof dpData?.Enter_concubinageDepuis === "number" ? dpData.Enter_concubinageDepuis : null,
        clauseBeneficiaire: dpData?.Enter_partenaireClauseBeneficiaire ?? null,
        rappelMasque: dpData?.Enter_partenaireClauseRappelMasque === true,
        partenairePrenom: dpData?.Enter_spousePrenom ?? null,
        partenaireNom: dpData?.Enter_spouseNom ?? null,
        nombreEnfants: enfants.filter((e: Record<string, unknown>) => !!e?.Enter_dateNaissance).length,
        nombreEnfantsCommuns: enfants.filter(
          (e: Record<string, unknown>) => !!e?.Enter_dateNaissance && e?.Enter_enfantCommunConjoint === true,
        ).length,
      };

      // Règlement de SA caisse : c'est lui qui fixe la durée exigée et dit si
      // les enfants communs en dispensent.
      const plansSnap = await db.collection("clients").doc(uid).collection("plans").get();
      const planLpp = plansSnap.docs
        .map((d) => d.data())
        .find((p) => ["LPP_BASE", "LPP_COMPL", "LPP"].includes(String(p.type ?? "").toUpperCase()));
      const nomCaisse = String((planLpp?.data ?? {}).Enter_nomCaisseComplet ?? "").trim()
        || planLpp?.institutionName || null;
      const reglement = nomCaisse ? await reglementConnuPour(nomCaisse) : null;
      const bloc = reglement?.general ?? null;

      const verdict = droitPartenaireConcubinage(situation, bloc);
      concubinage = {
        depuis: situation.concubinageDepuis,
        annees: anneesViecommune(situation.concubinageDepuis),
        partenaire: [situation.partenairePrenom, situation.partenaireNom]
          .map((x) => (x ?? "").trim()).filter(Boolean).join(" "),
        clause: situation.clauseBeneficiaire,
        rappelMasque: situation.rappelMasque,
        enfantsCommuns: situation.nombreEnfantsCommuns,
        verdict: verdict.verdict,
        motif: verdict.motif,
        caisse: reglement?.caisse ?? null,
        dureeExigee: dureeExigeeParReglement(bloc),
        dispenseEnfants: bloc?.rentePartenaire?.enfantsCommunsRemplacentDuree ?? null,
        article: bloc?.rentePartenaire?.article ?? null,
      };
    }

    // 5. CONSTRUCTION DU PAYLOAD POUR LE FRONTEND
    return NextResponse.json({
      ok: true,
      uid,
      concubinage,
      donneesPersonnelles: {
        exists: !!dpData,
        // On fusionne les infos pour que le front trouve tout au même endroit
        firstName: dpData?.Enter_prenom || mainData?.firstName || "",
        lastName: dpData?.Enter_nom || mainData?.lastName || "",
        birthdate: dpData?.Enter_dateNaissance || "",

        // E-mail : le compte Auth fait foi ; à défaut, celui saisi au dossier.
        email: mainData?.email || dpData?.Enter_email || "",
        // État civil : code 0-5 (cf. Enter_EtatCivil). `?? null` et non `|| null` —
        // 0 est « Célibataire », une valeur légitime qu'un `||` effacerait.
        etatCivil: dpData?.Enter_etatCivil ?? null,
        
        // ON AJOUTE LES CHAMPS D'ADRESSE ICI
        address: dpData?.Enter_adresse || "",
        npa: dpData?.Enter_npa || "",
        localite: dpData?.Enter_localite || "",
        
        // On garde les clés brutes par sécurité
        Enter_adresse: dpData?.Enter_adresse || "",
        Enter_npa: dpData?.Enter_npa || "",
        Enter_localite: dpData?.Enter_localite || "",
        
        updatedAt: dpData?.updatedAt || null,
      }
    });

  } catch (e: any) {
    console.error("Erreur Overview API:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}