//app/[locale]/(auth)/signup/_client/SignupForm.tsx
"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startRouteLoading } from "@/app-components/route-loading";

// shadcn/ui
import { Checkbox } from "@/components/ui/checkbox";

// form/validation
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// icons
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

// firebase
import { auth, db } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// toast
import { toast } from "sonner";
import { waitForAuthUser } from "@/lib/legacy/auth/waitForAuthUser";

// Traductions
import { useTranslations, useLocale } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function SignupForm({
  nextParam,
  loginHref,
  refParam,
}: {
  nextParam: string | null;
  loginHref: string;
  refParam: string | null;
}) {
  const router = useRouter();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const t = useTranslations("Signup");
  const locale = useLocale();

  const SignupSchema = useMemo(() => {
    return z
      .object({
        email: z.string().email(t("err_invalid_email")),
        password: z.string().min(8, t("err_min_password")),
        acceptLegal: z
          .boolean()
          .refine((v) => v === true, { message: t("err_accept_legal") }),
      });
  }, [t]);

  type SignupValues = z.infer<typeof SignupSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    watch,
  } = useForm<SignupValues>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { email: "", acceptLegal: false },
  });

  const acceptLegal = watch("acceptLegal");

  const onSubmit = async (values: SignupValues) => {
    try {
      startRouteLoading();
      const cred = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      await cred.user.getIdToken(true);

      // Profil
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: null,
        provider: "password",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Client Data
      await setDoc(doc(db, "clients", cred.user.uid), {
        displayName: null,
        email: cred.user.email,
        photoURL: `https://api.dicebear.com/7.x/rings/svg?seed=${cred.user.uid}&radius=25`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(refParam ? { invitedBy: refParam } : {}) // 👈 NOUVEAU : Enregistre le parrain
      }, { merge: true });

      // Consentement légal
      await setDoc(doc(db, "clients", cred.user.uid), {
        legal: {
          acceptedAt: serverTimestamp(),
          version: "2026-03-31",
          cguUrl: "/legal/cgu",
          privacyUrl: "/legal/confidentialite",
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq('track', 'CompleteRegistration');
      }

      toast.success(t("toast_success"));

      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cred.user.email, firstName: "Client", locale: locale }),
      }).catch(console.error);

      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
      });

      try { localStorage.setItem("ml_clientDocPath", `clients/${cred.user.uid}`); } catch {}

      router.replace(nextParam || "/dashboard/prevoyance");
    } catch (err: any) {
      console.error(err);
      const code: string = err?.code || "auth/unknown";
      let message = t("toast_err_generic");

      if (code === "permission-denied") message = t("toast_err_denied");
      if (code === "auth/email-already-in-use") message = t("toast_err_in_use");
      if (code === "auth/weak-password") message = t("toast_err_weak");
      if (code === "auth/invalid-email") message = t("err_invalid_email");

      setError("email", { message });
      toast.error(message);
    }
  };

  const signUpWithGoogle = async () => {
    if (!acceptLegal) {
      setError("acceptLegal", { message: t("err_accept_legal") });
      toast.error(t("toast_google_legal_err"));
      return;
    }

    try {
      startRouteLoading();
      setLoadingGoogle(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        provider: "google",
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, "clients", user.uid), {
        displayName: user.displayName || null,
        email: user.email,
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/rings/svg?seed=${user.uid}&radius=25`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(refParam ? { invitedBy: refParam } : {}) // 👈 NOUVEAU : Enregistre le parrain
      }, { merge: true });

      await setDoc(doc(db, "clients", user.uid), {
        legal: {
          acceptedAt: serverTimestamp(),
          version: "2026-03-31",
          cguUrl: "/legal/cgu",
          privacyUrl: "/legal/confidentialite",
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq('track', 'CompleteRegistration');
      }

      toast.success(t("toast_google_success"));

      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, firstName: user.displayName?.split(" ")[0] || "Client", locale: locale }),
      }).catch(console.error);

      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
      });

      try { localStorage.setItem("ml_clientDocPath", `clients/${user.uid}`); } catch {}

      const target = nextParam || "/dashboard/prevoyance";
      router.replace(target);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || t("toast_google_err"));
    } finally {
      setLoadingGoogle(false);
    }
  };

  useEffect(() => {
    (async () => {
      const u = await waitForAuthUser();
      if (u) {
        await fetch("/api/auth/set-uid", {
          method: "POST",
          headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
        });
        try { localStorage.setItem("ml_clientDocPath", `clients/${u.uid}`); } catch {}
        router.replace(nextParam || "/dashboard/prevoyance");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen w-full flex font-sans bg-white sm:bg-slate-50">
      
      {/* PARTIE GAUCHE (IMAGE & BRANDING) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center p-12 xl:p-20">
        <img 
          src="/images/expert.jpg" 
          alt="CreditX Prévoyance" 
          className="absolute inset-0 w-full h-full object-cover opacity-95"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/20 to-transparent" />
        
        <div className="relative z-10 w-full max-w-lg">
          {/* 👈 LOGO GAUCHE AGRANDI (h-12 à xl:h-16) */}
          <img
            src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
            alt="CreditX"
            className="h-12 xl:h-14 w-auto mb-8 invert brightness-200"
          />
          {/* 👈 TEXTES TRADUITS */}
          <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight mb-5">
            {t.rich("branding_title", {
              br: () => <br />
            })}
          </h2>
          <p className="text-lg text-slate-200 font-medium leading-relaxed mb-8 max-w-md">
            {t("branding_desc")}
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full w-fit border border-emerald-400/20 backdrop-blur-sm">
            <ShieldCheck size={16} /> {t("branding_badge")}
          </div>
        </div>
      </div>

      {/* PARTIE DROITE (FORMULAIRE) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-[420px] md:max-w-[480px] bg-white sm:rounded-[24px] sm:shadow-xl sm:border sm:border-slate-100 p-6 sm:p-10 md:p-12 flex flex-col transition-all">
          
          {/* EN-TÊTE DU FORMULAIRE */}
          <div className="mb-8 md:mb-10 text-center">
            {/* 👈 LOGO DROITE (MOBILE UNIQUEMENT) AGRANDI (h-10 à h-12) */}
            <Link href="/" className="inline-block lg:hidden mb-6">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd"
                alt="CreditX"
                className="h-10 md:h-12 w-auto hover:opacity-80 transition-all mx-auto"
              />
            </Link>
            {/* 👈 TITRE AJOUTÉ */}
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              {t("form_title")}
            </h1>
          </div>

          <div className="flex-1">
            <form className="space-y-4 md:space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <input
                  id="email"
                  type="email"
                  placeholder={t("email_placeholder")}
                  className={`w-full h-16 px-5 bg-white border ${errors.email ? 'border-red-500' : 'border-slate-200'} rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
                  {...register("email")}
                />
              </div>

              <div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("password_placeholder")}
                    className={`w-full h-16 pl-5 pr-12 bg-white border ${errors.password ? 'border-red-500' : 'border-slate-200'} rounded-xl text-base placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all`}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1} 
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs font-medium text-red-500 mt-1 pl-1">{errors.password.message}</p>
                )}
              </div>

              <div className="pt-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="acceptLegal"
                    checked={acceptLegal}
                    onCheckedChange={(v) => setValue("acceptLegal", v === true, { shouldValidate: true })}
                    className="mt-0.5 h-5 w-5 border-slate-300 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
                  />
                  <label htmlFor="acceptLegal" className="text-sm md:text-base text-slate-500 leading-snug">
                    {t.rich("legal_text", {
                      cgu: (chunks) => <Link href="/legal/cgu" target="_blank" className="text-slate-900 font-bold hover:underline">{chunks}</Link>,
                      privacy: (chunks) => <Link href="/legal/confidentialite" target="_blank" className="text-slate-900 font-bold hover:underline">{chunks}</Link>
                    })}
                  </label>
                </div>
                {errors.acceptLegal && (
                  <p className="text-xs font-medium text-red-500 mt-2 pl-8">{errors.acceptLegal.message}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full h-16 md:h-16 mt-6 bg-slate-900 text-white rounded-xl font-bold text-base md:text-lg hover:bg-slate-800 transition-colors flex items-center justify-center disabled:opacity-50 shadow-sm"
                disabled={isSubmitting || !acceptLegal}
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t("btn_submit")}
              </button>
            </form>

            <div className="my-8 md:my-10 flex items-center gap-3">
              <div className="h-px bg-slate-100 flex-1" />
              <span className="text-xs text-slate-400 font-medium">{t("or")}</span>
              <div className="h-px bg-slate-100 flex-1" />
            </div>

            <button
              type="button"
              onClick={signUpWithGoogle}
              disabled={loadingGoogle}
              className="w-full h-16 md:h-16 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-base md:text-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loadingGoogle ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-5 md:h-6 w-5 md:w-6" aria-hidden="true">
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
              <Link href={loginHref} className="text-[15px] md:text-base font-bold text-slate-900 hover:text-blue-600 transition-colors">
                {t("login_link")}
              </Link>
            </div>
          </div>

          <div className="mt-8 md:mt-10 pt-6 border-t border-slate-100 flex justify-center">
            <div className="bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 inline-flex">
              <LanguageSwitcher />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}