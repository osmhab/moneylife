// app/api/admin/notes/route.ts
//
// Notes rattachées à un client, pour l'analyse conseiller et le dossier PDF.
//
// TROIS SOURCES, DEUX NATURES
// ---------------------------
//   · `conseiller` — les notes RÉDIGÉES ici par le conseiller, dans la section
//     « Notes du conseiller » de l'écran d'analyse. Modifiables, enregistrées
//     automatiquement, et les seules que Gemini a le droit de reformuler.
//   · `session` — le compte rendu du DERNIER entretien clôturé
//     (`conseils_sessions`). C'est une pièce datée : lecture seule. On ne
//     réécrit pas un compte rendu après coup.
//   · `brouillon` — l'entretien en cours (`conseils_drafts/current`), s'il
//     existe. Lecture seule également.
//
// Le schéma des sessions a deux variantes historiques (`quickNotesSnapshot` du
// vrai outil de clôture, `notesRaw` du wizard) : on lit les deux.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type NoteBloc = { texte: string; date: string | null };

const advisorDoc = (uid: string) => `clients/${uid}/Analyse/notesConseiller`;

function guard(e: unknown) {
  const status = (e as Error)?.message === "FORBIDDEN" ? 403 : 401;
  return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
}

/** `dateSession` est saisie en JJ.MM.AAAA ; `createdAt` est un Timestamp. */
function sessionDate(x: any): string | null {
  const brut = String(x?.dateSession || "").trim();
  const m = brut.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const ts = x?.createdAt?.toDate?.();
  return ts ? ts.toISOString().slice(0, 10) : null;
}

export async function GET(req: NextRequest) {
  try {
    await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    const [advSnap, sessSnap, draftSnap] = await Promise.all([
      db.doc(advisorDoc(uid)).get(),
      // Le tri se fait en mémoire : `createdAt` manque sur d'anciens documents,
      // et un `orderBy` les exclurait silencieusement.
      db.collection(`clients/${uid}/conseils_sessions`).get(),
      db.doc(`clients/${uid}/conseils_drafts/current`).get(),
    ]);

    const adv = advSnap.data() || {};
    const sessions = sessSnap.docs
      .map((d) => d.data())
      .map((x) => ({ texte: String(x.quickNotesSnapshot || x.notesRaw || "").trim(), date: sessionDate(x) }))
      .filter((s) => s.texte)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    const draftTxt = String(draftSnap.data()?.notes || "").trim();

    return NextResponse.json({
      conseiller: {
        texte: String(adv.texte || ""),
        updatedAt: adv.updatedAt?.toDate?.()?.toISOString() || null,
      },
      session: sessions[0] || null,
      brouillon: draftTxt
        ? { texte: draftTxt, date: draftSnap.data()?.updatedAt?.toDate?.()?.toISOString()?.slice(0, 10) || null }
        : null,
    });
  } catch (e: any) {
    console.error("[notes] lecture:", e?.message || e);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Enregistre les notes rédigées par le conseiller. */
export async function PUT(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e) {
    return guard(e);
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Paramètre uid manquant" }, { status: 400 });

  try {
    const body = await req.json();
    const texte = String(body?.texte ?? "").slice(0, 8000);
    await db.doc(advisorDoc(uid)).set(
      { texte, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded?.email || decoded?.uid || null },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[notes] écriture:", e?.message || e);
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
