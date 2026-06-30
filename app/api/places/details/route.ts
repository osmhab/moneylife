// app/api/places/details/route.ts
//
// Détails d'une adresse Google Places (à partir d'un placeId) → renvoie les
// composants structurés (rue + n°, NPA, localité) pour remplir le formulaire.
// Clé côté serveur, authentifié (jeton Firebase).

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { placeId } = await req.json().catch(() => ({ placeId: "" }));
  if (!placeId) return NextResponse.json({ error: "placeId manquant" }, { status: 400 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "Clé Google manquante" }, { status: 500 });

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    "&fields=address_component&language=fr" +
    `&key=${key}`;

  try {
    const r = await fetch(url);
    const j = await r.json();
    const comps: any[] = j.result?.address_components || [];
    const get = (type: string) =>
      comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.long_name || "";

    const route = get("route");
    const number = get("street_number");
    const npa = get("postal_code");
    const localite = get("locality") || get("postal_town") || "";
    const adresse = [route, number].filter(Boolean).join(" ");

    return NextResponse.json({ adresse, npa, localite });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur Google" }, { status: 502 });
  }
}
