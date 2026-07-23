// app/lib/server/requireInternal.ts
//
// Garde d'accès BACK-OFFICE pour les routes API : n'autorise que les
// collaborateurs internes CreditX. Extrait ici pour cesser d'en dupliquer la
// logique dans chaque route admin (elle vivait copiée-collée un peu partout).
//
// Même définition du « nous » que firestore.rules → isInternal().

import { authAdmin } from "@/lib/firebase/admin";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

export function isInternalDecoded(decoded: { email?: string; uid?: string } | null | undefined): boolean {
  const email = (decoded?.email || "").toLowerCase();
  const uid = decoded?.uid;
  return (
    (!!uid && INTERNAL_UIDS.has(uid)) ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  );
}

/** Vérifie le jeton et le rôle interne. Lève UNAUTHENTICATED / FORBIDDEN. */
export async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await authAdmin.verifyIdToken(token);
  if (!isInternalDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}
