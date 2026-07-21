// app/api/signing/details/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token manquant" }, { status: 400 });
    }

    // Récupération de la demande de signature
    const requestDoc = await db.collection("signing_requests").doc(token).get();
    
    if (!requestDoc.exists) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const data = requestDoc.data();

    // On ajoute pillarType et l'IBAN dans la réponse JSON
    return NextResponse.json({
      details: {
        oldInstitution: data?.details?.oldInstitution || "Non spécifiée",
        contractNumber: data?.details?.contractNumber || "Non spécifié",
        transferDate: data?.details?.transferDate || "Dès que possible",
        iban: data?.details?.iban || null, // ✅ Ajouté pour le 3b
      },
      pillarType: data?.pillarType || "3a", // ✅ Crucial : on transmet le type au front
      status: data?.status
    });

  } catch (e: any) {
    console.error("Erreur API Details:", e.message);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}