// app/api/document/route.ts
import { NextRequest, NextResponse } from "next/server";
import { bucket } from "@/lib/firebase/admin";

// L'Admin SDK (repli Storage) impose le runtime Node.
export const runtime = "nodejs";

/**
 * Extrait le chemin Storage (`clients/.../fichier.pdf`) d'une URL de
 * téléchargement Firebase. Permet de régénérer l'accès via l'Admin SDK quand
 * le token de l'URL a expiré (cause de « Fichier introuvable ou corrompu »).
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<chemin-encodé>?alt=media&token=...
 */
function storagePathFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/o\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* pas une URL absolue */
  }
  return null;
}

/** Garde anti-traversée : on n'autorise le repli que sur des chemins clients/. */
function safePath(p: string | null): string | null {
  if (!p) return null;
  const clean = p.replace(/^\/+/, "");
  if (clean.includes("..")) return null;
  return clean.startsWith("clients/") ? clean : null;
}

async function fromBucket(path: string) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  const [meta] = await file.getMetadata();
  return { buf, contentType: meta.contentType || "application/pdf" };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const pathParam = req.nextUrl.searchParams.get("path");
  const name = req.nextUrl.searchParams.get("name") || "document.pdf";

  if (!url && !pathParam) {
    return new NextResponse("URL de document manquante", { status: 400 });
  }

  const serve = (body: BlobPart, contentType: string) => {
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    // "inline" → affichage dans le navigateur plutôt que téléchargement forcé.
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
    headers.set("Cache-Control", "private, max-age=300");
    return new NextResponse(body, { status: 200, headers });
  };

  // 1. Chemin rapide : on relaie directement l'URL de téléchargement.
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buf = await response.arrayBuffer();
        return serve(buf, response.headers.get("Content-Type") || "application/pdf");
      }
    } catch {
      /* on bascule sur le repli Storage ci-dessous */
    }
  }

  // 2. Repli : on régénère l'accès via l'Admin SDK à partir du chemin Storage
  //    (token expiré, URL héritée, ou `path` fourni explicitement par le coffre).
  const candidate = safePath(pathParam) || safePath(url ? storagePathFromUrl(url) : null);
  if (candidate) {
    try {
      const got = await fromBucket(candidate);
      if (got) return serve(got.buf as unknown as BlobPart, got.contentType);
    } catch (e) {
      console.error("Erreur repli Storage:", e);
    }
  }

  console.error("Document inaccessible:", { url, path: pathParam });
  return new NextResponse("Fichier introuvable ou corrompu", { status: 404 });
}
