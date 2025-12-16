// app/(auth)/login/_client/LoginForm.tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startRouteLoading } from "@/app-components/route-loading";

// shadcn/ui
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// validation
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// icons
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Chrome } from "lucide-react";

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

// import { resolvePostAuthRedirect } from "@/lib/auth/postAuthRedirect";
import { waitForAuthUser } from "@/lib/legacy/auth/waitForAuthUser";

const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Minimum 8 caractères"),
});
type LoginValues = z.infer<typeof LoginSchema>;

function FieldWrapper({
  label, htmlFor, children,
}: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function resolvePostLoginTarget(userEmail?: string | null) {
  // fallback (SSR / inconnu)
  const email = (userEmail || "").toLowerCase().trim();

  // ✅ règle email (ton cas habib.osmani@creditx.ch)
  if (email.endsWith("@creditx.ch")) {
    return "/admin/dashboard";
  }

  // ✅ règle domaine du site
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();

    if (
      host.endsWith("creditx.ch") ||
      host === "moneylife.ch" ||
      host.endsWith(".moneylife.ch")
    ) {
      return "/admin/dashboard";
    }
  }

  return "/dashboard";
}


export default function LoginForm({
  nextParam,
  signupHref,
}: {
  nextParam: string | null;
  signupHref: string;
}) {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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
      toast.success("Connexion réussie");
      const uid = auth.currentUser!.uid;

      // pose le cookie serveur pour les pages RSC
      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      // (facultatif) docPath local
      try { localStorage.setItem("ml_clientDocPath", `clients/${uid}`); } catch {}

      const target = nextParam || resolvePostLoginTarget(auth.currentUser?.email);
      router.replace(target);

    } catch (err: any) {
      console.error(err);
      const code: string = err?.code || "auth/unknown";
      let message = "Impossible de se connecter.";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") message = "Email ou mot de passe incorrect.";
      if (code === "auth/user-not-found") message = "Aucun compte avec cet email.";
      if (code === "auth/too-many-requests") message = "Trop de tentatives. Réessayez plus tard.";
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
      toast.success("Connecté avec Google");
      const uid = auth.currentUser!.uid;

      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      try { localStorage.setItem("ml_clientDocPath", `clients/${uid}`); } catch {}
      const target = nextParam || resolvePostLoginTarget(auth.currentUser?.email);
      router.replace(target);

    } catch (err: any) {
      console.error(err);
      const message = err?.message || "Connexion Google impossible.";
      toast.error(message);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleReset = async () => {
    const email = getValues("email");
    if (!email) {
      toast.message("Entrez votre email pour recevoir un lien de réinitialisation.");
      return;
    }
    try {
      startRouteLoading();
      setResetLoading(true);
      await sendPasswordResetEmail(auth, email);
      toast.success("Email de réinitialisation envoyé.");
    } catch (err: any) {
      console.error(err);
      toast.error("Impossible d'envoyer l'email de réinitialisation.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 py-12">
    
    {/* Logo MoneyLife */}
    <img
      src="/logoMoneyLife.svg"
      alt="MoneyLife"
      className="mb-8 h-10 w-auto opacity-90"
    />
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Se connecter</CardTitle>
          <CardDescription>
            Accédez à votre espace MoneyLife. Pas encore de compte ?{" "}
            <Link href={signupHref} className="text-primary underline-offset-4 hover:underline">
              Créer un compte
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <FieldWrapper label="Email" htmlFor="email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="vous@exemple.ch" className="pl-9" {...register("email")} />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </FieldWrapper>

            <FieldWrapper label="Mot de passe" htmlFor="password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPw ? "text" : "password"} placeholder="••••••••" className="pl-9 pr-9" {...register("password")} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Masquer" : "Afficher"}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </FieldWrapper>

            <div className="flex items-center justify-between text-sm">
              <div />
              <button type="button" onClick={handleReset} className="text-primary underline-offset-4 hover:underline disabled:opacity-50" disabled={resetLoading}>
                {resetLoading ? "Envoi…" : "Mot de passe oublié ?"}
              </button>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Se connecter
            </Button>
          </form>

          <div className="relative my-6">
            <div className="h-px w-full bg-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">ou</span>
          </div>

          <Button variant="outline" className="w-full" onClick={continueWithGoogle} disabled={loadingGoogle}>
            {loadingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Chrome className="mr-2 h-4 w-4" />} 
            Continuer avec Google
          </Button>
        </CardContent>
      </Card>
          {/* Footer */}
    <footer className="mt-10 text-center text-xs text-muted-foreground">
      <p>
        © {new Date().getFullYear()} MoneyLife ·{" "}
        <Link href="/pricing" className="hover:underline">
          Tarifs
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:underline">
          Confidentialité
        </Link>
      </p>
    </footer>
    </div>
  );
}
