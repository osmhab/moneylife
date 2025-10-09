// app/analyse/[id]/invalidite/view-client.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";

/* UI */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* Chart */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/* Firestore & Auth */
import { db, auth } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";

/* ===== Types alignés avec ta page ===== */
type EventKind = "maladie" | "accident";

type AvsSeed = {
  invalidityMonthly: number;
  childMonthly?: number;
  widowMonthly?: number;
};

type LppSeed = {
  invalidityMonthly?: number;
  invalidityChildMonthly?: number;
};

type LaaParams = {
  insured_earnings_max: number;
  disabilityPctFull: number;
  overallCapPct: number;
};

type CtxSeed = {
  eventInvalidity: EventKind;
  invalidityDegreePct: number;
  childrenCount: number;
  childrenBirthdates?: string[];
  weeklyHours?: number;
};

type Props = {
  analysisId: string;
  annualIncome: number;
  avs: AvsSeed;
  lpp: LppSeed;
  laaParams?: LaaParams;
  ctx: CtxSeed;
  /** IMPORTANT : passer `clients/{clientToken}` (clé utilisée par la page principale) */
  clientDocPath?: string;
};

/* ===== Helpers ===== */
const fmtChf = (n: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(n))
  );
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));
const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);

/** compte enfants éligibles à la date `at` (fallback sur compteur si dates absentes) */
function countEligibleChildren(birthdates: string[] | undefined, at: Date, fallbackCount: number) {
  if (!birthdates?.length) return Math.max(0, fallbackCount);
  const eighteen = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 18, d.getUTCMonth(), d.getUTCDate()));
  const parse = (s: string) => {
    const m1 = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return new Date(Date.UTC(+m1[1], +m1[2] - 1, +m1[3]));
    return new Date();
  };
  return birthdates.reduce((acc, iso) => (at < eighteen(parse(iso)) ? acc + 1 : acc), 0);
}

/* ===== Extraction souple depuis Firestore ===== */
type InvalidityParts = {
  avsAdult: number;
  avsKids: number;
  laa: number;
  lppAdult: number;
  lppKids: number;
  total: number;
  event: EventKind;
};

function sumSegments(segments: any[] | undefined, pred: (s: any) => boolean) {
  return Math.max(
    0,
    Math.round(
      (segments ?? []).filter(pred).reduce((acc: number, s: any) => acc + Number(s?.value ?? 0), 0)
    )
  );
}

/** Essaie d’extraire invalidité depuis plusieurs formes (prestations, gaps, benefits) */
function extractInvalidity(source: any, seed: InvalidityParts): InvalidityParts {
  if (!source || typeof source !== "object") return seed;

  // 1) prestations.invalidity (recommandé par usePrestationsSync)
  const direct = source?.prestations?.invalidity ?? source?.invalidity;
  if (direct && typeof direct === "object") {
    const parts: InvalidityParts = {
      avsAdult: Number(direct.avsAdult ?? direct.aiAdult ?? 0),
      avsKids: Number(direct.avsKids ?? direct.aiChildren ?? 0),
      laa: Number(direct.laa ?? direct.laaMonthly ?? 0),
      lppAdult: Number(direct.lppAdult ?? direct.lpp ?? 0),
      lppKids: Number(direct.lppKids ?? direct.lppChildren ?? 0),
      total: 0,
      event: (direct.event === "accident" ? "accident" : "maladie") as EventKind,
    };
    parts.total =
      Number(direct.total ?? 0) ||
      parts.avsAdult + parts.avsKids + parts.laa + parts.lppAdult + parts.lppKids;
    return parts;
  }

  // 2) gaps.invalidity.current.segments (snapshot de useGaps)
  const segments = source?.gaps?.invalidity?.current?.segments as any[] | undefined;
  if (Array.isArray(segments) && segments.length) {
    const avsAdult = sumSegments(segments, (s) => s.source === "AVS" && !/enfant/i.test(String(s.label)));
    const avsKids = sumSegments(segments, (s) => s.source === "AVS" && /enfant/i.test(String(s.label)));
    const laa = sumSegments(segments, (s) => s.source === "LAA");
    const lppAdult = sumSegments(segments, (s) => s.source === "LPP" && !/enfant/i.test(String(s.label)));
    const lppKids = sumSegments(segments, (s) => s.source === "LPP" && /enfant/i.test(String(s.label)));
    const total = avsAdult + avsKids + laa + lppAdult + lppKids;
    // essaie d’inférer l’événement
    const event =
      source?.gaps?.invalidity?.current === source?.gaps?.invalidity?.accident ? "accident" : "maladie";
    return { avsAdult, avsKids, laa, lppAdult, lppKids, total, event };
  }

  // 3) benefits / prestations plats (secours)
  const ben = source?.benefits ?? source?.prestations;
  if (ben && typeof ben === "object") {
    const parts: InvalidityParts = {
      avsAdult: Number(ben.avsAdult ?? 0),
      avsKids: Number(ben.avsKids ?? 0),
      laa: Number(ben.laa ?? 0),
      lppAdult: Number(ben.lppAdult ?? 0),
      lppKids: Number(ben.lppKids ?? 0),
      total: 0,
      event: (ben.event === "accident" ? "accident" : "maladie") as EventKind,
    };
    parts.total = Number(ben.total ?? 0) || parts.avsAdult + parts.avsKids + parts.laa + parts.lppAdult + parts.lppKids;
    return parts;
  }

  return seed;
}

/* ===== Vue ===== */
export default function InvaliditeViewClient({
  analysisId,
  annualIncome,
  avs,
  lpp,
  laaParams,
  ctx,
  clientDocPath,
}: Props) {
  // Clé Firestore : doc propriétaire (UID) & doc token
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) signInAnonymously(auth).catch(() => {});
      setUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  const ownerDocPath = uid ? `clients/${uid}` : undefined;
  const tokenDocPath = clientDocPath && clientDocPath.length ? clientDocPath : `clients/${analysisId}`;
  const docCandidates = useMemo(
    () => [ownerDocPath, tokenDocPath].filter(Boolean) as string[],
    [ownerDocPath, tokenDocPath]
  );

  // États pilotés par Firestore
  const [quickParams, setQuickParams] = useState<any | null>(null);
  const [invalidity, setInvalidity] = useState<InvalidityParts>({
    avsAdult: avs.invalidityMonthly ?? 0,
    avsKids: 0,
    laa: 0,
    lppAdult: Math.max(0, lpp.invalidityMonthly ?? 0),
    lppKids: Math.max(0, lpp.invalidityChildMonthly ?? 0) * (ctx.childrenCount ?? 0),
    total: 0,
    event: ctx.eventInvalidity ?? "maladie",
  });
  // init total si absent
  useEffect(() => {
    setInvalidity((prev) => ({
      ...prev,
      total: prev.total || prev.avsAdult + prev.avsKids + prev.laa + prev.lppAdult + prev.lppKids,
    }));
  }, []);

  // Listener DOCS (owner + token) — robustes avec error callback
  useEffect(() => {
    if (!docCandidates.length) return;
    const unsubs = docCandidates.map((path) =>
      onSnapshot(
        doc(db, path),
        (snap) => {
          const data: DocumentData | undefined = snap.data();
          if (!data) return;

          const qp = data.quickParams ?? data.params ?? data.advancedParams;
          if (qp) setQuickParams(qp);

          const inv = extractInvalidity(data, invalidity);
          setInvalidity(inv);
        },
        (err) => {
          if ((err as any)?.code === "permission-denied") {
            console.warn("[FS] lecture refusée:", path);
          } else {
            console.error("[FS] doc listener error:", err);
          }
        }
      )
    );
    return () => unsubs.forEach((u) => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docCandidates.join("|")]);

  // Listener sous-collection prestations — uniquement sur clients/{uid}
  useEffect(() => {
    if (!ownerDocPath) return;
    const q = query(collection(db, `${ownerDocPath}/prestations`), orderBy("updatedAt", "desc"), limit(1));
    const unsub = onSnapshot(
      q,
      (qsnap) => {
        if (!qsnap.empty) {
          const data = qsnap.docs[0].data();
          const inv = extractInvalidity(data, invalidity);
          setInvalidity(inv);
        }
      },
      (err) => {
        if ((err as any)?.code === "permission-denied") {
          console.warn("[FS] lecture refusée (subcol):", `${ownerDocPath}/prestations`);
        } else {
          console.error("[FS] subcol listener error:", err);
        }
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerDocPath]);

  // UI controls (scénario & degré) — visuels (la source de vérité reste Firestore)
  const eventInvalidity: EventKind =
    quickParams?.eventInvalidity === "accident" || quickParams?.eventInvalidity === "maladie"
      ? quickParams.eventInvalidity
      : invalidity.event;

  const [degree, setDegree] = useState<number>(
    clamp(
      typeof quickParams?.invalidityDegreePct === "number"
        ? quickParams.invalidityDegreePct
        : typeof quickParams?.accidentInvalidityPct === "number"
        ? quickParams.accidentInvalidityPct
        : ctx.invalidityDegreePct ?? 100,
      40,
      100
    )
  );

  // Timeline : dates d’enfants depuis quickParams (fallback ctx)
  const childrenBirthdates: string[] | undefined = Array.isArray(quickParams?.childrenBirthdates)
    ? quickParams.childrenBirthdates.filter(isISO)
    : ctx.childrenBirthdates;

  const childrenCount: number =
    typeof quickParams?.childrenCount === "number" ? quickParams.childrenCount : ctx.childrenCount ?? 0;

  const startAt = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }, []);

  const lastChild18 = useMemo(() => {
    const b = childrenBirthdates ?? [];
    if (!b.length) return null;
    const parse = (s: string) => {
      const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m1) return new Date(Date.UTC(+m1[1], +m1[2] - 1, +m1[3]));
      return new Date();
    };
    const youngest = b.map(parse).sort((a, b) => b.getTime() - a.getTime())[0];
    return new Date(Date.UTC(youngest.getUTCFullYear() + 18, youngest.getUTCMonth(), 1));
  }, [childrenBirthdates]);

  const months = useMemo(() => {
    if (!lastChild18) return 120; // 10 ans par défaut
    const years = lastChild18.getUTCFullYear() - startAt.getUTCFullYear();
    const monthsDiff = years * 12 + (lastChild18.getUTCMonth() - startAt.getUTCMonth());
    return Math.max(12, Math.min(240, monthsDiff + 1));
  }, [lastChild18, startAt]);

  // base par enfant (si 0 enfant → 0)
  const baseKidsAvsPerChild =
    childrenCount > 0 ? Math.round(invalidity.avsKids / Math.max(1, childrenCount)) : 0;
  const baseKidsLppPerChild =
    childrenCount > 0 ? Math.round(invalidity.lppKids / Math.max(1, childrenCount)) : 0;

  const data = useMemo(() => {
    const rows: Array<{
      date: string;
      avsAdult: number;
      avsKids: number;
      laa: number;
      lppAdult: number;
      lppKids: number;
      total: number;
    }> = [];

    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + i, 1));
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

      const nEligible = countEligibleChildren(childrenBirthdates, d, childrenCount);

      const avsKids = baseKidsAvsPerChild * nEligible;
      const lppKids = baseKidsLppPerChild * nEligible;

      const laaVal = eventInvalidity === "accident" ? invalidity.laa : 0;

      const total =
        invalidity.avsAdult + avsKids + laaVal + invalidity.lppAdult + lppKids;

      rows.push({
        date: label,
        avsAdult: invalidity.avsAdult,
        avsKids,
        laa: laaVal,
        lppAdult: invalidity.lppAdult,
        lppKids,
        total,
      });
    }
    return rows;
  }, [
    months,
    startAt,
    childrenBirthdates,
    childrenCount,
    baseKidsAvsPerChild,
    baseKidsLppPerChild,
    invalidity.avsAdult,
    invalidity.laa,
    invalidity.lppAdult,
    eventInvalidity,
  ]);

  const last = data[data.length - 1] ?? {
    avsAdult: 0,
    avsKids: 0,
    laa: 0,
    lppAdult: 0,
    lppKids: 0,
    total: 0,
  };

  /* ===== UI ===== */
  return (
    <section className="space-y-6">
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">
              Invalidité — {eventInvalidity === "maladie" ? "maladie" : "accident"} (timeline)
            </CardTitle>
            <Badge variant="secondary" className="rounded-full">
              Dossier <span className="ml-1 font-mono">{analysisId}</span>
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Tabs et slider sont purement visuels ici (source = Firestore) */}
            <Tabs value={eventInvalidity} onValueChange={() => { /* no-op */ }}>
              <TabsList>
                <TabsTrigger value="maladie">Maladie</TabsTrigger>
                <TabsTrigger value="accident">Accident</TabsTrigger>
              </TabsList>
            </Tabs>

            {eventInvalidity === "accident" && (
              <div className="w-full md:w-1/2">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Degré d’invalidité (affiché)</span>
                  <span className="font-medium">{degree}%</span>
                </div>
                <Slider
                  value={[degree]}
                  min={40}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setDegree(clamp(v ?? degree, 40, 100))}
                />
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="h-72 w-full rounded-xl border bg-white p-2 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-avs-adult" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="grad-avs-kids" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary)/0.6)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--primary)/0.6)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="grad-laa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="grad-lpp-adult" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4fd1c5" stopOpacity={0.85} />
                    <stop offset="95%" stopColor="#4fd1c5" stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="grad-lpp-kids" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgba(79,209,197,0.9)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="rgba(79,209,197,0.9)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => fmtChf(Number(v ?? 0))} labelFormatter={(l) => `Mois: ${l}`} />
                <Legend />
                <Area type="monotone" dataKey="avsAdult" name="AI (adulte)" stackId="1" stroke="hsl(var(--primary))" fill="url(#grad-avs-adult)" />
                <Area type="monotone" dataKey="avsKids" name="AI (enfants)" stackId="1" stroke="hsl(var(--primary)/0.6)" fill="url(#grad-avs-kids)" />
                {eventInvalidity === "accident" && (
                  <Area type="monotone" dataKey="laa" name="LAA (coord.)" stackId="1" stroke="hsl(var(--warning))" fill="url(#grad-laa)" />
                )}
                <Area type="monotone" dataKey="lppAdult" name="LPP (adulte)" stackId="1" stroke="#4fd1c5" fill="url(#grad-lpp-adult)" />
                <Area type="monotone" dataKey="lppKids" name="LPP (enfants)" stackId="1" stroke="rgba(79,209,197,0.9)" fill="url(#grad-lpp-kids)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown – dernier point */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">AI (adulte)</div>
              <div className="text-lg font-semibold">{fmtChf(last.avsAdult)}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">AI (enfants)</div>
              <div className="text-lg font-semibold">{fmtChf(last.avsKids)}</div>
            </div>
            {eventInvalidity === "accident" && (
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">LAA (coordonnée)</div>
                <div className="text-lg font-semibold">{fmtChf(last.laa)}</div>
              </div>
            )}
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">LPP (adulte)</div>
              <div className="text-lg font-semibold">{fmtChf(last.lppAdult)}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">LPP (enfants)</div>
              <div className="text-lg font-semibold">{fmtChf(last.lppKids)}</div>
            </div>
            <div className={cn("rounded-xl border p-3", "bg-muted/30")}>
              <div className="text-xs text-muted-foreground">Total mensuel (point affiché)</div>
              <div className="text-lg font-semibold">{fmtChf(last.total)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rappel paramètres / barèmes */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Paramètres (rappel)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Revenu AVS: <span className="font-medium">{fmtChf(annualIncome)}</span>/an</div>
            {laaParams && (
              <>
                <div>Cap LAA (90%): <span className="font-medium">
                  {fmtChf(Math.round((Math.min(annualIncome, laaParams.insured_earnings_max) * (laaParams.overallCapPct / 100)) / 12))}
                </span>/mois</div>
                <div>Rente LAA nominale (80% @100%): <span className="font-medium">
                  {fmtChf(Math.round((Math.min(annualIncome, laaParams.insured_earnings_max) * (laaParams.disabilityPctFull / 100)) / 12))}
                </span>/mois</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Source</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <div>Données lues en direct depuis <code>{ownerDocPath ?? "(no-uid)"}</code> (prestations) et/ou <code>{tokenDocPath}</code>.</div>
            <div>Dernier enregistrement de <code>{ownerDocPath}/prestations</code> pris en compte s’il existe.</div>
            <div>La page principale met à jour ces valeurs via <code>usePrestationsSync</code>.</div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
