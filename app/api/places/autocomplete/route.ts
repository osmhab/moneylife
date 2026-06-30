// app/api/places/autocomplete/route.ts
//
// Proxy d'autocomplétion d'adresse (Google Places) — la clé reste CÔTÉ SERVEUR.
// Consommé par l'app iOS (champ adresse des données personnelles). Restreint à la
// Suisse, types adresse. Authentifié (jeton Firebase).

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { input } = await req.json().catch(() => ({ input: "" }));
  const q = String(input || "").trim();
  if (q.length < 3) return NextResponse.json({ predictions: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "Clé Google manquante" }, { status: 500 });

  const url =
    "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
    `?input=${encodeURIComponent(q)}` +
    "&components=country:ch&types=address&language=fr" +
    `&key=${key}`;

  try {
    const r = await fetch(url);
    const j = await r.json();
    const predictions = (j.predictions || []).slice(0, 6).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
    }));
    return NextResponse.json({ predictions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur Google", predictions: [] }, { status: 502 });
  }
}
