// app/api/admin/clients/transfer-letter/list/route.ts
import { NextResponse } from "next/server";
import { db, authAdmin } from "@/lib/firebase/admin";

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await authAdmin.verifyIdToken(token);

    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    
    console.log("Recherche de docs signés pour UID:", uid);

    // On simplifie la requête pour tester sans index
    let query = db.collection("signing_requests")
      .where("clientUid", "==", uid)
      .where("status", "==", "signed");

    const snapshot = await query.get();

    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log("Documents trouvés dans Firestore:", docs.length);

    return NextResponse.json({ ok: true, docs });
  } catch (e: any) {
    console.error("Erreur API List:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}