import { NextResponse } from "next/server";
import { bucket, authAdmin } from "@/lib/firebase/admin";

export async function GET(req: Request) {
  try {
    // 1. Sécurité : Vérifier le token Admin
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return new NextResponse("Unauthorized", { status: 401 });
    
    await authAdmin.verifyIdToken(token);

    // 2. Récupération du chemin
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    if (!path) return new NextResponse("Path missing", { status: 400 });

    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return new NextResponse("File not found", { status: 404 });

    // 3. Récupérer le contenu du fichier sous forme de Buffer
    const [content] = await file.download();

    // 4. Déterminer le type de contenu (Optionnel mais plus propre)
    const fileName = path.split('/').pop() || "document.pdf";
    const contentType = path.toLowerCase().endsWith('.png') ? 'image/png' : 'application/pdf';

    // 5. Retourner le fichier (Correction du type Buffer pour le build)
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e: any) {
    console.error("Erreur téléchargement fichier:", e.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}