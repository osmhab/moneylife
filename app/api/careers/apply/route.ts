// app/api/careers/apply/route.ts
//
// Réception d'une candidature déposée depuis /careers/[slug].
//
// Contrat :
//   1. Les réponses de pré-qualification sont REVALIDÉES ici. Le blocage côté
//      client est un confort d'UX, pas une garantie : une réponse éliminatoire
//      envoyée directement à l'API est rejetée en 422.
//   2. Les documents partent dans Storage (`careers/<slug>/<id>/…`) et JAMAIS en
//      pièce jointe d'e-mail : une candidature complète dépasse vite les limites
//      SendGrid, et les fichiers doivent rester consultables depuis le CRM.
//   3. L'e-mail est un CONFORT : si SendGrid tombe, la candidature est déjà
//      stockée et visible dans /admin/recrutement — on ne renvoie pas d'erreur
//      au candidat pour autant.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sgMail from "@sendgrid/mail";
import { FieldValue } from "firebase-admin/firestore";
import { db, bucket } from "@/lib/firebase/admin";
import {
  getJob, describeAnswer,
  MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, ALLOWED_UPLOAD_EXTENSIONS,
  type Job,
} from "@/lib/core/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Anti-spam mémoire processus, même approche que /api/contact : suffisant pour
// une page carrières (volume faible, dépôt de fichiers déjà dissuasif).
//
// ⚠️ DEUX compteurs distincts, et c'est volontaire :
//   - `attempts`  : toutes les requêtes, plafond large — arrête un flood ;
//   - `accepted`  : les candidatures RÉELLEMENT enregistrées, plafond serré.
// Compter les rejets dans le plafond serré bloquerait une heure un candidat
// honnête qui corrige deux fois une erreur de saisie (fichier oublié, e-mail
// mal tapé). Le compteur serré ne s'incrémente donc qu'après un enregistrement.
type Bucket = { count: number; resetAt: number };
const WINDOW_MS = 60 * 60 * 1000;
const ATTEMPTS = new Map<string, Bucket>();
const ACCEPTED = new Map<string, Bucket>();

function hit(store: Map<string, Bucket>, key: string, limit: number) {
  const now = Date.now();
  const curr = store.get(key);
  if (!curr || now > curr.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (curr.count >= limit) return false;
  curr.count += 1;
  return true;
}

/** Le quota serré est-il déjà épuisé ? (lecture seule, sans incrémenter) */
function acceptedQuotaLeft(key: string, limit: number) {
  const curr = ACCEPTED.get(key);
  if (!curr || Date.now() > curr.resetAt) return true;
  return curr.count < limit;
}

function extensionOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

/** Nom de fichier sûr pour Storage (pas de chemin, pas d'accent exotique). */
function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() || "document";
  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

/** Référence lisible communiquée au candidat (ex. CX-260829-4F2A). */
function buildReference(now: Date) {
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `CX-${y}${m}${d}-${rand}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type StoredDoc = {
  slotId: string;
  slotLabel: string;
  fileName: string;
  path: string;
  size: number;
  contentType: string;
};

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!hit(ATTEMPTS, ip, 20) || !acceptedQuotaLeft(ip, 3)) {
      return NextResponse.json(
        { error: "Trop de candidatures envoyées depuis cette connexion. Réessayez plus tard." },
        { status: 429 },
      );
    }

    const form = await req.formData();

    // ---------------------------------------------------------------- poste
    const jobSlug = String(form.get("jobSlug") ?? "").trim();
    const job = getJob(jobSlug);
    if (!job) {
      return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
    }

    // ---------------------------------------------------------- coordonnées
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    const linkedin = String(form.get("linkedin") ?? "").trim();
    const message = String(form.get("message") ?? "").trim().slice(0, 4000);

    if (firstName.length < 2 || lastName.length < 2) {
      return NextResponse.json({ error: "Nom ou prénom invalide." }, { status: 400 });
    }
    if (!isEmail(email)) {
      return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    }
    if (phone.length < 6) {
      return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });
    }
    if (String(form.get("consent") ?? "") !== "true") {
      return NextResponse.json({ error: "Consentement manquant." }, { status: 400 });
    }

    // ------------------------------------------------ pré-qualification (⚠️)
    let answers: Record<string, string>;
    let rawPrecisions: Record<string, string>;
    try {
      answers = JSON.parse(String(form.get("answers") ?? "{}"));
      rawPrecisions = JSON.parse(String(form.get("precisions") ?? "{}"));
    } catch {
      return NextResponse.json({ error: "Réponses illisibles." }, { status: 400 });
    }

    // Ne conserve que les précisions réellement exigées : un client bricolé ne
    // doit pas pouvoir stocker du texte libre sur des questions qui n'en veulent pas.
    const precisions: Record<string, string> = {};

    for (const q of job.screening) {
      const value = answers?.[q.id];
      const option = q.options.find((o) => o.value === value);
      if (!option) {
        return NextResponse.json(
          { error: `Réponse manquante ou invalide : « ${q.label} »` },
          { status: 400 },
        );
      }
      if (option.disqualifying) {
        return NextResponse.json(
          { error: q.rejectMessage ?? "Votre profil ne correspond pas aux prérequis de ce poste." },
          { status: 422 },
        );
      }
      if (option.requiresPrecision) {
        const detail = String(rawPrecisions?.[q.id] ?? "").trim().slice(0, 200);
        if (detail.length < 2) {
          return NextResponse.json(
            { error: `Précision manquante : « ${q.precisionLabel ?? q.label} »` },
            { status: 400 },
          );
        }
        precisions[q.id] = detail;
      }
    }

    // ------------------------------------------------------------ documents
    const applicationId = randomUUID();
    const now = new Date();
    const reference = buildReference(now);

    const toUpload: { slotId: string; slotLabel: string; file: File }[] = [];
    let totalBytes = 0;

    for (const slot of job.documents) {
      const entries = form.getAll(`doc:${slot.id}`).filter((e): e is File => e instanceof File && e.size > 0);

      if (slot.required && entries.length === 0) {
        return NextResponse.json({ error: `Document obligatoire manquant : ${slot.label}.` }, { status: 400 });
      }
      const max = slot.multiple ? (slot.maxFiles ?? MAX_FILES) : 1;
      if (entries.length > max) {
        return NextResponse.json({ error: `Trop de fichiers pour « ${slot.label} ».` }, { status: 400 });
      }

      for (const file of entries) {
        if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(file.name))) {
          return NextResponse.json({ error: `Format de fichier refusé : ${file.name}.` }, { status: 400 });
        }
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json({ error: `Fichier trop lourd : ${file.name}.` }, { status: 400 });
        }
        totalBytes += file.size;
        toUpload.push({ slotId: slot.id, slotLabel: slot.label, file });
      }
    }

    if (toUpload.length > MAX_FILES) {
      return NextResponse.json({ error: "Trop de fichiers joints." }, { status: 400 });
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "Le total des fichiers dépasse la limite autorisée." }, { status: 400 });
    }

    const documents: StoredDoc[] = [];
    for (const { slotId, slotLabel, file } of toUpload) {
      const fileName = safeFileName(file.name);
      const path = `careers/${job.slug}/${applicationId}/${slotId}/${fileName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await bucket.file(path).save(buffer, {
        contentType: file.type || "application/octet-stream",
        metadata: {
          metadata: { applicationId, reference, jobSlug: job.slug, slotId },
        },
      });
      documents.push({
        slotId,
        slotLabel,
        fileName,
        path,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
    }

    // ------------------------------------------------------------- Firestore
    await db.collection("job_applications").doc(applicationId).set({
      reference,
      jobSlug: job.slug,
      jobTitle: job.title,
      jobLocation: job.location,
      firstName,
      lastName,
      email,
      phone,
      city: city || null,
      linkedin: linkedin || null,
      message: message || null,
      answers,
      precisions,
      documents,
      status: "nouveau",
      consentAt: now.toISOString(),
      ip,
      userAgent: req.headers.get("user-agent") || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Le quota serré ne se consomme qu'ici : une candidature réellement stockée.
    hit(ACCEPTED, ip, 3);

    // ------------------------------------------------------------- e-mails
    // Confort : un échec ici ne doit pas perdre la candidature déjà stockée.
    await sendEmails({ job, reference, firstName, lastName, email, phone, city, linkedin, message, answers, precisions, documents })
      .catch((e) => console.error("[careers] e-mail non envoyé:", e?.message || e));

    return NextResponse.json({ ok: true, reference });
  } catch (e: any) {
    console.error("[careers] erreur candidature:", e?.message || e);
    return NextResponse.json({ error: "Erreur serveur lors de l'envoi." }, { status: 500 });
  }
}

async function sendEmails(input: {
  job: Job;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  linkedin: string;
  message: string;
  answers: Record<string, string>;
  precisions: Record<string, string>;
  documents: StoredDoc[];
}) {
  const {
    job, reference, firstName, lastName, email, phone, city, linkedin, message, answers, precisions, documents,
  } = input;

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    console.warn("[careers] SENDGRID_API_KEY absente — candidature stockée sans notification.");
    return;
  }
  sgMail.setApiKey(SENDGRID_API_KEY);

  const toEmail = process.env.CAREERS_TO_EMAIL || process.env.CONTACT_TO_EMAIL || "info@creditx.ch";
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "no-reply@creditx.ch";
  const fromName = process.env.CONTACT_FROM_NAME || "CreditX";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://creditx.ch";

  const answersHtml = job.screening
    .map(
      (q) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;">${escapeHtml(q.label)}</td>` +
        `<td style="padding:6px 0;font-weight:700;color:#0f172a;">${escapeHtml(describeAnswer(job, q.id, answers[q.id], precisions[q.id]))}</td></tr>`,
    )
    .join("");

  const docsHtml = documents
    .map((d) => `<li><strong>${escapeHtml(d.slotLabel)}</strong> — ${escapeHtml(d.fileName)}</li>`)
    .join("");

  // → Recrutement
  await sgMail.send({
    to: toEmail,
    from: { email: fromEmail, name: fromName },
    replyTo: { email, name: `${firstName} ${lastName}` },
    subject: `[Candidature] ${job.title} — ${firstName} ${lastName} (${reference})`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
        <h2 style="margin:0 0 4px;">Nouvelle candidature</h2>
        <p style="margin:0 0 24px;color:#64748b;">${escapeHtml(job.title)} — ${escapeHtml(job.location)} · Réf. ${reference}</p>

        <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Candidat</h3>
        <p style="margin:0 0 24px;line-height:1.7;">
          <strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong><br/>
          ${escapeHtml(email)} · ${escapeHtml(phone)}<br/>
          ${city ? escapeHtml(city) + "<br/>" : ""}
          ${linkedin ? escapeHtml(linkedin) : ""}
        </p>

        <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Pré-qualification</h3>
        <table style="border-collapse:collapse;margin:0 0 24px;">${answersHtml}</table>

        <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Documents</h3>
        <ul style="margin:0 0 24px;line-height:1.7;">${docsHtml}</ul>

        ${message ? `<h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Message</h3><p style="margin:0 0 24px;white-space:pre-wrap;line-height:1.7;">${escapeHtml(message)}</p>` : ""}

        <p style="margin:0;">
          <a href="${appUrl}/fr/admin/recrutement" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;">
            Ouvrir dans le back-office
          </a>
        </p>
      </div>
    `,
  });

  // → Candidat (accusé de réception)
  await sgMail.send({
    to: email,
    from: { email: fromEmail, name: fromName },
    subject: `Votre candidature — ${job.title} (${reference})`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.7;">
        <h2 style="margin:0 0 16px;">Bonjour ${escapeHtml(firstName)},</h2>
        <p style="margin:0 0 16px;">
          Nous avons bien reçu votre candidature au poste de <strong>${escapeHtml(job.title)}</strong>
          (${escapeHtml(job.location)}). Votre référence de suivi est <strong>${reference}</strong>.
        </p>
        <p style="margin:0 0 16px;">
          Nous examinons chaque dossier attentivement et revenons vers vous dans les meilleurs délais,
          quelle que soit l'issue.
        </p>
        <p style="margin:0 0 24px;">Merci de l'intérêt que vous portez à CreditX.</p>
        <p style="margin:0;color:#64748b;">L'équipe CreditX — Sion</p>
      </div>
    `,
  });
}
