"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

type Props = { className?: string };

const BRAND = {
  navy: "#001D38",
  primary: "#0030A8",
  success: "#4fd1c5",
};

const HOVER_GRADIENT_SCAN =
  "linear-gradient(135deg, rgba(245,158,11,0.95) 0%, rgba(251,113,133,0.95) 55%, rgba(249,115,22,0.95) 100%)";

const HOVER_GRADIENT_ANALYSE =
  "linear-gradient(135deg, rgba(59,130,246,0.95) 0%, rgba(79,209,197,0.95) 55%, rgba(34,197,94,0.92) 100%)";

const HOVER_GRADIENT_CONFIG =
  "linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(147,51,234,0.95) 55%, rgba(79,70,229,0.92) 100%)";

const HOVER_GRADIENT_SIGN =
  "linear-gradient(135deg, rgba(56,189,248,0.95) 0%, rgba(59,130,246,0.95) 55%, rgba(29,78,216,0.92) 100%)";



export default function ProcessShowcase({ className = "" }: Props) {
  return (
    <section className={`w-full bg-white ${className}`}>
      {/* ✅ Gradient “glissant” global (scopé à ce composant) */}
      <style jsx global>{`
        @keyframes mlGradSlide {
          0% {
            transform: translate3d(-6%, -4%, 0) scale(1.06);
          }
          50% {
            transform: translate3d(6%, 4%, 0) scale(1.06);
          }
          100% {
            transform: translate3d(-6%, -4%, 0) scale(1.06);
          }
        }
        .ml-grad-slide {
          animation: mlGradSlide 2.6s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .ml-grad-slide {
            animation: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7">
          <ProcessCardScanLPP />
          <ProcessCardAnalyse />
          <ProcessCardConfig />
          <ProcessCardSign />
        </div>
      </div>
    </section>
  );
}

/* =========================
   CARD 1 — Scan LPP
========================= */
function ProcessCardScanLPP() {
  return (
    <div
      className={[
        "group block rounded-[22px] bg-white overflow-hidden",
        "shadow-[0_18px_50px_rgba(2,6,23,0.14)]",
        "transition-transform duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(2,6,23,0.18)]",
      ].join(" ")}
    >
      {/* ✅ Wrapper global : pas de px ici (sinon le texte colle) */}
      <div className="relative pt-2 pb-8 sm:pt-2 sm:pb-10">
        {/* ✅ Visuel : px-2 seulement ici (blanc↔visuel serré) */}
        <div className="px-2">
          <div className="relative rounded-[18px] p-6 sm:p-7 overflow-hidden bg-[rgba(15,23,42,0.04)] max-sm:bg-transparent">
            {/* Glow */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 blur-2xl scale-[1.08]"
              style={{
                background:
                  "radial-gradient(60% 60% at 30% 40%, rgba(255,122,24,0.35) 0%, rgba(251,113,133,0.18) 45%, transparent 70%)",
              }}
            />
            {/* Gradient glissant */}
            <div
              className="pointer-events-none absolute inset-[-35%] opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 ml-grad-slide"
              style={{ background: HOVER_GRADIENT_SCAN }}
            />

            <div className="relative z-10">
              {/* Widget à gauche (parallax down) */}
              <div className="absolute left-6 sm:left-7 top-1/2 -translate-y-1/2 w-[190px] sm:w-[210px] transition-transform duration-300 ease-out sm:group-hover:translate-y-[-46%] sm:group-hover:-translate-x-[2px] max-sm:translate-y-[-46%] max-sm:-translate-x-[2px]">
                <div className="rounded-[12px] bg-white shadow-[0_14px_30px_rgba(2,6,23,0.18)] ring-1 ring-black/5 overflow-hidden">
                  <div className="p-3">
                    <div
                      className="h-9 rounded-[10px] grid place-items-center text-[11px] font-semibold text-white"
                      style={{ backgroundColor: BRAND.success }}
                    >
                      Scanner mon certificat
                    </div>
                    <div className="py-2 text-center text-[11px] text-slate-500">
                      ou
                    </div>
                    <div className="h-9 rounded-[10px] grid place-items-center text-[10px] font-semibold text-slate-900 bg-white">
                      Entrer mes données manuellement
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificat à droite (parallax up) */}
              <div className="ml-auto w-[320px] sm:w-[360px] transition-transform duration-300 ease-out sm:group-hover:translate-y-[-6px] sm:group-hover:translate-x-[2px] max-sm:-translate-y-[6px] max-sm:translate-x-[2px]">
                <div className="rounded-[8px] bg-white shadow-[0_10px_22px_rgba(2,6,23,0.10)] overflow-hidden">
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="h-8 w-8 flex items-center justify-center">
                        <Image
                          src="/iconeAXA.svg"
                          alt="AXA"
                          width={32}
                          height={32}
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Certificat personnel
                      </div>
                    </div>
                    <div className="mt-3 h-px bg-slate-200" />
                  </div>
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-2 text-[9px] text-slate-500">
                      <div className="font-semibold text-slate-700">Personne</div>
                      <div className="text-slate-700">Dupont Jean</div>
                      <div>Date de naissance</div>
                      <div className="text-slate-700">29.01.1995</div>
                      <div>Employeur</div>
                      <div className="text-slate-700">ABC Sàrl</div>
                      <div className="mt-2 col-span-2 h-px bg-slate-200" />
                      <div className="font-semibold text-slate-700">Salaire</div>
                      <div className="text-slate-700">Déduction de coordination</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Contenu : padding normal (évite que la pastille + texte collent) */}
        <div className="px-6 sm:px-7">
          {/* Tag */}
          <div className="mt-5">
            <div
            className="
                inline-flex items-center gap-3
                rounded-[14px]
                px-5 py-3
                bg-gradient-to-br from-slate-50 to-white
            "
            >
            <Image
                src="/cartes/LPPCarteIcone.svg" // ⬅ adapte selon la carte
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
            />
            <span
                className="text-[13px] font-semibold"
                style={{ color: BRAND.navy }}
            >
                Scan LPP
            </span>
            </div>
          </div>

          {/* Texte */}
          <div className="mt-5 pb-1">
            <h3
  className="
    text-[20px] sm:text-[19px]
    font-semibold sm:font-black
  "
  style={{ color: BRAND.navy }}
>
              Scannez votre Certificat LPP
            </h3>
            <p className="mt-2 text-[15px] sm:text-[14px] leading-7 sm:leading-6 text-slate-600 max-w-[56ch]">
              MoneyLife vous permet de scanner votre certificat LPP pour vous aider à réaliser votre analyse de
              prévoyance.
            </p>

            <Link
            href="/login"
              className={[
                "mt-5 text-[15px] sm:text-[13px] font-semibold",
                "transition-all duration-300 ease-out",
                "opacity-0 translate-y-1",
                "sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:delay-75",
                "max-sm:opacity-100 max-sm:translate-y-0",
              ].join(" ")}
              style={{ color: "#0050FF" }}
            >
              Scannez votre certificat <span aria-hidden>›</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   CARD 2 — Analyse
========================= */
function ProcessCardAnalyse() {
  return (
    <div
      className={[
        "group block rounded-[22px] bg-white overflow-hidden",
        "shadow-[0_18px_50px_rgba(2,6,23,0.14)]",
        "transition-transform duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(2,6,23,0.18)]",
      ].join(" ")}
    >
      {/* ✅ Wrapper global : pt-2 / pb conservé, pas de px (sinon le texte colle) */}
      <div className="relative pt-2 pb-8 sm:pt-2 sm:pb-10">
        {/* ✅ Visuel : px-2 seulement ici */}
        <div className="px-2">
          <div className="relative rounded-[18px] p-6 sm:p-7 overflow-hidden bg-[rgba(15,23,42,0.04)] max-sm:bg-transparent">
            {/* Glow */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 blur-2xl scale-[1.08]"
              style={{
                background:
                  "radial-gradient(60% 60% at 25% 35%, rgba(59,130,246,0.25) 0%, rgba(79,209,197,0.18) 45%, transparent 72%)",
              }}
            />
            {/* Gradient glissant */}
            <div
              className="pointer-events-none absolute inset-[-35%] opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 ml-grad-slide"
              style={{ background: HOVER_GRADIENT_ANALYSE }}
            />

            <div className="relative z-10">
              <div className="mx-auto w-[330px] sm:w-[360px] transition-transform duration-300 ease-out sm:group-hover:-translate-y-1 sm:group-hover:translate-x-[2px] max-sm:-translate-y-1 max-sm:translate-x-[2px]">
                <div className="rounded-[14px] bg-white shadow-[0_14px_30px_rgba(2,6,23,0.14)] overflow-hidden">
                  <div className="px-4 pt-4 pb-2">
                    <div className="text-[13px] font-bold text-slate-900">
                      Invalidité — projection jusqu&apos;à 65 ans
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Prestations d&apos;assurances / AVS-AI / LAA / LPP
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      De 37 ans à 65 ans.
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="relative h-[170px] rounded-[10px] bg-slate-50 ring-1 ring-slate-200 overflow-hidden">
                      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.06)_1px,transparent_1px)] bg-[length:100%_28px]" />
                      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-[#FDBA74]/85" />
                      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[#9CA3AF]/55" />
                      <div className="absolute left-[22%] bottom-0 w-[2px] h-full bg-slate-200/90" />

                      <div className="absolute right-6 bottom-6 w-[170px] rounded-xl bg-white shadow-lg p-3">
                        <div className="text-[12px] font-semibold text-slate-900">
                          40 ans
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                          <div className="flex justify-between">
                            <span>AVS / AI</span>
                            <span className="text-slate-900">29’268 CHF</span>
                          </div>
                          <div className="flex justify-between">
                            <span>LPP</span>
                            <span className="text-slate-900">42’806 CHF</span>
                          </div>
                          <div className="mt-2 border-t pt-2 flex justify-between">
                            <span className="text-slate-500">Total</span>
                            <span className="text-slate-900">72’074 CHF</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Lacune</span>
                            <span className="text-red-500 font-semibold">13’538 CHF</span>
                          </div>
                        </div>
                      </div>

                      <div className="absolute left-[22%] top-[40%] h-2 w-2 rounded-full bg-orange-500 shadow" />
                      <div className="absolute left-[22%] top-[55%] h-2 w-2 rounded-full bg-amber-400 shadow" />
                      <div className="absolute left-[22%] top-[72%] h-2 w-2 rounded-full bg-amber-500 shadow" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Contenu : padding normal */}
        <div className="px-6 sm:px-7">
          {/* Tag */}
          <div className="mt-5">
            <div
            className="
                inline-flex items-center gap-3
                rounded-[14px]
                px-5 py-3
                bg-gradient-to-br from-slate-50 to-white
            "
            >
            <Image
                src="/cartes/AnalyseCarteIcone.svg"
                alt=""
                width={32}
                height={32}
                className="h-10 w-10"
            />
            <span
                className="text-[13px] font-semibold"
                style={{ color: BRAND.navy }}
            >
                Analyse
            </span>
            </div>
          </div>

          {/* Texte */}
          <div className="mt-5 pb-1">
            <h3
  className="
    text-[20px] sm:text-[19px]
    font-semibold sm:font-black
  "
  style={{ color: BRAND.navy }}
>
              Analyse de prévoyance
            </h3>
            <p className="mt-2 text-[15px] sm:text-[14px] leading-7 sm:leading-6 text-slate-600 max-w-[56ch]">
              Cliquez sur un bouton et obtenez votre analyse de prévoyance détaillée. MoneyLife vous affiche vos
              prestations et lacunes en cas d&apos;invalidité, décès ainsi que votre situation financière à la retraite.
            </p>

            <Link
                href="/login"
              className={[
                "mt-5 text-[15px] sm:text-[13px] font-semibold",
                "transition-all duration-300 ease-out",
                "opacity-0 translate-y-1",
                "sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:delay-75",
                "max-sm:opacity-100 max-sm:translate-y-0",
              ].join(" ")}
              style={{ color: "#0050FF" }}
            >
              Démarrez votre analyse <span aria-hidden>›</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   CARD 3 — Config 3e pilier
========================= */
function ProcessCardConfig() {
  return (
    <div
      className={[
        "group block rounded-[22px] bg-white overflow-hidden",
        "shadow-[0_18px_50px_rgba(2,6,23,0.14)]",
        "transition-transform duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(2,6,23,0.18)]",
      ].join(" ")}
    >
      {/* ✅ Wrapper global : pt-2 / pb conservé, pas de px */}
      <div className="relative pt-2 pb-8 sm:pt-2 sm:pb-10">
        {/* ✅ Visuel : px-2 seulement ici */}
        <div className="px-2">
          {/* Zone visuelle */}
          <div className="relative rounded-[18px] p-6 sm:p-7 overflow-hidden bg-[rgba(15,23,42,0.04)] max-sm:bg-transparent">
            {/* Glow */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 blur-2xl scale-[1.08]"
              style={{
                background:
                  "radial-gradient(60% 60% at 30% 35%, rgba(168,85,247,0.26) 0%, rgba(99,102,241,0.18) 45%, transparent 72%)",
              }}
            />
            {/* Gradient glissant */}
            <div
              className="pointer-events-none absolute inset-[-35%] opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 ml-grad-slide"
              style={{ background: HOVER_GRADIENT_CONFIG }}
            />

            <div className="relative z-10">
              {/* “UI card” du configurateur (parallax up) */}
              <div className="mx-auto w-[340px] sm:w-[372px] transition-transform duration-300 ease-out sm:group-hover:-translate-y-1 sm:group-hover:translate-x-[2px] max-sm:-translate-y-1 max-sm:translate-x-[2px]">
                <div className="rounded-[14px] bg-white shadow-[0_14px_30px_rgba(2,6,23,0.14)] overflow-hidden">
                  {/* Top line */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] text-slate-500">
                          Recommandation automatique MoneyLife
                        </div>
                      </div>
                      {/* switch */}
                      <div className="flex items-center gap-2 rounded-full bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                        <span className="text-[10px] text-slate-500">Recommandation</span>
                        <div className="h-4 w-8 rounded-full bg-[#001D38] relative">
                          <div className="absolute right-[2px] top-[2px] h-3 w-3 rounded-full bg-white" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Inner form */}
                  <div className="px-4 pb-4">
                    <div className="rounded-[12px]  bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[12px] font-bold text-slate-900">
                            Type de 3e pilier & prime
                          </div>
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Étape complétée
                          </div>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-700 rounded-full bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                          MoneyLife Configurator V.1
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <div className="rounded-full bg-[#001D38] px-3 py-2 text-[10px] font-semibold text-white">
                          3e pilier lié (3a)
                        </div>
                        <div className="rounded-full bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                          3e pilier libre (3b)
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[10px] font-semibold text-slate-700">Âge actuel</div>
                        <div className="mt-2 h-9 rounded-[10px] bg-slate-50 ring-1 ring-slate-200 px-3 flex items-center text-[11px] text-slate-700">
                          37
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[10px] font-semibold text-slate-700">
                          Date de début de l&apos;offre
                        </div>
                        <div className="mt-2 flex gap-2">
                          <div className="rounded-[10px] bg-[#001D38] px-3 py-2 text-[10px] font-semibold text-white">
                            01.01.2026
                          </div>
                          <div className="rounded-[10px] bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                            01.02.2026
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* (fade retiré, comme tu l'as fait) */}
            </div>
          </div>
        </div>

        {/* ✅ Contenu : padding normal */}
        <div className="px-6 sm:px-7">
          {/* Tag */}
          <div className="mt-5">
            <div
  className="
    inline-flex items-center gap-3
    rounded-[14px]
    px-5 py-3
    bg-gradient-to-br from-slate-50 to-white
  "
>
  <Image
    src="/cartes/ConfigCarteIcone.svg" // ⬅ adapte selon la carte
    alt=""
    width={34}
    height={34}
    className="h-10 w-10"
  />
  <span
    className="text-[13px] font-semibold"
    style={{ color: BRAND.navy }}
  >
    Config
  </span>
</div>
          </div>

          {/* Texte */}
          <div className="mt-5 pb-1">
            <h3
  className="
    text-[20px] sm:text-[19px]
    font-semibold sm:font-black
  "
  style={{ color: BRAND.navy }}
>
              Configurez votre solution (3e pilier)
            </h3>
            <p className="mt-2 text-[15px] sm:text-[14px] leading-7 sm:leading-6 text-slate-600 max-w-[56ch]">
              Configurez votre solution de prévoyance grâce au moteur de calcul MoneyLife. Suivez la recommandation
              MoneyLife ou montez votre propre solution avec ou sans couverture d&apos;assurance : à vous de choisir.
            </p>

            {/* CTA */}
            <Link
                href="/login"
              className={[
                "mt-5 text-[15px] sm:text-[13px] font-semibold",
                "transition-all duration-300 ease-out",
                "opacity-0 translate-y-1",
                "sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:delay-75",
                "max-sm:opacity-100 max-sm:translate-y-0",
              ].join(" ")}
              style={{ color: "#0050FF" }}
            >
              Créez votre 3e pilier <span aria-hidden>›</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   CARD 4 — Comparez & signez
========================= */
function ProcessCardSign() {
  return (
    <div
      className={[
        "group block rounded-[22px] bg-white overflow-hidden",
        "shadow-[0_18px_50px_rgba(2,6,23,0.14)]",
        "transition-transform duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(2,6,23,0.18)]",
      ].join(" ")}
    >
      {/* ✅ Wrapper global : pt-2 / pb conservé, pas de px */}
      <div className="relative pt-2 pb-8 sm:pt-2 sm:pb-10">
        {/* ✅ Visuel : px-2 seulement ici */}
        <div className="px-2">
          {/* Zone visuelle */}
          <div className="relative rounded-[18px] p-6 sm:p-7 overflow-hidden bg-[rgba(15,23,42,0.04)] max-sm:bg-transparent">
            {/* Glow */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 blur-2xl scale-[1.08]"
              style={{
                background:
                  "radial-gradient(60% 60% at 30% 35%, rgba(56,189,248,0.28) 0%, rgba(59,130,246,0.16) 45%, transparent 72%)",
              }}
            />
            {/* Gradient glissant */}
            <div
              className="pointer-events-none absolute inset-[-35%] opacity-0 transition-opacity duration-300 ease-out sm:group-hover:opacity-100 max-sm:opacity-100 ml-grad-slide"
              style={{ background: HOVER_GRADIENT_SIGN }}
            />

            <div className="relative z-10">
              {/* “UI offers list” (parallax up) */}
              <div className="mx-auto w-[360px] sm:w-[390px] transition-transform duration-300 ease-out sm:group-hover:-translate-y-1 sm:group-hover:translate-x-[2px] max-sm:-translate-y-1 max-sm:translate-x-[2px]">
                <div className="rounded-[14px] bg-white shadow-[0_14px_30px_rgba(2,6,23,0.14)] overflow-hidden">
                  {/* header */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="text-[12px] font-semibold text-slate-900">
                      Demande d&apos;offre du 18.12.2025
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <span className="rounded-full bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                        Prêt pour consultation
                      </span>
                      <span>3e pilier lié (3a)</span>
                      <span>•</span>
                      <span>Prime cible 604,8 CHF/mois</span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {[
                        "Valeurs de rachat",
                        "Coût des primes de risque",
                        "Capital projeté modéré",
                      ].map((t) => (
                        <div
                          key={t}
                          className="rounded-[10px] bg-white px-3 py-2 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200"
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-slate-200" />

                  {/* offer rows */}
                  <div className="p-4 space-y-3">
                    {/* AXA row */}
                    <div className="rounded-[14px] bg-white p-3 shadow-[0_8px_18px_rgba(2,6,23,0.08)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-[10px] bg-white ring-1 ring-slate-200 flex items-center justify-center">
                            <Image
                              src="/iconeAXA.svg"
                              alt="AXA"
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-slate-900">
                                AXA
                              </span>
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
                                #1
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                              <div>Capital projeté 297’450 CHF</div>
                              <div>Valeur de rachat au plus tôt 3’550 CHF</div>
                              <div>Primes de risque estimées 908,4 CHF/an</div>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Score 8.3
                        </div>
                      </div>
                    </div>

                    {/* Swiss Life row */}
                    <div className="rounded-[14px] bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-[10px] bg-white ring-1 ring-slate-200 flex items-center justify-center">
                            <Image
                              src="/iconeSwissLife.svg"
                              alt="Swiss Life"
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-slate-900">
                                Swiss Life
                              </span>
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5">
                                #2
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                              <div>Capital projeté 240’278 CHF</div>
                              <div>Valeur de rachat au plus tôt 7’189 CHF</div>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Score 8.0
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-2" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Contenu : padding normal */}
        <div className="px-6 sm:px-7">
          {/* Tag */}
          <div className="mt-5">
            <div
                className="
                    inline-flex items-center gap-3
                    rounded-[14px]
                    px-5 py-3
                    bg-gradient-to-br from-slate-50 to-white
                "
                >
                <Image
                    src="/cartes/SignCarteIcone.svg" // ⬅ adapte selon la carte
                    alt=""
                    width={32}
                    height={32}
                    className="h-10 w-10"
                />
                <span
                    className="text-[13px] font-semibold"
                    style={{ color: BRAND.navy }}
                >
                    Sign
                </span>
                </div>
          </div>

          {/* Texte */}
          <div className="mt-5 pb-1">
            <h3
  className="
    text-[20px] sm:text-[19px]
    font-semibold sm:font-black
  "
  style={{ color: BRAND.navy }}
>
              Comparez et signez vos offres sur MoneyLife
            </h3>
            <p className="mt-2 text-[15px] sm:text-[14px] leading-7 sm:leading-6 text-slate-600 max-w-[56ch]">
              Étudiez, comparez et signez votre contrat de 3e pilier en ligne. Vous décidez seul ou demandez conseil à nos
              spécialistes en prévoyance.
            </p>

            {/* CTA */}
            <Link
                href="/login"
              className={[
                "mt-5 text-[15px] sm:text-[13px] font-semibold",
                "transition-all duration-300 ease-out",
                "opacity-0 translate-y-1",
                "sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:delay-75",
                "max-sm:opacity-100 max-sm:translate-y-0",
              ].join(" ")}
              style={{ color: "#0050FF" }}
            >
              Comparez et signez en ligne <span aria-hidden>›</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}