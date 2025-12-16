// app/api/admin/offers/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseOfferPdf } from "lib/offers/parseOfferPdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file (field name: file)" },
        { status: 400 }
      );
    }

    const insurerHintRaw = form.get("insurerHint");
    const requestIdRaw = form.get("requestId");
    const clientUidRaw = form.get("clientUid");

    const insurerHint =
      typeof insurerHintRaw === "string" ? insurerHintRaw : "";
    const requestId =
      typeof requestIdRaw === "string" ? requestIdRaw : undefined;
    const clientUid =
      typeof clientUidRaw === "string" ? clientUidRaw : undefined;

    const buf = Buffer.from(await file.arrayBuffer());

    const offer = await parseOfferPdf({
      pdfBuffer: buf,
      insurerHint: insurerHint as any,
      requestId,
      clientUid,
    });

    return NextResponse.json({ ok: true, offer });
  } catch (err: any) {
    console.error("[api/admin/offers/import] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}