// app/lib/server/requireAuth.ts
//
// Vérifie le jeton Firebase (ID token) de l'appelant pour les routes API.
// Lève "UNAUTHENTICATED" si le jeton est absent ou invalide.

import { authAdmin } from "@/lib/firebase/admin";

export async function requireAuth(req: Request): Promise<{ uid: string }> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");

  const decoded = await authAdmin.verifyIdToken(token);
  return { uid: decoded.uid };
}
