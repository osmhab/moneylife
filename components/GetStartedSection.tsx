// components/GetStartedSection.tsx
import Link from "next/link";
import React from "react";

type Props = { className?: string };

export default function GetStartedSection({ className = "" }: Props) {
  return (
    <section className={`w-full bg-white ${className}`}>
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="rounded-3xl bg-slate-50 px-8 py-12 sm:px-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            {/* Titre */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900">
              Lancez-vous
            </h2>

            {/* Texte */}
            <p className="mt-4 text-base sm:text-lg leading-7 text-slate-600">
              Créez un compte pour vous lancer immédiatement, ou contactez-nous pour poser toutes vos
              questions. Nous sommes là pour vous accompagner.
            </p>

            {/* Actions */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/login"
                className="
                  inline-flex items-center justify-center
                  rounded-full bg-[#0050FF]
                  px-7 py-4
                  text-white text-base sm:text-lg font-semibold
                  shadow-[0_12px_28px_rgba(0,80,255,0.35)]
                  transition hover:opacity-90 active:translate-y-px
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0050FF] focus-visible:ring-offset-2
                "
              >
                Démarrer gratuitement
              </Link>

              <Link
                href="/contact"
                className="
                  text-base sm:text-lg font-semibold
                  text-[#0050FF]
                  transition hover:opacity-80
                "
              >
                Contactez-nous
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}