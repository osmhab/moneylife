import { NextResponse } from "next/server";
import { db } from "app/lib/firebase/admin"; // ✅ chez toi: app/lib/firebase/admin.ts
import { FieldValue } from "firebase-admin/firestore";
import admin from "firebase-admin";
import { buildProviderModelsServer } from "lib/learner3a/train";



// ✅ Simple guard: custom claim admin === true
function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function requireInternal(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing token");

  const decoded = await admin.auth().verifyIdToken(token);
  const em = (decoded.email || "").toLowerCase();

  const ok =
    decoded.uid === "FRFN1sTxU4VjlbJXnC3wBGLoVyw2" ||
    em.endsWith("@creditx.ch") ||
    em.endsWith("@moneylife.ch");

  if (!ok) throw new Error("Not internal");
  return decoded;
}

export async function POST(req: Request) {
  try {
    await requireInternal(req);

    const snap = await db.collection("learner-3a").orderBy("createdAt", "desc").get();
    const benchmarks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const models = buildProviderModelsServer(benchmarks);

    const batch = db.batch();
    let upserts = 0;

    for (const [provider, model] of models.entries()) {
      const ref = db.collection("learner_models_3a").doc(provider);
      batch.set(ref, {
        ...model,
        trainedAt: FieldValue.serverTimestamp(),
        version: 1
      }, { merge: true });
      upserts++;
    }

    await batch.commit();

    return NextResponse.json({ ok: true, providers: upserts });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}