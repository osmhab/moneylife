// app/api/admin/dossiers/route.ts
//
// Archive des dossiers d'analyse remis aux clients.
//
// POURQUOI ON ARCHIVE LE FICHIER, PAS LES DONNÉES
// -----------------------------------------------
// Un dossier archivé doit pouvoir être relu et réimprimé EXACTEMENT tel qu'il a
// été présenté au client. Réenregistrer les données pour les remettre en page
// plus tard ne le garantit pas : le gabarit évolue, et un dossier de 2026
// réimprimé avec le gabarit de 2027 ne serait pas ce que le client a eu en main.
// Ce sont donc les OCTETS du PDF qui font foi ; la fiche Firestore à côté ne
// sert qu'à retrouver, lister et filtrer.
//
// IMMUABILITÉ
// -----------
// Il n'existe volontairement NI PUT NI PATCH sur cette ressource. Le chemin de
// stockage porte un identifiant aléatoire et l'écriture refuse d'écraser une
// entrée existante. Un dossier remis à un client est une pièce : on en établit
// un nouveau, on ne corrige pas l'ancien.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, bucket } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: any, max = 120) => String(v ?? "").trim().slice(0, max);

/**
 * Le document qui DÉCLARE une analyse en cours (cf. /api/admin/analyse/en-cours).
 *
 * Auparavant l'état « en cours » était DÉDUIT des traces ci-dessous : retoucher
 * un détail chez un client suffisait à faire apparaître une analyse que personne
 * n'avait commencée. La liste se remplissait de faux positifs. C'est maintenant
 * une intention explicite — le conseiller répond au modal, et peut retirer
 * l'entrée de la liste.
 */
const OUVERTURE = "analyseEnCours";

/**
 * Traces de travail. Elles n'OUVRENT PLUS une analyse : elles servent seulement
 * à décrire ce qui a déjà été fait sur celles qui sont ouvertes (« besoins
 * ajustés · notes rédigées »), pour situer d'un coup d'œil où l'on en était.
 */
const TRACES = ["besoinsOverrides", "notesConseiller", "dossierImages"] as const;

/** Le document porte-t-il un contenu, ou n'est-ce qu'une coquille vide ? */
function traceRemplie(id: string, d: any): boolean {
  if (id === "notesConseiller") return String(d?.texte || "").trim().length > 0;
  if (id === "besoinsOverrides") return Object.keys(d?.besoins || {}).length > 0;
  if (id === "dossierImages") return Object.keys(d?.slots || {}).length > 0;
  return false;
}

const LIBELLE: Record<string, string> = {
  besoinsOverrides: "besoins ajustés",
  notesConseiller: "notes rédigées",
  dossierImages: "images choisies",
};

/** Liste des dossiers établis, du plus récent au plus ancien. */
export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  try {
    // ⚠️ Filtrer par client ET trier exigerait un index composite (clientUid +
    // createdAt) qui n'existe pas : la requête échouerait à l'exécution. Sur un
    // client donné le volume est de quelques documents — on trie en mémoire.
    const snap = uid
      ? await db.collection("dossiers").where("clientUid", "==", uid).get()
      : await db.collection("dossiers").orderBy("createdAt", "desc").limit(300).get();

    const dossiers = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        clientUid: x.clientUid,
        clientNom: x.clientNom,
        conseiller: x.conseiller || null,
        score: x.score ?? null,
        lacunes: x.lacunes || null,
        path: x.path,
        taille: x.taille ?? null,
        createdAt: x.createdAt?.toDate?.()?.toISOString() || null,
        etabliPar: x.etabliPar || null,
      };
    }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    // ── Analyses EN COURS : celles que le conseiller a DÉCLARÉES ────────────
    // Le volume est faible (une poignée de documents) : un balayage suffit, et
    // il évite d'entretenir un index qui pourrait mentir.
    const traceSnap = await db.collectionGroup("Analyse").get();
    const ouvertes = new Map<string, number>();                 // clientUid → dernière activité
    const travaux = new Map<string, string[]>();                // clientUid → ce qui a été fait

    for (const d of traceSnap.docs) {
      const cuid = d.ref.parent.parent?.id;
      if (!cuid || (uid && cuid !== uid)) continue;
      const data = d.data();
      const quand = data.updatedAt?.toDate?.()?.getTime()
        || data.ouverteLe?.toDate?.()?.getTime()
        || 0;

      // Seul ce document ouvre une analyse. `current` (Cloud Function) et les
      // autres traces ne le font pas — c'était toute la cause des faux positifs.
      if (d.id === OUVERTURE) {
        ouvertes.set(cuid, Math.max(ouvertes.get(cuid) || 0, quand));
        continue;
      }

      if (!TRACES.includes(d.id as any) || !traceRemplie(d.id, data)) continue;
      travaux.set(cuid, [...(travaux.get(cuid) || []), LIBELLE[d.id] || d.id]);
    }

    // Un dossier a-t-il déjà été établi pour ce client ? (badge « modifiée depuis »)
    const dernierDossier = new Map<string, number>();
    for (const d of dossiers) {
      const t = d.createdAt ? new Date(d.createdAt).getTime() : 0;
      dernierDossier.set(d.clientUid, Math.max(dernierDossier.get(d.clientUid) || 0, t));
    }

    const uids = [...ouvertes.keys()];

    // Noms : le document racine porte `firstName`/`lastName` ou `displayName`
    // selon l'origine du compte ; les champs `Enter_*` vivent ailleurs.
    const noms = new Map<string, { nom: string; email: string }>();
    if (uids.length) {
      const refs = uids.map((u) => db.doc(`clients/${u}`));
      const snaps = await db.getAll(...refs);
      snaps.forEach((sn) => {
        const x = sn.data() || {};
        const nom = `${x.firstName || ""} ${x.lastName || ""}`.trim() || String(x.displayName || "").trim();
        noms.set(sn.id, { nom: nom || x.email || sn.id.slice(0, 8), email: x.email || "" });
      });
    }

    const enCours = uids
      .map((cuid) => ({
        clientUid: cuid,
        clientNom: noms.get(cuid)?.nom || cuid.slice(0, 8),
        email: noms.get(cuid)?.email || "",
        // Dédoublonné : deux traces du même type ne doivent pas s'afficher deux fois.
        elements: [...new Set(travaux.get(cuid) || [])],
        modifieLe: ouvertes.get(cuid) ? new Date(ouvertes.get(cuid)!).toISOString() : null,
        dejaEtabli: (dernierDossier.get(cuid) || 0) > 0,
      }))
      .sort((a, b) => String(b.modifieLe || "").localeCompare(String(a.modifieLe || "")));

    return NextResponse.json({ dossiers, enCours });
  } catch (e: any) {
    console.error("[dossiers] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Établit un dossier : dépose le PDF et crée sa fiche. Aucune mise à jour possible ensuite. */
export async function POST(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const clientUid = str(form.get("clientUid"), 64);

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Dossier trop volumineux." }, { status: 400 });
    }
    if (!clientUid) {
      return NextResponse.json({ error: "Client manquant." }, { status: 400 });
    }

    let meta: any = {};
    try {
      meta = JSON.parse(String(form.get("meta") || "{}"));
    } catch { /* les métadonnées sont un confort, pas une condition */ }

    const id = randomUUID();
    const path = `dossiers/${clientUid}/${id}.pdf`;

    // Garde-fou d'immuabilité : on n'écrase jamais un objet existant.
    const [exists] = await bucket.file(path).exists();
    if (exists) {
      return NextResponse.json({ error: "Conflit d'identifiant, réessayez." }, { status: 409 });
    }

    await bucket.file(path).save(Buffer.from(await file.arrayBuffer()), {
      contentType: "application/pdf",
      metadata: { metadata: { dossierId: id, clientUid } },
    });

    await db.collection("dossiers").doc(id).set({
      clientUid,
      clientNom: str(meta.clientNom),
      conseiller: meta.conseiller
        ? { nom: str(meta.conseiller.nom), fonction: str(meta.conseiller.fonction), agence: str(meta.conseiller.agence) }
        : null,
      score: num(meta.score),
      lacunes: meta.lacunes && typeof meta.lacunes === "object"
        ? Object.fromEntries(Object.entries(meta.lacunes).slice(0, 8).map(([k, v]) => [str(k, 30), num(v)]))
        : null,
      nbPlans: num(meta.nbPlans),
      path,
      taille: file.size,
      etabliPar: decoded?.email || decoded?.uid || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Le dossier est remis : l'analyse n'est plus « en cours ». On retire la
    // déclaration plutôt que de la comparer par date — l'état devient explicite
    // dans les deux sens (ouverte par le modal, close par l'établissement).
    // Non bloquant : le dossier est déjà archivé, il ne doit pas échouer ici.
    try {
      await db.doc(`clients/${clientUid}/Analyse/analyseEnCours`).delete();
    } catch (e: any) {
      console.error("[dossiers] clôture de l'analyse en cours:", e?.message || e);
    }

    return NextResponse.json({ ok: true, id, path });
  } catch (e: any) {
    console.error("[dossiers] établissement:", e?.message || e);
    return NextResponse.json({ error: "Établissement impossible." }, { status: 500 });
  }
}
