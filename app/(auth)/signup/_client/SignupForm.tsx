// app/(auth)/signup/_client/SignupForm.tsx
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// shadcn/ui
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// form/validation
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// icons
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Chrome,
} from "lucide-react";

// firebase
import { auth, db } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// toast (sonner)
import { toast } from "sonner";

// import { resolvePostAuthRedirect } from "@/lib/auth/postAuthRedirect";
import { waitForAuthUser } from "@/lib/legacy/auth/waitForAuthUser";

/* =============================================
   Schema & types
============================================= */
const SignupSchema = z
  .object({
    email: z.string().email("Email invalide"),
    password: z.string().min(8, "Minimum 8 caractères"),
    confirm: z.string().min(8, "Minimum 8 caractères"),
    displayName: z.string().optional(),
  })
  .refine((vals) => vals.password === vals.confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm"],
  });

type SignupValues = z.infer<typeof SignupSchema>;

/* =============================================
   Helper UI
============================================= */
function FieldWrapper({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/* =============================================
   Client Component
============================================= */
export default function SignupForm({
  nextParam,
  loginHref,
}: {
  nextParam: string | null;
  loginHref: string;
}) {
  const router = useRouter();

  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<SignupValues>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: SignupValues) => {
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      if (values.displayName) {
        await updateProfile(cred.user, { displayName: values.displayName });
      }

      // users/{uid} (profil)
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || values.displayName || null,
          provider: "password",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // clients/{uid} (nouvelle source de vérité produit)
      await setDoc(
        doc(db, "clients", cred.user.uid),
        {
          displayName: cred.user.displayName || values.displayName || null,
          email: cred.user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Compte créé avec succès");

      // pose le cookie serveur pour les pages RSC
      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: cred.user.uid }),
      });

      try {
        localStorage.setItem("ml_clientDocPath", `clients/${cred.user.uid}`);
      } catch {}

      const target = nextParam || `/profil`;

      router.replace(target);
    } catch (err: any) {
      console.error(err);
      const code: string = err?.code || "auth/unknown";
      let message = "Une erreur est survenue.";
      if (code === "auth/email-already-in-use")
        message = "Cet email est déjà utilisé.";
      if (code === "auth/weak-password")
        message = "Mot de passe trop faible (≥ 8 caractères).";
      if (code === "auth/invalid-email") message = "Email invalide.";
      setError("email", { message });
      toast.error(message);
    }
  };

  const signUpWithGoogle = async () => {
    try {
      setLoadingGoogle(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);

      // users/{uid}
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || null,
          provider: "google",
          photoURL: user.photoURL || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // clients/{uid}
      await setDoc(
        doc(db, "clients", user.uid),
        {
          displayName: user.displayName || null,
          email: user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Connexion avec Google réussie");

      // pose le cookie serveur pour les pages RSC
      await fetch("/api/auth/set-uid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid }),
      });

      try {
        localStorage.setItem("ml_clientDocPath", `clients/${user.uid}`);
      } catch {}

      const target = nextParam || `/profil/${user.uid}`;
      router.replace(target);
    } catch (err: any) {
      console.error(err);
      const message = err?.message || "Connexion Google impossible.";
      toast.error(message);
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: u.uid }),
        });
        try {
          localStorage.setItem("ml_clientDocPath", `clients/${u.uid}`);
        } catch {}
        const target = nextParam || `/profil/${u.uid}`;
        router.replace(target);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Créer un compte</CardTitle>
          <CardDescription>
            Rejoignez MoneyLife en quelques secondes. Vous avez déjà un compte?{" "}
            <a
              href={loginHref}
              className="text-primary underline-offset-4 hover:underline"
            >
              Se connecter
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <FieldWrapper label="Nom (optionnel)" htmlFor="displayName">
              <Input
                id="displayName"
                placeholder="Ex. Habib"
                {...register("displayName")}
              />
            </FieldWrapper>

            <FieldWrapper label="Email" htmlFor="email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="vous@exemple.ch"
                  className="pl-9"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </FieldWrapper>

            <FieldWrapper label="Mot de passe" htmlFor="password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                  {...register("password")}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Masquer" : "Afficher"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </FieldWrapper>

            <FieldWrapper label="Répéter le mot de passe" htmlFor="confirm">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type={showPw2 ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                  {...register("confirm")}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
                  onClick={() => setShowPw2((v) => !v)}
                  aria-label={showPw2 ? "Masquer" : "Afficher"}
                >
                  {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && (
                <p className="text-sm text-destructive">
                  {errors.confirm.message}
                </p>
              )}
            </FieldWrapper>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Créer mon compte
            </Button>
          </form>

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              ou
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={signUpWithGoogle}
            disabled={loadingGoogle}
          >
            {loadingGoogle ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Chrome className="mr-2 h-4 w-4" />
            )}
            Continuer avec Google
          </Button>

          <p className="mt-6 text-xs text-muted-foreground">
            En créant un compte, vous acceptez nos Conditions d'utilisation et
            notre Politique de confidentialité.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
