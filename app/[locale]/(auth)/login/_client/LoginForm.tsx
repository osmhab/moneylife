//app/[locale]/(auth)/login/_client/LoginForm.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startRouteLoading } from "@/app-components/route-loading";

// validation
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// icons
import { Loader2 } from "lucide-react";

// firebase
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

// toast
import { toast } from "sonner";
import { waitForAuthUser } from "@/lib/legacy/auth/waitForAuthUser";

// 👈 NOUVEAU : Import de next-intl
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function resolvePostLoginTarget(userEmail?: string | null) {
  const email = (userEmail || "").toLowerCase().trim();

  // admins internes seulement
  if (
    email === "habib.osmani@creditx.ch" ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  ) {
    return "/admin/offres-wizard";
  }

  // tous les autres = dashboard client
  return "/dashboard/prevoyance";
}

export default function LoginForm({
  nextParam,
  signupHref,
}: {
  nextParam: string | null;
  signupHref: string;
}) {
  const router = useRouter();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("Login");

  // 👈 NOUVEAU : On définit le schéma Zod ICI pour pouvoir utiliser la traduction `t()`
  const LoginSchema = useMemo(() => {
    return z.object({
      email: z.string().email(t("err_invalid_email")),
      password: z.string().min(8, t("err_min_password")),
    });
  }, [t]);

  type LoginValues = z.infer<typeof LoginSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    try {
      startRouteLoading();
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast.success(t("toast_success"));
      const uid = auth.currentUser!.uid;

      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      try { localStorage.setItem("ml_clientDocPath", `clients/${uid}`); } catch {}

      const target = resolvePostLoginTarget(auth.currentUser?.email);
      router.replace(nextParam || target);

    } catch (err: any) {
      console.error(err);
      const code: string = err?.code || "auth/unknown";
      let message = t("toast_err_generic");
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") message = t("toast_err_credentials");
      if (code === "auth/user-not-found") message = t("toast_err_not_found");
      if (code === "auth/too-many-requests") message = t("toast_err_too_many");
      toast.error(message);
    }
  };

  const continueWithGoogle = async () => {
    try {
      startRouteLoading();
      setLoadingGoogle(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      toast.success(t("toast_google_success"));
      const uid = auth.currentUser!.uid;

      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      try { localStorage.setItem("ml_clientDocPath", `clients/${uid}`); } catch {}
      const target = resolvePostLoginTarget(auth.currentUser?.email);
      router.replace(nextParam || target);

    } catch (err: any) {
      console.error(err);
      toast.error(t("toast_google_err"));
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleReset = async () => {
    const email = getValues("email");
    if (!email) {
      toast.error(t("toast_reset_empty"));
      return;
    }
    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, email);
      toast.success(t("toast_reset_success"));
    } catch (err: any) {
      console.error(err);
      toast.error(t("toast_reset_err"));
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const u = await waitForAuthUser();
      if (u) {
        await fetch("/api/auth/set-uid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: u.uid }),
        });
        try { localStorage.setItem("ml_clientDocPath", `clients/${u.uid}`); } catch {}
        const target = nextParam || resolvePostLoginTarget(u.email);
        startRouteLoading();
        router.replace(target);
      }
    })();
  }, []);

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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          <div>
            <input
              id="email"
              type="email"
              placeholder={t("email_placeholder")}
              className={`w-full h-16 px-5 bg-white border ${errors.email ? 'border-red-500' : 'border-slate-200'} rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
              {...register("email")}
            />
          </div>

          <div className="relative">
            <input
              id="password"
              type="password"
              placeholder={t("password_placeholder")}
              className={`w-full h-16 pl-5 pr-24 bg-white border ${errors.password ? 'border-red-500' : 'border-slate-200'} rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
              {...register("password")}
            />
            <Link
              href="/forgot-password"
              className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors bg-white px-1"
            >
              {t("forgot_password")}
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-16 mt-4 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-colors flex items-center justify-center disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t("btn_submit")}
          </button>
        </form>

        <div className="my-8 flex items-center gap-3">
          <div className="h-px bg-slate-100 flex-1" />
          <span className="text-xs text-slate-400 font-medium">{t("or")}</span>
          <div className="h-px bg-slate-100 flex-1" />
        </div>

        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={loadingGoogle}
          className="w-full h-16 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-base hover:bg-slate-50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {loadingGoogle ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
                <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
                <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
                <path d="M12.0004 24C15.2404 24 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26536 14.29L1.27539 17.385C3.25539 21.31 7.3104 24 12.0004 24Z" fill="#34A853" />
              </svg>
              {t("btn_google")}
            </>
          )}
        </button>

        <div className="mt-8 text-center">
          <Link href={signupHref} className="text-[15px] font-bold text-slate-900 hover:text-blue-600 transition-colors">
            {t("create_account")}
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