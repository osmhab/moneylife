// app/api/clients/[token]/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { initAdminApp } from "@/lib/firebaseAdmin";
import { getFirestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic"; // évite tout caching indésirable

initAdminApp();
const adb = getFirestore();

function isSafeToken(t: string | null): t is string {
  return !!t && t.length >= 8 && t.length <= 128;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> } // ⬅️ params est une Promise
) {
  try {
    const { token } = await ctx.params;       // ⬅️ on attend params
    if (!isSafeToken(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { quickParams, project } = body ?? {};

    await adb.doc(`clients/${token}`).set(
      {
        quickParams: quickParams ?? null,
        project: project ?? null,
        anonymous: true,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[clients.save]", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
