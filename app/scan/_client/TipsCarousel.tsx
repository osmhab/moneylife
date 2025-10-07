// app/scan/_client/TipsCarousel.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  variant?: "saviez-vous";
  auto?: boolean;
  intervalMs?: number;
  clientToken?: string;
  full?: boolean;
  showTitle?: boolean;  // affiche "Saviez-vous" au-dessus
  showTimer?: boolean;  // affiche la barre de progression dans l’image
};

const SAVIEZ_VOUS: Array<{ title: string; text: string; img: string }> = [
  {
    title: "Vos données sont protégées",
    text: "MoneyLife chiffre vos documents et ne les partage qu’avec vous et vos conseillers de confiance.",
    img: "/images/security.jpg",
  },
  {
    title: "Lacunes de prévoyance",
    text: "En Suisse, plus de 60% des lacunes proviennent d’une couverture invalidité insuffisante.",
    img: "/images/coverage.jpg",
  },
  {
    title: "Bientôt sur MoneyLife",
    text: "Comparateur 3a, simulateur fiscal, export PDF, et bien plus encore.",
    img: "/images/next.jpg",
  },
];

export default function TipsCarousel({
  variant = "saviez-vous",
  auto = true,
  intervalMs = 6000,
  full = false,
  showTitle = true,
  showTimer = true,
}: Props) {
  const [api, setApi] = React.useState<any>();
  const [isHover, setIsHover] = React.useState(false);
  const [barKey, setBarKey] = React.useState(0);

  const items = React.useMemo(
    () => (variant === "saviez-vous" ? SAVIEZ_VOUS : []),
    [variant]
  );

  // Auto-advance robuste avec setInterval
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const clearTimer = React.useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);
  const startTimer = React.useCallback(() => {
    if (!auto) return;
    clearTimer();
    intervalRef.current = setInterval(() => {
      if (isHover) return; // pause au survol
      api?.scrollNext?.();
    }, intervalMs);
  }, [api, auto, intervalMs, isHover, clearTimer]);

  // Embla prêt → reset barre + (re)démarre le timer à chaque sélection
  React.useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setBarKey((k) => k + 1); // remonte la barre → relance l'animation
      startTimer();            // période complète jusqu’à la prochaine
    };
    api.on?.("select", onSelect);
    onSelect(); // démarrage initial
    return () => {
      api.off?.("select", onSelect);
      clearTimer();
    };
  }, [api, startTimer, clearTimer]);

  // Pause/reprise au survol : suspend l'interval + relance une barre complète à la reprise
  const handleEnter = () => setIsHover(true);
  const handleLeave = () => {
    setIsHover(false);
    startTimer();           // repart pour un cycle entier
    setBarKey((k) => k + 1); // reset visuel de la barre
  };

  if (!items.length) return null;

  return (
    <div
      className={full ? "w-full rounded-3xl overflow-hidden" : "w-full max-w-2xl mx-auto"}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {showTitle && <h2 className="mb-2 text-lg font-semibold px-1">Saviez-vous</h2>}

      <Carousel setApi={setApi} className="w-full" opts={{ loop: true }}>
        <CarouselContent>
          {items.map((item, i) => (
            <CarouselItem key={i}>
              <Card className="border shadow-sm overflow-hidden">
                {/* Image + barre de progression intégrée (CSS width 0→100) */}
                <div className="relative w-full aspect-[16/9] sm:aspect-[21/9]">
                  <Image
                    src={item.img}
                    alt={item.title}
                    fill
                    priority={i === 0}
                    className="object-cover"
                    sizes="100vw"
                  />

                  {showTimer && (
                    <div className="absolute inset-x-0 bottom-0">
                      {/* gradient pour lisibilité */}
                      <div className="pointer-events-none h-10 bg-gradient-to-t from-black/35 to-transparent" />

                      {/* Barre (animation CSS 0→100) */}
                      <div className="px-3 pb-2">
                        <div className="h-1.5 w-full rounded-full bg-white/35 backdrop-blur-[2px] overflow-hidden">
                          <div
                            key={barKey} // remount → relance l’animation
                            className={`h-1.5 rounded-full bg-white ml-fill ${isHover ? "ml-paused" : ""}`}
                            style={{ animationDuration: `${intervalMs}ms` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <CardContent className="p-6">
                  <h3 className="text-xl sm:text-2xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious className="hidden sm:flex" />
        <CarouselNext className="hidden sm:flex" />
      </Carousel>

      {/* Keyframes locales (styled-jsx) */}
      <style jsx>{`
        @keyframes ml_width_fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .ml-fill {
          width: 0%;
          animation-name: ml_width_fill;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
          will-change: width;
        }
        .ml-paused {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ml-fill { animation-duration: 0.001ms; animation-iteration-count: 1; }
        }
      `}</style>
    </div>
  );
}
