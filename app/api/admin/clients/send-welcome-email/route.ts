//app/api/admin/clients/send-welcome-email/route.ts
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
  firstName?: string;
  loginUrl?: string;      // ex: https://moneylife.ch/login
  resetLink?: string;     // optionnel: si tu veux inclure le lien reset aussi
};

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);

    const body = (await req.json()) as Body;
    const toEmail = (body?.toEmail || "").trim().toLowerCase();
    const firstName = (body?.firstName || "").trim();
    const loginUrl = (body?.loginUrl || "").trim();
    const resetLink = (body?.resetLink || "").trim();

    if (!toEmail) return NextResponse.json({ error: "Missing toEmail" }, { status: 400 });

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

    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL ||
      process.env.SENDGRID_FROM ||
      "offers@moneylife.ch";

    sgMail.setApiKey(apiKey);

    const subject = "Bienvenue sur MoneyLife — vos prochaines étapes";

    const greet = firstName ? `Bonjour ${firstName},` : "Bonjour,";
    const safeLoginUrl = loginUrl || "https://moneylife.ch/login";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.55; color:#0b1220;">
        <h2 style="margin:0 0 12px 0;">${greet}</h2>

        <p style="margin:0 0 12px 0;">
          Votre espace MoneyLife est prêt. Voici les prochaines étapes pour recevoir des offres 3a rapidement.
        </p>

        <ol style="margin:12px 0 18px 18px; padding:0;">
          <li><b>Connectez-vous</b> à votre espace client</li>
          <li><b>Complétez vos données</b> (état civil, salaire, LPP…)</li>
          <li><b>Scannez votre certificat LPP</b> (si disponible) pour une analyse plus précise</li>
          <li><b>Configurez votre 3a</b> (épargne + protections) puis <b>demandez vos offres</b></li>
        </ol>

        <p style="margin:16px 0;">
          <a href="${safeLoginUrl}"
             style="display:inline-block; background:#0030A8; color:#ffffff; text-decoration:none; padding:12px 16px; border-radius:12px;">
            Accéder à mon espace MoneyLife
          </a>
        </p>

        ${
          resetLink
            ? `
            <div style="margin:18px 0; padding:12px 14px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc;">
              <div style="font-weight:bold; margin-bottom:6px;">Définir votre mot de passe</div>
              <div style="font-size:13px; color:#334155;">
                Si vous n’avez pas encore défini votre mot de passe, utilisez ce lien sécurisé :
              </div>
              <div style="margin-top:8px;">
                <a href="${resetLink}" style="color:#0030A8; word-break:break-all;">${resetLink}</a>
              </div>
            </div>
          `
            : ""
        }

        <p style="margin:16px 0 0 0; font-size:12px; color:#64748b;">
          Si vous avez une question, répondez simplement à cet email.
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
  action: "client.welcome_email_sent",
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