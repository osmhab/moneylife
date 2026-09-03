// app/lib/server/requireInternal.ts
//
// Garde d'accès COLLABORATEUR pour les routes serveur de l'outil conseiller.
// Un utilisateur est « interne » si son e-mail Firebase est @creditx.ch /
// @moneylife.ch, ou si son UID figure dans la liste. Même politique que les
// routes /api/admin/clients/* (qui ré-implémentent le même helper en local) ;
// on centralise ici pour les nouvelles routes de l'outil conseiller.
//
// ⚠️ Vérifier le seul jeton NE SUFFIT PAS : un compte client authentifié passe.
// /api/admin/clients/overview a longtemps eu ce défaut ; elle utilise désormais
// cette garde. Toute nouvelle route de l'outil conseiller doit faire de même.

import { authAdmin } from "@/lib/firebase/admin";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

export function isInternalDecoded(decoded: any): boolean {
  const email = (decoded?.email || "").toLowerCase();
  return (
    INTERNAL_UIDS.has(decoded?.uid) ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  );
}

/** Vérifie le Bearer token et l'appartenance interne. Throw "UNAUTHENTICATED" | "FORBIDDEN". */
export async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await authAdmin.verifyIdToken(token);
  if (!isInternalDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}
