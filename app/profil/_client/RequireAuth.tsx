//app/profil/_client/RequireAuth.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// firebase client à la racine
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Props = {
  children: React.ReactNode;
  /** rediriger si non connecté (défaut: "/(auth)/login") */
  redirectTo?: string;
  /** texte/JSX pendant le chargement */
  fallback?: React.ReactNode;
};

export default function RequireAuth({
  children,
  redirectTo = "/(auth)/login",
  fallback = <div className="p-6 text-sm text-muted-foreground">Chargement…</div>,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading"|"authed"|"guest">("loading");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (user) setStatus("authed");
      else setStatus("guest");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (status === "guest") router.replace(redirectTo);
  }, [status, router, redirectTo]);

  if (status === "loading") return fallback;
  if (status === "guest") return null; // on va rediriger

  return <>{children}</>;
}