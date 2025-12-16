// lib/email/sendNew3eOfferRequestEmail.ts
import { google } from "googleapis";

type New3eOfferEmailPayload = {
  configId: string;
  clientUid: string;
  config: {
    type?: string;
    premiumAmount?: number;
    premiumFrequency?: string;
    offerName?: string;
    offerStartDate?: string | null;
  };
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    street?: string;
    zip?: string;
    city?: string;
    sex?: string;
    birthdate?: string;
    nationality?: string;
    residencePermit?: string | null;
    etatCivilLabel?: string | null;
  };
  pricingContext?: {
    age?: number;
    bmi?: number | null;
    isSmoker?: boolean;
    hasHypertension?: boolean;
  } | null;
  totalRiskPremium?: number | null;
  netSavingsPremium?: number | null;
  requiresHealthQuestionnaire?: boolean;
};

export async function sendNew3eOfferEmail(input: New3eOfferEmailPayload) {
  const {
    configId,
    clientUid,
    config,
    contact,
    pricingContext,
    totalRiskPremium,
    netSavingsPremium,
    requiresHealthQuestionnaire,
  } = input;

  const clientName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || null;

  const adminBaseUrl =
    process.env.MONEYLIFE_ADMIN_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.moneylife.ch";

  const adminLink = `${adminBaseUrl.replace(/\/$/, "")}/admin/dashboard/${configId}`;

  const gmailUser = process.env.GMAIL_USER;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const emailFrom =
    process.env.OFFERS_MAIL_FROM || process.env.EMAIL_FROM || gmailUser;
  const emailTo = process.env.OFFERS_MAIL_TO || "offres@moneylife.ch";

  if (!gmailUser || !clientId || !clientSecret || !refreshToken) {
    console.warn(
      "[sendNew3eOfferEmail] Gmail OAuth non configuré, email non envoyé."
    );
    console.warn("Admin link:", adminLink);
    return;
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const typeLabel =
    config.type === "3a"
      ? "3e pilier lié (3a)"
      : config.type === "3b"
      ? "3e pilier libre (3b)"
      : String(config.type ?? "n.c.");

  const lines: string[] = [];

  lines.push(`Vous avez reçu une nouvelle demande d'offre 3e pilier via MoneyLife.`);
  lines.push("");
  lines.push(`Référence dossier : ${configId}`);
  lines.push(`Client UID       : ${clientUid}`);
  lines.push("");

  // Infos client
  if (clientName) lines.push(`Client           : ${clientName}`);
  if (contact?.email) lines.push(`Email            : ${contact.email}`);
  if (contact?.phone) lines.push(`Téléphone        : ${contact.phone}`);
  if (contact?.street || contact?.zip || contact?.city) {
    const addr = [
      contact.street,
      [contact.zip, contact.city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(`Adresse          : ${addr}`);
  }
  if (contact?.birthdate)
    lines.push(`Date de naissance: ${contact.birthdate}`);
  if (contact?.sex) lines.push(`Sexe             : ${contact.sex}`);
  if (contact?.etatCivilLabel)
    lines.push(`État civil       : ${contact.etatCivilLabel}`);
  if (contact?.nationality)
    lines.push(`Nationalité      : ${contact.nationality}`);
  if (contact?.residencePermit)
    lines.push(`Permis de séjour : ${contact.residencePermit}`);

  lines.push("");
  // Infos contrat
  lines.push(`Type de contrat  : ${typeLabel}`);
  if (config.offerName) lines.push(`Nom de l'offre   : ${config.offerName}`);
  if (config.offerStartDate)
    lines.push(`Début de contrat : ${config.offerStartDate}`);
  if (typeof config.premiumAmount === "number") {
    const freq =
      config.premiumFrequency === "monthly"
        ? "CHF / mois"
        : config.premiumFrequency === "yearly"
        ? "CHF / an"
        : "CHF";
    lines.push(`Prime            : ${config.premiumAmount} ${freq}`);
  }
  if (typeof totalRiskPremium === "number") {
    lines.push(`Prime risque     : ${totalRiskPremium} CHF/an`);
  }
  if (typeof netSavingsPremium === "number") {
    lines.push(`Prime épargne    : ${netSavingsPremium} CHF/an`);
  }
  if (pricingContext?.age) {
    lines.push(`Âge              : ${pricingContext.age} ans`);
  }
  if (pricingContext?.bmi) {
    lines.push(`IMC estimé       : ${pricingContext.bmi.toFixed(1)}`);
  }
  if (typeof pricingContext?.isSmoker === "boolean") {
    lines.push(
      `Fumeur           : ${pricingContext.isSmoker ? "Oui" : "Non"}`
    );
  }
  if (typeof pricingContext?.hasHypertension === "boolean") {
    lines.push(
      `Hypertension     : ${pricingContext.hasHypertension ? "Oui" : "Non"}`
    );
  }
  if (requiresHealthQuestionnaire) {
    lines.push(`Questionnaire santé requis : Oui`);
  }

  lines.push("");
  lines.push(`➡️ Accéder au dossier dans le dashboard admin :`);
  lines.push(adminLink);
  lines.push("");
  lines.push(
    `Toutes les informations (profil, LPP, configuration 3e pilier, santé & profil investisseur)`
  );
  lines.push(
    `sont disponibles dans le dashboard collaborateur à ce lien.`
  );

  const textBody = lines.join("\n");
  const subject = `Nouvelle demande 3e pilier – ${clientName || configId}`;

  const message = [
    `From: ${emailFrom || gmailUser}`,
    `To: ${emailTo}`,
    `Subject: ${subject}`,
    "",
    textBody,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  console.log("[sendNew3eOfferEmail] Email envoyé pour la config:", configId);
}