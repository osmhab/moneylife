import sgMail from "@sendgrid/mail";

let _isReady = false;

function ensureSendgrid() {
  if (_isReady) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY");
  sgMail.setApiKey(apiKey);
  _isReady = true;
}

function appUrl() {
  const v = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!v) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  return v.replace(/\/$/, "");
}

function logoUrl() {
  return (process.env.MONEYLIFE_EMAIL_LOGO_URL || "").trim() || null;
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  requestId?: string | null;
}) {
  const logo = logoUrl();

  return `
  <div style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      
      ${logo ? `
        <div style="text-align:center; margin-bottom:24px;">
          <img src="${logo}" alt="MoneyLife" width="180" style="display:inline-block; border:0; outline:none; text-decoration:none;"/>
        </div>
      ` : ''}

      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);">
        <div style="padding:32px;line-height:1.6;color:#0f172a;">
          <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0030A8;">
            ${escapeHtml(opts.title)}
          </h2>

          <div style="font-size:15px; color:#334155;">
            ${opts.bodyHtml}
          </div>

          <div style="margin:28px 0;">
            <a href="${opts.ctaUrl}"
               style="display:inline-block;background:#0030A8;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:16px;">
              ${escapeHtml(opts.ctaLabel)}
            </a>
          </div>

          ${
            opts.requestId
              ? `<p style="margin:24px 0 0 0;font-size:12px;color:#64748b;border-top:1px solid #f1f5f9;padding-top:20px;">
                   Référence dossier : <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas;font-weight:600;">${escapeHtml(
                     opts.requestId
                   )}</span>
                 </p>`
              : ""
          }

          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
            <span style="word-break:break-all;color:#64748b;">${opts.ctaUrl}</span>
          </p>
        </div>

        <div style="border-top:1px solid #e5e7eb;background:#fcfcfd;">
          <div style="padding:24px 32px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#64748b;font-size:12px;line-height:1.5;">
            <div style="margin:0;">
              <strong style="color:#334155;">MoneyLife.ch</strong> – CreditX Sàrl<br/>
              Place de l'Aubade 3, 1950 Sion, Suisse<br/>
              Agréé FINMA n° F01536084<br/>
              <span style="color:#94a3b8;">Cet email est un message transactionnel sécurisé.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ✅ 1) OFFRES DISPONIBLES
export async function sendOffersReadyEmail(params: {
  to: string;
  clientName?: string | null;
  requestId: string;
  offersCount: number;
}) {
  ensureSendgrid();
  const from = process.env.SENDGRID_FROM || "info@moneylife.ch";
  const replyTo = process.env.SENDGRID_REPLY_TO || from;
  const base = appUrl();
  const link = `${base}/dashboard/offres`;
  const firstName = (params.clientName || "").trim().split(" ")[0] || "Bonjour";
  const subject = "Vos offres MoneyLife sont disponibles";
  const safeCount = Number.isFinite(params.offersCount) ? params.offersCount : 0;

  const bodyHtml = `
    <p style="margin:0 0 14px 0;">Nous avons déposé <strong>${safeCount}</strong> offre(s) dans votre espace MoneyLife suite à votre demande.</p>
    <p style="margin:0;">Pour les consulter, cliquez sur le bouton ci-dessous :</p>
  `;

  const html = renderShell({
    title: `${firstName}, vos offres sont disponibles`,
    bodyHtml,
    ctaLabel: "Accéder à mes offres",
    ctaUrl: link,
    requestId: params.requestId,
  });

  const text = `${firstName}, vos offres MoneyLife sont disponibles.\nAccéder à mes offres : ${link}\nRéf: ${params.requestId}`;
  const [res] = await sgMail.send({ to: params.to, from, replyTo, subject, text, html });
  return { status: res?.statusCode ?? null, messageId: (res?.headers?.["x-message-id"] as string | undefined) ?? null };
}

// ✅ 2) CHANGEMENT SOUSCRIPTION (REFUS / CONTRAINTE)
export async function sendUnderwritingUpdateEmail(params: {
  to: string;
  clientName?: string | null;
  requestId: string;
  offerNumber?: string | null;
}) {
  ensureSendgrid();
  const from = process.env.SENDGRID_FROM || "info@moneylife.ch";
  const replyTo = process.env.SENDGRID_REPLY_TO || from;
  const base = appUrl();
  const link = `${base}/dashboard/offres`;
  const firstName = (params.clientName || "").trim().split(" ")[0] || "Bonjour";
  const offerLabel = params.offerNumber ? ` (${escapeHtml(params.offerNumber)})` : "";
  const subject = `Réponse concernant votre offre${params.offerNumber ? ` (${params.offerNumber})` : ""}`;

  const bodyHtml = `<p style="margin:0;">Une réponse concernant votre offre${offerLabel} est disponible dans votre espace.</p>`;

  const html = renderShell({
    title: `${firstName}, vous avez reçu une réponse`,
    bodyHtml,
    ctaLabel: "Voir la réponse",
    ctaUrl: link,
    requestId: params.requestId,
  });

  const [res] = await sgMail.send({ to: params.to, from, replyTo, subject, text: subject, html });
  return { status: res?.statusCode ?? null };
}

// ✅ 3) ACCEPTATION
export async function sendOfferAcceptedEmail(params: {
  to: string;
  clientName?: string | null;
  requestId: string;
  offerNumber?: string | null;
}) {
  ensureSendgrid();
  const from = process.env.SENDGRID_FROM || "info@moneylife.ch";
  const replyTo = process.env.SENDGRID_REPLY_TO || from;
  const base = appUrl();
  const link = `${base}/dashboard/offre`;
  const firstName = (params.clientName || "").trim().split(" ")[0] || "Bonjour";
  const subject = `Offre ${params.offerNumber || ""} acceptée`;

  const bodyHtml = `<p style="margin:0;">Votre offre a été acceptée. Veuillez finaliser le processus depuis votre espace.</p>`;

  const html = renderShell({
    title: `${firstName}, votre offre a été acceptée`,
    bodyHtml,
    ctaLabel: "Accéder à mon offre",
    ctaUrl: link,
    requestId: params.requestId,
  });

  await sgMail.send({ to: params.to, from, replyTo, subject, text: subject, html });
}

// ✅ 4) FACTURE ENVOYÉE
export async function sendInvoiceReadyEmail(params: {
  to: string;
  clientName?: string | null;
  requestId: string;
}) {
  ensureSendgrid();
  const from = process.env.SENDGRID_FROM || "info@moneylife.ch";
  const replyTo = process.env.SENDGRID_REPLY_TO || from;
  const base = appUrl();
  const link = `${base}/dashboard/offres`;
  const firstName = (params.clientName || "").trim().split(" ")[0] || "Bonjour";
  const subject = "Votre facture est arrivée";

  const bodyHtml = `<p style="margin:0;">Votre facture est maintenant disponible dans votre espace MoneyLife.</p>`;

  const html = renderShell({
    title: `${firstName}, votre facture est disponible`,
    bodyHtml,
    ctaLabel: "Accéder à ma facture",
    ctaUrl: link,
    requestId: params.requestId,
  });

  await sgMail.send({ to: params.to, from, replyTo, subject, text: subject, html });
}

// ✅ 5) SIGNATURE LETTRE DE TRANSFERT
export async function sendTransferSignatureRequestEmail(params: {
  to: string;
  clientName?: string | null;
  oldInstitution: string;
  contractNumber: string;
  token: string;
}) {
  ensureSendgrid();

  // --- MODIFICATION ICI ---
  // On sépare l'email et le nom pour l'affichage
  const fromEmail = process.env.SENDGRID_FROM || "info@moneylife.ch";
  
  const from = {
    email: fromEmail,      // L'adresse réelle (info@moneylife.ch)
    name: "Habib de MoneyLife" // Le nom qui s'affiche dans la boîte de réception du client
  };
  // ------------------------

  const replyTo = process.env.SENDGRID_REPLY_TO || fromEmail;
  const base = appUrl();
  const link = `${base}/sign/${params.token}`;
  
  // Petite amélioration : on gère le cas où clientName est null/undefined
  const rawName = params.clientName || ""; 
  const firstName = rawName.trim().split(" ")[0] || "Client"; // Fallback sur "Client" si pas de prénom
  
  const subject = `Résiliation de votre contrat de 3e pilier ${params.oldInstitution}`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0;">Bonjour ${firstName},</p>
    <p style="margin:0 0 14px 0;">Votre conseiller a préparé votre lettre de résiliation de votre contrat chez <strong>${escapeHtml(params.oldInstitution)}</strong> (n° ${escapeHtml(params.contractNumber)}).</p>
    <div style="background:#f1f5f9; border-radius:12px; padding:20px; margin:18px 0; border:1px solid #e2e8f0;">
      <p style="margin:0; font-size:14px; color:#475569;">
        <strong>Action requise :</strong> Veuillez vérifier les informations et apposer votre signature électronique pour valider la demande de transfert.
      </p>
    </div>
    <p style="margin:0;">Pour accéder au document et signer, cliquez sur le bouton ci-dessous :</p>
  `;

  const html = renderShell({
    title: `Résiliez votre contrat chez ${params.oldInstitution} `,
    bodyHtml,
    ctaLabel: "Vérifier et signer",
    ctaUrl: link,
  });

  // SendGrid accepte l'objet 'from' que nous avons créé plus haut
  const [res] = await sgMail.send({ to: params.to, from, replyTo, subject, text: subject, html });
  return { status: res?.statusCode ?? null };
}