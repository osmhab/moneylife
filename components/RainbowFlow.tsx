"use client";

/**
 * Blobs + “vagues” (blobs étirés) — vibrants, transparents, lisibles.
 * - On garde tes animations ml-anim-drift-1/2/3 (+ d/variants).
 * - Les blobs “wave-like” sont faits via un wrapper transform (rotate + scaleX/scaleY).
 * - mix-blend-screen + blur pour un rendu Stripe-y sans écraser le H1.
 */
export default function RainbowFlow() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[720px] overflow-hidden">
      <div
        className="absolute inset-0 -rotate-3"
        style={{ filter: "saturate(1.25) contrast(1.05) brightness(1.03)" }}
      >
        {/* WAVE-BLOB 1 — Turquoise (très étiré, façon vague principale) */}
        <Blob
          left="-12%" top="-10%" w="85%" h="62%"
          color="#21E3B0" opacity={0.85} blur="blur-2xl"
          rotate={-10} scaleX={2.4} scaleY={1.0}
          anim="ml-anim-drift-1"
        />

        {/* WAVE-BLOB 2 — Bleu brand (étiré, passe derrière le titre sans le saturer) */}
        <Blob
          left="28%" top="-6%" w="80%" h="58%"
          color="#3B82F6" opacity={0.75} blur="blur-2xl"
          rotate={-12} scaleX={2.0} scaleY={1.0}
          anim="ml-anim-drift-2"
        />

        {/* WAVE-BLOB 3 — Violet → plus fin, un peu plus haut */}
        <Blob
          left="44%" top="-14%" w="70%" h="54%"
          color="#7C3AED" opacity={0.65} blur="blur-xl"
          rotate={-8} scaleX={1.8} scaleY={0.95}
          anim="ml-anim-drift-3"
        />

        {/* BLOB 4 — Turquoise clair (spot doux circulaire) */}
        <Blob
          left="6%" top="18%" w="46%" h="46%"
          color="#4fd1c5" opacity={0.55} blur="blur-2xl"
          rotate={0} scaleX={1.0} scaleY={1.0}
          anim="ml-anim-drift-2d"
        />

        {/* BLOB 5 — Fuchsia (accent punchy circu.), petit et rapide */}
        <Blob
          left="68%" top="6%" w="42%" h="42%"
          color="#EC4899" opacity={0.45} blur="blur-xl"
          rotate={-6} scaleX={1.0} scaleY={1.0}
          anim="ml-anim-drift-1d"
        />

        {/* BLOB 6 — Bleu profond (ombrage léger très large) */}
        <Blob
          left="32%" top="-18%" w="92%" h="82%"
          color="#0030A8" opacity={0.35} blur="blur-3xl"
          rotate={-10} scaleX={2.2} scaleY={1.05}
          anim="ml-anim-drift-3d"
        />
      </div>

      {/* Voile très léger pour garder le H1 lisible (augmente à /15 si besoin) */}
      <div className="absolute inset-0 bg-white/10" />
    </div>
  );
}

/* —————————————————————————————————————————————————————— */

function Blob({
  left, top, w, h,
  color,
  anim = "ml-anim-drift-1",
  blur = "blur-2xl",
  opacity = 0.8,
  rotate = 0,
  scaleX = 1,
  scaleY = 1,
}: {
  left: string; top: string; w: string; h: string;
  color: string;
  anim?: string; blur?: string; opacity?: number;
  rotate?: number; scaleX?: number; scaleY?: number;
}) {
  // Wrapper : pose la direction/forme (rotate + scale) SANS interférer avec l’animation
  return (
    <div
      className={`absolute mix-blend-screen ${blur}`}
      style={{
        left, top, width: w, height: h, opacity,
        transform: `rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`,
      }}
    >
      {/* Inner : animé (translate/scale via ml-anim-drift-*) */}
      <div
        className={`absolute inset-0 rounded-[100%] ${anim}`}
        style={{
          background: `radial-gradient(60% 60% at 50% 50%, ${color} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}
