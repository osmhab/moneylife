// app/api/share/[id]/file/[idx]/route.ts
//
// Sert un document partagé, UNIQUEMENT avec un jeton de session valide (obtenu
// après vérification du code OTP). Le fichier est streamé via l'Admin SDK —
// aucune URL Storage permanente n'est jamais exposée.

import { NextRequest, NextResponse } from "next/server";
import { db, bucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") || "";

  const snap = await db.collection("shares").doc(id).get();
  if (!snap.exists) return new NextResponse("Introuvable", { status: 404 });

  const d = snap.data()!;
  if (Date.now() > (d.expiresAt || 0)) return new NextResponse("Lien expiré", { status: 410 });
  if (d.status !== "verified" || !d.sessionToken || d.sessionToken !== token) {
    return new NextResponse("Accès refusé", { status: 403 });
  }
  if (Date.now() > (d.sessionExpiresAt || 0)) {
    return new NextResponse("Session expirée", { status: 403 });
  }

  const doc = (d.documents || [])[Number(idx)];
  if (!doc?.path) return new NextResponse("Document introuvable", { status: 404 });

  try {
    const file = bucket.file(doc.path);
    const [exists] = await file.exists();
    if (!exists) return new NextResponse("Fichier introuvable", { status: 404 });
    const [buf] = await file.download();
    const [meta] = await file.getMetadata();
    const headers = new Headers();
    headers.set("Content-Type", meta.contentType || "application/pdf");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.name || "document")}"`);
    headers.set("Cache-Control", "private, no-store");
    return new NextResponse(buf as unknown as BlobPart, { status: 200, headers });
  } catch (e) {
    console.error("share/file:", e);
    return new NextResponse("Erreur", { status: 500 });
  }
}
