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

/**
 * Base URL publique pour les liens des e-mails : on suit le domaine de la
 * requête entrante (ex. creditx.ch via le tunnel) — robuste sans dépendre d'une
 * variable d'env qui pourrait valoir localhost. Repli sur NEXT_PUBLIC_APP_URL.
 */
export function baseUrlFromRequest(req: Request): string {
  const h = (k: string) => req.headers.get(k) || "";
  const host = h("x-forwarded-host") || h("host");
  const proto = h("x-forwarded-proto") || "https";
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "https://creditx.ch").replace(/\/$/, "");
}

/** Masque un e-mail pour l'affichage : j***n@gmail.com. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email).split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : "";
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}${tail}@${domain}`;
}

/** Normalise un numéro vers le format E.164 (+41…). null si invalide. Défaut Suisse. */
export function normalizePhone(raw: string): string | null {
  let s = String(raw).replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0")) s = "+41" + s.slice(1); // numéro local suisse
  else if (!s.startsWith("+")) s = "+" + s;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

/** Masque un numéro pour l'affichage : +41 •• •• 67. */
export function maskPhone(p: string): string {
  const s = String(p);
  if (s.length < 5) return "•••";
  return `${s.slice(0, 3)}${"•".repeat(Math.max(2, s.length - 5))}${s.slice(-2)}`;
}
