// app/profil/story-mock/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useScroll, useSpring, useTransform, AnimatePresence } from "framer-motion";
import {
  Activity,
  HeartPulse,
  Accessibility,
  Skull,
  HandCoins,
  Flame,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

//Graphique
import StoryBars from "../../components/StoryBars";
import {
  textsInvaliditeMaladie,
  textsInvaliditeAccident,
  textsDecesMaladie,
  textsDecesAccident,
  textsRetraite,
} from "./texts";

import SpinCardLoader from '../../components/SpinCardLoader';


// === Données réelles & compute ===
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";
import type { ClientData, Legal_Settings } from "@/lib/core/types";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
const { meta } = Legal_Echelle44_2025;
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import { computeRetraite } from "@/lib/calculs/events/retraite";

/* =========================
   THEME / TOKENS
========================= */
const COLORS = {
  navy: "#001D38",
  turquoise: "#4FD1C5",
  gray: "#B9B9B9",
  amber: "#F0AB00",
  red: "#FF5858",
};

function chf(n: number) {
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function yearDate(y: number) { return new Date(y, 0, 1); }
function currentYear() { return new Date().getFullYear(); }

/* =========================
   COUNTER (démarre quand run=true)
========================= */
function Counter({ value, run, suffix }: { value: number; run: boolean; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!run) return; // on n’anime que quand la carte entre en vue
    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const from = 0; // toujours repartir de 0 à l’entrée
    const to = value;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);

  return (
    <span>
      {value < 0 ? "-" : ""}
      {chf(Math.abs(display))}
      {suffix && <span className="text-xs align-top ml-1">{suffix}</span>}
    </span>
  );
}

/* =========================
   Mini Bar (shadcn-like)
========================= */
function MiniBar({ data }: { data: { name: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fills = ["#001D38", "#F0AB00", "#FF5858", "#4FD1C5", "#B9B9B9"]; // AVS/AI, LPP, LAA/Enfants, Lacune, Autres
  return (
    <div className="w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="name" hide />
          <YAxis hide domain={[0, max * 1.2]} />
          <Tooltip formatter={(v: any) => chf(v as number)} />
          <Bar dataKey="value" radius={[8, 8, 4, 4]}>
            {data.map((_, i) => <Cell key={i} fill={fills[i] ?? "#B9B9B9"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* =========================
   Header sticky global + barre de progression
========================= */
function StickyHeader({ progressWidth, currentTitle }: { progressWidth: any; currentTitle: string }) {
  return (
    <div className="sticky top-0 z-20 w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
      <div className="max-w-sm mx-auto px-5 py-3">
        <h3 className="text-3xl font-semibold" style={{ color: COLORS.navy }}>
          Chiffres clés
        </h3>
        <div className="relative h-5 overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={currentTitle}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="text-sm"
              style={{ color: COLORS.gray }}
            >
              {currentTitle}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {/* Barre de progression (2px) */}
      <motion.div
  style={{ width: progressWidth }}
  className="h-[2px]"
>
  <div
    className="h-full w-full"
    style={{
      background:
        "linear-gradient(90deg, #001D38 0%, #4FD1C5 20%, #B9B9B9 40%, #F0AB00 60%, #FF5858 80%, #FF5EA9 100%)",
    }}
  />
</motion.div>
    </div>
  );
}

/* =========================
   StoryCard (plein écran)
========================= */
function StoryCard({
  tone,
  icon,
  title,
  monthlyGap,
  capital,
  detailText,
  chart,
  onVisible,
}: {
  tone: "amber" | "red" | "rose" | "navy";
  icon: React.ReactNode;
  title: string;
  monthlyGap: number; // négatif => perte
  capital?: number;
  detailText?: (visible: boolean) => React.ReactNode;
  chart?: React.ReactNode;
  onVisible?: (t: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
const inView = useInView(ref, { amount: 0.5, once: false });

React.useEffect(() => {
  if (inView) onVisible?.(title);
}, [inView, title, onVisible]);

const color =
    tone === "amber" ? COLORS.amber : tone === "red" ? COLORS.red : tone === "navy" ? COLORS.navy : COLORS.turquoise;

  return (
    <section ref={ref} className="min-h-[100svh] flex items-start md:items-center snap-start snap-always scroll-mt-20 pt-20 md:pt-0">
      <div className="w-full max-w-sm mx-auto px-5">
        {/* Icône + Titre évènement */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.35 }}
          className="mb-4 flex items-center gap-3"
          style={{ color }}
        >
          <div className="shrink-0">{icon}</div>
          <div className="text-base font-medium" style={{ color: COLORS.navy }}>
            {title}
          </div>
        </motion.div>

        {/* Grand nombre + capital */}
        <motion.div
          initial={{ y: 24, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0, filter: inView ? "blur(0px)" : "blur(4px)" }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="flex flex-col items-start gap-1"
        >
          <div className="text-5xl font-bold" style={{ color: COLORS.navy }}>
            <Counter value={monthlyGap} run={inView} />
            <span className="text-base font-medium ml-1">CHF/mois</span>
          </div>
          {capital != null && (
            <div className="text-sm flex items-center gap-2" style={{ color: COLORS.navy }}>
              <HandCoins size={18} className="opacity-80" />
              <span>{chf(capital)}<span className="text-[10px] ml-0.5">CHF</span></span>
            </div>
          )}
        </motion.div>

        {/* Texte */}
        <motion.div
        initial={{ y: 24, opacity: 0, filter: "blur(4px)" }}
        animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0, filter: inView ? "blur(0px)" : "blur(4px)" }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="mt-4 text-[15px] leading-6"
        style={{ color: COLORS.navy }}
        >
        {typeof detailText === "function" ? detailText(inView) : detailText}
        </motion.div>

        {/* Timeline chart (StoryBars) */}
        {chart && (
        <motion.div
            initial={{ y: 24, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0, filter: inView ? "blur(0px)" : "blur(4px)" }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mt-6"
        >
            {chart}
        </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-8"
        >
          <button
            className="w-full h-12 rounded-2xl shadow bg-white text-[15px] font-medium flex items-center justify-center gap-2"
            style={{ color: COLORS.navy }}
          >
            <Flame size={18} color={COLORS.amber} /> Optimiser
          </button>
        </motion.div>
      </div>
    </section>
  );
}

function DetailText({
  lead,
  paragraphs,
  visible,
}: {
  lead: string;
  paragraphs: string[];
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);



    // Scroll helper avec offset = hauteur réelle du header + désactivation temporaire du scroll-snap
  const ensureVisible = () => {
    const sectionEl = rootRef.current?.closest("section") as HTMLElement | null;
    if (!sectionEl) return;
    const headerEl = document.querySelector(".sticky") as HTMLElement | null;
    const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 80;
    const top = sectionEl.getBoundingClientRect().top + window.scrollY - headerH - 8;

    const snapRoot = document.querySelector("[data-snap-root]") as HTMLElement | null;
    if (snapRoot) snapRoot.classList.add("snap-none"); // coupe le snap pendant l’anim

    window.scrollTo({ top, behavior: "smooth" });

    // réactive le snap après l’animation d’ouverture
    window.setTimeout(() => {
      if (snapRoot) snapRoot.classList.remove("snap-none");
    }, 400);
  };

    const onToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        // attendre le reflow de l’ouverture avant de recaler sous le header
        requestAnimationFrame(ensureVisible);
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className="text-[15px] leading-6">
      <p className="mb-2">{lead}</p>
      <button
        className="underline underline-offset-2"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? "Fermer détails" : "Plus de détails"}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="mt-3 space-y-3 overflow-hidden"
          >
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =========================
   Résumé avec toggle A/M
========================= */
function SummaryCard({
  invalidityAcc,
  invalidityMal,
  deathAcc,
  deathMal,
  retirement,
  onVisible,
}: {
  invalidityAcc: number;
  invalidityMal: number;
  deathAcc: number;
  deathMal: number;
  retirement: number;
  onVisible?: (t: string) => void;
}) {
  const [mode, setMode] = useState<"accident" | "maladie">("accident");
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.5 });

  useEffect(() => {
  if (inView) onVisible?.("Résumé");
}, [inView, onVisible]);

  const invValue = mode === "accident" ? invalidityAcc : invalidityMal;
  const deathValue = mode === "accident" ? deathAcc : deathMal;

  return (
    <section ref={ref} className="min-h-[100svh] flex items-start md:items-center snap-start snap-always scroll-mt-20 pt-16 md:pt-0">
      <div className="w-full max-w-sm mx-auto px-5">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.35 }}
          className="mb-4 flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: COLORS.navy }}>Résumé</h1>
            <p className="text-sm" style={{ color: COLORS.gray }}>de votre situation de prévoyance</p>
          </div>
          {/* Toggle Accident/Maladie */}
            <div className="rounded-xl border p-1 text-xs flex gap-1 bg-white/70">
            <button
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                mode === "accident" ? "bg-zinc-200 text-[#001D38]" : "text-zinc-500"
                }`}
                onClick={() => setMode("accident")}
            >
                <Activity size={14} strokeWidth={2} />
                Accident
            </button>
            <button
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                mode === "maladie" ? "bg-zinc-200 text-[#001D38]" : "text-zinc-500"
                }`}
                onClick={() => setMode("maladie")}
            >
                <HeartPulse size={14} strokeWidth={2} />
                Maladie
            </button>
            </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: inView ? 0 : 18, opacity: inView ? 1 : 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Accessibility size={26} color={COLORS.amber} />
              <div className="text-sm" style={{ color: COLORS.navy }}>Invalidité ({mode})</div>
            </div>
            <div className="text-3xl font-bold" style={{ color: COLORS.navy }}>
              -<Counter value={Math.round(invValue)} run={inView} /><span className="text-xs ml-1">CHF/mois</span>
            </div>
          </motion.div>

          <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: inView ? 0 : 18, opacity: inView ? 1 : 0 }} transition={{ delay: 0.1 }} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skull size={26} color={COLORS.navy} />
              <div className="text-sm" style={{ color: COLORS.navy }}>Décès ({mode})</div>
            </div>
            <div className="text-3xl font-bold" style={{ color: COLORS.navy }}>
              -<Counter value={Math.round(deathValue)} run={inView} /><span className="text-xs ml-1">CHF/mois</span>
            </div>
          </motion.div>

          <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: inView ? 0 : 18, opacity: inView ? 1 : 0 }} transition={{ delay: 0.15 }} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/retraite.svg" alt="Retraite" className="w-[26px] h-[26px]" />
              <div className="text-sm" style={{ color: COLORS.navy }}>Retraite / 65 ans</div>
            </div>
            <div className="text-3xl font-bold" style={{ color: COLORS.navy }}>
              -<Counter value={Math.round(retirement)} run={inView} /><span className="text-xs ml-1">CHF/mois</span>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: inView ? 0 : 24, opacity: inView ? 1 : 0 }} transition={{ delay: 0.25 }} className="mt-8">
          <button className="w-full h-12 rounded-2xl shadow bg-[#001D38] text-white text-[15px] font-medium flex items-center justify-center gap-2">
            <Flame size={18} color={COLORS.amber}/> Optimiser maintenant
          </button>
        </motion.div>
      </div>
    </section>
  );
}

/* =========================
   PAGE
========================= */
export default function StoryMockPage() {
  // Auth + client
  const [uid, setUid] = useState<string | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTitle, setCurrentTitle] = useState<string>("Chiffres clés");
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setUid(null); setClient(null); setLoading(false); return; }
      setUid(u.uid);
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDonneesPersonnelles(uid, (d) => { setClient(d as ClientData | null); setLoading(false); });
    return () => { if (unsub) unsub(); };
  }, [uid]);

  const legal: Legal_Settings = {
    Legal_SalaireAssureMaxLAA: 148_200,
    Legal_MultiplicateurCapitalSiPasRenteLAA: 3,
    Legal_DeductionCoordinationMinLPP: 26_460,
    Legal_SeuilEntreeLPP: 22_680,
    Legal_SalaireMaxLPP: 90_720,
    Legal_SalaireAssureMaxLPP: 64_260,
    Legal_SalaireAssureMinLPP: 3_780,
    Legal_MultiplicateurCapitalSiPasRenteLPP: 3,
    Legal_CotisationsMinLPP: {},
    Legal_AgeRetraiteAVS: 65,
    Legal_AgeLegalCotisationsAVS: 21,
    Legal_Echelle44Version: "2025-01",
    Legal_ijAccidentTaux: 80, // 80% min légal pour l'accident

    // 🆕 Bonifications AVS (hydratées depuis l’échelle 44 meta ou valeurs fallback)
    Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
    Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
    Legal_BTE_SplitMarried: 0.5,
  };

    // Barre de progression (et header sticky) — scroll global du document
    const { scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 20 });
    const barWidth = useTransform(progress, [0, 1], ["0%", "100%"]);

  // Helpers
  const birthYearFromMask = (mask?: string) => {
    if (!mask) return undefined;
    const m = mask.replace(/\s/g, "");
    const ok = /^\d{2}\.\d{2}\.\d{4}$/.test(m) || /^\d{8}$/.test(m);
    if (!ok) return undefined;
    return Number(m.length === 8 ? m.slice(4) : m.split(".")[2]);
  };
  const mode = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const freq = new Map<number, number>();
    for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
    let best = arr[0], bestC = 0;
    for (const [v, c] of freq) { if (c > bestC) { best = v; bestC = c; } }
    return best;
  };

  // ==== Modes des lacunes (ligne "Lacune"), en CHF/mois ====
  const longTerm = useMemo(() => {
    if (!client) return { invMal: 0, invAcc: 0, decMal: 0, decAcc: 0, ret: 0 };

    const y0 = currentYear();
    const needMonthly = (client.Enter_salaireAnnuel ?? 0) / 12;
    const by = birthYearFromMask((client as any).Enter_dateNaissance);
    const endWorkYear = Math.max(y0, (by ?? y0) + 65);

    // Invalidité Maladie
    const gapsInvMal: number[] = [];
    const resMalStart = computeInvaliditeMaladie(yearDate(y0), client, legal, Legal_Echelle44_2025.rows);
    const ijMal0 = (resMalStart?.phaseIj?.annualIj ?? 0) / 12;
    for (let y = y0, idx = 0; y <= endWorkYear; y++, idx++) {
      if (idx < 2) {
        gapsInvMal.push(Math.max(0, needMonthly - ijMal0));
      } else {
        const r = computeInvaliditeMaladie(yearDate(y), client, legal, Legal_Echelle44_2025.rows);
        const ai = ((((r?.phaseRente?.annual as any)?.aiTotal ?? r?.phaseRente?.annual?.ai) ?? 0)) / 12;
        const lpp = ((r?.phaseRente?.annual?.lppInvalidite ?? 0) + (r?.phaseRente?.annual?.lppEnfants ?? 0)) / 12;
        gapsInvMal.push(Math.max(0, needMonthly - (ai + lpp)));
      }
    }

    // Invalidité Accident
    const gapsInvAcc: number[] = [];
    const resAccStart = computeInvaliditeAccident(client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y0) });
    const ijAcc0 = (resAccStart?.phaseIj?.annualIj ?? 0) / 12;
    for (let y = y0, idx = 0; y <= endWorkYear; y++, idx++) {
      if (idx < 2) {
        gapsInvAcc.push(Math.max(0, needMonthly - ijAcc0));
      } else {
        const r = computeInvaliditeAccident(client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y) });
        const ai = (r?.phaseRente?.annual?.aiTotal ?? 0) / 12;
        const lpp = (r?.phaseRente?.annual?.lppAfterCap ?? 0) / 12;
        const laa = (r?.phaseRente?.annual?.laaAfterCap ?? 0) / 12;
        gapsInvAcc.push(Math.max(0, needMonthly - (ai + lpp + laa)));
      }
    }

// Décès Maladie (décès figé, enfants évolutifs par année)
const gapsDecMal: number[] = [];
const deathRefDecMal = new Date();
for (let y = y0; y <= endWorkYear; y++) {
  const r = computeDecesMaladie(
    deathRefDecMal,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) }
  );
  const avs = (r?.annual?.avs ?? 0) / 12;
  const lpp = (r?.annual?.lppRentes ?? 0) / 12;
  gapsDecMal.push(Math.max(0, needMonthly - (avs + lpp)));
}

// Décès Accident (décès figé, enfants évolutifs par année)
const gapsDecAcc: number[] = [];
const deathRefDecAcc = new Date();
for (let y = y0; y <= endWorkYear; y++) {
  const r = computeDecesAccident(
    deathRefDecAcc,
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y) }
  );
  const avs = (r?.annual?.avs ?? 0) / 12;
  const lpp = (r?.annual?.lppAfterCap ?? 0) / 12;
  const laa = (r?.annual?.laaAfterCap ?? 0) / 12;
  gapsDecAcc.push(Math.max(0, needMonthly - (avs + lpp + laa)));
}

    // Retraite (65 → 87)
    const gapsRet: number[] = [];
    const startRet = (by ?? y0) + 65;
    for (let y = startRet; y <= startRet + 22; y++) {
      const r = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
      const avs = (r?.annual?.avs ?? 0) / 12;
      const lpp = (r?.annual?.lpp ?? 0) / 12;
      gapsRet.push(Math.max(0, needMonthly - (avs + lpp)));
    }

    return {
      invMal: mode(gapsInvMal),
      invAcc: mode(gapsInvAcc),
      decMal: mode(gapsDecMal),
      decAcc: mode(gapsDecAcc),
      ret: mode(gapsRet),
    };
  }, [client]);

  // ===== Slides (ordre narratif demandé)
  const slides = useMemo(() => {
    if (!client) return [] as any[];
    const y0 = currentYear();
    const NEED = (client.Enter_salaireAnnuel ?? 0) / 12;

    // --- Invalidité par maladie (illustration des composantes à ~Y0+3)
    const invMalR = computeInvaliditeMaladie(yearDate(y0 + 3), client, legal, Legal_Echelle44_2025.rows);
    const im_ai = ((((invMalR?.phaseRente?.annual as any)?.aiTotal ?? invMalR?.phaseRente?.annual?.ai) ?? 0)) / 12;
    const im_lppA = (invMalR?.phaseRente?.annual?.lppInvalidite ?? 0) / 12;
    const im_lppE = (invMalR?.phaseRente?.annual?.lppEnfants ?? 0) / 12;
    const invMalText = textsInvaliditeMaladie(
    client,
    { hasIJ: ((computeInvaliditeMaladie(yearDate(y0), client, legal, Legal_Echelle44_2025.rows)?.phaseIj?.annualIj ?? 0) > 0) }
    );

    const invMaladie = {
      key: "inv-maladie",
      tone: "amber" as const,
      icon: <Accessibility size={40} />,
      title: "Invalidité (Maladie)",
      monthlyGap: -Math.round(longTerm.invMal),
      detailText: (visible: boolean) => (
  <DetailText
    lead={invMalText.lead}
    paragraphs={invMalText.paragraphs}
    visible={visible}
  />
),
      chartData: [
        { name: "AVS/AI", value: im_ai },
        { name: "LPP", value: im_lppA },
        ...(im_lppE > 0 ? [{ name: "Enfants", value: im_lppE }] : []),
        { name: "Lacune", value: Math.max(0, NEED - (im_ai + im_lppA + im_lppE)) },
      ],
    };

    // --- Invalidité par accident (illustration composantes à ~Y0+3)
    const invAccR = computeInvaliditeAccident(client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y0 + 3) });
    const ia_ai = (invAccR?.phaseRente?.annual?.aiTotal ?? 0) / 12;
    const ia_lpp = (invAccR?.phaseRente?.annual?.lppAfterCap ?? 0) / 12;
    const ia_laa = (invAccR?.phaseRente?.annual?.laaAfterCap ?? 0) / 12;
    const invAccText = textsInvaliditeAccident(
    client,
    { hasIJ: ((computeInvaliditeAccident(client, legal, Legal_Echelle44_2025.rows, { referenceDate: yearDate(y0) })?.phaseIj?.annualIj ?? 0) > 0) }
    );

    const invAccident = {
      key: "inv-accident",
      tone: "amber" as const,
      icon: <Activity size={40} />,
      title: "Invalidité (Accident)",
      monthlyGap: -Math.round(longTerm.invAcc),
      detailText: (visible: boolean) => (
        <DetailText
            lead={invAccText.lead}
            paragraphs={invAccText.paragraphs}
            visible={visible}
        />
        ),
      chartData: [
        { name: "AVS/AI", value: ia_ai },
        { name: "LPP", value: ia_lpp },
        { name: "LAA", value: ia_laa },
        { name: "Lacune", value: Math.max(0, NEED - (ia_ai + ia_lpp + ia_laa)) },
      ],
    };

// --- Décès par maladie (photo = décès aujourd’hui, paiement = année courante)
    const decMal = computeDecesMaladie(
    new Date(),
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y0) }
    );
    const dm_avs = (decMal?.annual?.avs ?? 0) / 12;
    const dm_lpp = (decMal?.annual?.lppRentes ?? 0) / 12;
    const dm_cap = decMal?.capitals?.totalCapitalsMaladie ?? 0;
    const decMalText = textsDecesMaladie(client, { capital: dm_cap });
    const decesMaladie = {
      key: "deces-maladie",
      tone: "navy" as const,
      icon: <Skull size={40} />,
      title: "Décès (Maladie)",
      monthlyGap: -Math.round(longTerm.decMal),
      capital: dm_cap > 0 ? dm_cap : undefined,
      detailText: (visible: boolean) => (
        <DetailText
            lead={decMalText.lead}
            paragraphs={decMalText.paragraphs}
            visible={visible}
        />
        ),
      chartData: [
        { name: "AVS/AI", value: dm_avs },
        { name: "LPP", value: dm_lpp },
        { name: "Lacune", value: Math.max(0, NEED - (dm_avs + dm_lpp)) },
      ],
    };

    // --- Décès par accident (photo = décès aujourd’hui, paiement = année courante)
    const decAcc = computeDecesAccident(
    new Date(),
    client,
    legal,
    Legal_Echelle44_2025.rows,
    { paymentRef: yearDate(y0) }
    );
    const da_avs = (decAcc?.annual?.avs ?? 0) / 12;
    const da_lpp = (decAcc?.annual?.lppAfterCap ?? 0) / 12;
    const da_laa = (decAcc?.annual?.laaAfterCap ?? 0) / 12;
    const da_cap = (decAcc?.capitals?.totalCapitalsAccident ?? 0);
    const decAccText = textsDecesAccident(client, { capital: da_cap });
    const decesAccident = {
      key: "deces-accident",
      tone: "navy" as const,
      icon: <Skull size={40} />,
      title: "Décès (Accident)",
      monthlyGap: -Math.round(longTerm.decAcc),
      capital: da_cap > 0 ? da_cap : undefined,
      detailText: (visible: boolean) => (
        <DetailText
            lead={decAccText.lead}
            paragraphs={decAccText.paragraphs}
            visible={visible}
        />
        ),
      chartData: [
        { name: "AVS/AI", value: da_avs },
        { name: "LPP", value: da_lpp },
        { name: "LAA", value: da_laa },
        { name: "Lacune", value: Math.max(0, NEED - (da_avs + da_lpp + da_laa)) },
      ],
    };

    // --- Retraite
    const ret = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
const r_avs = (ret?.annual?.avs ?? 0) / 12;
const r_lpp = (ret?.annual?.lpp ?? 0) / 12;

// capital cumulé retraite 65→87 (somme des lacunes annuelles)
const byRet = birthYearFromMask((client as any).Enter_dateNaissance);
const startRetYear = (byRet ?? y0) + (legal?.Legal_AgeRetraiteAVS ?? 65);
let retCapital = 0;
for (let yy = startRetYear; yy <= startRetYear + 22; yy++) {
  const rYear = computeRetraite(client, legal, Legal_Echelle44_2025.rows);
  const avsYear = rYear?.annual?.avs ?? 0;
  const lppYear = rYear?.annual?.lpp ?? 0;
  const needYear = (NEED ?? 0) * 12;
  retCapital += Math.max(0, Math.round(needYear - (avsYear + lppYear)));
}
const retraiteText = textsRetraite(client, { capital: retCapital });
    const retraite = {
      key: "retraite",
      tone: "rose" as const,
      icon: <img src="/retraite.svg" alt="Retraite" className="w-[40px] h-[40px]" />,
      title: "Retraite",
      monthlyGap: -Math.round(longTerm.ret),
      detailText: (visible: boolean) => (
        <DetailText
            lead={retraiteText.lead}
            paragraphs={retraiteText.paragraphs}
            visible={visible}
        />
        ),
      chartData: [
        { name: "AVS", value: r_avs },
        { name: "LPP", value: r_lpp },
        { name: "Lacune", value: Math.max(0, NEED - (r_avs + r_lpp)) },
      ],
    };

    // Réordonne selon la narration souhaitée
    const ordered = [invMaladie, invAccident, decesMaladie, decesAccident, retraite];
    return ordered;
  }, [client, longTerm]);

  useEffect(() => {
  const first = slides[0]?.title;
  setCurrentTitle(typeof first === "string" ? first : "Chiffres clés");
}, [slides]);

  return (
    <div
    className="relative bg-white dark:bg-zinc-950 text-zinc-900 md:snap-y md:snap-mandatory"
    data-snap-root
    >
      {/* Header sticky global avec barre de progression 2px */}
      <StickyHeader
        progressWidth={useTransform(progress, [0, 1], ["0%", "100%"])}
        currentTitle={currentTitle}
        />

      {/* States */}
      {!uid && <div className="h-[100svh] flex items-center justify-center text-sm" style={{ color: COLORS.navy }}>Connectez-vous.</div>}
      {uid && loading && (
        <div className="min-h-dvh grid place-items-center">
            <SpinCardLoader size={110} duration={0.8} pause={0.3} iconScale={0.5} />
        </div>
        )}
      {uid && !loading && !client && <div className="h-[100svh] flex items-center justify-center text-sm" style={{ color: COLORS.navy }}>Aucune donnée trouvée.</div>}

      {uid && !loading && client && (
        <>
          {slides.map((s) => (
            <StoryCard
                key={s.key}
                tone={s.tone as any}
                icon={s.icon}
                title={s.title}
                monthlyGap={s.monthlyGap}
                capital={s.capital}
                detailText={s.detailText}
                chart={
                s.key === "inv-maladie" ? (
                    <StoryBars
                    client={client}
                    legal={legal}
                    kind="invalidite-maladie"
                    horizonYears={14}
                    labelOverrides={{
                        2: "nov. 2027", // fin IJ → début rentes
                        // ajoute ici d’autres jalons si nécessaire
                    }}
                    />
                ) : s.key === "inv-accident" ? (
                    <StoryBars
                    client={client}
                    legal={legal}
                    kind="invalidite-accident"
                    horizonYears={14}
                    />
                ) : s.key === "deces-maladie" ? (
                    <StoryBars
                    client={client}
                    legal={legal}
                    kind="deces-maladie"
                    horizonYears={12}
                    />
                ) : s.key === "deces-accident" ? (
                    <StoryBars
                    client={client}
                    legal={legal}
                    kind="deces-accident"
                    horizonYears={12}
                    />
                ) : s.key === "retraite" ? (
                    <StoryBars
                    client={client}
                    legal={legal}
                    kind="retraite"
                    // retraite: horizon géré en interne (65→87)
                    />
                ) : undefined
                }
            onVisible={(t) => setCurrentTitle(t)}
            />
            ))}

          {/* Résumé (toggle Accident/Maladie) */}
          <SummaryCard
            invalidityAcc={Math.round(longTerm.invAcc)}
            invalidityMal={Math.round(longTerm.invMal)}
            deathAcc={Math.round(longTerm.decAcc)}
            deathMal={Math.round(longTerm.decMal)}
            retirement={Math.round(longTerm.ret)}
            onVisible={(t) => setCurrentTitle(t)}
            />
        </>
      )}
    </div>
  );
}