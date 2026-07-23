// app/api/admin/audit/[uid]/pdf/route.ts
//
// Export PDF de la piste d'audit d'un client — pour transmission FINMA.
// Interne uniquement. Lit auditTrail/{uid}/events (source inaltérable) et rend
// un PDF structuré. Fonctionne MÊME si le compte client a été supprimé, puisque
// la piste vit dans auditTrail (racine, hors clients/{uid}).

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { db } from "@/lib/firebase/admin";
import { requireInternal } from "@/lib/server/requireInternal";
import { AuditTrailTemplate, type AuditRow } from "lib/pdf/AuditTrailTemplate";

export const dynamic = "force-dynamic";

function fmtDate(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : ts?._seconds ? new Date(ts._seconds * 1000) : null;
  if (!d) return "—";
  return d.toLocaleString("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await requireInternal(req);
  } catch (e: any) {
    const code = e?.message === "UNAUTHENTICATED" ? 401 : 403;
    return NextResponse.json({ error: e?.message || "Interdit" }, { status: code });
  }

  const { uid } = await ctx.params;

  try {
    // Événements, ordre chronologique (le plus ancien d'abord = lecture naturelle).
    const snap = await db
      .collection("auditTrail").doc(uid).collection("events")
      .orderBy("at", "asc")
      .get();

    const rows: AuditRow[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        type: x.type,
        at: fmtDate(x.at),
        summary: x.summary || "",
        actorType: x.actorType || "system",
        changes: x.changes,
        document: x.document ?? null,
      };
    });

    // Identité : depuis le profil s'il existe encore, sinon depuis l'événement
    // de création (l'e-mail y est conservé même après suppression du compte).
    let clientName = "";
    let clientEmail = "";
    try {
      const pd = await db.doc(`clients/${uid}/DonneePersonnelles/current`).get();
      if (pd.exists) {
        const p = pd.data() as any;
        clientName = [p.Enter_prenom, p.Enter_nom].filter(Boolean).join(" ");
        clientEmail = p.Enter_email || "";
      }
    } catch { /* profil supprimé → on se rabat sur l'audit */ }
    if (!clientEmail) {
      const created = snap.docs.find((d) => (d.data() as any).type === "ACCOUNT_CREATED");
      clientEmail = (created?.data() as any)?.meta?.email || "";
    }

    const generatedAt = new Date().toLocaleString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    // Cast `as any` : friction de typage @react-pdf (même contournement que les
    // templates existants, ex. TransferTemplate). Le contenu reste typé côté template.
    const buffer = await renderToBuffer(
      createElement(AuditTrailTemplate, { clientName, clientEmail, uid, generatedAt, rows }) as any
    );

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-${uid}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error("[audit/pdf]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
