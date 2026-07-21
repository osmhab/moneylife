import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

type Body = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  company?: string;
  phone?: string;
};

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function getClientIp(req: Request) {
  // Cloud Run / Vercel / proxies
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// mini anti-spam (mémoire processus) : suffisant pour un premier jet
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const curr = RATE_LIMIT.get(key);
  if (!curr || now > curr.resetAt) {
    RATE_LIMIT.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (curr.count >= limit) return { ok: false, remaining: 0 };
  curr.count += 1;
  RATE_LIMIT.set(key, curr);
  return { ok: true, remaining: Math.max(0, limit - curr.count) };
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Trop de messages envoyés. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Body;

    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim();
    const subject = (body.subject ?? "").trim();
    const message = (body.message ?? "").trim();
    const company = (body.company ?? "").trim();
    const phone = (body.phone ?? "").trim();

    if (name.length < 2) {
      return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
    }
    if (!isEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }
    if (subject.length < 3) {
      return NextResponse.json({ error: "Sujet invalide." }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json({ error: "Message trop court." }, { status: 400 });
    }

    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (!SENDGRID_API_KEY) {
      return NextResponse.json(
        { error: "Configuration email manquante (SENDGRID_API_KEY)." },
        { status: 500 }
      );
    }

    // Mise à jour des variables de fallback vers CreditX
    const toEmail = process.env.CONTACT_TO_EMAIL || "info@creditx.ch";
    const fromEmail = process.env.CONTACT_FROM_EMAIL || "no-reply@creditx.ch";
    const fromName = process.env.CONTACT_FROM_NAME || "CreditX";

    sgMail.setApiKey(SENDGRID_API_KEY);

    // Mise à jour de l'objet du mail
    const safeSubject = `[Contact CreditX] ${subject}`;

    const details = [
      `Nom: ${name}`,
      `Email: ${email}`,
      company ? `Société: ${company}` : null,
      phone ? `Téléphone: ${phone}` : null,
      `IP: ${ip}`,
      `Date: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const text = `${details}\n\n---\n\n${message}\n`;

    await sgMail.send({
      to: toEmail,
      from: { email: fromEmail, name: fromName },
      subject: safeSubject,
      text,
      replyTo: { email, name },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Ne pas leak d'info SendGrid
    return NextResponse.json({ error: "Erreur serveur lors de l’envoi." }, { status: 500 });
  }
}