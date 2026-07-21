import { google } from "googleapis";

function getServiceAccountCreds() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SA_JSON");
  return JSON.parse(raw);
}

export function getCalendarClient() {
  const creds = getServiceAccountCreds();
  
  // Sécurité pour éviter tout bug de lecture de la clé
  const privateKey = creds.private_key.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
    // ON NE MET PLUS l'impersonation ici (c'est ce qui causait l'erreur 401)
  });

  return google.calendar({ version: "v3", auth });
}

export function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}