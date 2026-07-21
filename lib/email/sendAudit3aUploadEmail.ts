// lib/email/sendAudit3aUploadEmail.ts
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type Audit3aUploadEmailParams = {
  to: string;
  from: string;
  sessionId: string;
  uploadId: string;
  clientEmail: string;
  clientPhone?: string | null;
  filename: string;
  mimeType: string;
  fileBase64: string;
  sizeBytes: number;
  storagePath: string;
};

export async function sendAudit3aUploadEmail(params: Audit3aUploadEmailParams) {
  const {
    to,
    from,
    sessionId,
    uploadId,
    clientEmail,
    clientPhone,
    filename,
    mimeType,
    fileBase64,
    sizeBytes,
    storagePath,
  } = params;

  const subject = "📎 MoneyLife – Nouveau contrat 3e pilier reçu";

  const text =
    `Un nouveau document Audit 3a a été reçu.\n\n` +
    `--- Client ---\n` +
    `Email : ${clientEmail}\n` +
    `Téléphone : ${clientPhone || "-"}\n\n` +
    `--- Technique ---\n` +
    `SessionId : ${sessionId}\n` +
    `UploadId : ${uploadId}\n` +
    `Fichier : ${filename}\n` +
    `Taille : ${(sizeBytes / 1024 / 1024).toFixed(2)} MB\n` +
    `Storage : ${storagePath}\n`;

  await sgMail.send({
    to,
    from,
    subject,
    text,
    attachments: [
      {
        content: fileBase64,
        filename,
        type: mimeType || "application/octet-stream",
        disposition: "attachment",
      },
    ],
  });
}