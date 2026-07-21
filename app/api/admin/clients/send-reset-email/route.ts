import { NextResponse } from "next/server";
import { authAdmin } from "app/lib/firebase/admin";
import sgMail from "@sendgrid/mail";
import { writeAdminAudit } from "app/lib/audit/adminAudit";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

function isInternalDecoded(decoded: any) {
  const email = (decoded?.email || "").toLowerCase();
  const uid = decoded?.uid;

  return (
    INTERNAL_UIDS.has(uid) ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  );
}

async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");

  const decoded = await authAdmin.verifyIdToken(token);
  if (!isInternalDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}

type Body = {
  toEmail: string;
  resetLink: string;
  firstName?: string;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);

    const body = (await req.json()) as Body;
    const toEmail = (body?.toEmail || "").trim().toLowerCase();
    const resetLink = (body?.resetLink || "").trim();
    const firstName = (body?.firstName || "").trim();

    if (!toEmail) return NextResponse.json({ error: "Missing toEmail" }, { status: 400 });
    if (!resetLink) return NextResponse.json({ error: "Missing resetLink" }, { status: 400 });

    const apiKey =
      process.env.SENDGRID_API_KEY ||
      process.env.SENDGRID_KEY ||
      process.env.SENDGRID_APIKEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing SendGrid API key env (SENDGRID_API_KEY)" },
        { status: 500 }
      );
    }

    // From: idéalement définis ça dans env.prod.yaml / Cloud Run
    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL ||
      process.env.SENDGRID_FROM ||
      "offers@moneylife.ch";

    sgMail.setApiKey(apiKey);

    const subject = "MoneyLife — Définissez votre mot de passe";
    const greet = firstName ? `Bonjour ${firstName},` : "Bonjour,";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.5; color:#0b1220;">
        <h2 style="margin:0 0 12px 0;">${greet}</h2>
        <p style="margin:0 0 12px 0;">
          Voici votre lien sécurisé pour définir votre mot de passe MoneyLife.
        </p>
        <p style="margin:16px 0;">
          <a href="${resetLink}"
             style="display:inline-block; background:#0030A8; color:#ffffff; text-decoration:none; padding:12px 16px; border-radius:12px;">
            Définir mon mot de passe
          </a>
        </p>
        <p style="margin:16px 0 0 0; font-size:12px; color:#475569;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :
        </p>
        <p style="margin:6px 0 0 0; font-size:12px; color:#475569; word-break:break-all;">
          ${resetLink}
        </p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />
        <p style="margin:0; font-size:12px; color:#64748b;">
          MoneyLife.ch — Assistance : offers@moneylife.ch
        </p>
      </div>
    `;

    await sgMail.send({
  to: toEmail,
  from: fromEmail,
  subject,
  html,
});

await writeAdminAudit({
  action: "client.reset_email_sent",
  actor: { uid: decoded.uid, email: decoded.email || null },
  target: { clientEmail: toEmail },
});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const code =
      msg === "UNAUTHENTICATED" ? 401 :
      msg === "FORBIDDEN" ? 403 : 500;

    return NextResponse.json({ error: msg }, { status: code });
  }
}