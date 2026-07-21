//app/[locale]/(site)/contact/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, Mail, MapPin, Clock, Send, Navigation } from "lucide-react"; // 👈 NOUVEAU: Import de Navigation

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { useTranslations } from "next-intl";

type ContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const [honeypot, setHoneypot] = useState("");
  const [startTime, setStartTime] = useState<number>(0);

  const t = useTranslations("Contact");

  useEffect(() => {
    setStartTime(Date.now());
  }, []);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && isEmail(email) && message.trim().length >= 10;
  }, [name, email, message]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    if (honeypot.length > 0) {
      setSent(true);
      return;
    }

    const submitTime = Date.now() - startTime;
    if (submitTime < 3000) {
      toast.error(t("toast_err_spam"));
      return;
    }

    setLoading(true);
    try {
      const payload: ContactPayload = {
        name: name.trim(),
        email: email.trim(),
        subject: "Message depuis /contact",
        message: message.trim(),
      };

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        toast.error(data?.error ?? t("toast_err_send"));
        return;
      }

      setSent(true);
    } catch {
      toast.error(t("toast_err_network"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-white font-sans selection:bg-blue-100 pb-32">
      
      {/* HEADER IMAGE */}
      <div className="absolute top-0 left-0 w-full h-[60vh] min-h-[500px]">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/bureaux-sion.jpg')" }} 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-white" />
      </div>

      {/* CONTENU PRINCIPAL */}
      <div className="relative z-10 pt-[20vh] sm:pt-[25vh] px-6 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
        
        {/* GAUCHE : TEXTE & INFOS */}
        <section className="flex flex-col justify-center">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 mb-6 w-fit shadow-sm">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">{t("badge")}</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.1] drop-shadow-sm">
            {t.rich("title", {
              blue: (chunks) => <span className="text-blue-600">{chunks}</span>
            })}
          </h1>
          
          <p className="mt-6 text-xl text-slate-700 font-medium leading-relaxed max-w-lg">
            {t("subtitle")}
          </p>

          <div className="mt-12 space-y-5">

            <div className="flex items-center gap-5 p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500">{t("response_time_label")}</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{t("response_time_value")}</p>
              </div>
            </div>

            {/* CARTE ADRESSE & BOUTON ITINÉRAIRE */}
            <div className="flex items-start gap-5 p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                <MapPin size={24} />
              </div>
              <div className="w-full">
                <p className="text-sm font-bold text-slate-500">{t("address_label")}</p>
                <p className="text-base font-bold text-slate-900 mt-1 leading-relaxed">
                  {t.rich("address_value", {
                    br: () => <br />
                  })}
                </p>
                
                {/* 👈 NOUVEAU : Bouton Itinéraire */}
                <a 
                  href="https://www.google.com/maps/dir/46.2282893,7.3623759/46.2282893,7.3623759/@46.2282358,7.3621695,21z/data=!4m6!4m5!1m1!4e1!1m1!4e1!3e2?entry=ttu&g_ep=EgoyMDI2MDUyNy4wIKXMDSoASAFQAw%3D%3D" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-[14px] hover:bg-blue-700 transition-all shadow-md w-fit"
                >
                  <Navigation size={18} />
                  {/* Ajouter t("btn_directions") dans next-intl */}
                  {t("btn_directions") || "Lancer l'itinéraire"}
                </a>
              </div>
            </div>

            {/* 👈 NOUVEAU : CARTE VIDÉO YOUTUBE (SHORT) */}
            <div className="flex flex-col gap-3 p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-sm font-bold text-slate-500">{t("video_label") || "Comment nous trouver en vidéo"}</p>
              
              {/* Conteneur au ratio 9:16 idéal pour un Short */}
              <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 shadow-inner">
                {/* ⚠️ Remplacer ID_DE_TA_VIDEO une fois l'upload terminé */}
                <iframe 
                  className="absolute top-0 left-0 w-full h-full"
                  src="https://www.youtube.com/embed/wVspsRhPo5U" 
                  title="Vidéo accès bureaux" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                />
              </div>
            </div>

          </div>
        </section>

        {/* DROITE : FORMULAIRE */}
        <section className="bg-white/95 backdrop-blur-xl rounded-[40px] p-8 md:p-10 lg:p-12 shadow-2xl border border-slate-200 mt-8 lg:mt-0">
          {!sent ? (
            <div>
              <div className="mb-8">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{t("form_title")}</h2>
              </div>

              <form onSubmit={onSubmit} className="space-y-6">
                
                <div style={{ display: 'none' }} aria-hidden="true">
                  <label htmlFor="website">{t("honeypot_label")}</label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">{t("name_label")}</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("name_placeholder")}
                    autoComplete="name"
                    className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 shadow-inner"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end ml-1">
                    <label className="text-sm font-bold text-slate-700">{t("email_label")}</label>
                    {email.length > 0 && !isEmail(email) && (
                      <span className="text-xs font-bold text-red-500">{t("err_email_format")}</span>
                    )}
                  </div>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("email_placeholder")}
                    autoComplete="email"
                    inputMode="email"
                    className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 shadow-inner"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end ml-1">
                    <label className="text-sm font-bold text-slate-700">{t("message_label")}</label>
                    {message.length > 0 && message.length < 10 && (
                      <span className="text-xs font-bold text-amber-500">{t("err_message_short")}</span>
                    )}
                  </div>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("message_placeholder")}
                    className="min-h-[160px] rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 shadow-inner resize-none p-4"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className="h-14 w-full rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 transition-all shadow-lg mt-6 disabled:opacity-50"
                >
                  {loading ? (
                    t("btn_sending")
                  ) : (
                    <span className="flex items-center gap-2">
                      {t("btn_submit")} <Send size={18} />
                    </span>
                  )}
                </Button>
              </form>
            </div>
          ) : (
            <div className="bg-emerald-50/50 rounded-[32px] p-10 border border-emerald-100 flex flex-col items-center justify-center text-center h-full min-h-[450px]">
              <div className="mb-6 rounded-full bg-emerald-100 p-5 shadow-sm">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              </div>

              <h2 className="text-4xl font-black text-slate-900 tracking-tight">{t("success_title")}</h2>
              <p className="mt-4 text-lg text-slate-600 font-medium">
                {t("success_desc")} <span className="font-bold text-slate-900">{email}</span>.
              </p>

              <div className="mt-10 w-full space-y-4">
                <Button
                  type="button"
                  className="h-14 w-full rounded-2xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 shadow-lg"
                  onClick={() => {
                    setSent(false);
                    setName("");
                    setEmail("");
                    setMessage("");
                  }}
                >
                  {t("btn_send_another")}
                </Button>

                <Link href="/" className="block">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 w-full rounded-2xl font-bold text-[15px] text-slate-600 border-slate-200 hover:bg-slate-50"
                  >
                    {t("btn_back_home")}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}