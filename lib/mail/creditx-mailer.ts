//lib/mail/creditx-mailer.ts
import sgMail from "@sendgrid/mail";
import { getTranslations } from "next-intl/server";

let _isReady = false;

function ensureSendgrid() {
  if (_isReady) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY");
  sgMail.setApiKey(apiKey);
  _isReady = true;
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.creditx.ch").replace(/\/$/, "");
}

function logoUrl() {
  return process.env.CREDITX_EMAIL_LOGO_URL || "https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"; 
}

function escapeHtml(s: string) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/**
 * SHELL CREDITX : Design institutionnel Noir & Blanc
 */
function renderCreditXShell(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  requestId?: string | null;
}) {
  const logo = logoUrl();

  return `
  <div style="margin:0;padding:0;background:#ffffff;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
      
      <div style="margin-bottom:48px;">
        <img src="${logo}" alt="CreditX" width="140" style="display:block; border:0; outline:none;"/>
      </div>

      <div style="line-height:1.6; color:#1A1A1A;">
        <h1 style="margin:0 0 24px 0; font-size:24px; font-weight:900; letter-spacing:-0.02em; text-transform:uppercase;">
          ${escapeHtml(opts.title)}
        </h1>

        <div style="font-size:16px; color:#4A4A4A; margin-bottom:32px;">
          ${opts.bodyHtml}
        </div>

        <div style="margin:40px 0;">
          <a href="${opts.ctaUrl}"
             style="display:inline-block; background:#000000; color:#ffffff; text-decoration:none; padding:18px 36px; border-radius:40px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">
            ${escapeHtml(opts.ctaLabel)}
          </a>
        </div>

        ${opts.requestId ? `
          <p style="margin-top:48px; font-size:11px; color:#A0A0A0; letter-spacing:0.05em; border-top:1px solid #F0F0F0; padding-top:24px;">
            Référence Dossier : <strong>${escapeHtml(opts.requestId)}</strong>
          </p>
        ` : ""}
      </div>

      <div style="margin-top:64px; border-top:1px solid #F0F0F0; padding-top:32px; font-size:12px; color:#A0A0A0; line-height:1.8;">
        <p style="margin:0;">
          <strong>CreditX Sàrl</strong><br/>
          Cour de Gare<br/>
          Place de l'Aubade 3, 1950 Sion, Suisse<br/>
          Agréé FINMA n° F01536084<br/>
          <span style="color:#D0D0D0;">Ce message est une notification transactionnelle sécurisée.</span>
        </p>
      </div>
    </div>
  </div>`;
}

// ── Partage sécurisé de documents ──────────────────────────────

/** Invitation : "X souhaite partager des documents avec vous" + lien vers la page d'accès. */
export async function sendShareInvitationEmail(params: {
  to: string; senderName: string; count: number; shareUrl: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const docWord = params.count > 1 ? `${params.count} documents` : "un document";
  const bodyHtml = `
    <p><strong>${escapeHtml(params.senderName)}</strong> souhaite partager ${docWord} avec vous, en toute sécurité via CreditX.</p>
    <p>Pour les consulter, cliquez ci-dessous : un code de vérification à 6 chiffres vous sera envoyé pour confirmer votre accès.</p>
  `;
  const html = renderCreditXShell({
    title: "Documents partagés avec vous",
    bodyHtml,
    ctaLabel: "Accéder aux documents",
    ctaUrl: params.shareUrl,
  });
  await sgMail.send({
    to: params.to, from,
    subject: `${params.senderName} a partagé ${docWord} avec vous`,
    html,
    text: `${params.senderName} a partagé ${docWord} avec vous : ${params.shareUrl}`,
  });
}

/** Code OTP à 6 chiffres pour débloquer l'accès aux documents. */
export async function sendShareCodeEmail(params: { to: string; code: string; shareUrl: string }) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const bodyHtml = `
    <p>Voici votre code de vérification pour accéder aux documents partagés :</p>
    <div style="margin:32px 0; text-align:center;">
      <span style="display:inline-block; font-size:38px; font-weight:900; letter-spacing:10px; color:#1A1A1A; background:#F5F5F7; padding:18px 28px; border-radius:14px;">${escapeHtml(params.code)}</span>
    </div>
    <p style="color:#A0A0A0; font-size:14px;">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
  `;
  const html = renderCreditXShell({
    title: "Votre code de vérification",
    bodyHtml,
    ctaLabel: "Retour à la page",
    ctaUrl: params.shareUrl,
  });
  await sgMail.send({
    to: params.to, from,
    subject: `Votre code CreditX : ${params.code}`,
    html,
    text: `Votre code de vérification CreditX : ${params.code} (valable 15 minutes).`,
  });
}

// ✅ 1) CONFIRMATION CLIENT
export async function sendCreditXConfirmationEmail(params: {
  to: string;
  firstName: string;
  recommendation: string;
  monthlyTotal: number;
  details: any;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.Confirmation" });
  
  const subject = t("subject");
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-CH' : 'de-CH');

  let detailsHtml = `
  <table style="width:100%; font-size:14px; border-collapse: collapse; margin-top: 10px;">
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 0; color:#4A4A4A;">${t("row_saving")}</td>
      <td style="padding:12px 0; text-align:right; color:#1A1A1A;"><strong>${fmt.format(params.details?.epargne?.montant || 0)} CHF</strong></td>
    </tr>
  `;

  if (params.details?.deces?.prix > 0) {
    detailsHtml += `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 0; color:#4A4A4A;">${t("row_death")}</td>
      <td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(params.details.deces.prix)} CHF</td>
    </tr>`;
  }

  if (params.details?.invalidite?.prix > 0) {
    detailsHtml += `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 0; color:#4A4A4A;">${t("row_invalidity")}</td>
      <td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(params.details.invalidite.prix)} CHF</td>
    </tr>`;
  }

  if (params.details?.liberation?.prix > 0) {
    detailsHtml += `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 0; color:#4A4A4A;">${t("row_waiver")}</td>
      <td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(params.details.liberation.prix)} CHF</td>
    </tr>`;
  }

  detailsHtml += `
    <tr style="background:#f8fafc;">
      <td style="padding:16px 10px; font-weight:900; text-transform:uppercase; font-size:15px; border-radius: 8px 0 0 8px;">${t("row_total")}</td>
      <td style="padding:16px 10px; text-align:right; font-weight:900; font-size:18px; color:#1A1A1A; border-radius: 0 8px 8px 0;">${fmt.format(params.monthlyTotal)} CHF</td>
    </tr>
  </table>`;

  const bodyHtml = `
    <p>${t("greeting", { firstName: escapeHtml(params.firstName) })}</p>
    <p>${t("intro_1")}</p>
    <p>${t("intro_2")}</p>
    
    <div style="background:#ffffff; padding:24px; border-radius:12px; margin:32px 0; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <h3 style="margin:0 0 16px 0; font-size:12px; text-transform:uppercase; color:#64748b; letter-spacing:0.05em;">${t("summary_title")}</h3>
      ${detailsHtml}
    </div>

    <p style="font-size:11px; color:#A0A0A0; margin-top: 10px; line-height: 1.5;">
      <em>* ${t("disclaimer")}</em>
    </p>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}

// ✅ 2) ALERTE COLLABORATEUR (ADMIN) - Reste en français
export async function sendCreditXAdminAlert(params: {
  client: any;
  selection: any;
  sante: any;
  benchmarks: any;
  requestId: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX Intelligence" };
  const to = "info@creditx.ch";
  const subject = `⚡ NOUVEAU LEAD : ${params.client.firstName} ${params.client.lastName}`;

  const d = params.selection.details;
  const fmt = new Intl.NumberFormat('fr-CH');

  const bodyHtml = `
    <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px; border:1px solid #e2e8f0;">
      <h3 style="margin:0 0 10px 0; font-size:11px; text-transform:uppercase; color:#64748b; letter-spacing:0.05em;">👤 Identité Client</h3>
      <p style="margin:2px 0;"><strong>Nom :</strong> ${escapeHtml(params.client.firstName)} ${escapeHtml(params.client.lastName)}</p>
      <p style="margin:2px 0;"><strong>Tel :</strong> ${escapeHtml(params.client.phone)}</p>
      <p style="margin:2px 0;"><strong>Email :</strong> ${escapeHtml(params.client.email)}</p>
      <p style="margin:2px 0;"><strong>Job :</strong> ${escapeHtml(params.client.profession)}</p>
    </div>

    <div style="background:#ffffff; padding:20px; border-radius:12px; margin-bottom:20px; border:2px solid #000000;">
      <h3 style="margin:0 0 15px 0; font-size:11px; text-transform:uppercase; color:#000000; letter-spacing:0.05em;">⚖️ Analyse Technique</h3>
      
      <table style="width:100%; font-size:13px; border-collapse: collapse;">
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;"><strong>Épargne</strong><br/><small style="color:#64748b;">${d?.epargne?.compagnie !== "Non désiré" ? (d?.epargne?.compagnie || 'Non spécifié') : 'Refusé par le client'}</small></td>
          <td style="padding:8px 0; text-align:right;">
            ${d?.epargne?.compagnie === "Non désiré" ? '<strong style="color:#dc2626;">Non désiré</strong>' : `<strong>${fmt.format(d?.epargne?.montant || 0)}.- /m</strong>`}
          </td>
        </tr>
        
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">Décès (Lacune: ${fmt.format(d?.deces?.lacune || 0)}.-)<br/><small style="color:#64748b;">${d?.deces?.compagnie !== "Non désiré" ? (d?.deces?.compagnie || 'N/A') : 'Refusé par le client'}</small></td>
          <td style="padding:8px 0; text-align:right;">
            ${d?.deces?.compagnie === "Non désiré" ? '<strong style="color:#dc2626;">Non désiré</strong>' : `${fmt.format(d?.deces?.prix || 0)}.- /m`}
          </td>
        </tr>

        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">
            Invalidité (IG Maladie: ${fmt.format(d?.invalidite?.lacuneMaladie || 0)}.-)<br/>
            <small style="color:#64748b;">${d?.invalidite?.compagnie !== "Non désiré" ? (d?.invalidite?.compagnie || 'N/A') : 'Refusé par le client'}</small>
          </td>
          <td style="padding:8px 0; text-align:right;">
            ${d?.invalidite?.compagnie === "Non désiré" ? '<strong style="color:#dc2626;">Non désiré</strong>' : `${fmt.format(d?.invalidite?.prix || 0)}.- /m`}
          </td>
        </tr>

        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">Libération du paiement des primes</td>
          <td style="padding:8px 0; text-align:right;">
            ${d?.liberation?.compagnie === "Non désiré" ? '<strong style="color:#dc2626;">Non désiré</strong>' : `${fmt.format(d?.liberation?.prix || 0)}.- /m`}
          </td>
        </tr>

        <tr style="background:#f8fafc;">
          <td style="padding:10px; font-weight:900; text-transform:uppercase;">Mensualité Totale</td>
          <td style="padding:10px; text-align:right; font-weight:900; font-size:16px;">${fmt.format(params.selection.total || 0)} CHF</td>
        </tr>
      </table>
    </div>

    <div style="background:#fff7ed; padding:20px; border-radius:12px; border:1px solid #ffedd5; margin-bottom:20px;">
      <h3 style="margin:0 0 10px 0; font-size:11px; text-transform:uppercase; color:#c2410c; letter-spacing:0.05em;">🩺 Santé</h3>
      <p style="margin:2px 0;"><strong>Fumeur :</strong> ${params.sante?.isSmoker ? 'Oui' : 'Non'}</p>
      <p style="margin:2px 0;"><strong>Morpho :</strong> ${params.sante?.height}cm / ${params.sante?.weight}kg</p>
      <p style="margin:5px 0 0 0; font-weight:bold; color:${params.sante?.healthOk ? '#059669' : '#dc2626'};">
        ${params.sante?.healthOk ? '✅ OK' : '⚠️ ATTENTION : POINTS DE SANTÉ À VÉRIFIER'}
      </p>
    </div>
  `;

  const html = renderCreditXShell({
    title: "Nouveau Dossier Wizard",
    bodyHtml,
    ctaLabel: "Ouvrir dans le Backoffice",
    ctaUrl: `${appUrl()}/admin/offres-wizard`,
    requestId: params.requestId
  });

  await sgMail.send({ to, from, subject, html, text: subject });
}


// ✅ 3) EMAIL OFFRE PRÊTE (CLIENT)
export async function sendCreditXOfferReadyEmail(params: {
  to: string;
  firstName: string;
  plans: Array<{ institutionName: string; price: number }>;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.OfferReady" });
  
  const subject = t("subject");
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-CH' : 'de-CH');

  let plansHtml = `
  <table style="width:100%; font-size:14px; border-collapse: collapse; margin-top: 10px;">
  `;
  params.plans.forEach(plan => {
    plansHtml += `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:16px 0; color:#4A4A4A; font-weight: 600;">${escapeHtml(plan.institutionName)}</td>
      <td style="padding:16px 0; text-align:right; color:#1A1A1A; font-weight: 900; font-size: 16px;">${fmt.format(plan.price)} CHF/m</td>
    </tr>`;
  });
  plansHtml += `</table>`;

  const bodyHtml = `
    <p>${t("greeting", { firstName: escapeHtml(params.firstName) })}</p>
    <p>${t("intro")}</p>
    
    <div style="background:#ffffff; padding:24px; border-radius:12px; margin:32px 0; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <h3 style="margin:0 0 16px 0; font-size:12px; text-transform:uppercase; color:#64748b; letter-spacing:0.05em;">${t("summary_title")}</h3>
      ${plansHtml}
    </div>

    <p>${t("outro")}</p>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance?tab=prive`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}


// ✅ 4) EMAIL MODIFICATION / CONTRE-PROPOSITION COMPAGNIE
export async function sendCreditXOfferModifiedEmail(params: {
  to: string;
  firstName: string;
  institutionName: string;
  newPrice: number;
  explanation: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.OfferModified" });
  
  const subject = t("subject");
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-CH' : 'de-CH');

  const bodyHtml = `
    <p>${t("greeting", { firstName: escapeHtml(params.firstName) })}</p>
    <p>${t("intro", { institutionName: escapeHtml(params.institutionName) })}</p>
    
    <div style="background:#f8fafc; border-left:4px solid #3b82f6; padding:16px; margin:24px 0;">
      <p style="margin:0 0 8px 0; font-size:12px; font-weight:bold; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.05em;">${t("advisor_message_title")}</p>
      <p style="margin:0; font-size:14px; color:#1e293b; font-style:italic;">"${escapeHtml(params.explanation)}"</p>
    </div>

    <div style="background:#fff7ed; padding:24px; border-radius:12px; margin:32px 0; border:1px solid #ffedd5; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <h3 style="margin:0 0 10px 0; font-size:12px; text-transform:uppercase; color:#c2410c; letter-spacing:0.05em;">${t("new_premium_title")}</h3>
      <p style="font-size:24px; font-weight:900; color:#1A1A1A; margin:0;">${fmt.format(params.newPrice)} CHF <span style="font-size:14px; color:#4A4A4A;">/ ${t("per_month")}</span></p>
    </div>

    <p>${t("outro")}</p>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance?tab=prive`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}

// ✅ 5) EMAIL CONTRAT ACTIVÉ (POLICE ÉMISE)
export async function sendCreditXContractActivatedEmail(params: {
  to: string;
  firstName: string;
  institutionName: string;
  numeroPolice: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.ContractActivated" });
  
  const subject = t("subject", { institutionName: params.institutionName });

  const bodyHtml = `
    <p>${t("greeting", { firstName: escapeHtml(params.firstName) })}</p>
    <p>${t("intro", { institutionName: escapeHtml(params.institutionName) })}</p>
    
    <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:16px; margin:24px 0;">
      <p style="margin:0 0 4px 0; font-size:12px; font-weight:bold; color:#166534; text-transform:uppercase; letter-spacing:0.05em;">${t("policy_number_title")}</p>
      <p style="margin:0; font-size:18px; font-weight:900; color:#14532d;">${escapeHtml(params.numeroPolice)}</p>
    </div>

    <h3 style="font-size:14px; color:#1A1A1A; margin-top:32px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">${t("documents_title")}</h3>
    <p>${t("documents_intro")}</p>
    
    <ul style="color:#4A4A4A; line-height:1.6; margin-bottom:32px;">
      <li>${t("doc_1")}</li>
      <li>${t("doc_2")}</li>
      <li>${t("doc_3")}</li>
    </ul>

    <p>${t("payment_instructions")}</p>
    <p>${t("signature")}</p>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance?tab=prive`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}

export async function sendCreditXReviewCompletedEmail(params: {
  to: string;
  firstName: string;
  institutionName: string;
  typeLabel: string;
  locale?: string;
}) {
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.ReviewCompleted" });
  
  const subject = t("subject", { typeLabel: params.typeLabel });

  const msg = {
    to: params.to,
    from: process.env.SENDGRID_FROM || "info@creditx.ch",
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
        <h2 style="color: #0f172a;">${t("greeting", { firstName: escapeHtml(params.firstName) })}</h2>
        <p>${t("intro", { typeLabel: params.typeLabel, institutionName: escapeHtml(params.institutionName) })}</p>
        <p>${t("details")}</p>
        <div style="margin: 32px 0;">
          <a href="${appUrl()}/${locale}/dashboard/prevoyance" 
             style="background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
             ${t("cta_label")}
          </a>
        </div>
        <p style="margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          ${t("signature")}<br>
          ${t("auto_message")}
        </p>
      </div>
    `,
  };

  await sgMail.send(msg);
}

// ✅ 6) EMAIL DE BIENVENUE (STYLE LANDING PAGE AVEC IMAGES + WIDGETS)
export async function sendCreditXWelcomeEmail(params: {
  to: string;
  firstName: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Welcome" });

  const subject = t("subject");
  const logo = logoUrl();
  const baseUrl = appUrl(); // ex: https://app.creditx.ch
  const dashUrl = `${baseUrl}/${locale}/dashboard`;

  // Images dynamiques depuis ton dossier public Next.js
  const imgStep1 = `${baseUrl}/images/simplePhoto.jpg`;
  const imgStep2 = `${baseUrl}/images/offre.jpg`;
  const imgStep3 = `${baseUrl}/images/documents_resized.jpg`;

  const greetingText = (params.firstName && params.firstName !== "Client") 
    ? t("greeting_name", { firstName: escapeHtml(params.firstName) }) 
    : t("greeting_simple");

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc;">
      <tr>
        <td align="center" style="padding: 40px 10px;">
          <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
            
            <tr>
              <td align="center" style="padding: 50px 30px; background-color: #0f172a; color: #ffffff;">
                <img src="${logo}" alt="CreditX" width="160" style="display: block; margin-bottom: 30px; filter: invert(1) brightness(2);"/>
                <h1 style="margin: 0 0 16px 0; font-size: 32px; font-weight: 900; letter-spacing: -0.02em;">${t("shell_title")}</h1>
                <p style="margin: 0; font-size: 16px; color: #cbd5e1; line-height: 1.5;">${greetingText}<br/><br/>${t("intro")}</p>
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 30px; border-bottom: 1px solid #f1f5f9;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="45%" valign="top" style="padding-right: 20px;">
                      
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;">
                        <tr><td><img src="${imgStep1}" width="100%" style="display: block; max-height: 180px; object-fit: cover;" /></td></tr>
                        <tr>
                          <td style="padding: 12px; border-top: 1px solid #f1f5f9;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="36" valign="middle">
                                  <div style="width:28px; height:28px; background:#eff6ff; border-radius:50%; text-align:center; line-height:28px; font-size:14px;">🔎</div>
                                </td>
                                <td valign="middle">
                                  <p style="margin:0; font-size:11px; font-weight:900; color:#0f172a;">${t("w1_title")}</p>
                                  <p style="margin:0; font-size:9px; font-weight:bold; color:#64748b;">${t("w1_sub")}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                    </td>
                    <td width="55%" valign="middle">
                      <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; background-color: #eff6ff; display: inline-block; padding: 4px 10px; border-radius: 20px;">${t("step1_badge")}</p>
                      <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${t("step1_title")}</h2>
                      <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.6;">${t("step1_desc")}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 30px; border-bottom: 1px solid #f1f5f9; background-color: #f8fafc;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                  <tr>
                    <td width="45%" valign="top" style="padding-left: 20px;" dir="ltr">
                      
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;">
                        <tr><td><img src="${imgStep2}" width="100%" style="display: block; max-height: 180px; object-fit: cover;" /></td></tr>
                        <tr>
                          <td style="padding: 12px; border-top: 1px solid #f1f5f9;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="36" valign="middle">
                                  <div style="width:28px; height:28px; background:#fef2f2; border-radius:50%; text-align:center; line-height:28px; font-size:14px;">📈</div>
                                </td>
                                <td valign="middle">
                                  <p style="margin:0; font-size:11px; font-weight:900; color:#0f172a;">${t("w2_title")}</p>
                                  <p style="margin:0; font-size:9px; font-weight:bold; color:#64748b;">${t("w2_sub")}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                    </td>
                    <td width="55%" valign="middle" dir="ltr" style="text-align: left;">
                      <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.05em; background-color: #fef2f2; display: inline-block; padding: 4px 10px; border-radius: 20px;">${t("step2_badge")}</p>
                      <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${t("step2_title")}</h2>
                      <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.6;">${t("step2_desc")}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="45%" valign="top" style="padding-right: 20px;">
                      
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;">
                        <tr><td><img src="${imgStep3}" width="100%" style="display: block; max-height: 180px; object-fit: cover;" /></td></tr>
                        <tr>
                          <td style="padding: 12px; border-top: 1px solid #f1f5f9;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="36" valign="middle">
                                  <div style="width:28px; height:28px; background:#ecfdf5; border-radius:50%; text-align:center; line-height:28px; font-size:14px;">🔒</div>
                                </td>
                                <td valign="middle">
                                  <p style="margin:0; font-size:11px; font-weight:900; color:#0f172a;">${t("w3_title")}</p>
                                  <p style="margin:0; font-size:9px; font-weight:bold; color:#64748b;">${t("w3_sub")}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                    </td>
                    <td width="55%" valign="middle">
                      <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 0.05em; background-color: #ecfdf5; display: inline-block; padding: 4px 10px; border-radius: 20px;">${t("step3_badge")}</p>
                      <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${t("step3_title")}</h2>
                      <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.6;">${t("step3_desc")}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding: 20px 30px 50px 30px;">
                <a href="${dashUrl}" style="background-color: #816DEC; color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 50px; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; box-shadow: 0 10px 20px rgba(129, 109, 236, 0.3);">
                  ${escapeHtml(t("cta_label"))}
                </a>
              </td>
            </tr>
            
            <tr>
              <td style="background-color: #f1f5f9; padding: 24px 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0;"><strong>CreditX Sàrl</strong> - Suisse<br/>Cet email vous a été envoyé suite à votre inscription.</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}

// ✅ 7) EMAIL AGENT IA (Relances intelligentes)
export async function sendCreditXAgentEmail(params: {
  to: string;
  firstName: string;
  subject: string;
  bodyHtml: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  
  const t = await getTranslations({ locale, namespace: "Emails.Agent" });

  // 👈 PATCH : On nettoie le prénom pour éviter "Bonjour Client" ou "Bonjour ,"
  const rawName = params.firstName?.trim() || "";
  const isGenericName = rawName.toLowerCase() === "client" || rawName === "";
  const safeNameStr = isGenericName ? "" : ` ${escapeHtml(rawName)}`;

  const fullBodyHtml = `
    <p style="font-size: 16px; color: #1A1A1A; margin-bottom: 24px;">
      Bonjour${safeNameStr},
    </p>
    <div style="font-size: 16px; color: #4A4A4A; line-height: 1.6;">
      ${params.bodyHtml}
    </div>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml: fullBodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard`, 
  });

  await sgMail.send({ to: params.to, from, subject: params.subject, html, text: params.subject });
}

// ✅ 8) EMAIL AGENT IA (Relance Création d'Offre)
export async function sendCreditXAgentOfferEmail(params: {
  to: string;
  firstName: string;
  subject: string;
  bodyHtml: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";

  // On applique directement notre patch anti "Bonjour Client" !
  const rawName = params.firstName?.trim() || "";
  const isGenericName = rawName.toLowerCase() === "client" || rawName === "";
  const safeNameStr = isGenericName ? "" : ` ${escapeHtml(rawName)}`;

  const fullBodyHtml = `
    <p style="font-size: 16px; color: #1A1A1A; margin-bottom: 24px;">
      Bonjour${safeNameStr},
    </p>
    <div style="font-size: 16px; color: #4A4A4A; line-height: 1.6;">
      ${params.bodyHtml}
    </div>
  `;

  const html = renderCreditXShell({
    title: "Optimisation de votre Prévoyance",
    bodyHtml: fullBodyHtml,
    ctaLabel: "Améliorer ma prévoyance", // 👈 Ton CTA personnalisé
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance`, // Redirige vers la bonne page
  });

  await sgMail.send({ to: params.to, from, subject: params.subject, html, text: params.subject });
}


// ✅ 9) EMAIL RAPPEL OFFRE EN ATTENTE
export async function sendCreditXOfferReminderEmail(params: {
  to: string;
  firstName: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";
  const t = await getTranslations({ locale, namespace: "Emails.OfferReminder" });
  
  const subject = t("subject");

  const rawName = params.firstName?.trim() || "";
  const isGenericName = rawName.toLowerCase() === "client" || rawName === "";
  const safeNameStr = isGenericName ? "" : ` ${escapeHtml(rawName)}`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #1A1A1A; margin-bottom: 24px;">
      Bonjour${safeNameStr},
    </p>
    <div style="font-size: 16px; color: #4A4A4A; line-height: 1.6;">
      <p>${t("intro")}</p>
      <p>${t("body")}</p>
    </div>
  `;

  const html = renderCreditXShell({
    title: t("shell_title"),
    bodyHtml: bodyHtml,
    ctaLabel: t("cta_label"),
    ctaUrl: `${appUrl()}/${locale}/dashboard/prevoyance?tab=prive`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}


// ✅ 10) ALERTE COLLABORATEUR (RAPPEL RAPIDE OU RDV)
export async function sendCreditXLeadCallbackAlert(params: {
  firstName: string;
  phone: string;
  type: "immédiat" | "planifié";
  date?: string;
}) {
  ensureSendgrid();
  
  // L'alerte t'est destinée, on l'envoie à ton adresse admin
  const to = process.env.ADMIN_EMAIL || "info@creditx.ch"; 
  const from = { email: "noreply@creditx.ch", name: "CreditX Alertes" };
  
  const isImmediat = params.type === "immédiat";
  const subject = isImmediat ? `🚨 RAPPEL IMMÉDIAT : ${params.firstName}` : `📅 NOUVEAU RDV : ${params.firstName}`;
  
  const dateStr = params.date ? new Date(params.date).toLocaleString('fr-CH', { 
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
  }) : "";

  const bodyHtml = `
    <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom: 20px;">
      <h3 style="margin:0 0 15px 0; font-size:14px; text-transform:uppercase; color:${isImmediat ? '#ea580c' : '#4f46e5'}; letter-spacing:0.05em;">
        ${isImmediat ? '⚡ Demande de rappel express' : '📅 Nouveau créneau bloqué'}
      </h3>
      <p style="margin:4px 0; font-size: 16px;"><strong>Prénom :</strong> ${escapeHtml(params.firstName)}</p>
      <p style="margin:4px 0; font-size: 16px;"><strong>Téléphone :</strong> <a href="tel:${escapeHtml(params.phone)}" style="color: #3b82f6; text-decoration: none;">${escapeHtml(params.phone)}</a></p>
      ${!isImmediat ? `<p style="margin:4px 0; font-size: 16px;"><strong>Prévu le :</strong> ${dateStr}</p>` : ''}
    </div>
    <p>Ce lead a été automatiquement ajouté à l'onglet "Rappels" de ton Pipeline de Souscription.</p>
  `;

  // On utilise ta coquille (shell) CreditX pour un rendu impeccable
  const html = renderCreditXShell({
    title: "Nouveau Lead Pré-qualifié",
    bodyHtml,
    ctaLabel: "Ouvrir le Pipeline",
    ctaUrl: `${appUrl()}/admin/offres-wizard`
  });

  await sgMail.send({ to, from, subject, html, text: subject });
}

// ✅ 11) EMAIL CRÉATION DE COMPTE (ADMIN)
export async function sendCreditXNewAccountEmail(params: {
  to: string;
  firstName: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";

  const subject = "Votre espace sécurisé CreditX est prêt";
  const safeNameStr = params.firstName ? ` ${escapeHtml(params.firstName.trim())}` : "";

  const bodyHtml = `
    <p style="font-size: 16px; color: #1A1A1A; margin-bottom: 24px;">
      Bonjour${safeNameStr},
    </p>
    <div style="font-size: 16px; color: #4A4A4A; line-height: 1.6;">
      <p>Votre conseiller a préparé votre espace personnel pour la gestion de votre prévoyance.</p>
      
      <div style="background:#f8fafc; border-left:4px solid #3b82f6; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px 0; font-size:12px; font-weight:bold; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.05em;">Vos identifiants de connexion</p>
        <p style="margin:0; font-size:16px; color:#1e293b; font-weight:bold;">Adresse e-mail : ${escapeHtml(params.to)}</p>
      </div>

      <p>Pour des raisons de sécurité, veuillez configurer votre mot de passe personnel en cliquant sur le bouton ci-dessous.</p>
    </div>
  `;

  const html = renderCreditXShell({
    title: "Bienvenue sur CreditX",
    bodyHtml: bodyHtml,
    ctaLabel: "Créer mon mot de passe",
    ctaUrl: `${appUrl()}/${locale}/forgot-password`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}

// ✅ 12) EMAIL CLÔTURE DE CONSEIL & RECOMMANDATION
export async function sendCreditXConseilClosedEmail(params: {
  to: string;
  firstName: string;
  referralCode: string;
  nextRdvDate?: string;
  nextRdvObjectif?: string;
  locale?: string;
}) {
  ensureSendgrid();
  const from = { email: "noreply@creditx.ch", name: "CreditX" };
  const locale = params.locale || "fr";

  const subject = "Résumé de votre audit & Accès Cercle Privilège";
  const safeNameStr = params.firstName ? ` ${escapeHtml(params.firstName.trim())}` : "";
  const referralLink = `${appUrl()}/invite/${params.referralCode}`;

  let rdvHtml = "";
  if (params.nextRdvDate) {
    rdvHtml = `
      <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:16px; margin:24px 0;">
        <p style="margin:0 0 4px 0; font-size:12px; font-weight:bold; color:#166534; text-transform:uppercase; letter-spacing:0.05em;">Prochaine étape</p>
        <p style="margin:0; font-size:16px; font-weight:900; color:#14532d;">Rendez-vous le ${escapeHtml(params.nextRdvDate)}</p>
        ${params.nextRdvObjectif ? `<p style="margin:4px 0 0 0; font-size:14px; color:#166534;">Objectif : ${escapeHtml(params.nextRdvObjectif)}</p>` : ""}
      </div>
    `;
  }

  const bodyHtml = `
    <p style="font-size: 16px; color: #1A1A1A; margin-bottom: 24px;">
      Bonjour${safeNameStr},
    </p>
    <div style="font-size: 16px; color: #4A4A4A; line-height: 1.6;">
      <p>Merci pour votre confiance lors de notre entretien. Votre dossier d'expertise a été scellé et sécurisé dans votre coffre-fort numérique.</p>
      
      ${rdvHtml}

      <h3 style="margin:40px 0 16px 0; font-size:14px; text-transform:uppercase; color:#000000; letter-spacing:0.05em; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">Le Cercle Privilège CreditX</h3>
      <p>Notre développement repose exclusivement sur la satisfaction de nos clients. Si notre accompagnement vous a été utile, vous pouvez en faire profiter votre entourage.</p>
      
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin:24px 0; text-align:center;">
        <p style="margin:0 0 12px 0; font-size:14px; font-weight:bold; color:#475569;">Votre lien d'invitation unique :</p>
        <a href="${referralLink}" style="font-size:18px; font-family:monospace; font-weight:900; color:#2563eb; text-decoration:none; word-break:break-all;">${referralLink}</a>
        <p style="margin:12px 0 0 0; font-size:13px; color:#64748b;">
          Pour toute personne créant un compte via ce lien, <strong>nous vous versons une prime de 80 CHF</strong>.
        </p>
      </div>

      <p>Vous pouvez suivre vos recommandations en temps réel directement depuis votre espace client.</p>
    </div>
  `;

  const html = renderCreditXShell({
    title: "Votre Audit est finalisé",
    bodyHtml: bodyHtml,
    ctaLabel: "Accéder à mon espace",
    ctaUrl: `${appUrl()}/${locale}/dashboard`,
  });

  await sgMail.send({ to: params.to, from, subject, html, text: subject });
}