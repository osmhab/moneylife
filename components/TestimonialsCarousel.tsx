"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

type Props = { className?: string };

type T = {
  name: string;
  meta: string; // ex: "Lausanne • 39 ans"
  title: string; // ex: "Enfin clair"
  quote: string;
  rating: 5 | 4;
};

const BLUE = "#0050FF";
const NAVY = "#001D38";

export default function TestimonialsCarousel({ className = "" }: Props) {
  const items: T[] = useMemo(
    () => [
      {
        name: "Sophie M.",
        meta: "Lausanne • 34 ans",
        title: "Vue d'ensemble claire",
        quote:
          "J’ai scanné mon certificat LPP et j’ai compris en 2 minutes où étaient mes lacunes. Le résumé est super lisible, et le configurateur 3a m’a aidée à choisir une prime réaliste.",
        rating: 5,
      },
      {
        name: "Nicolas P.",
        meta: "Genève • 41 ans",
        title: "Rapide, pro, sans pression. Magnifique",
        quote:
          "J’avais toujours repoussé le sujet. Là, l’expérience est fluide : analyse, recommandations moneylife, puis comparaison des offres. Je me suis senti accompagné sans pression.",
        rating: 4,
      },
      {
        name: "Amira K.",
        meta: "Fribourg • 29 ans",
        title: "Comparaison d’offres vraiment utile",
        quote:
          "Le comparatif m’a évité de signer trop vite. Les infos importantes sont mises en avant, et j’ai pu avancer à mon rythme. Très bonne expérience.",
        rating: 5,
      },
      {
        name: "Markus D.",
        meta: "Zurich • 46 ans",
        title: "On sent la rigueur derrière le produit",
        quote:
          "L’interface est moderne, mais surtout j’ai apprécié la logique de calcul et les explications. Ça fait sérieux, et ça donne confiance pour signer en ligne.",
        rating: 4,
      },
    ],
    []
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: i * w, behavior: "smooth" });
    setIndex(i);
  };

  const prev = () => scrollTo(clamp(index - 1));
  const next = () => scrollTo(clamp(index + 1));

  // Sync index on manual swipe
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setIndex(clamp(i));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  return (
    <section className={`w-full bg-transparent ${className}`}>
      <div className="mx-auto max-w-7xl px-6 py-14 sm:py-18">
        {/* Header */}
        <div className="flex items-start justify-between gap-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight" style={{ color: NAVY }}>
              Ils parlent de MoneyLife
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-7 text-slate-600">
              Des retours concrets de clients qui ont scanné leur Certificat LPP, compris leurs lacunes et avancé
              sereinement jusqu’à la comparaison d'offres de 3e pilier et la signature.
            </p>
          </div>

          {/* Desktop arrows */}
          <div className="hidden sm:flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={prev}
              className="h-10 w-10 rounded-full bg-white shadow-sm ring-1 ring-black/5 grid place-items-center hover:shadow transition"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <button
              type="button"
              onClick={next}
              className="h-10 w-10 rounded-full bg-[#EEF2FF] shadow-sm ring-1 ring-black/5 grid place-items-center hover:shadow transition"
              aria-label="Suivant"
            >
              <ChevronRight className="h-5 w-5" style={{ color: BLUE }} />
            </button>
          </div>
        </div>

        {/* Cards track */}
        <div className="mt-10">
          <div
            ref={trackRef}
            className="
              flex
              overflow-x-auto
              snap-x snap-mandatory
              scroll-smooth
              [-webkit-overflow-scrolling:touch]
              pb-6
            "
            style={{ scrollbarWidth: "none" as any }}
          >
            {items.map((t, i) => (
              <div key={i} className="min-w-full snap-start sm:min-w-[calc(50%-10px)] lg:min-w-[calc(33.333%-14px)] pr-5">
                <TestimonialCard t={t} />
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="mt-2 flex justify-center gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollTo(i)}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === index ? 28 : 10,
                  backgroundColor: i === index ? BLUE : "rgba(15,23,42,0.20)",
                }}
                aria-label={`Aller au témoignage ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ t }: { t: T }) {
  return (
    <div className="h-full rounded-2xl bg-white shadow-[0_18px_50px_rgba(2,6,23,0.12)] overflow-hidden">
      {/* top blue bar */}
      <div className="h-1.5" style={{ backgroundColor: BLUE }} />

      <div className="p-7">
        <div className="flex items-center gap-1 text-amber-500">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-4 w-4" fill={i < t.rating ? "currentColor" : "none"} />
          ))}
        </div>

        <h3 className="mt-4 text-xl font-semibold text-slate-900">{t.title}</h3>
        <p className="mt-3 text-slate-600 leading-7">{t.quote}</p>

        <div className="mt-6 h-px bg-slate-200" />

        <div className="mt-5 flex items-center justify-between text-sm">
          <div>
            <div className="font-semibold text-slate-900">{t.name}</div>
            <div className="text-slate-500">{t.meta}</div>
          </div>
          <div className="text-slate-400 text-xs">MoneyLife</div>
        </div>
      </div>
    </div>
  );
}