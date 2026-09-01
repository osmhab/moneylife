// app/lib/server/requireOwner.ts
//
// Garde d'accès PROPRIÉTAIRE, au-dessus de `requireInternal`.
//
// Pourquoi une deuxième garde
// ---------------------------
// `requireInternal` ouvre l'accès à tout compte @creditx.ch / @moneylife.ch —
// donc à tout collaborateur, présent et futur. Certaines actions ne sont pas de
// l'usage mais du PARAMÉTRAGE : ce que contient la bibliothèque d'images, quel
// jeu de visuels part par défaut dans tous les dossiers clients. Un conseiller
// recruté demain doit pouvoir s'en servir, pas le redéfinir.
//
// Étape suivante (à faire au moment de recruter) : remplacer cette liste par de
// vrais RÔLES portés par des custom claims Firebase (`owner`, `advisor`,
// `backoffice`…), attribués depuis un écran d'administration. La forme de
// l'appel ci-dessous ne changera pas — seule l'implémentation de `isOwner`.
// Tant qu'il n'y a qu'une personne concernée, une liste explicite est plus sûre
// qu'un système de rôles à moitié construit.

import { requireInternal } from "./requireInternal";

/** Comptes autorisés à modifier le paramétrage. */
const OWNER_EMAILS = new Set(["habib.osmani@creditx.ch"]);
const OWNER_UIDS = new Set(["3gs6ZKCkw5eULYtM65Ko0Pba8wJ2"]);

export function isOwnerDecoded(decoded: any): boolean {
  const email = String(decoded?.email || "").toLowerCase();
  return OWNER_UIDS.has(decoded?.uid) || OWNER_EMAILS.has(email);
}

/**
 * Vérifie le jeton, l'appartenance interne PUIS la qualité de propriétaire.
 * Throw "UNAUTHENTICATED" | "FORBIDDEN", comme `requireInternal`, pour que les
 * routes traitent les deux gardes de la même façon.
 */
export async function requireOwner(req: Request) {
  const decoded = await requireInternal(req);
  if (!isOwnerDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}
