//app/dashboard/offres/page.tsx
"use client";

import { useEffect, useState, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
} from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";

import { auth, db, storage } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { AppSidebar } from "../../components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import RequireAuth from "../../profil/_client/RequireAuth";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import {
  ArrowLeft,
  PiggyBank,
  Layers,
  ShieldHalf,
  Clock,
  FileText,
  Download,
  SlidersHorizontal,
  HandCoins,
  Hourglass,
  Sparkles,
  CheckCircle,
  Trophy, 
  Skull,
  Accessibility,
  FileHeart, 
  Copy
} from "lucide-react";

import {
  AreaChart,
  Area,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";

function getInsurerLogo(insurer: string | null | undefined): string | null {
  if (!insurer) return null;
  switch (insurer) {
    case "AXA":
      return "/iconeAXA.svg";
    case "Bâloise":
      return "/iconeBaloise.svg";
    case "PAX":
      return "/iconePax.svg";
    case "Swiss Life":
      return "/iconeSwissLife.svg";
    default:
      return null;
  }
}

function getInsurerColor(insurer: string | null | undefined): string {
  if (!insurer) return "#999"; // fallback neutre

  switch (insurer) {
    case "AXA":
      return "#00008F";
    case "Swiss Life":
      return "#C5363B";
    case "Bâloise":
      return "#5E8AD8";
    case "PAX":
      return "#8CCD0F";
    default:
      return "#999";
  }
}


type OfferStatus = "nouvelle" | "en_cours" | "en_attente_client" | "terminee";
type ClientFlowStatus = "SIGNED" | "SIGNED_WAITING_HEALTH" | "SIGNED_FINALIZING";
type SurrenderScenario = "pess" | "mid" | "opt" | "guaranteed";
type SortCriterion = "score" | "capital" | "rachat" | "risque" | "flex";

interface ClientAttachment {
  id: string;
  name: string;
  storagePath: string;
  mimeType?: string | null;
  category?: "offre" | "conditions_generales" | "signature" | "autres" | string;
}

interface ClientCoverage {
  label: string;
  sumInsured: number | null;
  premium: number | null;
  waitingPeriodMonths?: number | null;
}

interface ClientSurrenderValue {
  dateLabel: string;
  pess: number | null;
  mid: number | null;
  opt: number | null;
  guaranteed: number | null;
}

interface ClientOffer {
  id: string;
  insurer: string;
  contractForm: "3a" | "3b" | "";
  offerNumber?: string | null;
  startDateLabel?: string | null;
  premiumAnnual: number | null;
  premiumMonthly: number | null;
  projectedModerateAmount: number | null;
  projectedModerateRatePct: number | null;
  riskDeathCapital?: number | null;
  riskInvalidityRente?: number | null;
  riskInvalidityCapital?: number | null;
  coverages: ClientCoverage[];
  surrenderValues: ClientSurrenderValue[];
  surrenderValuesEpl?: ClientSurrenderValue[] | null;
  attachments: ClientAttachment[];
  healthQuestionnaireRequired?: boolean | null;
  healthQuestionnaireUrl?: string | null;
  healthQuestionnaireTan?: string | null;
  healthQuestionnairePin?: string | null;


}

interface ClientOfferRequest {
  id: string;
  type: string | null;
  offerName?: string | null;
  createdAt: Date | null;
  status: OfferStatus;
  clientFlowStatus?: ClientFlowStatus | null;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  totalRiskPremium: number | null;
  netSavingsPremium: number | null;
  adminOffersStatus?: "saved" | "sent";
  offers: ClientOffer[];
}

interface OfferMetrics {
  earlySurrenderAmount: number | null;
  earlySurrenderLabel: string | null;
  riskPremiumTotal: number | null;
}

const COLORS = ["#2563EB", "#22C55E", "#F97316", "#E11D48", "#8B5CF6"];

/* -------- Helpers -------- */

function toDate(value: any): Date | null {
  if (!value && value !== 0) return null;
  // Firestore Timestamp
  // @ts-ignore
  if (typeof value?.toDate === "function") {
    // @ts-ignore
    const d: Date = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseDateLabel(label: string): Date | null {
  if (!label) return null;
  const [dd, mm, yyyy] = label.split(".");
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeVrDateLabel(label: string): string {
  const d = parseDateLabel(label);
  if (!d) return label;

  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 0 = janv

  // Si c'est en janvier, on force au 1er janvier de l'année
  if (month === 1) {
    return `01.01.${year}`;
  }

  // Sinon, on garde la date réelle (mais bien formatée)
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}.${mm}.${year}`;
}

function formatDateTime(date: Date | null) {
  if (!date) return "Date inconnue";
  return `${date.toLocaleDateString("fr-CH")} · ${date.toLocaleTimeString(
    "fr-CH",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

function formatMoney(value: number | null, suffix: string = "CHF") {
  if (value == null) return "Non renseigné";
  return `${value.toLocaleString("fr-CH")} ${suffix}`;
}

function formatType(type: string | null) {
  if (type === "3a") return "3e pilier lié (3a)";
  if (type === "3b") return "3e pilier libre (3b)";
  return type || "Type non renseigné";
}

function statusBadgeVariant(
  status: OfferStatus
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "nouvelle":
      return "outline";
    case "en_cours":
      return "outline";
    case "en_attente_client":
      return "secondary";
    case "terminee":
      return "default";
    default:
      return "outline";
  }
}

function statusLabel(status: OfferStatus) {
  switch (status) {
    case "nouvelle":
      return "En préparation";
    case "en_cours":
      return "En cours de traitement";
    case "en_attente_client":
      return "En attente de réponse";
    case "terminee":
      return "Finalisée";
    default:
      return status;
  }
}

function adminStatusLabel(status?: "saved" | "sent") {
  if (status === "sent") return "Prêt pour consultation";
  if (status === "saved") return "Brouillon (non publiée)";
  return "En préparation";
}

function getScenarioLabel(s: SurrenderScenario) {
  switch (s) {
    case "pess":
      return "Pessimiste";
    case "mid":
      return "Modéré";
    case "opt":
      return "Optimiste";
    case "guaranteed":
      return "Garanti";
  }
}

function getScenarioValue(row: ClientSurrenderValue, s: SurrenderScenario) {
  let primary: number | null | undefined;

  switch (s) {
    case "pess":
      primary = row.pess;
      break;
    case "mid":
      primary = row.mid;
      break;
    case "opt":
      primary = row.opt;
      break;
    case "guaranteed":
      primary = row.guaranteed;
      break;
  }

  // Si la valeur du scénario choisi existe → on la prend
  if (primary != null && Number.isFinite(primary)) {
    return primary;
  }

  // Fallback : on prend ce qu'on trouve
  if (row.mid != null && Number.isFinite(row.mid)) return row.mid;
  if (row.guaranteed != null && Number.isFinite(row.guaranteed)) return row.guaranteed;
  if (row.pess != null && Number.isFinite(row.pess)) return row.pess;
  if (row.opt != null && Number.isFinite(row.opt)) return row.opt;

  return null;
}

/* -------- Métriques & score global -------- */

function computeOfferMetrics(offer: ClientOffer): OfferMetrics {
  let earlySurrenderAmount: number | null = null;
  let earlySurrenderLabel: string | null = null;

  if (offer.surrenderValues && offer.surrenderValues.length > 0) {
    const candidates = offer.surrenderValues
      .map((row) => {
        const date = parseDateLabel(row.dateLabel);
        const amount =
          row.mid != null
            ? row.mid
            : row.guaranteed != null
            ? row.guaranteed
            : row.pess != null
            ? row.pess
            : row.opt != null
            ? row.opt
            : null;
        return { date, amount, label: row.dateLabel };
      })
      .filter((r) => r.date && r.amount != null) as {
      date: Date;
      amount: number;
      label: string;
    }[];

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
      earlySurrenderAmount = candidates[0].amount;
      earlySurrenderLabel = candidates[0].label;
    }
  }

  const riskPremiumTotal =
    offer.coverages && offer.coverages.length > 0
      ? offer.coverages.reduce(
          (sum, c) => sum + (c.premium != null ? c.premium : 0),
          0
        )
      : null;

  return { earlySurrenderAmount, earlySurrenderLabel, riskPremiumTotal };
}


/**
 * Score global 0-100 par offre (par configuration)
 * - 50% capital projeté modéré
 * - 30% valeur de rachat la plus tôt
 * - 20% coût du risque (plus bas = mieux)
 */

function getFlexibilityScore(insurer: string | null | undefined): number {
  // Note interne 1–5
  let raw: number;
  switch (insurer) {
    case "AXA":
      raw = 4;
      break;
    case "Swiss Life":
      raw = 3;
      break;
    case "Bâloise":
      raw = 2;
      break;
    case "PAX":
      raw = 1;
      break;
    default:
      raw = 3; // neutre par défaut
  }

  // Normalisation 0–1
  return raw / 5;
}


function computeGlobalScores(offers: ClientOffer[]): Record<string, number> {
  if (offers.length === 0) return {};

  const caps = offers.map((o) => o.projectedModerateAmount ?? 0);
  const metrics = offers.map((o) => computeOfferMetrics(o));
  const rachats = metrics.map((m) => m.earlySurrenderAmount ?? 0);
  const risks = metrics.map((m) => m.riskPremiumTotal ?? 0);

  const maxCap = Math.max(...caps, 0);
  const maxRachat = Math.max(...rachats, 0);

  const positiveRisks = risks.filter((r) => r > 0);
  const minRisk =
    positiveRisks.length > 0
      ? positiveRisks.reduce((a, b) => Math.min(a, b))
      : 0;
  const maxRisk =
    positiveRisks.length > 0
      ? positiveRisks.reduce((a, b) => Math.max(a, b))
      : 0;

  const scores: Record<string, number> = {};

  offers.forEach((offer, idx) => {
    const cap = caps[idx];
    const rach = rachats[idx];
    const risk = risks[idx];

    // 1) Capital projeté (0–1)
    const sCap = maxCap > 0 ? cap / maxCap : 0;

    // 2) Valeur de rachat la plus tôt (0–1)
    const sRach = maxRachat > 0 ? rach / maxRachat : 0;

    // 3) Coût du risque (0–1, plus bas = mieux)
    let sRisk = 0.5; // neutre
    if (maxRisk > minRisk && risk > 0) {
      sRisk = 1 - (risk - minRisk) / (maxRisk - minRisk); // min risk => 1, max => 0
    } else if (risk > 0) {
      sRisk = 1; // tous égaux ≈ neutre favorable
    }

    // 4) Flexibilité produit (0–1) basé sur la compagnie
    const sFlex = getFlexibilityScore(offer.insurer);

    // Pondération :
    // - 35% capital
    // - 21% valeur de rachat la plus tôt
    // - 14% coût du risque
    // - 30% flexibilité produit
    const globalScore =
      (0.35 * sCap + 0.21 * sRach + 0.14 * sRisk + 0.3 * sFlex) * 100;

    scores[offer.id] = Math.round(globalScore);
  });

  return scores;
}

/* -------- Tri des offres selon critère -------- */

function sortOffers(
  offers: ClientOffer[],
  sortCriterion: SortCriterion,
  scoresById: Record<string, number>
): ClientOffer[] {
  const copy = [...offers];
    return copy.sort((a, b) => {
    const ma = computeOfferMetrics(a);
    const mb = computeOfferMetrics(b);

    switch (sortCriterion) {
      case "score": {
        const sa = scoresById[a.id] ?? 0;
        const sb = scoresById[b.id] ?? 0;
        return sb - sa;
      }
      case "capital": {
        return (
          (b.projectedModerateAmount ?? 0) - (a.projectedModerateAmount ?? 0)
        );
      }
      case "rachat": {
        return (
          (mb.earlySurrenderAmount ?? 0) - (ma.earlySurrenderAmount ?? 0)
        );
      }
      case "risque": {
        const ra = ma.riskPremiumTotal ?? Infinity;
        const rb = mb.riskPremiumTotal ?? Infinity;
        return ra - rb; // plus faible en premier
      }
      case "flex": {
        const fa = getFlexibilityScore(a.insurer);
        const fb = getFlexibilityScore(b.insurer);
        // plus flexible en premier
        return fb - fa;
      }
      default:
        return 0;
    }
  });
}

async function openAttachment(att: ClientAttachment) {
  try {
    const url = await getDownloadURL(ref(storage, att.storagePath));
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.error("[MesOffres] Erreur ouverture pièce jointe:", e);
    toast.error("Impossible d'ouvrir ce fichier.");
  }
}

const MotionAccordionItem = motion(AccordionItem as any);

type LegendSeriesEntry = {
  key: string;
  label: string;
  color: string;
};

function CustomLegend({ series }: { series: LegendSeriesEntry[] }) {
  if (!series || series.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1">
          {/* petit carré de couleur */}
          <span
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: s.color }}
          />
          {/* label */}
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* -------- Page principale -------- */


export default function DashboardOffersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ClientOfferRequest[]>([]);
  const [userReady, setUserReady] = useState(false);

  const [valuesScenarioByReq, setValuesScenarioByReq] = useState<
    Record<string, SurrenderScenario>
  >({});
  const [sortCriterion, setSortCriterion] = useState<SortCriterion>("score");

  const [openOfferByReq, setOpenOfferByReq] = useState<
  Record<string, string | undefined>
>({});

  // 👇 nouveau : mode EPL activé ou non par demande
const [useEplByReq, setUseEplByReq] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login?from=/dashboard/offres");
        return;
      }
      setUserReady(true);
      try {
        const q = query(
          collection(db, "offers_requests_3e"),
          where("clientUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const items: ClientOfferRequest[] = [];

        snap.forEach((docSnap) => {
          const d = docSnap.data() as DocumentData;
          const createdAt = toDate(d.createdAt);
          const adminOffers: any[] = Array.isArray(d.adminOffers)
            ? d.adminOffers
            : [];

const offers: ClientOffer[] = adminOffers.map((o: any, idx: number) => {
const toNum = (v: any): number | null => {
  // Déjà un nombre valide → on le garde
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;

    // Nettoyage "suisse" : espaces, apostrophes, insécables, etc.
    const cleaned = trimmed
      .replace(/[\s'’\u00A0]/g, "")          // espaces, apostrophes droites et typographiques, insécables
      .replace(/\u200B|\u200C|\u200D/g, "")  // zero-width
      .replace(/,(?=\d{2}\b)/, ".");        // virgule décimale → point (ex: 1,25)

    // Si la chaîne ne contient que des 0 (avec parasites) → 0
    const onlyZeros = cleaned.replace(/0/g, "").length === 0;
    if (onlyZeros) return 0;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  return null;
};

  return {
    id: o.id ?? `offer_${idx}_${docSnap.id}`,
    insurer: o.insurer ?? "",
    contractForm: (o.contractForm as "3a" | "3b") ?? "",
    // 👉 nouveau
    offerNumber: o.offerNumber ?? null,
    startDateLabel: o.startDateLabel ?? null,
    premiumAnnual: toNum(o.premiumAnnual),
    premiumMonthly: toNum(o.premiumMonthly),
    projectedModerateAmount: toNum(o.projectedModerateAmount),
    projectedModerateRatePct: toNum(o.projectedModerateRatePct),
    riskDeathCapital: toNum(d.riskDeathCapital),
    riskInvalidityRente: toNum(d.riskInvalidityRente),
    riskInvalidityCapital: toNum(d.riskInvalidityCapital),
    coverages: Array.isArray(o.coverages)
      ? o.coverages.map((c: any) => ({
          label: c.label ?? "",
          sumInsured: toNum(c.sumInsured),
          premium: toNum(c.premium),
          waitingPeriodMonths: toNum(c.waitingPeriodMonths),
        }))
      : [],
    surrenderValues: Array.isArray(o.surrenderValues)
      ? o.surrenderValues.map((row: any) => ({
          dateLabel: row.dateLabel ?? "",
          pess: toNum(row.pess),
          mid: toNum(row.mid),
          opt: toNum(row.opt),
          guaranteed: toNum(row.guaranteed),
        }))
      : [],
    // 👉 nouveau : EPL stockée côté client, prête pour l’UI plus tard
    surrenderValuesEpl: Array.isArray(o.surrenderValuesEpl)
      ? o.surrenderValuesEpl.map((row: any) => ({
          dateLabel: row.dateLabel ?? "",
          pess: toNum(row.pess),
          mid: toNum(row.mid),
          opt: toNum(row.opt),
          guaranteed: toNum(row.guaranteed),
        }))
      : null,
    attachments: Array.isArray(o.attachments)
  ? (o.attachments as any[]).map((att, i) => ({
      id: att.id ?? `att_${idx}_${i}`,
      name: att.name ?? "Document",
      storagePath: att.storagePath,
      mimeType: att.mimeType ?? null,
      // 👇 par défaut on considère que c'est une offre
      category: att.category ?? "offre",
    })).filter((att) => !!att.storagePath)
  : [],
        healthQuestionnaireRequired:
      o.healthQuestionnaireRequired === true ? true : false,

    // ✅ lien/PIN/TAN stockés par le collaborateur dans l’offre
    healthQuestionnaireUrl:
      typeof o.healthQuestionnaireUrl === "string" ? o.healthQuestionnaireUrl : null,

    healthQuestionnaireTan: (() => {
      const raw =
        o.healthQuestionnaireTan ??
        o.healthQuestionnaireTAN ??
        o.healthQuestionnairePin ??
        o.healthQuestionnairePIN ??
        null;
      return raw != null ? String(raw).trim() : null;
    })(),

    healthQuestionnairePin: (() => {
      const raw =
        o.healthQuestionnairePin ??
        o.healthQuestionnairePIN ??
        null;
      return raw != null ? String(raw).trim() : null;
    })(),
  };
});

items.push({
  id: docSnap.id,
  type: d.type ?? null,
  createdAt,
  status: (d.status as OfferStatus) ?? "nouvelle",
  clientFlowStatus: (d.clientFlowStatus as ClientFlowStatus) ?? null,
  premiumAmount:
              typeof d.premiumAmount === "number"
                ? d.premiumAmount
                : (d.premiumAmount as number) ?? null,
            premiumFrequency: d.premiumFrequency ?? null,
            totalRiskPremium:
              typeof d.totalRiskPremium === "number"
                ? d.totalRiskPremium
                : (d.totalRiskPremium as number) ?? null,
            netSavingsPremium:
              typeof d.netSavingsPremium === "number"
                ? d.netSavingsPremium
                : (d.netSavingsPremium as number) ?? null,
            adminOffersStatus: d.adminOffersStatus,
              offerName:
              d.configSnapshot?.offerName ??
              d.offerName ??
              null,
            offers,
          });
        });

        setRequests(items);
      } catch (e) {
        console.error("[MesOffres] Erreur chargement des offres:", e);
        toast.error("Impossible de charger vos offres pour le moment.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const isLoading = loading || !userReady;
  const signedReq =
  requests.find((r) => r.clientFlowStatus && r.clientFlowStatus.startsWith("SIGNED")) ?? null;

  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Espace client
                </span>
                <h1 className="text-sm font-semibold leading-tight">
                  Mes offres 3e pilier
                </h1>
              </div>
            </div>

            {/* CTA nouvelle demande */}
            <div className="hidden md:flex items-center gap-2 pr-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 text-[11px]"
                onClick={() => router.push("/configurateur/3epilier")}
              >
                <PiggyBank className="h-3.5 w-3.5" />
                Nouvelle demande 3e pilier
              </Button>
            </div>
          </header>

          {/* Content */}
          <main className="p-4 md:p-6 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
                <div className="space-y-3">
                  <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
                  <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
                </div>
              </div>
            ) : requests.length === 0 ? (
              <Card className="border-dashed border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Aucune offre pour le moment
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>
                    Dès qu&apos;un conseiller aura préparé une offre pour vous,
                    elle apparaîtra ici.
                  </p>
                  <p className="text-xs">
                    Vous pouvez déjà créer une nouvelle configuration 3e pilier
                    et demander des offres personnalisées.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => router.push("/configurateur/3epilier")}
                      className="inline-flex items-center gap-1 text-[11px]"
                    >
                      <PiggyBank className="h-3 w-3" />
                      Nouvelle demande 3e pilier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/dashboard")}
                      className="inline-flex items-center gap-1 text-[11px]"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Retour au tableau de bord
                    </Button>
                  </div>
                </CardContent>
              </Card>
                        ) : signedReq ? (
  <SignedTimelineView request={signedReq} />
) : (
  <>

                {/* Bloc tri + classement des offres envoyées au client */}
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-medium">
                    Classement de vos offres
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Classement basé sur le capital projeté, les valeurs de rachat
                    et le coût des couvertures de risque.
                  </p>

                  {/* Barre de filtres / tri */}
                  <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-background">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-medium">
                            Trier les offres
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Choisissez le critère qui compte le plus pour vous
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Chip Score global */}
                      <button
                        type="button"
                        onClick={() => setSortCriterion("score")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition",
                          sortCriterion === "score"
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>Score global</span>
                      </button>

                      {/* Chip Capital projeté */}
                      <button
                        type="button"
                        onClick={() => setSortCriterion("capital")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition",
                          sortCriterion === "capital"
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>Capital projeté</span>
                      </button>

                      {/* Chip Valeur de rachat */}
                      <button
                        type="button"
                        onClick={() => setSortCriterion("rachat")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition",
                          sortCriterion === "rachat"
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>Valeur de rachat</span>
                      </button>

                      {/* Chip Coût du risque */}
                      <button
                        type="button"
                        onClick={() => setSortCriterion("risque")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition",
                          sortCriterion === "risque"
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>Coût des primes de risque</span>
                      </button>
                        {/* Chip Flexibilité du contrat */}
                      <button
                        type="button"
                        onClick={() => setSortCriterion("flex")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition",
                          sortCriterion === "flex"
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>Flexibilité du contrat</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Liste des configurations avec offres envoyées */}
                <div className="space-y-4">
                  {requests.map((req) => {
                    // On ne classe que les demandes avec offres envoyées au client
                    if (req.adminOffersStatus !== "sent" || req.offers.length === 0) {
                      return null;
                    }

// Détection des couvertures présentes dans les offres
const hasDeath = req.offers.some(o =>
  o.coverages.some(c =>
    c.label?.toLowerCase().includes("décès")
  )
);

const hasDisability = req.offers.some(o =>
  o.coverages.some(c =>
    c.label?.toLowerCase().includes("incapacité") ||
    c.label?.toLowerCase().includes("invalidité") ||
    c.label?.toLowerCase().includes("libération")
  )
);

const scenario: SurrenderScenario =
  valuesScenarioByReq[req.id] ?? "mid";

// 👇 mode EPL pour cette demande
const useEpl = useEplByReq[req.id] ?? false;

const scoresById = computeGlobalScores(req.offers);
const sortedOffers = sortOffers(req.offers, sortCriterion, scoresById);

console.log("[VR DEBUG RAW OFFERS]", {
  reqId: req.id,
  sortedOffers: sortedOffers.map((o) => ({
    insurer: o.insurer,
    surrenderValuesFirst: o.surrenderValues.slice(0, 5),
    surrenderValuesEplFirst: o.surrenderValuesEpl?.slice(0, 5) ?? [],
  })),
});

// 👇 y a-t-il au moins une offre avec tableau EPL ?
const hasAnyEpl = sortedOffers.some(
  (o) => Array.isArray(o.surrenderValuesEpl) && o.surrenderValuesEpl.length > 0
);

console.log("[VR DEBUG RAW OFFERS]", {
  reqId: req.id,
  sortedOffers: sortedOffers.map((o) => ({
    insurer: o.insurer,
    surrenderValuesFirst: o.surrenderValues.slice(0, 5),
  })),
});

// --- Séries VR : une clé simple par offre (serie_1, serie_2, ...) ---
const series = sortedOffers.map((offer, idx) => ({
  key: `serie_${idx + 1}`,
  label: offer.insurer || `Offre ${idx + 1}`,
  color: getInsurerColor(offer.insurer),
}));

// On garde les labels pour les autres graphes (coût du risque, capital)
const offerLabels = series.map((s) => s.label);

// --- Valeurs de rachat + primes totales payées ---
const valuesDateMap = new Map<string, any>();

// 1) Valeurs de rachat par offre → on range sous serie_1 / serie_2 / ...
sortedOffers.forEach((offer, offerIdx) => {
  const serie = series[offerIdx];
  const dataKey = serie.key; // ex : "serie_1"

  const baseRows = offer.surrenderValues ?? [];
  const eplRows = offer.surrenderValuesEpl ?? null;

  // 👇 si mode EPL et que l’offre a un tableau EPL → on l’utilise,
  // sinon on reste sur les valeurs de rachat "classiques"
  const rowsToUse =
    useEpl && eplRows && eplRows.length > 0 ? eplRows : baseRows;

    rowsToUse.forEach((row) => {
    if (!row.dateLabel) return;

    // 👇 on normalise la date pour l'affichage (31.1.2027 → 01.01.2027)
    const normLabel = normalizeVrDateLabel(row.dateLabel);

    const entry =
      valuesDateMap.get(normLabel) || {
        date: normLabel,
      };

    const val = getScenarioValue(row, scenario);
    entry[dataKey] = val ?? null;
    valuesDateMap.set(normLabel, entry);
  });
});



// 5) Tableau final trié par date
let valeursRachatData = Array.from(valuesDateMap.values()).sort((a, b) => {
  const da = parseDateLabel(a.date) ?? new Date(0);
  const db = parseDateLabel(b.date) ?? new Date(0);
  return da.getTime() - db.getTime();
});

// 5bis) Si on est en mode Rachat EPL, on limite l'horizon
//       à la dernière date pour laquelle on a des valeurs EPL.
if (useEpl && hasAnyEpl) {
  let lastEplDate: Date | null = null;

  // On parcourt toutes les offres de la demande
  sortedOffers.forEach((offer) => {
    const eplRows = offer.surrenderValuesEpl ?? [];
    eplRows.forEach((row) => {
      const d = parseDateLabel(row.dateLabel);
      if (!d) return;
      if (!lastEplDate || d.getTime() > lastEplDate.getTime()) {
        lastEplDate = d;
      }
    });
  });

  if (lastEplDate) {
    valeursRachatData = valeursRachatData.filter((row) => {
      const d = parseDateLabel(row.date);
      return d != null && d.getTime() <= lastEplDate!.getTime();
    });
  }
}

// 6) Harmonisation : chaque série doit exister sur chaque date
series.forEach((s) => {
  valeursRachatData.forEach((row) => {
    if (!(s.key in row)) {
      row[s.key] = null;
    }
  });
});

// DEBUG : tu peux laisser pour vérifier
console.log("[DEBUG VR] Request", req.id);
console.log(
  "[DEBUG VR] Offers (sorted)",
  sortedOffers.map((o) => ({
    id: o.id,
    insurer: o.insurer,
    hasVR: o.surrenderValues?.length ?? 0,
  }))
);
console.log(
  "[DEBUG VR] valeursRachatData (first 5)",
  valeursRachatData.slice(0, 5)
);
console.log("[DEBUG VR] series", series);

// --- Coût du risque (inchangé, mais basé sur offerLabels) ---
const allCoverageLabels = Array.from(
  new Set(
    sortedOffers.flatMap((o) =>
      o.coverages
        .map((c) => c.label)
        .filter((l) => !!l && l.trim() !== "")
    )
  )
) as string[];

const riskCostData = sortedOffers.map((offer, idx) => {
  const base: any = {
    offer: offerLabels[idx],
  };
  allCoverageLabels.forEach((lab) => {
    const sum = offer.coverages
      .filter((c) => c.label === lab)
      .reduce(
        (s, c) => s + (c.premium != null ? c.premium : 0),
        0
      );
    base[lab] = sum;
  });
  return base;
});

// --- Capital projeté (inchangé) ---
const capitalData = sortedOffers.map((offer, idx) => ({
  offer: offerLabels[idx],
  capital: offer.projectedModerateAmount ?? 0,
}));

                    return (
                      <Card
                        key={req.id}
                        className="border border-primary/10 bg-background"
                      >
                        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
                              <Layers className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                                Demande d'offre du {req.createdAt ? req.createdAt.toLocaleDateString("fr-CH") : "date inconnue"}

                                {req.adminOffersStatus && (
                                  <Badge variant="outline" className="text-[9px]">
                                    {adminStatusLabel(req.adminOffersStatus)}
                                  </Badge>
                                )}
                              </CardTitle>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
  <span>{formatType(req.type)}</span>

  {req.premiumAmount != null && (
    <>
      <span>•</span>
      <span>
        Prime cible&nbsp;
        {formatMoney(
          req.premiumAmount,
          req.premiumFrequency === "monthly"
            ? "CHF/mois"
            : "CHF/an"
        )}
      </span>
    </>
  )}

  {/* Couvertures détectées */}
  {(hasDeath || hasDisability) && (
    <>
      <span>•</span>
      <span className="flex items-center gap-1">
        Couvertures :
        {hasDeath && (
          <Skull className="h-3 w-3 text-muted-foreground" />
        )}
        {hasDisability && (
          <Accessibility className="h-3 w-3 text-muted-foreground" />
        )}
      </span>
    </>
  )}
</div>
                            </div>
                          </div>

                          {/* Boutons de comparaison graphique */}
                          <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
                            {/* Valeurs de rachat */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-[11px]"
                                >
                                  Valeurs de rachat
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl w-full">
                                <DialogHeader>
                                  <DialogTitle>
                                    Comparaison des valeurs de rachat
                                  </DialogTitle>
                                  <DialogDescription className="text-xs text-muted-foreground">
                                    Compare l&apos;évolution des valeurs de
                                    rachat projetées pour chaque offre.
                                  </DialogDescription>
                                </DialogHeader>

                                <div className="flex flex-wrap items-center gap-2 mb-3">
{(["pess", "mid", "opt", "guaranteed"] as SurrenderScenario[]).map((s) => {
  const isActive = scenario === s;
  const isRecommended = s === "mid";

  return (
    <Button
      key={s}
      type="button"
      size="sm"
      variant={isActive ? "default" : "outline"}
      className={cn(
  "text-[11px] relative flex items-center justify-center transition-all",

  // ⭐ STYLE MODÉRÉ ACTIF
  isRecommended && isActive &&
    "bg-primary/10 border-primary text-primary shadow-md shadow-primary/40",

  // ⭐ NEUTRALISATION DU HOVER QUAND ACTIF
  isActive && "hover:bg-primary/10 hover:text-primary hover:border-primary",

  // ⭐ MODÉRÉ non actif (outline spécial)
  isRecommended && !isActive &&
    "border-primary/50"
)}
      onClick={() =>
        setValuesScenarioByReq((prev) => ({
          ...prev,
          [req.id]: s,
        }))
      }
    >
      {/* Petite icône Sparkles pour Modéré */}
      {isRecommended && (
  <Sparkles
    className={cn(
      "absolute -top-1 -left-1 h-[12px] w-[12px]",
      isActive ? "text-primary opacity-100" : "text-primary opacity-80"
    )}
    style={{
      fill: "currentColor",
      strokeWidth: 0,
    }}
  />
)}

      {getScenarioLabel(s)}
    </Button>
  );
})}

  {hasAnyEpl && (
    <Button
      type="button"
      size="sm"
      variant={useEpl ? "default" : "outline"}
      className="text-[11px] md:ml-auto"
      onClick={() =>
        setUseEplByReq((prev) => ({
          ...prev,
          [req.id]: !useEpl,
        }))
      }
    >
      Rachat EPL*
    </Button>
  )}
</div>

                                {valeursRachatData.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Aucune donnée de valeurs de rachat n&apos;a
                                    été trouvée pour ces offres.
                                  </p>
) : (
  <>
    <div className="h-80 md:h-96">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={valeursRachatData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis tickFormatter={(v) => v.toLocaleString("fr-CH")} />
      <RechartsTooltip
        formatter={(value: any, name) => [
          value != null
            ? `${value.toLocaleString("fr-CH")} CHF`
            : "-",
          name,
        ]}
      />

      {series.map((s) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={`${s.label} – valeur de rachat`}
          stroke={s.color}
          fill={s.color}
          fillOpacity={0.16}
          strokeWidth={1.6}
          // lisse les trous éventuels dans les séries
          connectNulls
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  </ResponsiveContainer>
</div>

    {/* 👇 nouvelle légende avec petits carrés de couleur */}
    <CustomLegend series={series} />

    {hasAnyEpl && (
      <p className="mt-2 text-[10px] text-muted-foreground">
        * Rachat EPL : Montant que vous pourriez retirer pour des cas EPL
        (fonds propres pour un achat immobilier, rénovations,
        remboursement de votre dette hypothécaire, etc.). Il doit
        s&apos;agir de votre résidence principale. Pour profiter de
        ces retraits « privilégiés », le contrat doit rester en
        vigueur avec la même prime après avoir effectué votre retrait.
      </p>
    )}
  </>
)}
                           
                              </DialogContent>
                            </Dialog>

                            {/* Coût du risque */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-[11px]"
                                >
                                  Coût des primes de risque
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl w-full">
                                <DialogHeader>
                                  <DialogTitle>
                                    Comparaison du coût des risques
                                  </DialogTitle>
                                  <DialogDescription className="text-xs text-muted-foreground">
                                    Répartition des primes de risque par type de
                                    couverture (décès, rente IG, libération…)
                                    pour chaque offre.
                                  </DialogDescription>
                                </DialogHeader>

                                {allCoverageLabels.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Aucune couverture de risque n&apos;a été
                                    trouvée sur ces offres.
                                  </p>
                                ) : (
                                  <div className="h-64">
                                    <ResponsiveContainer
                                      width="100%"
                                      height="100%"
                                    >
                                      <BarChart data={riskCostData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="offer" />
                                        <YAxis
                                          tickFormatter={(v) =>
                                            v.toLocaleString("fr-CH")
                                          }
                                        />
                                        <RechartsTooltip
                                          formatter={(value: any, name) => [
                                            value != null
                                              ? `${value.toLocaleString(
                                                  "fr-CH"
                                                )} CHF/an`
                                              : "-",
                                            name,
                                          ]}
                                        />
                                        <Legend />
                                        {allCoverageLabels.map((lab, idx) => (
                                          <Bar
                                            key={lab}
                                            dataKey={lab}
                                            name={lab}
                                            stackId="risk"
                                            fill={COLORS[idx % COLORS.length]}
                                          />
                                        ))}
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>

                            {/* Capital projeté modéré */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-[11px]"
                                >
                                  Capital projeté modéré
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl w-full">
                                <DialogHeader>
                                  <DialogTitle>
                                    Capital projeté (scénario modéré)
                                  </DialogTitle>
                                  <DialogDescription className="text-xs text-muted-foreground">
                                    Comparaison du capital projeté en scénario
                                    modéré pour chaque offre.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="h-64">
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <BarChart data={capitalData}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="offer" />
                                      <YAxis
                                        tickFormatter={(v) =>
                                          v.toLocaleString("fr-CH")
                                        }
                                      />
                                      <RechartsTooltip
                                        formatter={(value: any) => [
                                          value != null
                                            ? `${value.toLocaleString(
                                                "fr-CH"
                                              )} CHF`
                                            : "-",
                                          "Capital projeté",
                                        ]}
                                      />
                                      <Legend />
                                      <Bar
                                        dataKey="capital"
                                        name="Capital projeté"
                                        fill={COLORS[0]}
                                      />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-0 pb-3">
  <Accordion
    type="single"
    collapsible
    className="space-y-2"
  >
    {sortedOffers.map((offer, index) => {
      const metrics = computeOfferMetrics(offer);
      const rank = index + 1;
      const label = offer.insurer || `Offre ${index + 1}`;
      const score = scoresById[offer.id] ?? 0;

      const earlyRachatText =
        metrics.earlySurrenderAmount != null &&
        metrics.earlySurrenderLabel
          ? `${metrics.earlySurrenderAmount.toLocaleString(
              "fr-CH"
            )} CHF au ${metrics.earlySurrenderLabel}`
          : "Non disponible";

      const riskPremiumText =
        metrics.riskPremiumTotal != null &&
        metrics.riskPremiumTotal > 0
          ? `${metrics.riskPremiumTotal.toLocaleString(
              "fr-CH"
            )} CHF/an`
          : "Non calculée";

      return (
        <motion.div
  key={offer.id}
  layout
  transition={{
    type: "spring",
    stiffness: 400,   // plus haut = plus vif
    damping: 28,      // plus bas = plus rebond, plus haut = plus sec
    mass: 1,        // plus petit = plus réactif
  }}
>
          <AccordionItem
  value={offer.id}
  className={cn(
    "group rounded-lg border bg-muted/20 transition-all duration-150 data-[state=open]:shadow-lg data-[state=open]:shadow-black/10",

    // ⭐ Styles supplémentaires si c'est la carte #1
    index === 0 &&
      "shadow-lg shadow-black/10 border-primary/40 bg-muted/10"
  )}
>
            <AccordionTrigger className="flex w-full items-stretch gap-3 px-3 py-2 text-left cursor-pointer rounded-lg group-hover:bg-muted/60 group-hover:shadow-sm">
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center justify-center">
                  {(() => {
                    const logo = getInsurerLogo(offer.insurer);
                    if (logo) {
                      return (
                        <Image
                          src={logo}
                          alt={offer.insurer || "Compagnie"}
                          width={28}
                          height={28}
                          className="h-7 w-7 object-contain"
                        />
                      );
                    }
                    return (
                      <ShieldHalf className="h-5 w-5 text-muted-foreground" />
                    );
                  })()}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  {/* Badge rang – petit pill neutre */}
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium px-2 py-[1px] rounded-full border",
                      rank === 1
                        ? "bg-amber-100 border-amber-400 text-amber-800" // #1 → gold
                        : "bg-muted border-muted-foreground/20 text-muted-foreground" // #2, #3, etc → neutre
                    )}
                  >
                    #{rank}
                  </span>
                  <span className="text-xs font-semibold">
                    {label}
                  </span>

                  <span className="ml-auto text-[10px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-[1px]">
                    Score&nbsp;
                    <span className="font-semibold">
                      {score}/100
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1 text-[10px] text-muted-foreground">
                  <span>
                    Capital projeté&nbsp;
                    <span className="font-medium">
                      {formatMoney(
                        offer.projectedModerateAmount,
                        "CHF"
                      )}
                    </span>
                  </span>
                  <span>
                    Valeur de rachat au plus tôt &nbsp;
                    <span className="font-medium">
                      {earlyRachatText}
                    </span>
                  </span>
                  <span>
                    Primes de risque estimées&nbsp;
                    <span className="font-medium">
                      {riskPremiumText}
                    </span>
                  </span>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent>
              <div className="px-3 pb-3 pt-1 space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-md bg-background p-2">
                    <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <PiggyBank className="h-3 w-3" />
                      Prime annuelle
                    </p>
                    <p className="text-sm font-semibold">
                      {formatMoney(offer.premiumAnnual, "CHF/an")}
                    </p>
                    {offer.premiumMonthly != null && (
                      <p className="text-[11px] text-muted-foreground">
                        ≈ {formatMoney(offer.premiumMonthly, "CHF/mois")}
                      </p>
                    )}
                  </div>

                  <div className="rounded-md bg-background p-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Capital projeté (scénario modéré)
                    </p>
                    <p className="text-sm font-semibold">
                      {formatMoney(offer.projectedModerateAmount, "CHF")}
                    </p>
                    {offer.projectedModerateRatePct != null && (
                      <p className="text-[11px] text-muted-foreground">
                        Hypothèse de rendement {offer.projectedModerateRatePct}% / an
                      </p>
                    )}
                  </div>

                  <div className="rounded-md bg-background p-2">
                    <p className="text-[12px] font-semibold text-muted-foreground mb-1">
                      Options d’assurance
                    </p>

                    {offer.coverages.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        Aucune couverture de risque (offre 100% épargne).
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {offer.coverages.map((cov, idxCov) => (
                          <li
                            key={idxCov}
                            className={cn(
                              "space-y-2 rounded-md px-2 py-2",
                              idxCov % 2 === 0 ? "bg-muted/40" : "bg-muted/70"
                            )}
                          >
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {cov.label || `Option ${idxCov + 1}`}
                            </p>

                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                {cov.label === "Libération du paiement des primes" ? (
                                  <Hourglass className="h-3 w-3" />
                                ) : (
                                  <HandCoins className="h-3 w-3" />
                                )}
                                {cov.label === "Libération du paiement des primes"
                                  ? "Délai d’attente"
                                  : "Montant assuré"}
                              </p>

                              <p className="text-sm font-semibold">
                                {cov.label === "Libération du paiement des primes" ? (
                                  cov.waitingPeriodMonths != null ? (
                                    `Délai ${cov.waitingPeriodMonths} mois`
                                  ) : (
                                    "Délai non renseigné"
                                  )
                                ) : cov.sumInsured != null ? (
                                  `${cov.sumInsured.toLocaleString("fr-CH")} CHF`
                                ) : (
                                  "Montant non renseigné"
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <PiggyBank className="h-3 w-3" />
                                Prime annuelle
                              </p>
                              <p className="text-sm font-semibold">
                                {cov.premium != null
                                  ? `${cov.premium.toLocaleString("fr-CH")} CHF/an`
                                  : "Prime non renseignée"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                

                {/* Info questionnaire santé */}
                  {offer.healthQuestionnaireRequired && (
                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-2 flex items-start gap-2">
                      <FileHeart className="h-4 w-4 mt-[2px] text-amber-700" />
                      <p className="text-[11px] text-amber-900">
                        Un questionnaire de santé est nécessaire pour valider cette offre.
                      </p>
                    </div>
                  )}

                {/* Pièces jointes */}
<div className="border-t pt-3">
  <p className="text-[11px] font-medium text-muted-foreground mb-2">
    Pièces jointes (offres détaillées)
  </p>

  {(() => {
    // 👇 On ne montre PAS les documents de signature au client
    const publicAttachments =
      (offer.attachments ?? []).filter(
        (att) => att.category !== "signature"
      );

    if (publicAttachments.length === 0) {
      return (
        <p className="text-[12px] text-muted-foreground">
          Aucune pièce jointe n&apos;a encore été ajoutée pour cette offre.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {publicAttachments.map((att) => (
          <div
            key={att.id}
            className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2 py-2"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-background">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px]">
                  {att.name || "Fichier joint"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {att.mimeType?.startsWith("image/")
                    ? "Image"
                    : "Document"}
                </span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-[11px] flex items-center gap-1"
              onClick={() => openAttachment(att)}
            >
              <Download className="h-3 w-3" />
              Télécharger
            </Button>
          </div>
        ))}
      </div>
    );
  })()}
</div>

                {/* CTA Choisir cette offre */}
                  <div className="pt-3">
                    <Button
                      type="button"
                      className="w-full justify-center text-[13px] font-semibold gap-2"
                      onClick={() => {
                        // Flow par compagnie
                        const raw = (offer.insurer || "").trim();
                        const insurer = raw.toLowerCase().replace(/\s+/g, ""); // "Swiss Life" => "swisslife"

                        // req.id = requestId Firestore, offer.id = offerId interne (stable)
                        if (insurer === "axa") {
                          router.push(`/dashboard/offres/axa/${req.id}/${offer.id}`);
                          return;
                        }

                        if (insurer === "swisslife") {
                          router.push(`/dashboard/offres/swisslife/${req.id}/${offer.id}`);
                          return;
                        }

                        toast.message("Flow bientôt disponible", {
                          description: raw
                            ? `Le flow de signature pour ${raw} n'est pas encore implémenté.`
                            : "Compagnie inconnue pour cette offre.",
                        });
                      }}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Choisir cette offre
                    </Button>
                  </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </motion.div>
      );
    })}
  </Accordion>
</CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
function SignedTimelineView({
  request,
}: {
  request: ClientOfferRequest;
}) {
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<any | null>(null);

  // 1) On récupère la dernière session de signature pour cette demande
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoadingSession(true);

        const uid = auth.currentUser?.uid;
        if (!uid) {
          setSession(null);
          return;
        }

        const qy = query(
          collection(db, "offers_signing_sessions"),
          where("clientUid", "==", uid),
          where("requestId", "==", request.id),
          orderBy("updatedAt", "desc"),
          limit(1)
        );

        const snap = await getDocs(qy);
        const doc0 = snap.docs[0];
        const data = doc0 ? { id: doc0.id, ...doc0.data() } : null;

        if (!cancelled) setSession(data);
      } catch (e) {
        console.error("[SignedTimelineView] load session error", e);
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const flow = request.clientFlowStatus ?? null;

  // 2) Offer "signée" : on essaie de matcher offerId depuis la session
  const offerIdFromSession = session?.offerId ? String(session.offerId) : null;
  const signedOffer =
    (offerIdFromSession
      ? request.offers.find((o) => String(o.id) === offerIdFromSession)
      : null) ?? request.offers?.[0] ?? null;

  const insurer = signedOffer?.insurer || "Assureur";
  const logo = getInsurerLogo(insurer);
  const premiumMonthly = signedOffer?.premiumMonthly ?? null;

  // ✅ Health state depuis offers_signing_sessions (source de vérité)
    const healthUrl: string | null =
    session?.steps?.healthQuestionnaire?.url ??
    signedOffer?.healthQuestionnaireUrl ??
    null;

  // SwissLife utilise "tan", AXA peut ne rien avoir
  const healthTanOrPin: string | null =
    session?.steps?.healthQuestionnaire?.tan ??
    session?.steps?.healthQuestionnaire?.pin ??
    signedOffer?.healthQuestionnaireTan ??
    signedOffer?.healthQuestionnairePin ??
    null;

  const healthClickedAt = session?.steps?.healthQuestionnaire?.clickedAt ?? null;
  const healthStarted = !!healthClickedAt;
  const creditxMandateUrl: string | null =
  session?.steps?.creditxMandatePdf?.url ?? null;


  // 3) Timeline : calée sur clientFlowStatus (simple et clair)
  const steps =
  flow === "SIGNED_WAITING_HEALTH"
    ? (["Contrat signé", "Questionnaire santé", "Facture", "Couverture active"] as const)
    : (["Contrat signé", "Facture", "Couverture active"] as const);

  const currentIndex =
  flow === "SIGNED_WAITING_HEALTH"
    ? 1 // Questionnaire santé
    : flow === "SIGNED_FINALIZING"
    ? 1 // Facture
    : 1; // fallback sûr

  const Dot = ({
    done,
    current,
  }: {
    done?: boolean;
    current?: boolean;
  }) => (
    <div
      className={cn(
        "h-9 w-9 rounded-full border flex items-center justify-center",
        done
          ? "bg-[#4fd1c5] border-[#4fd1c5]"
          : current
          ? "bg-[#F59E0B] border-[#F59E0B]"
          : "bg-white border-slate-300"
      )}
    >
      {done ? (
        <CheckCircle className="h-5 w-5 text-white" />
      ) : (
        <div className={cn("h-2.5 w-2.5 rounded-full", current ? "bg-white" : "bg-slate-300")} />
      )}
    </div>
  );

  const Line = ({ done }: { done?: boolean }) => (
    <div className={cn("h-[2px] flex-1 rounded-full", done ? "bg-[#4fd1c5]" : "bg-slate-200")} />
  );

  const formatCHF = (n: number | null) => {
    if (n == null) return "—";
    const s = Math.round(n).toString();
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + ".–";
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* Header card (comme ton image) */}
      <Card className="rounded-[28px] border shadow-sm bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 flex items-center justify-center">
                {logo ? (
                  <Image
                    src={logo}
                    alt={insurer}
                    width={64}
                    height={64}
                    className="h-12 w-12 object-contain"
                    priority
                  />
                ) : (
                  <ShieldHalf className="h-7 w-7 text-slate-400" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold text-slate-900 truncate">
                    {insurer}
                  </div>
                  <Badge variant="secondary" className="rounded-xl">
                    Signée
                  </Badge>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-sm text-slate-500">Prime</div>
              <div className="text-lg font-semibold text-slate-900">
                CHF {formatCHF(premiumMonthly)}/mois
              </div>
            </div>
          </div>

          {/* Stepper (grid-aligned pills + labels) */}
<div className="mt-4">
  <div className="w-full px-2">
    {/* ligne arrière */}
    <div className="relative">
      <div className="absolute left-0 right-0 top-[14px] h-[2px] bg-slate-200" />

      {/* pills sur une grille */}
      <div
        className="relative grid items-center"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((label, idx) => {
          const done = idx < currentIndex;
          const current = idx === currentIndex;

          return (
            <div key={label} className="flex justify-center">
              <div
                className={cn(
                  "h-7 w-7 rounded-full border flex items-center justify-center",
                  done
                    ? "bg-[#4fd1c5] border-[#4fd1c5]"
                    : current
                    ? "bg-[#F59E0B] border-[#F59E0B]"
                    : "bg-white border-slate-300"
                )}
              >
                {done ? (
                  <CheckCircle className="h-4 w-4 text-white" />
                ) : (
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      current ? "bg-white" : "bg-slate-300"
                    )}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* titres, même grille => alignement parfait */}
    <div
      className="mt-2 grid"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((label, idx) => {
        const done = idx < currentIndex;
        const current = idx === currentIndex;

        return (
          <div
            key={label}
            className={cn(
              "text-center text-xs leading-tight",
              done
                ? "text-slate-600"
                : current
                ? "text-slate-900 font-medium"
                : "text-slate-400"
            )}
          >
            {label}
          </div>
        );
      })}
    </div>
  </div>
</div>
        </CardHeader>

        <CardContent className="space-y-5">
{/* Bloc action principal */}
{flow === "SIGNED_FINALIZING" ? (
  /* =======================
     FACTURE (FINALIZING)
  ======================= */
  <Card className="rounded-3xl border shadow-sm">
    <CardHeader>
      <CardTitle className="text-base">Facture de prime</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="text-sm text-slate-600">Émise par : Assureur</div>

      <div className="text-sm text-slate-700">
        <span className="font-semibold">Facture :</span> une fois la facture reçue de l’assureur,
        merci de procéder au paiement.
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="rounded-2xl text-slate-900"
          style={{ backgroundColor: "#4fd1c5" }}
        >
          J’ai payé ma facture
        </Button>
        <Button variant="outline" className="rounded-2xl">
          Je n’ai pas encore reçu la facture
        </Button>
      </div>

      <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
        <span className="font-semibold">Aucune action pour le moment :</span>  
        MoneyLife ne perçoit aucun paiement.  
        La couverture démarre après réception du paiement par l’assureur.
      </div>
    </CardContent>
  </Card>

) : flow === "SIGNED_WAITING_HEALTH" ? (
  /* =======================
     SANTÉ — EN ANALYSE
  ======================= */
  <Card className="rounded-3xl border shadow-sm">
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <FileHeart className="h-5 w-5 text-slate-700" />
        Questionnaire de santé
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-3">
      <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
        Votre questionnaire de santé a été transmis à la souscription de{" "}
        <span className="font-semibold">{insurer}</span> pour analyse.
        <div className="mt-1 text-slate-600">
          Vous recevrez un e-mail dès que la décision sera connue
          (acceptation, surprime, réserve ou refus).
        </div>
      </div>

      {healthUrl && (
        <div className="rounded-2xl border bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-slate-700">Lien questionnaire</div>
            <a
              href={healthUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#0030A8] font-medium hover:underline"
            >
              Ouvrir
            </a>
          </div>

          {healthTanOrPin && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-slate-700">TAN / PIN</div>

            <div className="flex items-center gap-2">
              <div className="font-mono text-slate-900">
                {healthTanOrPin}
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(healthTanOrPin);
                  toast.success("TAN / PIN copié");
                }}
                className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-slate-200 transition"
                title="Copier le TAN / PIN"
              >
                <Copy className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}
        </div>
      )}
    </CardContent>
  </Card>

) : flow === "SIGNED" ? (
  /* =======================
     SANTÉ — ACTION REQUISE
  ======================= */
  <Card className="rounded-3xl border shadow-sm">
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <FileHeart className="h-5 w-5 text-slate-700" />
        Questionnaire de santé
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-3">
      <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
        <span className="font-semibold">Action requise :</span>  
        pour valider cette offre, vous devez répondre au questionnaire de santé.
      </div>

      {healthUrl && (
        <div className="rounded-2xl border bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-slate-700">Lien questionnaire</div>
            <a
              href={healthUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#0030A8] font-medium hover:underline"
            >
              Ouvrir
            </a>
          </div>

          {healthTanOrPin && (
            <div className="mt-2 flex items-center justify-between">
              <div className="text-slate-700">TAN / PIN</div>
              <div className="font-mono text-slate-900">{healthTanOrPin}</div>
            </div>
          )}
        </div>
      )}

      {healthUrl && (
        <Button
          className="rounded-2xl bg-[#0030A8] hover:bg-[#002786]"
          onClick={() => window.open(healthUrl, "_blank")}
        >
          Répondre au questionnaire
        </Button>
      )}
    </CardContent>
  </Card>
) : null}

          {/* Documents */}
<div>
  <div className="text-base font-semibold text-slate-900 mb-2">
    Documents de l'offre
  </div>

  {loadingSession ? (
    <div className="text-sm text-slate-500">Chargement…</div>
  ) : (
    <div className="space-y-5">

      {/* 1) Mandat de gestion CreditX */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">
          Mandat de gestion CreditX
        </div>

        {creditxMandateUrl ? (
          <a
            href={creditxMandateUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-600" />
              <div className="text-sm font-medium text-slate-900">
                Mandat de gestion signé (PDF)
              </div>
            </div>
            <Download className="h-4 w-4 text-slate-400" />
          </a>
        ) : (
          <div className="text-sm text-slate-500">
            Mandat de gestion non disponible.
          </div>
        )}
      </div>

      {/* 2) Documents de l’offre (collaborateur) */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">
          Documents de l’offre
        </div>

        {signedOffer?.attachments?.filter(
          (a) =>
  a.category !== "signature" &&
  a.category !== "conditions_generales" &&
  String(a.category ?? "").toLowerCase() !== "mandat"
        )?.length ? (
          <div className="space-y-2">
            {signedOffer.attachments
              .filter((a) =>
  a.category !== "signature" &&
  a.category !== "conditions_generales" &&
  String(a.category ?? "").toLowerCase() !== "mandat")
              .map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => openAttachment(att)}
                  className="w-full flex items-center justify-between rounded-xl border bg-white px-4 py-3 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-slate-600" />
                    <div className="text-sm font-medium text-slate-900">
                      {att.name || "Document"}
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-slate-400" />
                </button>
              ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            Aucun document d’offre disponible.
          </div>
        )}
      </div>

      {/* 3) Conditions d’assurance */}
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">
          Conditions d’assurance
        </div>

        {signedOffer?.attachments?.filter(
          (a) => a.category === "conditions_generales"
        )?.length ? (
          <div className="space-y-2">
            {signedOffer.attachments
              .filter((a) => a.category === "conditions_generales")
              .map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => openAttachment(att)}
                  className="w-full flex items-center justify-between rounded-xl border bg-white px-4 py-3 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <ShieldHalf className="h-5 w-5 text-slate-600" />
                    <div className="text-sm font-medium text-slate-900">
                      {att.name || "Conditions générales"}
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-slate-400" />
                </button>
              ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            Conditions d’assurance non disponibles.
          </div>
        )}
      </div>
    </div>
  )}
</div>
        </CardContent>
      </Card>
    </div>
  );
}
}