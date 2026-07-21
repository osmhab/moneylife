//app/[locale]/(auth)/forgot-password/page.tsx
"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";

// 👈 NOUVEAU : Imports pour la traduction et le changement de langue
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState(false);
  
  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("ForgotPassword");

  // 👈 NOUVEAU : On déplace le schéma ici pour le traduire dynamiquement
  const ForgotSchema = useMemo(() => {
    return z.object({
      email: z.string().email(t("err_invalid_email")),
    });
  }, [t]);

  type ForgotValues = z.infer<typeof ForgotSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ForgotValues>({
    resolver: zodResolver(ForgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotValues) => {
    try {
      // On appelle notre propre API au lieu de Firebase Client
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("err_generic"));
      }

      setIsSent(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t("toast_err"));
    }
  };

  return (
    <div className="min-h-screen w-full bg-white sm:bg-[#f4f7f6] flex items-center justify-center sm:p-4 font-sans">
      <div className="w-full max-w-[420px] bg-white sm:rounded-xl sm:shadow-sm sm:border sm:border-slate-100 p-6 sm:p-10">
        
        <div className="flex justify-center mb-10">
          <Link href="/">
            <img
              src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
              alt="CreditX"
              className="h-8 w-auto hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>

        {!isSent ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-bold text-slate-900 mb-3">
                {t("title")}
              </h1>
              <p className="text-sm text-slate-500 font-medium leading-relaxed px-4">
                {t("description")}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <input
                  id="email"
                  type="email"
                  placeholder={t("email_placeholder")}
                  className={`w-full h-16 px-5 bg-white border ${
                    errors.email ? "border-red-500" : "border-slate-200"
                  } rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs font-medium text-red-500 mt-2 pl-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-16 mt-2 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-colors flex items-center justify-center disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  t("btn_submit")
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center flex flex-col items-center">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <MailCheck className="h-8 w-8 text-slate-900" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-3">
              {t("sent_title")}
            </h1>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">
              {t("sent_description")} <strong>{getValues("email")}</strong>.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 text-[15px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back_to_login")}
          </Link>
        </div>

        {/* 👈 NOUVEAU : Sélecteur de langue en bas de la carte */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center">
          <div className="bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 inline-flex">
            <LanguageSwitcher />
          </div>
        </div>

      </div>
    </div>
  );
}