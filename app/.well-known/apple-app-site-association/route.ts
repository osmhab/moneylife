// app/.well-known/apple-app-site-association/route.ts
//
// Apple App Site Association (AASA) — active les Universal Links pour l'app iOS.
// Servi sur https://creditx.ch/.well-known/apple-app-site-association
// (JSON, sans extension, Content-Type application/json, PAS de redirection).
//
// ⚠️ DOMAINE : creditx.ch, PAS app.creditx.ch. C'est le domaine qui résout et
// que les e-mails utilisent (NEXT_PUBLIC_APP_URL). L'entitlement iOS a été
// aligné dessus (applinks:creditx.ch) — les deux DOIVENT rester cohérents,
// sinon aucun Universal Link ne s'ouvre dans l'app.
//
// appID = <TeamID>.<BundleID>. Team CreditX Sàrl (ex-OrderNow Sàrl, 728HA9R48A),
// bundle ch.creditx.CreditX. Le Team ID ne change PAS avec la raison sociale.
// Chemins captés :
//   - /invite/couple        → invitation conjoint ;
//   - /{fr,de}/dashboard/*   → boutons des e-mails (routés vers la bonne page).
// Les routes du site sont prefixees par la locale (pas de middleware next-intl),
// d'ou les variantes /fr et /de.

import { NextResponse } from "next/server";

export const dynamic = "force-static";

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "728HA9R48A.ch.creditx.CreditX",
        paths: [
          "/invite/couple",
          "/invite/couple/*",
          "/dashboard/*",
          "/fr/dashboard/*",
          "/de/dashboard/*",
        ],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: { "Content-Type": "application/json" },
  });
}
