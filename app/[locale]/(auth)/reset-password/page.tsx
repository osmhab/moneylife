//app/[locale]/(auth)/reset-password/page.tsx
"use client";

import * as React from "react";
import { useState, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/firebase"; // Vérifie que le chemin correspond à ton index.ts
import { confirmPasswordReset } from "firebase/auth";
import { toast } from "sonner";

// 👈 NOUVEAU : Imports pour la traduction et le changement de langue
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function ResetPasswordForm() {
  const [isSuccess, setIsSuccess] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // On récupère le code de sécurité dans l'URL (?oobCode=XYZ)
  const oobCode = searchParams.get("oobCode");

  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("ResetPassword");

  // 👈 NOUVEAU : On définit le schéma Zod à l'intérieur pour utiliser `t()`
  const ResetPasswordSchema = useMemo(() => {
    return z.object({
      password: z.string().min(8, t("err_min_password")),
      confirmPassword: z.string()
    }).refine((data) => data.password === data.confirmPassword, {
      message: t("err_match_password"),
      path: ["confirmPassword"],
    });
  }, [t]);

  type ResetPasswordValues = z.infer<typeof ResetPasswordSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    if (!oobCode) {
      toast.error(t("toast_invalid_code"));
      return;
    }

    try {
      // On envoie le nouveau mot de passe à Firebase
      await confirmPasswordReset(auth, oobCode, values.password);
      setIsSuccess(true);
      toast.success(t("toast_success"));
      
      // Redirection automatique après 3 secondes
      setTimeout(() => {
        router.push("/login");
      }, 3000);
      
    } catch (err: any) {
      console.error(err);
      toast.error(t("toast_expired"));
    }
  };

  // Si l'utilisateur arrive sur la page sans code dans l'URL
  if (!oobCode) {
    return (
      <div className="text-center space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t("invalid_link_title")}</h1>
        <p className="text-sm text-slate-500 font-medium">{t("invalid_link_desc")}</p>
        <Link href="/forgot-password" className="inline-flex items-center justify-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700">
          {t("btn_retry")} <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Écran de succès
  if (isSuccess) {
    return (
      <div className="text-center flex flex-col items-center animate-in fade-in zoom-in duration-300">
        <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-3">
          {t("success_title")}
        </h1>
        <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">
          {t("success_desc")}
        </p>
        <Link
          href="/login"
          className="w-full h-14 bg-slate-900 text-white rounded-xl font-bold text-[15px] hover:bg-slate-800 transition-colors flex items-center justify-center shadow-sm"
        >
          {t("btn_to_login")}
        </Link>
      </div>
    );
  }

  // Formulaire de saisie
  return (
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
            type="password"
            placeholder={t("password_placeholder")}
            className={`w-full h-16 px-5 bg-white border ${
              errors.password ? "border-red-500" : "border-slate-200"
            } rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs font-medium text-red-500 mt-2 pl-1">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <input
            type="password"
            placeholder={t("confirm_placeholder")}
            className={`w-full h-16 px-5 bg-white border ${
              errors.confirmPassword ? "border-red-500" : "border-slate-200"
            } rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs font-medium text-red-500 mt-2 pl-1">
              {errors.confirmPassword.message}
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
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full bg-white sm:bg-[#f4f7f6] flex items-center justify-center sm:p-4 font-sans">
      <div className="w-full max-w-[420px] bg-white sm:rounded-xl sm:shadow-sm sm:border sm:border-slate-100 p-6 sm:p-10 flex flex-col">
        
        {/* Logo centré */}
        <div className="flex justify-center mb-10">
          <Link href="/">
            <img
              src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
              alt="CreditX"
              className="h-8 w-auto hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>

        {/* Le contenu du formulaire (ou les états de succès/erreur) */}
        <div className="flex-1">
          <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>}>
            <ResetPasswordForm />
          </Suspense>
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