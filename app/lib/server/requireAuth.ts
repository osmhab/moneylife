// app/lib/server/requireAuth.ts
//
// Vérifie le jeton Firebase (ID token) de l'appelant pour les routes API.
// Lève "UNAUTHENTICATED" si le jeton est absent ou invalide.
//
// Renvoie aussi l'E-MAIL confirmé par Google. C'est ce qui permet aux routes
// d'e-mail transactionnel de ne plus jamais prendre le destinataire dans le
// corps de la requête : un utilisateur ne peut s'écrire qu'à lui-même.

import { authAdmin } from "@/lib/firebase/admin";

export async function requireAuth(req: Request): Promise<{ uid: string; email: string | null }> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");

  const decoded = await authAdmin.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}
