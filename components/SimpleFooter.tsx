"use client";

import Link from "next/link";

export default function SimpleFooter() {
  return (
    <footer className="mt-16 border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-xl px-4 py-8 text-center text-xs text-zinc-500">
        <div className="mb-3 flex justify-center">
          <img
            src="/logoMoneyLifeIconeDark.svg"
            alt="MoneyLife"
            className="h-5 opacity-70"
          />
        </div>

        <p className="mb-2">
          © {new Date().getFullYear()} MoneyLife · Tous droits réservés
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/legal/confidentialite" className="hover:underline">
            Confidentialité
          </Link>
          <Link href="/legal/cookies" className="hover:underline">
            Cookies
          </Link>
          <Link href="/legal" className="hover:underline">
            Mentions légales
          </Link>
        </div>
      </div>
    </footer>
  );
}