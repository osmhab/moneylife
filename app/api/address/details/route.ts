// app/api/address/details/route.ts
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
    const placeId = searchParams.get("placeId")?.trim();

    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "Missing placeId parameter" },
        { status: 400 }
      );
    }

    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json"
    );
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", "address_component,formatted_address");
    url.searchParams.set("language", "fr");
    url.searchParams.set("key", GOOGLE_API_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[address/details] HTTP error:", res.status, await res.text());
      return NextResponse.json(
        { ok: false, error: "Upstream Google API error" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== "OK") {
      console.error("[address/details] Google status:", data.status, data.error_message);
      return NextResponse.json(
        { ok: false, error: data.error_message || data.status },
        { status: 502 }
      );
    }

    const result = data.result;
    const components = result.address_components || [];

    const getPart = (type: string) =>
      components.find((c: any) => c.types.includes(type)) || null;

    const streetNumber = getPart("street_number")?.long_name || "";
    const route = getPart("route")?.long_name || "";
    const postalCode = getPart("postal_code")?.long_name || "";
    const locality =
      getPart("locality")?.long_name ||
      getPart("postal_town")?.long_name ||
      "";
    const country = getPart("country")?.long_name || "";

    const street =
      route && streetNumber ? `${route} ${streetNumber}` : route || "";

    const normalized = {
      street,
      zip: postalCode,
      city: locality,
      country,
      formatted: result.formatted_address as string,
    };

    return NextResponse.json({ ok: true, address: normalized });
  } catch (err) {
    console.error("[address/details] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}