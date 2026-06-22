// app/lib/server/share.ts
//
// Helpers du partage sécurisé de documents (page d'accès + OTP).

import crypto from "crypto";

/** Code OTP à 6 chiffres. */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Empreinte HMAC de l'OTP (on ne stocke jamais le code en clair). */
export function hashOtp(shareId: string, code: string): string {
  const secret = process.env.SHARE_OTP_SECRET || process.env.SENDGRID_API_KEY || "creditx-share-secret";
  return crypto.createHmac("sha256", secret).update(`${shareId}:${code}`).digest("hex");
}

/** Jeton de session opaque (accès aux fichiers après vérification du code). */
export function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Extrait le chemin Storage (`clients/.../fichier.pdf`) d'une URL de
 * téléchargement Firebase. Permet de partager un doc dont on n'a que l'URL.
 */
export function storagePathFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/o\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* pas une URL absolue */
  }
  return null;
}

/** Masque un e-mail pour l'affichage : j***n@gmail.com. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email).split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : "";
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}${tail}@${domain}`;
}
