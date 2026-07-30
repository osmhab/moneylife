"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type SceneKey = "CERT" | "ANALYSE" | "CFG3A" | "OFFERS" | "SIGN";

/**
 * Apple-like light theme tokens
 */
const APPLE = {
  ink: "rgba(2, 6, 23, 0.92)",
  ink2: "rgba(2, 6, 23, 0.72)",
  ink3: "rgba(2, 6, 23, 0.55)",
  border: "rgba(15, 23, 42, 0.10)",
  borderStrong: "rgba(15, 23, 42, 0.16)",
  surface: "rgba(255, 255, 255, 0.92)",
  surface2: "rgba(248, 250, 252, 0.92)",
  shadow: "0 30px 90px rgba(2, 6, 23, 0.12)",
  shadowCard: "0 18px 40px -24px rgba(0,0,0,0.22)",
  shadowCardStrong: "0 20px 60px -26px rgba(2,6,23,0.24)",
  accent: "rgba(2, 6, 23, 0.88)",
};

function useTimeline(total = 15) {
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const loop = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      setT(elapsed % total);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [total]);

  return { t, total };
}

/**
 * Timing (15s total)
 * - CERT:    0.0  → 3.0  (3.0s)
 * - ANALYSE: 3.0  → 6.0  (3.0s)
 * - CFG3A:   6.0  → 10.5 (4.5s)
 * - OFFERS:  10.5 → 13.5 (3.0s)
 * - SIGN:    13.5 → 15.0 (1.5s)
 */
const CUTS = {
  CERT_START: 0.0,
  CERT_END: 3.0,

  ANALYSE_START: 3.0,
  ANALYSE_END: 6.0,

  CFG_START: 6.0,
  CFG_END: 10.5,

  OFFERS_START: 10.5,
  OFFERS_END: 13.5,

  SIGN_START: 13.5,
  SIGN_END: 15.0,
};

export default function Story9x16() {
  const { t, total } = useTimeline(15);

  const active: SceneKey =
    t < CUTS.CERT_END
      ? "CERT"
      : t < CUTS.ANALYSE_END
      ? "ANALYSE"
      : t < CUTS.CFG_END
      ? "CFG3A"
      : t < CUTS.OFFERS_END
      ? "OFFERS"
      : "SIGN";

  return (
    <div
      className="relative overflow-hidden rounded-[42px] border shadow-2xl"
      style={{
        width: 1080,
        height: 1920,
        background:
          "radial-gradient(1200px 1200px at 50% 10%, rgba(0,0,0,0.045), rgba(255,255,255,0)), #ffffff",
        borderColor: APPLE.border,
        boxShadow: APPLE.shadow,
      }}
    >
      {/* top bar */}
      <div className="absolute left-10 right-10 top-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center overflow-hidden bg-white"
            style={{ boxShadow: "0 14px 40px rgba(2,6,23,0.10)" }}
          >
            <Image
              src="/logoMoneyLifeIconeDark.svg"
              alt="MoneyLife"
              width={40}
              height={40}
              className="h-8 w-8 object-contain"
              priority
            />
          </div>

          <div className="text-slate-900">
            <div className="text-xl font-semibold tracking-tight">MoneyLife</div>
            <div className="text-sm text-slate-500">Introducing</div>
          </div>
        </div>

        {/* progress */}
        <div className="h-2 w-56 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${(t / total) * 100}%`, background: APPLE.accent }}
          />
        </div>
      </div>

      {/* scene area */}
      <div className="absolute inset-0 px-14 pt-40 pb-24">
        <AnimatePresence mode="wait">
          {active === "CERT" && (
            <SceneCert key="CERT" t={t - CUTS.CERT_START} />
          )}
          {active === "ANALYSE" && (
            <SceneAnalyse key="ANALYSE" t={t - CUTS.ANALYSE_START} />
          )}
          {active === "CFG3A" && (
            <SceneConfigurator3a key="CFG3A" t={t - CUTS.CFG_START} />
          )}
          {active === "OFFERS" && (
            <SceneOffers key="OFFERS" t={t - CUTS.OFFERS_START} />
          )}
          {active === "SIGN" && (
            <SceneSign key="SIGN" t={t - CUTS.SIGN_START} />
          )}
        </AnimatePresence>
      </div>

      {/* bottom */}
      <div className="absolute left-14 right-14 bottom-14 flex items-center justify-between">
        <div className="text-slate-500 text-sm">moneylife.ch</div>
        <div
          className="rounded-full px-6 py-3 text-sm font-medium border"
          style={{
            background: "rgba(255,255,255,0.92)",
            borderColor: APPLE.border,
            color: APPLE.ink,
            boxShadow: "0 16px 40px rgba(2,6,23,0.10)",
          }}
        >
          Continuer →
        </div>
      </div>
    </div>
  );
}

function SceneWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -14, filter: "blur(10px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col"
    >
      {children}
    </motion.div>
  );
}

function TitlePill({ k, sub }: { k: string; sub?: string }) {
  return (
    <div>
      <div
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2"
        style={{ borderColor: APPLE.border, background: "rgba(2,6,23,0.03)" }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: APPLE.accent,
            boxShadow: "0 0 0 6px rgba(2,6,23,0.07)",
          }}
        />
        <span className="text-slate-700 text-sm">{k}</span>
      </div>

      {sub && (
        <p
          className="mt-4 text-[26px] leading-snug max-w-[860px]"
          style={{ color: APPLE.ink2 }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/* -----------------------
   SCENE 1 — CERTIFICAT
------------------------ */
function SceneCert({ t }: { t: number }) {
  const fill1 = t > 1.0;
  const fill2 = t > 1.35;
  const fill3 = t > 1.7;
  const ok = t > 2.2;

  return (
    <SceneWrap>
      <div className="relative flex-1">
        <div className="mt-10">
          <h1
            className="text-[72px] leading-[0.98] font-semibold tracking-tight"
            style={{ color: APPLE.ink }}
          >
            Certificat LPP.
          </h1>
          <TitlePill
            k="Scan & analyse"
            sub="On extrait les informations clés automatiquement."
          />
        </div>

        <div className="mt-12 grid gap-10">
          <motion.div
            className="relative rounded-[32px] border p-10 overflow-hidden"
            style={{
              borderColor: APPLE.border,
              background: APPLE.surface2,
              boxShadow: "0 18px 60px rgba(2,6,23,0.08)",
            }}
            initial={{ scale: 0.99, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* scan line */}
            <motion.div
              className="absolute left-0 right-0 h-[2px]"
              style={{ background: "rgba(2,6,23,0.25)" }}
              initial={{ top: 40, opacity: 0 }}
              animate={{ top: 420, opacity: [0, 1, 0] }}
              transition={{ duration: 1.1, ease: "easeInOut", delay: 0.15 }}
            />

            <div className="flex items-center justify-between">
              <div className="text-lg font-medium" style={{ color: APPLE.ink }}>
                Certificat de prévoyance
              </div>
              <div className="text-sm" style={{ color: APPLE.ink3 }}>
                PDF
              </div>
            </div>

            <div className="mt-8 space-y-5">
              <Row label="Salaire assuré" value={fill1 ? "CHF 98’400" : "—"} />
              <Row
                label="Rente invalidité"
                value={fill2 ? "CHF 38’900 / an" : "—"}
              />
              <Row
                label="Rente conjoint"
                value={fill3 ? "CHF 19’450 / an" : "—"}
              />
            </div>

            <AnimatePresence>
              {ok && (
                <motion.div
                  className="mt-10 inline-flex items-center gap-3 rounded-full px-5 py-3 border"
                  style={{
                    background: "rgba(2,6,23,0.04)",
                    borderColor: APPLE.border,
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="font-semibold" style={{ color: APPLE.ink }}>
                    ✓
                  </span>
                  <span className="text-base" style={{ color: APPLE.ink2 }}>
                    Analyse terminée
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="mt-auto" />
      </div>
    </SceneWrap>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl border px-6 py-5"
      style={{
        borderColor: APPLE.border,
        background: "rgba(255,255,255,0.86)",
      }}
    >
      <div className="text-lg" style={{ color: APPLE.ink3 }}>
        {label}
      </div>
      <div
        className="text-xl font-semibold tracking-tight"
        style={{ color: APPLE.ink }}
      >
        {value}
      </div>
    </div>
  );
}

/* -----------------------
   SCENE 2 — ANALYSE (LACUNES + TIMELINES)
------------------------ */
function SceneAnalyse({ t }: { t: number }) {
  const showGaps = t > 0.25;
  const showTimeline = t > 1.1;
  const toggleAccident = t > 2.0;

  return (
    <SceneWrap>
      <div className="relative flex-1">
        <div className="mt-10">
          <h1
            className="text-[72px] leading-[0.98] font-semibold tracking-tight"
            style={{ color: APPLE.ink }}
          >
            Analyse de prévoyance.
          </h1>
          <TitlePill
            k="Lacunes & timelines"
            sub="Invalidité, décès, retraite — en un coup d’œil."
          />
        </div>

        <div
          className="mt-12 rounded-[32px] border p-10"
          style={{
            borderColor: APPLE.border,
            background: APPLE.surface2,
            boxShadow: "0 18px 60px rgba(2,6,23,0.08)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium" style={{ color: APPLE.ink }}>
                Résumé
              </div>
              <div className="mt-1 text-sm" style={{ color: APPLE.ink3 }}>
                Couverture estimée et lacunes.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <MiniChip label="Maladie" active={!toggleAccident} />
              <MiniChip label="Accident" active={toggleAccident} />
            </div>
          </div>

          <AnimatePresence>
            {showGaps && (
              <motion.div
                className="mt-8 grid grid-cols-3 gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <GapCard title="Invalidité" coveredPct={toggleAccident ? 93 : 86} />
                <GapCard title="Décès" coveredPct={toggleAccident ? 90 : 82} />
                <GapCard title="Retraite" coveredPct={88} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showTimeline && (
              <motion.div
                className="mt-8 rounded-2xl border p-6"
                style={{ borderColor: APPLE.border, background: "rgba(255,255,255,0.90)" }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold" style={{ color: APPLE.ink }}>
                    Timeline couverture (jusqu’à 65 ans)
                  </div>
                  <div className="text-[12px]" style={{ color: APPLE.ink3 }}>
                    {toggleAccident ? "Accident" : "Maladie"}
                  </div>
                </div>

                <div className="mt-4">
                  <MiniTimeline accent={toggleAccident ? 0.92 : 0.78} />
                </div>

                <div className="mt-4 text-[12px]" style={{ color: APPLE.ink3 }}>
                  Les lacunes sont recalculées selon votre situation (LPP/LAA/AVS/AI).
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-auto" />
      </div>
    </SceneWrap>
  );
}

function MiniChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className="rounded-full border px-4 py-2 text-sm font-medium"
      style={{
        borderColor: active ? APPLE.borderStrong : APPLE.border,
        background: active ? "rgba(2,6,23,0.88)" : "rgba(2,6,23,0.03)",
        color: active ? "white" : APPLE.ink2,
        boxShadow: active ? "0 16px 40px rgba(2,6,23,0.12)" : "none",
      }}
    >
      {label}
    </div>
  );
}

function GapCard({ title, coveredPct }: { title: string; coveredPct: number }) {
  const ok = coveredPct >= 95;
  const warn = coveredPct >= 90 && coveredPct < 95;

  const label = ok ? "OK" : warn ? "À surveiller" : "Lacune";
  const bar = Math.max(0, Math.min(100, coveredPct));

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: APPLE.border, background: "rgba(255,255,255,0.90)" }}
    >
      <div className="text-[11px]" style={{ color: APPLE.ink3 }}>
        {title}
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div className="text-2xl font-semibold" style={{ color: APPLE.ink }}>
          {coveredPct}%
        </div>
        <div className="text-[12px] font-semibold" style={{ color: APPLE.ink2 }}>
          {label}
        </div>
      </div>

      <div
        className="mt-4 h-2 w-full rounded-full overflow-hidden border"
        style={{ borderColor: APPLE.border, background: "rgba(2,6,23,0.06)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: APPLE.accent }}
          initial={{ width: "0%" }}
          animate={{ width: `${bar}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function MiniTimeline({ accent }: { accent: number }) {
  // Simple SVG line “coverage” with a dip to suggest a gap.
  const stroke = `rgba(2,6,23,${accent})`;
  return (
    <svg viewBox="0 0 1000 160" width="100%" height="120" aria-hidden="true">
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.14" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* axis */}
      <line x1="0" y1="140" x2="1000" y2="140" stroke="rgba(2,6,23,0.10)" strokeWidth="2" />
      <line x1="0" y1="20" x2="1000" y2="20" stroke="rgba(2,6,23,0.06)" strokeWidth="2" />

      {/* area */}
      <path
        d="M0,60 C160,52 260,42 360,60 C460,78 560,92 640,80 C740,66 820,44 1000,54 L1000,140 L0,140 Z"
        fill="url(#fill)"
      />
      {/* line */}
      <path
        d="M0,60 C160,52 260,42 360,60 C460,78 560,92 640,80 C740,66 820,44 1000,54"
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -----------------------
   SCENE 3 — CONFIGURATEUR 3a
------------------------ */
function SceneConfigurator3a({ t }: { t: number }) {
  const tapAddDeath = t > 0.9;
  const tapAddInvalid = t > 1.2;
  const tapAddRent = t > 1.5;

  const sliderMoves = t > 1.9;
  const showCta = t > 3.0;

  const prime = sliderMoves ? 285 : 220;
  const epargne = sliderMoves ? 250 : 180;
  const total = prime + epargne;

  return (
    <SceneWrap>
      <div className="relative flex-1">
        <div className="mt-10">
          <h1
            className="text-[72px] leading-[0.98] font-semibold tracking-tight"
            style={{ color: APPLE.ink }}
          >
            Configurateur 3a.
          </h1>
          <TitlePill
            k="Assurance"
            sub="Ajoutez des couvertures, ajustez votre prime, et demandez des offres."
          />
        </div>

        <div
          className="mt-12 rounded-[32px] border p-10"
          style={{
            borderColor: APPLE.border,
            background: APPLE.surface2,
            boxShadow: "0 18px 60px rgba(2,6,23,0.08)",
          }}
        >
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-lg font-medium" style={{ color: APPLE.ink }}>
                Couvertures
              </div>
              <div className="mt-2 text-sm" style={{ color: APPLE.ink3 }}>
                Tapez pour ajouter.
              </div>

              <div className="mt-6 grid gap-3">
                <CoverageCard
                  label="Décès"
                  desc="Capital versé aux proches"
                  active={tapAddDeath}
                  tapped={t > 0.75 && t < 0.98}
                />
                <CoverageCard
                  label="Invalidité"
                  desc="Protection du revenu"
                  active={tapAddInvalid}
                  tapped={t > 1.05 && t < 1.28}
                />
                <CoverageCard
                  label="Rente"
                  desc="Rente en cas d’événement"
                  active={tapAddRent}
                  tapped={t > 1.35 && t < 1.58}
                />
              </div>
            </div>

            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium" style={{ color: APPLE.ink }}>
                    Prime mensuelle
                  </div>
                  <div className="mt-2 text-sm" style={{ color: APPLE.ink3 }}>
                    Ajustez selon votre budget.
                  </div>
                </div>

                <motion.div
                  key={total}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="text-xl font-semibold text-right"
                  style={{ color: APPLE.ink }}
                >
                  {formatCHF(total)}{" "}
                  <span className="text-sm font-medium" style={{ color: APPLE.ink3 }}>
                    CHF/mois
                  </span>
                </motion.div>
              </div>

              <div
                className="mt-6 h-3 w-full rounded-full border overflow-hidden"
                style={{ borderColor: APPLE.border, background: "rgba(2,6,23,0.05)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: APPLE.accent }}
                  initial={{ width: "36%" }}
                  animate={{ width: sliderMoves ? "56%" : "36%" }}
                  transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <div className="relative mt-3 h-8">
                <motion.div
                  className="absolute top-0 h-8 w-8 rounded-full border"
                  style={{
                    background: "rgba(255,255,255,0.95)",
                    borderColor: APPLE.border,
                    boxShadow: "0 14px 35px rgba(2,6,23,0.16)",
                  }}
                  initial={{ left: "36%" }}
                  animate={{ left: sliderMoves ? "56%" : "36%" }}
                  transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <KpiCard label="Prime (risque)" value={`${formatCHF(prime)} CHF/mois`} />
                <KpiCard label="Épargne" value={`${formatCHF(epargne)} CHF/mois`} />
              </div>

              <AnimatePresence>
                {showCta && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-8"
                  >
                    <div
                      className="rounded-2xl border px-6 py-5 flex items-center justify-between"
                      style={{
                        borderColor: APPLE.border,
                        background: "rgba(255,255,255,0.90)",
                        boxShadow: "0 16px 40px rgba(2,6,23,0.08)",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: APPLE.ink }}>
                          Demander des offres
                        </div>
                        <div className="text-[12px] mt-1" style={{ color: APPLE.ink3 }}>
                          Vous recevez plusieurs propositions comparables.
                        </div>
                      </div>

                      <div
                        className="rounded-full px-5 py-3 text-sm font-semibold"
                        style={{
                          background: "rgba(2,6,23,0.88)",
                          color: "white",
                          boxShadow: "0 16px 40px rgba(2,6,23,0.14)",
                        }}
                      >
                        Envoyer
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-auto" />
      </div>
    </SceneWrap>
  );
}

function CoverageCard({
  label,
  desc,
  active,
  tapped,
}: {
  label: string;
  desc: string;
  active: boolean;
  tapped: boolean;
}) {
  return (
    <motion.div
      className="rounded-2xl border px-5 py-4 flex items-center justify-between"
      style={{
        borderColor: active ? APPLE.borderStrong : APPLE.border,
        background: "rgba(255,255,255,0.90)",
        boxShadow: active ? "0 16px 40px rgba(2,6,23,0.08)" : "none",
      }}
      animate={{ scale: tapped ? 0.985 : 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="min-w-0">
        <div className="text-base font-semibold" style={{ color: APPLE.ink }}>
          {label}
        </div>
        <div className="mt-1 text-[12px] truncate" style={{ color: APPLE.ink3 }}>
          {desc}
        </div>
      </div>

      <div
        className="h-7 w-12 rounded-full border p-1"
        style={{
          borderColor: APPLE.border,
          background: active ? "rgba(2,6,23,0.88)" : "rgba(2,6,23,0.05)",
        }}
      >
        <motion.div
          className="h-5 w-5 rounded-full"
          style={{ background: "rgba(255,255,255,0.95)" }}
          animate={{ x: active ? 20 : 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: APPLE.border,
        background: "rgba(255,255,255,0.90)",
      }}
    >
      <div className="text-[11px]" style={{ color: APPLE.ink3 }}>
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold" style={{ color: APPLE.ink }}>
        {value}
      </div>
    </div>
  );
}

/* -----------------------
   SCENE 4 — OFFRES: FILTER CLICK + RE-RANK + CHOISIR
------------------------ */
function SceneOffers({ t }: { t: number }) {
  const clickAt = 0.9;
  const clickedFilter = t > clickAt;

  const chooseAt = 2.2; // click “Choisir” juste avant la fin
  const chosen = t > chooseAt;

  const offersBase = useMemo(
    () => [
      {
        id: "axa",
        insurer: "AXA",
        logoSrc: "/iconeAXA.svg",
        score: 92,
        capital: 184_000,
        rachat1y: 21_600,
        risk: 1_180,
      },
      {
        id: "swisslife",
        insurer: "Swiss Life",
        logoSrc: "/iconeSwissLife.svg",
        score: 95,
        capital: 191_000,
        rachat1y: 24_200,
        risk: 980,
      },
      {
        id: "baloise",
        insurer: "Helvetia",
        logoSrc: "/iconeBaloise.svg",
        score: 90,
        capital: 176_000,
        rachat1y: 20_100,
        risk: 1_050,
      },
    ],
    []
  );

  const offers = useMemo(() => {
    if (!clickedFilter) {
      const map = new Map(offersBase.map((o) => [o.id, o] as const));
      return ["axa", "baloise", "swisslife"].map((id) => map.get(id)!);
    }
    return [...offersBase].sort((a, b) => (b.capital ?? 0) - (a.capital ?? 0));
  }, [clickedFilter, offersBase]);

  const bestId = offers[0]?.id;

  return (
    <SceneWrap>
      <div className="relative flex-1">
        <div className="mt-10">
          <h1
            className="text-[72px] leading-[0.98] font-semibold tracking-tight"
            style={{ color: APPLE.ink }}
          >
            Comparaison d’offres.
          </h1>
          <TitlePill
            k="Filtres"
            sub="Comparez, triez selon vos envies."
          />
        </div>

        <div className="mt-10 flex items-center gap-2">
          <FilterChip label="Score global" active={!clickedFilter} />
          <FilterChip label="Projection retraite" active={clickedFilter} emphasized />

          <AnimatePresence>
            {!clickedFilter && t > 0.55 && (
              <TapPulse className="ml-2" />
            )}
          </AnimatePresence>
        </div>

        <motion.div
          className="mt-8 space-y-4"
          layout
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          {offers.map((o, idx) => {
            const isBest = clickedFilter && o.id === bestId;
            const isChosen = chosen && isBest;

            return (
              <OfferCardML
                key={o.id}
                offer={{
                  insurer: o.insurer,
                  logoSrc: o.logoSrc,
                  score: o.score,
                  capital: o.capital,
                  rachat1y: o.rachat1y,
                  risk: o.risk,
                  rank: idx + 1,
                }}
                isBest={isBest}
                showChoose={isBest}
                chosen={isChosen}
              />
            );
          })}
        </motion.div>

        <div className="mt-auto" />
      </div>
    </SceneWrap>
  );
}

function TapPulse({ className }: { className?: string }) {
  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="h-10 w-10 rounded-full"
        style={{ background: "rgba(2,6,23,0.08)" }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border"
        style={{ borderColor: APPLE.border }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function FilterChip({
  label,
  active,
  emphasized,
}: {
  label: string;
  active: boolean;
  emphasized?: boolean;
}) {
  return (
    <motion.div
      className="rounded-full border px-4 py-2 text-sm font-medium"
      style={{
        borderColor: active ? APPLE.borderStrong : APPLE.border,
        background: active ? "rgba(2,6,23,0.88)" : "rgba(2,6,23,0.03)",
        color: active ? "white" : APPLE.ink2,
        boxShadow: active ? "0 16px 40px rgba(2,6,23,0.12)" : "none",
      }}
      animate={{ scale: emphasized && active ? 1.01 : 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {label}
    </motion.div>
  );
}

type OfferML = {
  insurer: string;
  logoSrc: string;
  score: number;
  capital: number;
  rachat1y: number;
  risk: number;
  rank: number;
};

function OfferCardML({
  offer,
  isBest,
  showChoose,
  chosen,
}: {
  offer: OfferML;
  isBest: boolean;
  showChoose?: boolean;
  chosen?: boolean;
}) {
  return (
    <motion.div
      layout
      className="group w-full text-left rounded-3xl border select-none"
      style={{
        background: APPLE.surface,
        borderColor: isBest ? APPLE.borderStrong : APPLE.border,
        boxShadow: isBest ? APPLE.shadowCardStrong : APPLE.shadowCard,
      }}
      animate={{ y: isBest ? -6 : 0, scale: isBest ? 1.01 : 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pt-10 pb-7 px-8">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 flex items-center justify-center overflow-visible">
            <Image
              src={offer.logoSrc}
              alt={offer.insurer}
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
              priority
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold truncate" style={{ color: APPLE.ink }}>
                {offer.insurer}
              </div>

              <span
                className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[11px] border"
                style={{
                  background: "rgba(2,6,23,0.03)",
                  borderColor: APPLE.border,
                  color: APPLE.ink3,
                }}
              >
                #{offer.rank}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] border"
                style={{
                  background: "rgba(2,6,23,0.03)",
                  borderColor: APPLE.border,
                  color: APPLE.ink2,
                }}
              >
                Score{" "}
                <span className="font-semibold ml-1" style={{ color: APPLE.ink }}>
                  {offer.score}/100
                </span>
              </span>

              {showChoose && (
                <motion.div
                  className="ml-auto inline-flex items-center rounded-full border px-4 py-2 text-[12px] font-semibold"
                  style={{
                    background: chosen ? "rgba(2,6,23,0.88)" : "rgba(255,255,255,0.9)",
                    borderColor: chosen ? "rgba(2,6,23,0.88)" : APPLE.border,
                    color: chosen ? "white" : APPLE.ink2,
                    boxShadow: chosen ? "0 16px 40px rgba(2,6,23,0.14)" : "none",
                  }}
                  animate={{ scale: chosen ? 0.98 : 1 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {chosen ? "Choisi ✓" : "Choisir"}
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <Metric label="Projection retraite" value={formatCHF(offer.capital)} suffix="CHF" />
          <Metric label="Valeur après 1 an" value={formatCHF(offer.rachat1y)} suffix="CHF" />
          <Metric label="Prime de risque" value={formatCHF(offer.risk)} suffix="/an" />
        </div>

        <AnimatePresence>
          {isBest && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6"
            >
              <div
                className="rounded-2xl px-5 py-4 border"
                style={{
                  background: "rgba(2,6,23,0.03)",
                  borderColor: APPLE.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold" style={{ color: APPLE.ink }}>
                    Meilleure offre (Projection retraite)
                  </div>
                  <div className="text-sm font-semibold" style={{ color: APPLE.ink }}>
                    Sélectionner →
                  </div>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: APPLE.ink3 }}>
                  Trié automatiquement via le filtre.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* -----------------------
   SCENE 5 — SIGNATURE PAD
------------------------ */
function SceneSign({ t }: { t: number }) {
  const showPad = t > 0.05;
  const showStroke = t > 0.25;

  return (
    <SceneWrap>
      <div className="relative flex-1">
        <div className="mt-10">
          <h1
            className="text-[72px] leading-[0.98] font-semibold tracking-tight"
            style={{ color: APPLE.ink }}
          >
            Signature.
          </h1>
          <TitlePill k="En ligne" sub="Sécurisé" />
        </div>

        <AnimatePresence>
          {showPad && (
            <motion.div
              className="mt-12 rounded-[32px] border p-10"
              style={{
                borderColor: APPLE.border,
                background: APPLE.surface2,
                boxShadow: "0 18px 60px rgba(2,6,23,0.08)",
              }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-medium" style={{ color: APPLE.ink }}>
                    Signer la demande
                  </div>
                  <div className="mt-1 text-sm" style={{ color: APPLE.ink3 }}>
                    Dessinez votre signature.
                  </div>
                </div>

                <div
                  className="rounded-full px-5 py-3 text-sm font-semibold"
                  style={{
                    background: "rgba(2,6,23,0.88)",
                    color: "white",
                    boxShadow: "0 16px 40px rgba(2,6,23,0.14)",
                  }}
                >
                  Valider →
                </div>
              </div>

              <div
                className="mt-8 rounded-2xl border overflow-hidden"
                style={{ borderColor: APPLE.border, background: "rgba(255,255,255,0.92)" }}
              >
                <div className="p-6">
                  <div className="text-[12px]" style={{ color: APPLE.ink3 }}>
                    Signature
                  </div>

                  <div className="mt-4">
                    <SignatureSvg reveal={showStroke ? Math.min(1, (t - 0.20) / 1.25) : 0} />
                  </div>

                  <div
                    className="mt-6 h-[1px] w-full"
                    style={{ background: "rgba(2,6,23,0.10)" }}
                  />

                  <div className="mt-4 flex items-center justify-between text-[12px]" style={{ color: APPLE.ink3 }}>
                    <span>Effacer</span>
                    <span>Signer</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto" />
      </div>
    </SceneWrap>
  );
}

function SignatureSvg({ reveal }: { reveal: number }) {
  const r = clamp01(reveal);

  const johnRef = useRef<SVGPathElement | null>(null);
  const doeRef = useRef<SVGPathElement | null>(null);

  const [LJ, setLJ] = useState(1);
  const [LD, setLD] = useState(1);

  const [pen, setPen] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  // 0 → 0.65 : John
  // 0.65 → 1 : Doe
  const pJohn = clamp01(r / 0.65);
  const pDoe = clamp01((r - 0.65) / 0.35);

  // Micro “pression” (subtile) : varie pendant l’écriture
  const pressureJohn = 0.85 + 0.15 * Math.sin(pJohn * Math.PI);
  const pressureDoe = 0.85 + 0.15 * Math.sin(pDoe * Math.PI);

  const swJohn = 9.2 + 0.8 * pressureJohn; // ~10.0
  const swDoe = 8.2 + 0.7 * pressureDoe;  // ~8.8

  const penR =
    r <= 0.0001
      ? 0
      : r < 0.65
      ? 4.6 + 1.0 * pressureJohn
      : 4.2 + 0.9 * pressureDoe;

  useEffect(() => {
    try {
      if (johnRef.current) setLJ(johnRef.current.getTotalLength());
      if (doeRef.current) setLD(doeRef.current.getTotalLength());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Positionner le stylo à l’extrémité du tracé en cours
    try {
      if (r <= 0.001) {
        setPen((p) => ({ ...p, visible: false }));
        return;
      }

      if (r < 0.65) {
        const path = johnRef.current;
        if (!path) return;
        const len = LJ * pJohn;
        const pt = path.getPointAtLength(Math.max(0, Math.min(LJ, len)));
        setPen({ x: pt.x, y: pt.y, visible: true });
      } else {
        const path = doeRef.current;
        if (!path) return;
        const len = LD * pDoe;
        const pt = path.getPointAtLength(Math.max(0, Math.min(LD, len)));
        setPen({ x: pt.x, y: pt.y, visible: true });
      }
    } catch {
      // ignore
    }
  }, [r, pJohn, pDoe, LJ, LD]);

  return (
    <svg viewBox="0 0 1100 240" width="100%" height="140" aria-hidden="true">
      {/* "John" */}
      <path
        ref={johnRef}
        d="
          M150 175
          Q165 70 235 110
          Q285 145 250 175
          Q215 210 275 198
          Q345 180 370 150
          Q395 120 425 150
          Q455 182 485 158
          Q505 140 530 155
        "
        fill="none"
        stroke="rgba(2,6,23,0.90)"
        strokeWidth={swJohn}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LJ}
        strokeDashoffset={(1 - pJohn) * LJ}
        style={{ filter: "drop-shadow(0 10px 18px rgba(2,6,23,0.10))" }}
      />

      {/* "Doe" */}
      <path
        ref={doeRef}
        d="
          M605 168
          Q640 108 700 135
          Q765 165 715 205
          Q680 235 640 205
          Q600 175 635 155

          Q700 120 755 150
          Q805 180 770 210

          Q835 210 860 182
          Q890 150 930 160
        "
        fill="none"
        stroke="rgba(2,6,23,0.82)"
        strokeWidth={swDoe}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LD}
        strokeDashoffset={(1 - pDoe) * LD}
        style={{ filter: "drop-shadow(0 8px 16px rgba(2,6,23,0.08))" }}
      />

      {/* STYLO (point noir) qui suit l’écriture */}
      {pen.visible && (
        <>
          {/* ombre douce */}
          <circle
            cx={pen.x}
            cy={pen.y}
            r={penR + 3}
            fill="rgba(2,6,23,0.08)"
          />
          {/* pointe */}
          <circle
            cx={pen.x}
            cy={pen.y}
            r={penR}
            fill="rgba(2,6,23,0.92)"
            style={{ filter: "drop-shadow(0 8px 14px rgba(2,6,23,0.18))" }}
          />
          {/* micro highlight (effet stylo) */}
          <circle
            cx={pen.x - 1.2}
            cy={pen.y - 1.6}
            r={Math.max(1.4, penR * 0.35)}
            fill="rgba(255,255,255,0.35)"
          />
        </>
      )}
    </svg>
  );
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="transition-transform duration-200 will-change-transform">
      <div className="text-[10px]" style={{ color: APPLE.ink3 }}>
        {label}
      </div>
      <div className="text-xl font-semibold" style={{ color: APPLE.ink }}>
        {value}
        <span className="ml-1 text-[11px] font-medium" style={{ color: APPLE.ink3 }}>
          {suffix}
        </span>
      </div>
    </div>
  );
}

function formatCHF(n: number) {
  return n.toLocaleString("fr-CH");
}