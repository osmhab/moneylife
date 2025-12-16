'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

/* === Icônes === */
function IconDeath({ size = 48, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <g fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M37.5 51 36 48 34.5 51Z" />
        <path d="M45,66 C46.6568542,66 48,64.6568542 48,63 L48,60 C50.3061773,59.9985596 52.407436,58.67546 53.4053908,56.5963876 C54.4033455,54.5173152 54.1213615,52.0502591 52.68,50.25 C59.7128529,43.4519936 61.9165714,33.0661198 58.2502765,23.9979231 C54.5839815,14.9297264 45.7813041,8.99376634 36,8.99376634 C26.2186959,8.99376634 17.4160185,14.9297264 13.7497235,23.9979231 C10.0834286,33.0661198 12.2871471,43.4519936 19.32,50.25 C17.8786385,52.0502591 17.5966545,54.5173152 18.5946092,56.5963876 C19.592564,58.67546 21.6938227,59.9985596 24,60 L24,63 C24,64.6568542 25.3431458,66 27,66 L45,66 Z" />
        <circle cx="45" cy="36" r="3" />
        <circle cx="27" cy="36" r="3" />
      </g>
    </svg>
  );
}

function IconInvalidite({ size = 48, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      {/* ✅ Translate global pour tout garder proportionné */}
      <g transform="translate(12.0642, 9)" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={35.9358201} cy={3} r={3} />
        <polyline points="41.9358201 48 44.9358201 27 26.9358201 30" />
        <polyline points="2.93582008 15 11.9358201 6 28.4358201 15 21.3558201 25.5" />
        <path d="M0.655820081,34.5 C-1.07340629,40.156951 0.683476877,46.3019169 5.14164494,50.1898542 C9.59981301,54.0777914 15.9266312,54.9825651 21.2958201,52.5" />
        <path d="M29.2158201,43.5 C30.9450465,37.843049 29.1881633,31.6980831 24.7299952,27.8101458 C20.2718272,23.9222086 13.945009,23.0174349 8.57582008,25.5" />
      </g>
    </svg>
  );
}

function IconRetraite({ size = 48, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <g fill="none" stroke={color} strokeLinecap="round">
        <path strokeWidth={5} strokeLinejoin="round" d="M39,24 C39,16.4267741 32.8261296,10.158594 24.7938858,9.1436804 C24.0442737,9.04896321 19.4075723,9.19967344 17.9677973,9.57259158 C11.055022,11.3630793 6,17.147269 6,24 L12,24 L15,21 L18,24 L30,24" />
        <path strokeWidth={4} strokeLinejoin="round" d="M39,21.42 C42.037824,19.1740504 45.7221714,17.9740058 49.5,18 C50.4625204,18 51.4056597,18.0748513 52.3227876,18.2184881 C53.0833677,18.337607 55.8925282,19.1516254 56.5329269,19.4262709 C60.2646823,21.0266957 63.4203733,25.5512721 66,33 L57,33 L54,30 L51,33 L42,33" transform="translate(52.5, 25.4998) rotate(7) translate(-52.5, -25.4998)" />
        <path strokeWidth={5} strokeLinejoin="round" d="M16.62,51.42 C18.4316827,49.6040445 19.7904447,48.2420778 20.6962861,47.3341 C21.4783438,46.5501979 22.4762592,44.4522412 23.6900324,41.0402299 L29.34,38.67 L31.44,36.57 L33.57,34.44 L39.93,28.08 C34.08,22.2 24.12,22.68 17.67,29.13 C13.37,33.43 13.02,40.86 16.62,51.42 Z" />
        <path strokeWidth={5} d="M32.7362185,44.5966786 C34.2362185,52.6014978 32.49,62.4231322 30,68.8269875 C33.6521892,68.8269875 36.3913312,68.8269875 38.2174258,68.8269875 C39.0579978,68.8269875 40.3188559,68.8269875 42,68.8269875 C42.3775726,67.7187739 42.7016849,66.5978806 42.9771961,65.4686962 C47.0798286,48.6540302 40.4056068,30.0008686 39,24" />
      </g>
    </svg>
  );
}

/* === SpinCardLoader avec texte % === */
export default function SpinCardLoader({
  size = 96,
  bg = '#003263',
  duration = 0.8,
  pause = 0.3,
  borderRadius = '1rem',
  iconScale = 0.5,
}: {
  size?: number;
  bg?: string;
  duration?: number;
  pause?: number;
  borderRadius?: string;
  iconScale?: number;
}) {
  const rotation = useMotionValue(0);
  const Icons = useMemo(() => [IconDeath, IconInvalidite, IconRetraite], []);
  const [frontIndex, setFrontIndex] = useState(0);
  const [backIndex, setBackIndex] = useState(1);
  const dirRef = useRef<1 | -1>(1);

  const [percent, setPercent] = useState(0);
  const FrontIcon = Icons[frontIndex];
  const BackIcon = Icons[backIndex];

  // boucle pourcentage (0 → 100)
  useEffect(() => {
    let alive = true;
    const loop = async () => {
      while (alive) {
        for (let i = 0; i <= 100; i++) {
          if (!alive) break;
          setPercent(i);
          await new Promise((r) => setTimeout(r, 20)); // vitesse progression
        }
      }
    };
    loop();
    return () => { alive = false; };
  }, []);

  // flip aller-retour avec pause de face
  const norm = (deg: number) => ((deg % 360) + 360) % 360;
  useEffect(() => {
    let alive = true;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    (async () => {
      while (alive) {
        const current = norm(rotation.get());
        const target = dirRef.current === 1 ? 180 : 0;
        if (current !== 0 && current !== 180) {
          rotation.set(current < 90 || current > 270 ? 0 : 180);
        }
        await animate(rotation, target, {
          duration,
          ease: [0.4, 0.0, 0.2, 1.0],
        }).finished;
        if (!alive) break;
        await sleep(pause * 1000);
        if (dirRef.current === 1) setFrontIndex((_) => (backIndex + 1) % Icons.length);
        else setBackIndex((_) => (frontIndex + 1) % Icons.length);
        dirRef.current = dirRef.current === 1 ? -1 : 1;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, duration, pause, Icons.length, frontIndex, backIndex]);

  return (
    <div className="flex flex-col items-center gap-3" style={{ perspective: 800 }}>
      <motion.div
        style={{
          width: size,
          height: size,
          position: 'relative',
          transformStyle: 'preserve-3d',
          rotateY: rotation,
        }}
      >
        {/* Face front */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bg,
            borderRadius,
            display: 'grid',
            placeItems: 'center',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(0deg)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.18), 0 6px 10px rgba(0,0,0,0.12)',
          }}
        >
          <FrontIcon size={Math.round(size * iconScale)} color="#FFFFFF" />
        </div>

        {/* Face back */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bg,
            borderRadius,
            display: 'grid',
            placeItems: 'center',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.18), 0 6px 10px rgba(0,0,0,0.12)',
          }}
        >
          <BackIcon size={Math.round(size * iconScale)} color="#FFFFFF" />
        </div>
      </motion.div>

      
    </div>
  );
}