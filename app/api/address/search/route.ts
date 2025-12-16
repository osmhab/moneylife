// app/api/address/search/route.ts
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(req: NextRequest) {
  try {
    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_MAPS_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return NextResponse.json(
        { ok: false, error: "Missing query parameter q" },
        { status: 400 }
      );
    }

    // Places Autocomplete – filtré sur les adresses en Suisse
    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json"
    );
    url.searchParams.set("input", q);
    url.searchParams.set("types", "address");
    url.searchParams.set("components", "country:ch");
    url.searchParams.set("language", "fr");
    url.searchParams.set("key", GOOGLE_API_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[address/search] HTTP error:", res.status, await res.text());
      return NextResponse.json(
        { ok: false, error: "Upstream Google API error" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("[address/search] Google status:", data.status, data.error_message);
      return NextResponse.json(
        { ok: false, error: data.error_message || data.status },
        { status: 502 }
      );
    }

    const predictions =
      (data.predictions || []).map((p: any) => ({
        placeId: p.place_id,
        label: p.description as string,
      })) ?? [];

    return NextResponse.json({ ok: true, predictions });
  } catch (err) {
    console.error("[address/search] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}