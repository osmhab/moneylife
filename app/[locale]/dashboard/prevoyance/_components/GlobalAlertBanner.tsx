"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";

export default function GlobalAlertBanner() {
  const [hasPending, setHasPending] = useState(false);
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // On cherche s'il y a des plans en attente d'action par le client
        const q = query(
          collection(db, "clients", user.uid, "plans"),
          where("status", "==", "PENDING_CLIENT")
        );
        
        const unsub = onSnapshot(q, (snap) => {
          setHasPending(!snap.empty);
        });
        
        return () => unsub();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  if (!hasPending) return null;

  return (
    <div 
      onClick={() => router.push(`/${locale}/dashboard/prevoyance?tab=prive`)}
      className="fixed top-0 left-0 w-full h-12 bg-orange-500 text-white px-6 flex items-center justify-between cursor-pointer hover:bg-orange-600 transition-colors z-[100] shadow-md"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={18} className="animate-pulse" />
        <span className="text-xs font-black uppercase tracking-widest truncate">
          Action requise : Une offre vous attend !
        </span>
      </div>
      <ChevronRight size={18} />
    </div>
  );
}