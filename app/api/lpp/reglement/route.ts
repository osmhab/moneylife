// app/api/lpp/reglement/route.ts
//
// SCAN DU RÈGLEMENT PAR UN CLIENT, depuis l'app.
//
// La route ne fait qu'authentifier, décider de QUI est le document, et passer
// la main à `ingererReglement` — la porte d'entrée commune au client, au
// back-office et à la veille. Trois implémentations parallèles finiraient par
// diverger, et un règlement déposé par un collaborateur serait alors lu
// autrement que le même document scanné par un client.

import { NextRequest, NextResponse } from "next/server";
import { bucket } from "app/lib/firebase/admin";
import { requireAuth } from "app/lib/server/requireAuth";
import { isInternalDecoded } from "app/lib/server/requireInternal";
import { ingererReglement } from "app/lib/server/ingererReglement";
import { envoyerPush } from "app/lib/server/push";
import type { FichierIA } from "app/lib/server/analyseIA";

export const maxDuration = 300;   // cinquante pages à lire : bien au-delà du défaut

export async function POST(req: NextRequest) {
  let uid: string;
  let email: string | null;
  try {
    ({ uid, email } = await requireAuth(req));
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const estAdmin = isInternalDecoded({ uid, email });

  try {
    // DEUX FORMES D'ENVOI : l'app poste les pages en multipart, l'outil
    // conseiller passe des chemins Storage déjà téléversés.
    let fichiers: FichierIA[] = [];
    let clientUid = uid;
    let pdfUrl: string | null = null;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      if (files.length === 0) return NextResponse.json({ error: "Aucune page fournie" }, { status: 400 });

      // Un conseiller peut scanner POUR un client ; un client, jamais pour un autre.
      const demande = String(form.get("uid") ?? "").trim();
      if (demande && demande !== uid) {
        if (!estAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        clientUid = demande;
      }

      // Uniquement une adresse de NOTRE stockage : un lien fourni par l'appelant
      // finirait affiché au client.
      const url = String(form.get("pdfUrl") ?? "").trim();
      if (/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(url)) pdfUrl = url;

      fichiers = await Promise.all(files.map(async (f) => ({
        mimeType: f.type || "application/pdf",
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
      })));
    } else {
      const { allPaths } = await req.json().catch(() => ({}));
      const paths: string[] = Array.isArray(allPaths) ? allPaths.filter((p) => typeof p === "string") : [];
      if (paths.length === 0) return NextResponse.json({ error: "Aucune page fournie" }, { status: 400 });

      // Le propriétaire est déduit du CHEMIN, jamais du corps de la requête.
      clientUid = paths[0].split("/")[1];
      if (uid !== clientUid && !estAdmin) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      fichiers = await Promise.all(paths.map(async (p) => {
        const [buffer] = await bucket.file(p).download();
        const ext = p.split(".").pop()?.toLowerCase();
        const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
        return { mimeType, base64: buffer.toString("base64") };
      }));
    }

    const r = await ingererReglement(fichiers, { clientUid, pdfUrl, source: "client" });

    if (r.statut === "PAS_UN_REGLEMENT") {
      return NextResponse.json(
        { error: "Ce document ne semble pas être un règlement de caisse de pension." },
        { status: 422 },
      );
    }

    // L'analyse tourne en arrière-plan : le client a pu fermer l'app. La
    // notification est le seul moyen qu'il apprenne que c'est terminé.
    const verifies = r.qualification?.plansVerifies.length ?? 0;
    await envoyerPush(
      clientUid,
      "Règlement analysé",
      verifies > 0
        ? `${r.caisse} : ${verifies} plan${verifies > 1 ? "s" : ""} de 2e pilier revérifié${verifies > 1 ? "s" : ""}.`
        : `${r.caisse} : règlement enregistré dans votre coffre-fort.`,
      { type: "reglement", cle: r.cle ?? "" },
    );

    return NextResponse.json({
      ok: true,
      statut: r.statut,
      cle: r.cle,
      caisse: r.caisse,
      enVigueurAu: r.enVigueurAu,
      annexes: r.annexes,
      plansVerifies: r.qualification?.plansVerifies ?? [],
      plansAVerifier: r.qualification?.plansAVerifier ?? [],
    });
  } catch (e) {
    console.error("[reglement] échec", e);
    return NextResponse.json({ error: "L'analyse a échoué" }, { status: 500 });
  }
}
