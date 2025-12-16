"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function RequireAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const email = user.email?.toLowerCase() || "";

      // 🔐 Règle d'admin MoneyLife
      const isPlatformAdmin =
        user.uid === "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2" || // ton UID
        email.endsWith("@creditx.ch") ||
        email.endsWith("@moneylife.ch");

      if (!isPlatformAdmin) {
        router.push("/dashboard"); // client normal → dashboard client
        return;
      }

      setAllowed(true);
    });

    return () => unsub();
  }, [router]);

  if (allowed === null) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Vérification de vos droits d&apos;accès…
      </div>
    );
  }

  return <>{children}</>;
}