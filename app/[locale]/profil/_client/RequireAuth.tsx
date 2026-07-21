// app/profil/_client/RequireAuth.tsx
"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Props = {
  children: React.ReactNode;
  /** Où rediriger si non connecté */
  redirectTo?: string;
  /** UI affichée pendant le check auth */
  fallback?: React.ReactNode;
};

export default function RequireAuth({
  children,
  redirectTo = "/login",
  fallback = null,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const ok = !!user;
      setAuthed(ok);
      setLoading(false);

      if (!ok) {
        // redirige vers une vraie route publique
        router.replace(redirectTo);
      }
    });

    return () => unsub();
  }, [router, redirectTo]);

  if (loading) return <>{fallback}</>;
  if (!authed) return <>{fallback}</>; // le temps que router.replace fasse effet

  return <>{children}</>;
}