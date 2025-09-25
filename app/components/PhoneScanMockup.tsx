"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Phone + scan + barres avec oscillation organique en boucle (amplitude ++). */
export function PhoneScanMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(false);
  const [oscillate, setOscillate] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStart(true);
          const t = setTimeout(() => setOscillate(true), 2600); // après le scan
          return () => clearTimeout(t);
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative mx-auto aspect-[9/19] w-full max-w-[360px] overflow-hidden rounded-[2.2rem] border border-white/15 bg-[#0a1626] shadow-[0_0_0_8px_rgba(255,255,255,0.04)_inset]"
    >
      {/* notch */}
      <div className="absolute left-1/2 top-0 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black/60" />

      {/* halo périphérique */}
      <div className="pointer-events-none absolute -inset-16 bg-[radial-gradient(closest-side,rgba(79,209,197,0.22),transparent_70%)]" />

      {/* ÉCRAN */}
      <div className="relative z-10 flex h-full items-center justify-center">
        <div className="relative h-[72%] w-[78%] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-3 text-center text-xs text-white/70">Certificat LPP</div>

          {/* contenu “avant scan” */}
          <div className="relative space-y-2">
            <div className="h-3 rounded bg-white/10" />
            <div className="h-3 w-5/6 rounded bg-white/10" />
            <div className="h-3 w-2/3 rounded bg-white/10" />
          </div>

          {/* zone résultats */}
          <div className="relative mt-5 h-40 overflow-hidden rounded-xl border border-[#4fd1c5]/30 bg-[#031626] p-3">
            <div className="mb-2 text-[11px] text-[#4fd1c5]">Gaps estimés</div>
            <MiniBarsOrganic play={start} oscillate={oscillate} />
          </div>

          {/* —— SCAN ANIMÉ (masque + ligne) —— */}
          <div className={`pointer-events-none absolute inset-0 bg-[#0a1626]/70 ${start ? "animate-mlReveal" : ""}`} />
          <div className={`pointer-events-none absolute left-0 right-0 h-10 -translate-y-1/2 bg-[linear-gradient(180deg,transparent,rgba(79,209,197,0.25),transparent)] ${start ? "animate-mlScan" : ""}`} />
        </div>
      </div>

      {/* keyframes locales */}
      <style jsx global>{`
        @keyframes mlScan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        @keyframes mlReveal {
          0% { transform: translateY(0%); }
          100% { transform: translateY(-100%); }
        }
        .animate-mlScan { animation: mlScan 2.2s ease-in-out forwards 0.3s; }
        .animate-mlReveal { animation: mlReveal 2.2s ease-in-out forwards 0.3s; }
        @media (prefers-reduced-motion: reduce) {
          .animate-mlScan, .animate-mlReveal { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** Barres : reveal (0→1) puis oscillation organique infinie via RAF (amplitude augmentée). */
function MiniBarsOrganic({ play, oscillate }: { play: boolean; oscillate: boolean }) {
  // hauteurs de base (%)
  const heights = useMemo(() => [48, 64, 80, 72, 60], []);

  // amplitudes & vitesses plus larges (±14% à ±16% autour de la base)
  const params = useMemo(
    () => [
      { min: 0.86, max: 1.14, speed: 0.022 },
      { min: 0.84, max: 1.12, speed: 0.026 },
      { min: 0.88, max: 1.16, speed: 0.024 },
      { min: 0.85, max: 1.13, speed: 0.028 },
      { min: 0.87, max: 1.15, speed: 0.023 },
    ],
    []
  );

  // refs des calques "fill" qui portent le dégradé ET l'oscillation
  const fillRefs = useRef<HTMLDivElement[]>([]);
  const setFillRef = (i: number) => (el: HTMLDivElement | null) => {
    if (!el) return;
    fillRefs.current[i] = el;
  };

  // états internes pour l’oscillation
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef(
    heights.map(() => ({
      cur: 1, // scaleY courant
      tgt: 1, // scaleY cible
      lag: Math.round(Math.random() * 400), // démarrage décalé
    }))
  );

  useEffect(() => {
    if (!oscillate) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;

    const tick = () => {
      stateRef.current.forEach((s, i) => {
        const el = fillRefs.current[i];
        if (!el) return;

        if (s.lag > 0) {
          s.lag -= 16;
          return;
        }

        const { min, max, speed } = params[i % params.length];

        // si proche de la cible → nouvelle cible aléatoire plus éloignée
        if (Math.abs(s.cur - s.tgt) < 0.004) {
          // “marche” vers une cible aléatoire avec petit biais pour éviter de rester au centre
          const edgeBias = Math.random() < 0.5 ? min : max;
          const mix = Math.random() * 0.6 + 0.4; // 0.4 → 1.0
          s.tgt = lerp(rand(min, max), edgeBias, mix);
        }

        // lerp vers la cible + clamp doux (évite écrasement visuel)
        s.cur += (s.tgt - s.cur) * speed;
        s.cur = clamp(s.cur, 0.80, 1.20);

        el.style.transform = `scaleY(${s.cur})`;
        el.style.transformOrigin = "bottom";
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [oscillate, params]);

  return (
    <div className="flex h-24 items-end gap-2">
      {heights.map((h, i) => (
        <div key={i} className="relative w-6 rounded-t-md" style={{ height: `${h}%` }}>
          {/* REVEAL container */}
          <div
            className="absolute bottom-0 left-0 right-0 origin-bottom rounded-t-md overflow-hidden"
            style={{
              height: "100%",
              transform: play ? "scaleY(1)" : "scaleY(0)",
              transition: "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
              transitionDelay: play ? `${300 + i * 120}ms` : "0ms",
            }}
          >
            {/* FILL (dégradé visible) — oscille en boucle */}
            <div
              ref={setFillRef(i)}
              className="relative h-full w-full origin-bottom rounded-t-md bg-gradient-to-b from-[#4fd1c5] to-[#0030A8]"
              style={{ transform: "scaleY(1)" }}
            >
              <span
                className="pointer-events-none absolute -top-1 left-0 right-0 block h-1 rounded-full"
                style={{ background: "rgba(79,209,197,0.65)", filter: "blur(2px)" }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* utils */
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
