// app/[locale]/(site)/careers/[slug]/_client/ApplyFlow.tsx
//
// Tunnel de candidature en 4 étapes :
//   1. Pré-qualification  — le candidat confirme les points clés du poste.
//      Une réponse marquée `disqualifying` FERME la candidature : l'upload n'est
//      jamais proposé (et la route serveur revérifie, cf. /api/careers/apply).
//   2. Coordonnées
//   3. Documents (lettre, CV, photo, autres) — glisser-déposer
//   4. Récapitulatif + consentement, puis envoi.
//
// ⚠️ Les questions et les emplacements de documents viennent du descriptif de
// poste (app/lib/core/jobs.ts) : ne rien coder en dur ici.

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Check, ChevronLeft, ChevronRight, Upload, X, FileText, Image as ImageIcon,
  Send, CheckCircle2, ShieldAlert, Loader2, Eye, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  type Job, type JobDocumentSlot,
  MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, ALLOWED_UPLOAD_EXTENSIONS,
} from "@/lib/core/jobs";

type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  linkedin: string;
  message: string;
};

const EMPTY_PROFILE: Profile = {
  firstName: "", lastName: "", email: "", phone: "", city: "", linkedin: "", message: "",
};

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function extensionOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

/**
 * Le navigateur ne sait afficher que les images et les PDF. Word est proposé au
 * téléchargement — le candidat vérifie ainsi qu'il a bien joint le bon fichier.
 */
function previewKind(file: File): "image" | "pdf" | "download" {
  const ext = extensionOf(file.name);
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "download";
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ApplyFlow({ job }: { job: Job }) {
  const t = useTranslations("Careers");

  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  /** Texte libre exigé par certaines options (ex. « Autre formation »). */
  const [precisions, setPrecisions] = React.useState<Record<string, string>>({});
  const [blockedBy, setBlockedBy] = React.useState<string | null>(null); // id de la question éliminatoire
  const [profile, setProfile] = React.useState<Profile>(EMPTY_PROFILE);
  const [files, setFiles] = React.useState<Record<string, File[]>>({});
  const [consent, setConsent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);
  /** Pièce jointe ouverte dans la visionneuse (vérification avant envoi). */
  const [preview, setPreview] = React.useState<File | null>(null);

  // Anti-spam : pot de miel + délai minimal de remplissage.
  const [honeypot, setHoneypot] = React.useState("");
  const startedAt = React.useRef<number>(0);
  React.useEffect(() => { startedAt.current = Date.now(); }, []);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const goTo = (n: number) => {
    setStep(n);
    // Le tunnel est long : on ramène l'utilisateur en haut de la carte à chaque étape.
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const steps = [t("step_1"), t("step_2"), t("step_3"), t("step_4")];

  // ---------------------------------------------------------------- étape 1
  /** L'option cochée pour cette question, si elle existe. */
  const chosenOption = (q: Job["screening"][number]) =>
    q.options.find((o) => o.value === answers[q.id]);

  // Une option « Autre » sans texte libre n'apprend rien au recruteur : tant que
  // la précision manque, la question compte comme non répondue.
  const allAnswered = job.screening.every((q) => {
    const opt = chosenOption(q);
    if (!opt) return false;
    if (opt.requiresPrecision) return (precisions[q.id] ?? "").trim().length >= 2;
    return true;
  });

  const blockingQuestion = job.screening.find((q) => q.id === blockedBy) ?? null;

  function chooseAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Une réponse éliminatoire déjà signalée redevient modifiable dès qu'on la change.
    if (blockedBy === questionId) setBlockedBy(null);
  }

  function submitScreening() {
    const failed = job.screening.find((q) =>
      q.options.find((o) => o.value === answers[q.id])?.disqualifying,
    );
    if (failed) {
      setBlockedBy(failed.id);
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    goTo(1);
  }

  // ---------------------------------------------------------------- étape 2
  const profileValid =
    profile.firstName.trim().length >= 2 &&
    profile.lastName.trim().length >= 2 &&
    isEmail(profile.email) &&
    profile.phone.trim().length >= 6;

  // ---------------------------------------------------------------- étape 3
  const allFiles = React.useMemo(() => Object.values(files).flat(), [files]);
  const totalBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
  const documentsValid = job.documents
    .filter((d) => d.required)
    .every((d) => (files[d.id]?.length ?? 0) > 0);

  function addFiles(slot: JobDocumentSlot, incoming: FileList | File[]) {
    const list = Array.from(incoming);
    setFiles((prev) => {
      const current = prev[slot.id] ?? [];
      const accepted: File[] = [];

      for (const f of list) {
        if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(f.name))) {
          toast.error(t("err_file_type", { name: f.name }));
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          toast.error(t("err_file_size", { name: f.name, max: formatBytes(MAX_FILE_BYTES) }));
          continue;
        }
        // Même nom + même taille = doublon manifeste (double dépôt accidentel).
        if (current.some((c) => c.name === f.name && c.size === f.size)) continue;
        accepted.push(f);
      }
      if (!accepted.length) return prev;

      const max = slot.multiple ? (slot.maxFiles ?? MAX_FILES) : 1;
      const merged = slot.multiple ? [...current, ...accepted].slice(0, max) : accepted.slice(0, 1);

      const others = Object.entries(prev)
        .filter(([k]) => k !== slot.id)
        .flatMap(([, v]) => v);
      const nextTotal = [...others, ...merged].reduce((s, f) => s + f.size, 0);
      if (nextTotal > MAX_TOTAL_BYTES) {
        toast.error(t("err_total_size", { max: formatBytes(MAX_TOTAL_BYTES) }));
        return prev;
      }

      return { ...prev, [slot.id]: merged };
    });
  }

  function removeFile(slotId: string, index: number) {
    setFiles((prev) => {
      const next = [...(prev[slotId] ?? [])];
      next.splice(index, 1);
      return { ...prev, [slotId]: next };
    });
  }

  // ---------------------------------------------------------------- envoi
  async function submitApplication() {
    if (loading || !consent) return;

    if (honeypot.length > 0) {
      setReference("—");
      return;
    }
    if (Date.now() - startedAt.current < 5000) {
      toast.error(t("err_too_fast"));
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("jobSlug", job.slug);
      fd.append("answers", JSON.stringify(answers));
      fd.append("precisions", JSON.stringify(precisions));
      fd.append("consent", "true");
      (Object.keys(EMPTY_PROFILE) as (keyof Profile)[]).forEach((k) => {
        fd.append(k, profile[k].trim());
      });
      for (const [slotId, list] of Object.entries(files)) {
        list.forEach((f) => fd.append(`doc:${slotId}`, f, f.name));
      }

      const res = await fetch("/api/careers/apply", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        toast.error(data?.error ?? t("err_send"));
        return;
      }
      setReference(data?.reference ?? "—");
    } catch {
      toast.error(t("err_network"));
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------- rendus
  if (reference) {
    return (
      <div ref={rootRef} className="rounded-[32px] bg-white border border-slate-200 shadow-xl p-10 md:p-14 text-center">
        <div className="mx-auto mb-7 w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{t("success_title")}</h3>
        <p className="mt-5 text-lg text-slate-600 font-medium leading-relaxed max-w-xl mx-auto">
          {t("success_desc", { email: profile.email })}
        </p>
        <p className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-100 text-slate-700 text-sm font-bold">
          {t("success_reference")} <span className="font-mono">{reference}</span>
        </p>
        <div className="mt-10">
          <Link href="/careers">
            <Button variant="outline" className="h-14 px-8 rounded-2xl font-bold text-[15px] border-slate-200">
              {t("back_to_openings")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (blockingQuestion) {
    return (
      <div ref={rootRef} className="rounded-[32px] bg-white border border-slate-200 shadow-xl p-10 md:p-14 text-center">
        <div className="mx-auto mb-7 w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert className="h-10 w-10 text-amber-600" />
        </div>
        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{t("blocked_title")}</h3>
        <p className="mt-5 text-lg text-slate-600 font-medium leading-relaxed max-w-xl mx-auto">
          {blockingQuestion.rejectMessage}
        </p>
        <p className="mt-4 text-[15px] text-slate-500 font-medium">{t("blocked_hint")}</p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={() => setBlockedBy(null)}
            className="h-14 px-8 rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800"
          >
            {t("blocked_edit")}
          </Button>
          <Link href="/careers">
            <Button variant="outline" className="h-14 px-8 w-full rounded-2xl font-bold text-[15px] border-slate-200">
              {t("back_to_openings")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rounded-[32px] bg-white border border-slate-200 shadow-xl overflow-hidden scroll-mt-24">
      {/* Fil d'étapes */}
      <div className="px-7 md:px-10 pt-8 pb-7 border-b border-slate-100">
        <div className="flex items-center gap-2 md:gap-3">
          {steps.map((label, i) => (
            <React.Fragment key={label}>
              <button
                type="button"
                onClick={() => i < step && goTo(i)}
                disabled={i >= step}
                className={`flex items-center gap-2.5 shrink-0 ${i < step ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                    i < step
                      ? "bg-emerald-500 text-white"
                      : i === step
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < step ? <Check size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={`hidden md:inline text-sm font-bold ${
                    i === step ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < steps.length - 1 && <span className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          ))}
        </div>
        <p className="mt-5 md:hidden text-sm font-black text-slate-900">{steps[step]}</p>
      </div>

      <div className="p-7 md:p-10">
        {/* Pot de miel (invisible aux humains) */}
        <div style={{ display: "none" }} aria-hidden="true">
          <label htmlFor="careers-website">Website</label>
          <input
            id="careers-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* ---------------------------------------------------- ÉTAPE 1 */}
        {step === 0 && (
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t("screening_title")}</h3>
            <p className="mt-3 text-[15px] text-slate-600 font-medium leading-relaxed">{t("screening_desc")}</p>

            <div className="mt-9 space-y-9">
              {job.screening.map((q, qi) => (
                <fieldset key={q.id}>
                  <legend className="text-[17px] font-bold text-slate-900 leading-snug">
                    <span className="text-slate-400 mr-2 font-black">{qi + 1}.</span>
                    {q.label}
                  </legend>
                  {q.help && <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">{q.help}</p>}

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {q.options.map((o) => {
                      const active = answers[q.id] === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => chooseAnswer(q.id, o.value)}
                          aria-pressed={active}
                          className={`flex items-center gap-3 text-left p-4 rounded-2xl border-2 transition-all ${
                            active
                              ? "border-blue-600 bg-blue-50/60 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              active ? "border-blue-600 bg-blue-600" : "border-slate-300"
                            }`}
                          >
                            {active && <Check size={12} strokeWidth={4} className="text-white" />}
                          </span>
                          <span className={`text-[15px] font-semibold ${active ? "text-slate-900" : "text-slate-600"}`}>
                            {o.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Précision libre exigée par l'option cochée (ex. « Autre formation »). */}
                  {chosenOption(q)?.requiresPrecision && (
                    <div className="mt-4">
                      <label className="text-sm font-bold text-slate-700 ml-1">
                        {q.precisionLabel ?? t("precision_label")} <span className="text-blue-600">*</span>
                      </label>
                      <Input
                        value={precisions[q.id] ?? ""}
                        onChange={(e) => setPrecisions({ ...precisions, [q.id]: e.target.value })}
                        placeholder={q.precisionPlaceholder}
                        autoFocus
                        className={`mt-2 ${inputClass}`}
                      />
                    </div>
                  )}
                </fieldset>
              ))}
            </div>

            <div className="mt-10 flex justify-end">
              <Button
                onClick={submitScreening}
                disabled={!allAnswered}
                className="h-14 px-8 rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 disabled:opacity-40"
              >
                {t("next")} <ChevronRight size={18} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- ÉTAPE 2 */}
        {step === 1 && (
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t("profile_title")}</h3>
            <p className="mt-3 text-[15px] text-slate-600 font-medium leading-relaxed">{t("profile_desc")}</p>

            <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label={t("field_firstname")} required>
                <Input
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                  autoComplete="given-name"
                  className={inputClass}
                />
              </Field>
              <Field label={t("field_lastname")} required>
                <Input
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  autoComplete="family-name"
                  className={inputClass}
                />
              </Field>
              <Field
                label={t("field_email")}
                required
                error={profile.email.length > 0 && !isEmail(profile.email) ? t("err_email_format") : undefined}
              >
                <Input
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  autoComplete="email"
                  inputMode="email"
                  className={inputClass}
                />
              </Field>
              <Field label={t("field_phone")} required>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+41 79 000 00 00"
                  className={inputClass}
                />
              </Field>
              <Field label={t("field_city")}>
                <Input
                  value={profile.city}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                  autoComplete="address-level2"
                  className={inputClass}
                />
              </Field>
              <Field label={t("field_linkedin")}>
                <Input
                  value={profile.linkedin}
                  onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
                  placeholder="linkedin.com/in/…"
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-5">
              <Field label={t("field_message")}>
                <Textarea
                  value={profile.message}
                  onChange={(e) => setProfile({ ...profile, message: e.target.value })}
                  placeholder={t("field_message_placeholder")}
                  className="min-h-[130px] rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold resize-none p-4 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                />
              </Field>
            </div>

            <StepNav
              onBack={() => goTo(0)}
              onNext={() => goTo(2)}
              nextDisabled={!profileValid}
              backLabel={t("back")}
              nextLabel={t("next")}
            />
          </div>
        )}

        {/* ---------------------------------------------------- ÉTAPE 3 */}
        {step === 2 && (
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t("documents_title")}</h3>
            <p className="mt-3 text-[15px] text-slate-600 font-medium leading-relaxed">{t("documents_desc")}</p>

            <div className="mt-9 space-y-5">
              {job.documents.map((slot) => (
                <DropSlot
                  key={slot.id}
                  slot={slot}
                  files={files[slot.id] ?? []}
                  onAdd={(list) => addFiles(slot, list)}
                  onRemove={(i) => removeFile(slot.id, i)}
                  onPreview={setPreview}
                  labels={{
                    required: t("doc_required"),
                    optional: t("doc_optional"),
                    drop: t("doc_drop"),
                    browse: t("doc_browse"),
                    replace: t("doc_replace"),
                    preview: t("doc_preview"),
                  }}
                />
              ))}
            </div>

            <p className="mt-6 text-sm text-slate-500 font-medium">
              {t("documents_total", { used: formatBytes(totalBytes), max: formatBytes(MAX_TOTAL_BYTES) })}
            </p>

            <StepNav
              onBack={() => goTo(1)}
              onNext={() => goTo(3)}
              nextDisabled={!documentsValid}
              backLabel={t("back")}
              nextLabel={t("next")}
            />
          </div>
        )}

        {/* ---------------------------------------------------- ÉTAPE 4 */}
        {step === 3 && (
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t("review_title")}</h3>
            <p className="mt-3 text-[15px] text-slate-600 font-medium leading-relaxed">{t("review_desc")}</p>

            <div className="mt-9 space-y-4">
              <SummaryCard title={t("review_candidate")} onEdit={() => goTo(1)} editLabel={t("review_edit")}>
                <p className="text-[15px] font-bold text-slate-900">
                  {profile.firstName} {profile.lastName}
                </p>
                <p className="text-sm text-slate-600 font-medium">{profile.email} · {profile.phone}</p>
                {profile.city && <p className="text-sm text-slate-600 font-medium">{profile.city}</p>}
                {profile.linkedin && <p className="text-sm text-slate-600 font-medium">{profile.linkedin}</p>}
              </SummaryCard>

              <SummaryCard title={t("review_answers")} onEdit={() => goTo(0)} editLabel={t("review_edit")}>
                <ul className="space-y-2.5">
                  {job.screening.map((q) => {
                    const opt = chosenOption(q);
                    const detail = (precisions[q.id] ?? "").trim();
                    return (
                      <li key={q.id} className="text-sm">
                        <span className="text-slate-500 font-medium">{q.label}</span>
                        <span className="block text-slate-900 font-bold">
                          {opt ? (opt.requiresPrecision && detail ? `${opt.label} — ${detail}` : opt.label) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </SummaryCard>

              {/* Vérification avant envoi : chaque pièce est ouvrable ici. */}
              <SummaryCard title={t("review_documents")} onEdit={() => goTo(2)} editLabel={t("review_edit")}>
                <ul className="space-y-2">
                  {job.documents.flatMap((slot) =>
                    (files[slot.id] ?? []).map((f, i) => (
                      <li
                        key={`${slot.id}-${f.name}-${i}`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200"
                      >
                        <FileText size={15} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{f.name}</p>
                          <p className="text-xs text-slate-500 font-medium">
                            {slot.label} · {formatBytes(f.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreview(f)}
                          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-blue-600 hover:bg-blue-50 font-bold text-sm transition"
                        >
                          <Eye size={15} />
                          {t("doc_preview")}
                        </button>
                      </li>
                    )),
                  )}
                </ul>
              </SummaryCard>
            </div>

            <label className="mt-8 flex items-start gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-5 h-5 rounded accent-blue-600 shrink-0"
              />
              <span className="text-sm text-slate-600 font-medium leading-relaxed">
                {t.rich("consent", {
                  privacy: (chunks) => (
                    <Link href="/legal/confidentialite" className="text-blue-600 font-bold hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>

            <div className="mt-8 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goTo(2)}
                className="h-14 px-6 rounded-2xl font-bold text-[15px] text-slate-500 hover:text-slate-900 w-full sm:w-auto"
              >
                <ChevronLeft size={18} className="mr-1" /> {t("back")}
              </Button>
              <Button
                onClick={submitApplication}
                disabled={!consent || loading}
                className="h-14 px-8 rounded-2xl bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700 disabled:opacity-40 shadow-lg w-full sm:w-auto"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" /> {t("sending")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {t("submit")} <Send size={18} />
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          labels={{
            close: t("preview_close"),
            download: t("preview_download"),
            unsupported: t("preview_unsupported"),
          }}
        />
      )}
    </div>
  );
}

const inputClass =
  "h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500";

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end ml-1">
        <label className="text-sm font-bold text-slate-700">
          {label} {required && <span className="text-blue-600">*</span>}
        </label>
        {error && <span className="text-xs font-bold text-red-500">{error}</span>}
      </div>
      {children}
    </div>
  );
}

function StepNav({
  onBack, onNext, nextDisabled, backLabel, nextLabel,
}: {
  onBack: () => void; onNext: () => void; nextDisabled: boolean; backLabel: string; nextLabel: string;
}) {
  return (
    <div className="mt-10 flex items-center justify-between gap-4">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        className="h-14 px-6 rounded-2xl font-bold text-[15px] text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft size={18} className="mr-1" /> {backLabel}
      </Button>
      <Button
        onClick={onNext}
        disabled={nextDisabled}
        className="h-14 px-8 rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 disabled:opacity-40"
      >
        {nextLabel} <ChevronRight size={18} className="ml-1" />
      </Button>
    </div>
  );
}

function DropSlot({
  slot, files, onAdd, onRemove, onPreview, labels,
}: {
  slot: JobDocumentSlot;
  files: File[];
  onAdd: (list: FileList | File[]) => void;
  onRemove: (index: number) => void;
  onPreview: (file: File) => void;
  labels: { required: string; optional: string; drop: string; browse: string; replace: string; preview: string };
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const filled = files.length > 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
      }}
      className={`rounded-[24px] border-2 border-dashed transition-colors p-6 ${
        dragging
          ? "border-blue-500 bg-blue-50/60"
          : filled
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-4">
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              filled ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-400 border border-slate-200"
            }`}
          >
            {filled ? <Check size={18} strokeWidth={3} /> : slot.id === "photo" ? <ImageIcon size={18} /> : <FileText size={18} />}
          </span>
          <div>
            <p className="text-[15px] font-black text-slate-900 flex items-center gap-2 flex-wrap">
              {slot.label}
              <span
                className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  slot.required ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
                }`}
              >
                {slot.required ? labels.required : labels.optional}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-500 font-medium">{slot.desc}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-bold hover:bg-slate-50 transition shadow-sm"
        >
          <Upload size={15} />
          {filled && !slot.multiple ? labels.replace : labels.browse}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={slot.accept}
          multiple={slot.multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAdd(e.target.files);
            e.target.value = ""; // permet de re-sélectionner le même fichier
          }}
        />
      </div>

      {filled && (
        <ul className="mt-5 space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200"
            >
              <FileText size={15} className="text-slate-400 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm font-bold text-slate-900">{f.name}</span>
              <span className="text-xs text-slate-400 font-bold shrink-0">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onPreview(f)}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-blue-600 hover:bg-blue-50 font-bold text-xs transition shrink-0"
              >
                <Eye size={14} />
                {labels.preview}
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition shrink-0"
                aria-label="Retirer"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!filled && (
        <p className="mt-4 text-xs text-slate-400 font-bold uppercase tracking-widest">{labels.drop}</p>
      )}
    </div>
  );
}

/**
 * Visionneuse d'une pièce jointe, avant envoi.
 *
 * L'URL objet est créée à l'ouverture et révoquée à la fermeture : la garder
 * ouverte pendant toute la session retiendrait le fichier en mémoire, et une URL
 * révoquée trop tôt afficherait un cadre vide.
 */
function FilePreview({
  file, onClose, labels,
}: {
  file: File;
  onClose: () => void;
  labels: { close: string; download: string; unsupported: string };
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const kind = previewKind(file);

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // PORTAIL sur <body>, et pas un simple `position: fixed` dans l'arbre :
  // la transition de page du site anime un ancêtre en `transform`, lequel devient
  // le bloc conteneur de tout `position: fixed` enfant — la feuille se retrouvait
  // alors positionnée hors écran. Sortir du sous-arbre règle le problème.
  //
  // Un `<dialog>` + `showModal()` (top layer) a été essayé : il souffre du même
  // besoin, mais sa fermeture native ne remonte pas jusqu'à React (l'événement
  // `close` ne bulle pas), ce qui laissait le composant monté et `body.overflow`
  // bloqué à `hidden`. Ici, l'ÉTAT REACT reste la seule source de vérité.
  React.useEffect(() => setMounted(true), []);

  // Échap ferme la visionneuse, et le défilement de la page est gelé derrière.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      <div
        className="w-full max-w-4xl h-full max-h-[88vh] bg-white rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
          <FileText size={18} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-black text-slate-900 truncate">{file.name}</p>
            <p className="text-xs text-slate-500 font-medium">{formatBytes(file.size)}</p>
          </div>
          {url && (
            <a
              href={url}
              download={file.name}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition shrink-0"
            >
              <Download size={15} />
              <span className="hidden sm:inline">{labels.download}</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-slate-50">
          {!url ? null : kind === "image" ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-6">
              <img src={url} alt={file.name} className="max-w-full max-h-full object-contain rounded-xl shadow-sm" />
            </div>
          ) : kind === "pdf" ? (
            <iframe src={url} title={file.name} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-5">
              <FileText size={40} className="text-slate-300" />
              <p className="text-[15px] text-slate-600 font-medium max-w-sm leading-relaxed">
                {labels.unsupported}
              </p>
              <a
                href={url}
                download={file.name}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
              >
                <Download size={16} />
                {labels.download}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryCard({
  title, onEdit, editLabel, children,
}: {
  title: string; onEdit: () => void; editLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="p-6 rounded-[24px] bg-slate-50 border border-slate-200">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-bold text-blue-600 hover:text-blue-700 transition"
        >
          {editLabel}
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
