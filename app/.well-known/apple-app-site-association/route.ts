// app/.well-known/apple-app-site-association/route.ts
//
// Apple App Site Association (AASA) — active les Universal Links pour l'app iOS.
// Servi sur https://app.creditx.ch/.well-known/apple-app-site-association
// (JSON, sans extension, Content-Type application/json, PAS de redirection).
//
// appID = <TeamID>.<BundleID>. Team OrderNow Sàrl (728HA9R48A), bundle ch.creditx.CreditX.
// Chemin capté par l'app : /invite/couple (lien d'invitation conjoint).

import { NextResponse } from "next/server";

export const dynamic = "force-static";

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "728HA9R48A.ch.creditx.CreditX",
        paths: ["/invite/couple", "/invite/couple/*"],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: { "Content-Type": "application/json" },
  });
}
