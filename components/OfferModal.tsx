"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function OfferModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const alreadySeen = sessionStorage.getItem("ml-offer-modal-200");
    const today = new Date();
    const end = new Date("2026-01-31T23:59:59");

    if (!alreadySeen && today <= end) {
      setOpen(true);
      sessionStorage.setItem("ml-offer-modal-200", "true");
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-[2px] flex items-center justify-center px-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          aria-label="Fermer"
        >
          ✕
        </button>

        {/* ⚠️ Mets ton visuel dans /public/offer-200.png */}
        <div className="relative w-full aspect-[4/3]">
          <Image
            src="/offer-200.png"
            alt="Offre CHF 200"
            fill
            className="object-cover"
            priority
          />
        </div>

        <div className="p-6">
          <div className="text-center">
            <div className="text-sm text-slate-500">Offre spéciale</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              CHF 200.– par TWINT
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Souscrivez à un 3e pilier et recevez CHF 200.–.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Offre valable jusqu’au 31 janvier 2026.
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <Link
              href="/login"
              className="w-full rounded-2xl bg-[#0030A8] hover:bg-[#002786] text-white py-3 text-center font-semibold"
              onClick={() => setOpen(false)}
            >
              Démarrer
            </Link>

            <button
              type="button"
              className="w-full rounded-2xl border border-slate-200 py-3 text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Continuer sans l’offre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}