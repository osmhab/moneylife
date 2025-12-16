//app/admin/dashboard/[requestId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase"; // ⬅ on suppose que storage est exporté ici
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import RequireAdmin from "../../../components/RequireAdmin";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

import {
  ArrowLeft,
  User2,
  Mail,
  Phone,
  MapPin,
  ShieldHalf,
  ShieldCheck,
  Clock,
  PiggyBank,
  TrendingUp,
  Copy as CopyIcon,
  Check,
  Hammer,
  UploadCloud,
  ChevronDown,
  Loader2,
  HeartPulse,
  Cigarette,
  Globe2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  ManualOfferPayload as ManualOfferPayloadRaw,
  InsurerCode,
  ContractForm,
  OfferCoverageRow,
  SurrenderValueRow,
} from "lib/offers/parsers/types";

type AttachmentCategory = "offre" | "conditions_generales" | "signature" | "autres";

type OfferRequestStatus =
  | "nouvelle"
  | "en_cours"
  | "en_attente_client"
  | "terminee";

interface OfferRequestDetail {
  id: string;
  clientUid: string;
  clientName: string | null;
  type: string | null;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  totalRiskPremium: number | null;
  netSavingsPremium: number | null;
  profession: string | null;
  createdAt: Date | null;
  source: string | null;
  status: OfferRequestStatus;
    contact: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    street?: string;
    zip?: string;
    city?: string;
    sex?: string;
    birthdate?: string;
    nationality?: string;
    residencePermit?: string | null;
    etatCivilLabel?: string | null;
  } | null;
  riskInvalidityRente: number | null;
  riskInvalidityCapital: number | null;
  riskDeathCapital: number | null;
  riskPremiumWaiver: boolean | null;
  configSnapshot: any | null;
}

interface ManualOfferAttachment {
  id: string;          // ID interne de la pièce jointe
  name: string;        // Nom affiché (modifiable)
  storagePath: string; // Chemin Firebase Storage
  mimeType?: string | null;
  createdAt?: string;  // ISO string
  category: AttachmentCategory
}

type ManualOfferPayloadExtended = ManualOfferPayloadRaw & {
  attachments?: ManualOfferAttachment[];
};




interface ManualOffer {
  id: string;
  insurer: InsurerCode | ""; // "" = pas encore choisi côté UI
  contractForm: ContractForm;
  offerNumber?: string | null; 
  startDateLabel: string; // ex. 01.12.2025
  endDateLabel: string;   // jj.mm.aaaa libre
  premiumAnnual: number | null;
  premiumMonthly: number | null;

  // options d'assurance
  coverages: OfferCoverageRow[];
  // capital projeté modéré
  projectedModerateAmount: number | null;
  projectedModerateRatePct: number | null;
  // taux de scénarios pour valeurs de rachat
  pessRatePct: number | null;
  midRatePct: number | null;
  optRatePct: number | null;
  // tableau de valeurs de rachat
  surrenderValues: SurrenderValueRow[];
    // tableau de valeurs de rachat EPL (Swiss Life), facultatif
  surrenderValuesEpl?: SurrenderValueRow[] | null;
  // pièces jointes (PDF, images, etc.)
  attachments: ManualOfferAttachment[];
  healthQuestionnaireRequired?: boolean | null;
  healthQuestionnaireUrl?: string | null;
  healthQuestionnaireTan?: string | null;
  signingDocsUrl?: string | null;
  signingDocsPin?: string | null; // PIN 4 chiffres (laisser vide par défaut)

}


// Questions du profil investisseur (mêmes IDs que dans le configurateur)
const INVESTOR_QUESTIONS: {
  id: string;
  label: string;
  options: { id: string; label: string }[];
}[] = [
  {
    id: "experience_actions",
    label: "Expérience avec les actions / fonds",
    options: [
      { id: "yes", label: "Oui, déjà de l’expérience actions / fonds" },
      { id: "no", label: "Non, aucune expérience significative" },
    ],
  },
  {
    id: "revenu_annuel",
    label: "Revenu annuel brut",
    options: [
      { id: "0_30", label: "Entre CHF 0 et 29 999" },
      { id: "30_75", label: "Entre CHF 30 000 et 74 999" },
      { id: "75_149", label: "Entre CHF 75 000 et 149 000" },
      { id: "150_250", label: "Entre CHF 150 000 et 250 000" },
      { id: "250_plus", label: "Plus de CHF 250 000" },
    ],
  },
  {
    id: "revenu_evolution",
    label: "Évolution attendue du revenu",
    options: [
      { id: "strong_down", label: "Sensiblement à la baisse" },
      { id: "down", label: "À la baisse" },
      { id: "same", label: "Pas d’évolution prévue" },
      { id: "up", label: "À la hausse" },
      { id: "strong_up", label: "Sensiblement à la hausse" },
    ],
  },
  {
    id: "epargne_mensuelle",
    label: "Capacité d’épargne mensuelle",
    options: [
      { id: "none", label: "Ne parvient pas à épargner" },
      { id: "lt10", label: "Peut épargner un peu chaque mois" },
      { id: "10_20", label: "Peut épargner une part confortable" },
      { id: "gt20", label: "Peut épargner une part importante" },
    ],
  },
  {
    id: "fortune_totale",
    label: "Fortune totale (patrimoine global)",
    options: [
      { id: "none", label: "Pas de fortune" },
      { id: "lt50", label: "Moins de CHF 50 000" },
      { id: "50_249", label: "CHF 50 000 – 249 999" },
      { id: "250_999", label: "CHF 250 000 – 999 999" },
      { id: "1_3m", label: "CHF 1 – 3 millions" },
      { id: "gt3m", label: "Plus de CHF 3 millions" },
    ],
  },
  {
    id: "dettes_totales",
    label: "Dettes totales",
    options: [
      { id: "none", label: "Aucune dette" },
      { id: "lt50", label: "Moins de CHF 50 000" },
      { id: "50_249", label: "CHF 50 000 – 249 999" },
      { id: "250_999", label: "CHF 250 000 – 999 999" },
      { id: "1_3m", label: "CHF 1 – 3 millions" },
      { id: "gt3m", label: "Plus de CHF 3 millions" },
    ],
  },
  {
    id: "depenses_importantes",
    label: "Dépenses importantes prévues",
    options: [
      { id: "yes", label: "Oui, dépenses importantes prévues" },
      { id: "no", label: "Non, pas de dépenses importantes prévues" },
    ],
  },
  {
    id: "securite_reserve",
    label: "Réserve de sécurité (mois de charges couvertes)",
    options: [
      { id: "lt3", label: "Moins de 3 mois" },
      { id: "3_6", label: "Entre 3 et 6 mois" },
      { id: "7_12", label: "Entre 7 et 12 mois" },
      { id: "gt12", label: "Plus de 12 mois" },
    ],
  },
  {
    id: "dependants",
    label: "Personnes à charge",
    options: [
      { id: "0", label: "Aucune personne à charge" },
      { id: "1", label: "1 personne à charge" },
      { id: "2_3", label: "2–3 personnes à charge" },
      { id: "4_5", label: "4–5 personnes à charge" },
      { id: "gt5", label: "Plus de 5 personnes à charge" },
    ],
  },

  // 🔹 NOUVELLES QUESTIONS AVANT DURABILITÉ

  {
    id: "but_investissement",
    label: "But de l’investissement (propension au risque)",
    options: [
      {
        id: "secure",
        label:
          "Le risque de perte doit être aussi faible que possible (gains non prioritaires).",
      },
      {
        id: "moderate",
        label:
          "Prêt à accepter un certain risque de perte pour profiter de gains modérés.",
      },
      {
        id: "aggressive",
        label:
          "Prêt à prendre un risque de perte élevé pour viser des gains importants.",
      },
    ],
  },
  {
    id: "choix_gain_perte",
    label:
      "Choix entre différentes combinaisons perte / gain possibles",
    options: [
      {
        id: "p1",
        label: "Perte possible -1%, gain possible +1%",
      },
      {
        id: "p2",
        label: "Perte possible -3%, gain possible +5%",
      },
      {
        id: "p3",
        label: "Perte possible -8%, gain possible +12%",
      },
      {
        id: "p4",
        label: "Perte possible -13%, gain possible +19%",
      },
      {
        id: "p5",
        label: "Perte possible -18%, gain possible +26%",
      },
    ],
  },
  {
    id: "reaction_perte10",
    label:
      "Réaction probable si un investissement perd 10% en quelques mois",
    options: [
      {
        id: "sell_all",
        label:
          "Vend tout pour éviter une perte plus importante.",
      },
      {
        id: "sell_some",
        label:
          "Vend une partie pour limiter les pertes potentielles.",
      },
      {
        id: "hold",
        label:
          "Ne fait rien, accepte la fluctuation de marché à court terme.",
      },
      {
        id: "buy_more",
        label:
          "Investit davantage, considère la baisse comme une opportunité.",
      },
    ],
  },
  {
    id: "horizon_placement",
    label: "Horizon de placement",
    options: [
      { id: "lt15", label: "14 ans maximum" },
      { id: "gte15", label: "15 ans ou plus" },
    ],
  },

  // 🔹 PRÉFÉRENCES THÉMATIQUES

  {
    id: "theme_us_tech",
    label: "Tech américaine (Apple, Nvidia, Microsoft, Google, Tesla…)",
    options: [
      { id: "like", label: "J’aime ce thème" },
      { id: "dislike", label: "Je n’aime pas ce thème" },
      { id: "neutral", label: "Pas d’avis particulier" },
    ],
  },
  {
    id: "theme_ch_equity",
    label: "100% Suisse (Nestlé, Roche, Julius Baer, Novartis, Lonza…)",
    options: [
      { id: "like", label: "J’aime ce thème" },
      { id: "dislike", label: "Je n’aime pas ce thème" },
      { id: "neutral", label: "Pas d’avis particulier" },
    ],
  },
  {
    id: "theme_net_zero",
    label:
      "Net zéro émissions / transition énergétique (Nvidia, Apple, Microsoft, Visa, Itron…)",
    options: [
      { id: "like", label: "J’aime ce thème" },
      { id: "dislike", label: "Je n’aime pas ce thème" },
      { id: "neutral", label: "Pas d’avis particulier" },
    ],
  },
  {
    id: "theme_ch_real_estate",
    label: "Immobilier Suisse",
    options: [
      { id: "like", label: "J’aime ce thème" },
      { id: "dislike", label: "Je n’aime pas ce thème" },
      { id: "neutral", label: "Pas d’avis particulier" },
    ],
  },

  // 🔹 QUESTION EXISTANTE DURABILITÉ
  {
    id: "durabilite",
    label: "Préférences de durabilité",
    options: [
      { id: "none", label: "Aucune préférence particulière" },
      { id: "esg", label: "Critères ESG importants" },
      { id: "objectifs", label: "Objectifs de durabilité à intégrer" },
    ],
  },
];

// IDs des questions "thèmes de placement" pour pouvoir les regrouper dans l'UI admin
const THEME_QUESTION_IDS = [
  "theme_us_tech",
  "theme_ch_equity",
  "theme_net_zero",
  "theme_ch_real_estate",
];


function mapOffersToPayload(offers: ManualOffer[]): ManualOfferPayloadExtended[] {
  return offers
    // On ne garde que les offres avec une compagnie renseignée
    .filter((o) => !!o.insurer)
    .map((o) => ({
      id: o.id,
      insurer: o.insurer as InsurerCode, // "" filtré juste au-dessus
      contractForm: o.contractForm,
      offerNumber: o.offerNumber ?? null,       
      startDateLabel: o.startDateLabel,
      endDateLabel: o.endDateLabel,
      premiumAnnual: o.premiumAnnual,
      premiumMonthly: o.premiumMonthly,
      coverages: o.coverages,
      projectedModerateAmount: o.projectedModerateAmount,
      projectedModerateRatePct: o.projectedModerateRatePct,
      pessRatePct: o.pessRatePct,
      midRatePct: o.midRatePct,
      optRatePct: o.optRatePct,
      surrenderValues: o.surrenderValues,
      surrenderValuesEpl: o.surrenderValuesEpl ?? null,
      attachments: o.attachments ?? [],
      healthQuestionnaireRequired:
        typeof o.healthQuestionnaireRequired === "boolean"
          ? o.healthQuestionnaireRequired
          : null,
       healthQuestionnaireUrl:
        typeof o.healthQuestionnaireUrl === "string"
          ? o.healthQuestionnaireUrl
          : null,  
      healthQuestionnaireTan:
         typeof o.healthQuestionnaireTan === "string" 
         ? o.healthQuestionnaireTan 
         : null,   
            signingDocsUrl:
        typeof o.signingDocsUrl === "string" 
        ? o.signingDocsUrl 
        : null,
      signingDocsPin:
        typeof o.signingDocsPin === "string" 
        ? o.signingDocsPin 
        : null,
    }));
}


function validateOffersForSend(offers: ManualOffer[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  offers.forEach((offer, idx) => {
    const labelBase = `Offre ${idx + 1}${offer.insurer ? ` – ${offer.insurer}` : ""}`;

    // Champs toujours obligatoires
    if (!offer.insurer) {
      errors.push(`${labelBase}: compagnie non renseignée`);
    }

    if (!offer.startDateLabel) {
      errors.push(`${labelBase}: date de début manquante`);
    }

    if (!offer.endDateLabel) {
      errors.push(`${labelBase}: date de fin manquante`);
    }

    if (offer.premiumAnnual == null) {
      errors.push(`${labelBase}: prime annuelle manquante`);
    }

    if (offer.premiumMonthly == null) {
      errors.push(`${labelBase}: prime mensuelle manquante`);
    }

    const hasCoverages = !!offer.coverages && offer.coverages.length > 0;

    // Cas 1 : aucune couverture de risque → OK, mais warning
    if (!hasCoverages) {
      warnings.push(
        `${labelBase}: aucune couverture de risque (uniquement épargne).`
      );
      return;
    }

    // Cas 2 : des couvertures de risque existent → doivent être complètes
    offer.coverages.forEach((cov, cidx) => {
      const covLabel = cov.label || `Couverture ${cidx + 1}`;

      if (!cov.label) {
        errors.push(`${labelBase}: libellé manquant pour une couverture (p.ex. décès fixe, rente IG, etc.)`);
      }

      if (cov.label === "Libération du paiement des primes") {
        // Pour la libération de primes, on attend un délai d'attente, pas un capital
        if (cov.waitingPeriodMonths == null) {
          errors.push(
            `${labelBase}: délai d'attente manquant pour "${covLabel}"`
          );
        }
      } else {
        // Pour les autres couvertures, montant assuré obligatoire si la couverture existe
        if (cov.sumInsured == null) {
          errors.push(
            `${labelBase}: montant assuré manquant pour "${covLabel}"`
          );
        }
      }

      // Prime toujours requise pour une couverture existante
      if (cov.premium == null) {
        errors.push(
          `${labelBase}: prime manquante pour "${covLabel}"`
        );
      }
    });
  });

  return { errors, warnings };
}


const COVERAGE_OPTIONS = [
  { value: "death_fixed", label: "Capital décès fixe" },
  { value: "death_decreasing", label: "Capital décès décroissant" },
  { value: "disability_main", label: "Rente incapacité de gain (principale)" },
  { value: "disability_deferred", label: "Rente incapacité de gain différée" },
  { value: "waiver", label: "Libération du paiement des primes" },
];

function getInsurerLogo(insurer: InsurerCode | ""): string | null {
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

function formatDateTime(date: Date | null): string {
  if (!date) return "";
  const dateStr = date.toLocaleDateString("fr-CH");
  const timeStr = date.toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} ${timeStr}`;
}

function formatStatusLabel(status: OfferRequestStatus): string {
  switch (status) {
    case "nouvelle":
      return "Nouvelle demande";
    case "en_cours":
      return "En cours de traitement";
    case "en_attente_client":
      return "En attente du client";
    case "terminee":
      return "Terminée";
  }
}

function statusBadgeVariant(
  status: OfferRequestStatus
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "nouvelle":
      return "outline"; // on forcera la couleur via className
    case "en_cours":
      return "outline"; // idem
    case "en_attente_client":
      return "secondary";
    case "terminee":
      return "outline"; // on fera le vert via className
  }
}

function frequencyLabel(freq: string | null): string {
  if (!freq) return "";
  if (freq === "monthly") return "par mois";
  if (freq === "yearly" || freq === "annual") return "par an";
  return freq;
}

function defaultTanFromPhone(phone?: string | null): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function getNextMonthFirstDateLabel(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = month === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonth = (month + 1) % 12;
  const d = new Date(year, nextMonth, 1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function createEmptyOffer(config: any | null): ManualOffer {
  const contractForm: ContractForm =
    (config?.type === "3b" ? "3b" : "3a") as ContractForm;

  const currentYear = new Date().getFullYear();

  return {
    id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    insurer: "",
    contractForm,
    offerNumber: null,
    startDateLabel: getNextMonthFirstDateLabel(),
    endDateLabel: "",
    premiumAnnual: null,
    premiumMonthly: null,
    coverages: [],
    projectedModerateAmount: null,
    projectedModerateRatePct: null,
    pessRatePct: null,
    midRatePct: null,
    optRatePct: null,
    surrenderValues: [
      {
        id: `sv_${currentYear + 1}`,
        dateLabel: `01.12.${currentYear + 1}`,
        guaranteed: null,
        pess: null,
        mid: null,
        opt: null,
      },
      {
        id: `sv_${currentYear + 2}`,
        dateLabel: `01.12.${currentYear + 2}`,
        guaranteed: null,
        pess: null,
        mid: null,
        opt: null,
      },
      {
        id: `sv_${currentYear + 3}`,
        dateLabel: `01.12.${currentYear + 3}`,
        guaranteed: null,
        pess: null,
        mid: null,
        opt: null,
      },
    ],
    // 👇 on initialise EPL à null (pas de 2e tableau par défaut)
    surrenderValuesEpl: null,
    attachments: [],
    healthQuestionnaireRequired: null,
    healthQuestionnaireUrl: null,
    healthQuestionnaireTan: null,
    signingDocsUrl: null,
    signingDocsPin: null,

  };
}
export default function AdminOfferDetailPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const [data, setData] = useState<OfferRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [offers, setOffers] = useState<ManualOffer[]>([]);
  const [offersState, setOffersState] = useState<"saved" | "sent" | null>(null);
  const [savingOffers, setSavingOffers] = useState(false);
  const [sendingOffers, setSendingOffers] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendValidationErrors, setSendValidationErrors] = useState<string[]>([]);
  const [sendWarnings, setSendWarnings] = useState<string[]>([]);


  const [uploadingAttachmentOfferId, setUploadingAttachmentOfferId] = useState<string | null>(null);
  const [importingOfferId, setImportingOfferId] = useState<string | null>(null);

  // 🔹 Catégorie actuellement sélectionnée par offre (avant upload)
const [attachmentCategoryByOffer, setAttachmentCategoryByOffer] = useState<
  Record<string, AttachmentCategory | undefined>
>({});

  const [importingVROfferId, setImportingVROfferId] = useState<string | null>(null);

  // Profil investisseur (answers + profil IA)
const [investorAnswers, setInvestorAnswers] = useState<Record<string, string> | null>(null);
const [investorProfile, setInvestorProfile] = useState<{
  equityMinPct: number | null;
  equityMaxPct: number | null;
  equityChosenPct: number | null;
  equityOverrideAck: boolean;
  summary: string | null;
  validatedAt: Date | null;
} | null>(null);


  const [healthSummary, setHealthSummary] = useState<{
    profession?: string | null;
    isSmoker?: boolean;
    cigarettesPerDay?: number | null;
    hasHypertension?: boolean;
    hasHighCholesterol?: boolean;
    heightCm?: number | null;
    weightKg?: number | null;
    bmi?: number | null;
    countryResidence?: string;
    doesPhysicalWork?: "yes" | "no";
    hasHigherEducation?: "yes" | "no";
    degreeLabel?: string;
    degreeSchool?: string;
    isUsCitizenOrResident?: "yes" | "no";
    isUsTaxableOther?: "yes" | "no";
    healthBlockUs?: boolean;
    updatedAt?: Date | null;
  } | null>(null);

  const [healthLoading, setHealthLoading] = useState(false);

  const requestId = params?.requestId;

  useEffect(() => {
    if (!requestId) return;

    const fetchData = async () => {
      try {
        const ref = doc(db, "offers_requests_3e", requestId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const d: any = snap.data();

        const contact = (d.contact as any) ?? null;

        // Offres déjà sauvegardées pour cette demande (adminOffers)
        const adminOffersRaw = (d.adminOffers as any[]) ?? [];
        const adminOffersStatus = d.adminOffersStatus as "saved" | "sent" | undefined;

        const restoredOffers: ManualOffer[] = adminOffersRaw.map((o: any, index: number) => ({
          id: o.id ?? `offer_restored_${index}_${Date.now()}`,
          insurer: (o.insurer as InsurerCode) ?? "",
          contractForm: (o.contractForm as ContractForm) ?? "3a",
          startDateLabel: o.startDateLabel ?? "",
          endDateLabel: o.endDateLabel ?? "",
          premiumAnnual: typeof o.premiumAnnual === "number" ? o.premiumAnnual : null,
          premiumMonthly: typeof o.premiumMonthly === "number" ? o.premiumMonthly : null,
          offerNumber: o.offerNumber ?? null,
          coverages: Array.isArray(o.coverages) ? o.coverages : [],
          projectedModerateAmount:
            typeof o.projectedModerateAmount === "number" ? o.projectedModerateAmount : null,
          projectedModerateRatePct:
            typeof o.projectedModerateRatePct === "number" ? o.projectedModerateRatePct : null,
          pessRatePct: typeof o.pessRatePct === "number" ? o.pessRatePct : null,
          midRatePct: typeof o.midRatePct === "number" ? o.midRatePct : null,
          optRatePct: typeof o.optRatePct === "number" ? o.optRatePct : null,
          surrenderValues: Array.isArray(o.surrenderValues) ? o.surrenderValues : [],
          // 👇 nouveau : on restaure aussi la table EPL si elle existe
          surrenderValuesEpl: Array.isArray(o.surrenderValuesEpl)
            ? o.surrenderValuesEpl
            : o.surrenderValuesEpl ?? null,
          attachments: Array.isArray(o.attachments)
          ? o.attachments.map((att: any) => ({
              ...att,
              // 🔹 fallback si pas encore de catégorie en base
              category: (att.category as AttachmentCategory) ?? "autres",
            }))
          : [],
          healthQuestionnaireRequired:
          typeof o.healthQuestionnaireRequired === "boolean"
            ? o.healthQuestionnaireRequired
            : null,
          healthQuestionnaireUrl:
          typeof o.healthQuestionnaireUrl === "string"
            ? o.healthQuestionnaireUrl
            : null,
          healthQuestionnaireTan: 
          typeof o.healthQuestionnaireTan === "string" 
            ? o.healthQuestionnaireTan 
            : null,
                    signingDocsUrl:
            typeof o.signingDocsUrl === "string" 
            ? o.signingDocsUrl 
            : null,
          signingDocsPin:
            typeof o.signingDocsPin === "string" 
            ? o.signingDocsPin 
            : null,
        }));

        if (restoredOffers.length > 0) {
          setOffers(restoredOffers);
        }
        setOffersState(adminOffersStatus ?? null);
        const createdAtDate = toDate(d.createdAt);

        const rawStatus = (d.status as OfferRequestStatus) ?? "nouvelle";
        const status: OfferRequestStatus = [
          "nouvelle",
          "en_cours",
          "en_attente_client",
          "terminee",
        ].includes(rawStatus)
          ? rawStatus
          : "nouvelle";

        const detail: OfferRequestDetail = {
          id: snap.id,
          clientUid: d.clientUid ?? "",
          clientName: d.clientName ?? null,
          type: d.type ?? null,
          premiumAmount:
            typeof d.premiumAmount === "number" ? d.premiumAmount : null,
          premiumFrequency: d.premiumFrequency ?? null,
          totalRiskPremium:
            typeof d.totalRiskPremium === "number"
              ? d.totalRiskPremium
              : null,
          netSavingsPremium:
            typeof d.netSavingsPremium === "number"
              ? d.netSavingsPremium
              : null,
          profession: d.profession ?? null,
          riskInvalidityRente:
            typeof d.riskInvalidityRente === "number"
              ? d.riskInvalidityRente
              : null,
          riskInvalidityCapital:
            typeof d.riskInvalidityCapital === "number"
              ? d.riskInvalidityCapital
              : null,
          riskDeathCapital:
            typeof d.riskDeathCapital === "number"
              ? d.riskDeathCapital
              : null,
          riskPremiumWaiver:
            typeof d.riskPremiumWaiver === "boolean"
              ? d.riskPremiumWaiver
              : null,
          createdAt: createdAtDate,
          source: d.source ?? null,
          status,
          contact: contact,
          configSnapshot: d.configSnapshot ?? null,
        };

        setData(detail);
        setLoading(false);
      } catch (err) {
        console.error("[AdminOfferDetail] Erreur de lecture Firestore:", err);
        setLoading(false);
        setNotFound(true);
      }
    };

    fetchData();
  }, [requestId]);

  useEffect(() => {
  if (!data?.clientUid) return;

  const cfg = (data.configSnapshot as any) ?? null;
  const configId = cfg?.id;
  if (!configId) return;

  (async () => {
    try {
      // 1. On essaye d'abord la nouvelle sous-collection spécifique 3e pilier
      let snap = await getDoc(
        doc(
          db,
          "clients",
          data.clientUid,
          "investor_profile_3epilier",
          configId
        )
      );

      // 2. Fallback sur l’ancienne sous-collection "investorProfiles" si rien
      if (!snap.exists()) {
        snap = await getDoc(
          doc(db, "clients", data.clientUid, "investorProfiles", configId)
        );
      }

      if (!snap.exists()) {
        setInvestorAnswers(null);
        setInvestorProfile(null);
        return;
      }

      const d = snap.data() as any;
        setInvestorAnswers(d.answers || null);

        const p = d.profile || {};
        const validatedAtDate = d.validatedAt ? toDate(d.validatedAt) : null;

        setInvestorProfile({
          equityMinPct:
            typeof p.equityMinPct === "number" ? p.equityMinPct : null,
          equityMaxPct:
            typeof p.equityMaxPct === "number" ? p.equityMaxPct : null,
          equityChosenPct:
            typeof p.equityChosenPct === "number" ? p.equityChosenPct : null,
          equityOverrideAck:
            typeof p.equityOverrideAck === "boolean" ? p.equityOverrideAck : false,
          summary:
            typeof p.summary === "string" || p.summary === null
              ? p.summary
              : null,
          validatedAt: validatedAtDate,
        });
    } catch (err) {
      console.error("[AdminOfferDetail] erreur lecture investorProfile:", err);
      setInvestorAnswers(null);
      setInvestorProfile(null);
    }
  })();
}, [data?.clientUid, (data?.configSnapshot as any)?.id]);

  // Charger le dernier questionnaire Santé & Lifestyle pour ce client
  useEffect(() => {
    if (!data?.clientUid) return;

    setHealthLoading(true);

    (async () => {
      try {
        const qRef = query(
          collection(db, "clients", data.clientUid, "health_lifestyle_3epilier"),
          orderBy("updatedAt", "desc"),
          limit(1)
        );

        const snap = await getDocs(qRef);
        if (snap.empty) {
          setHealthSummary(null);
          setHealthLoading(false);
          return;
        }

        const raw = snap.docs[0].data() as any;
        const updatedAtDate = raw.updatedAt ? toDate(raw.updatedAt) : null;

        setHealthSummary({
          profession: raw.profession ?? null,
          isSmoker:
            typeof raw.isSmoker === "boolean" ? raw.isSmoker : undefined,
          cigarettesPerDay:
            typeof raw.cigarettesPerDay === "number"
              ? raw.cigarettesPerDay
              : null,
          hasHypertension:
            typeof raw.hasHypertension === "boolean"
              ? raw.hasHypertension
              : undefined,
          hasHighCholesterol:
            typeof raw.hasHighCholesterol === "boolean"
              ? raw.hasHighCholesterol
              : undefined,
          heightCm:
            typeof raw.heightCm === "number" ? raw.heightCm : null,
          weightKg:
            typeof raw.weightKg === "number" ? raw.weightKg : null,
          bmi: typeof raw.bmi === "number" ? raw.bmi : null,
          countryResidence: raw.countryResidence ?? undefined,
          doesPhysicalWork: raw.doesPhysicalWork,
          hasHigherEducation: raw.hasHigherEducation,
          degreeLabel: raw.degreeLabel,
          degreeSchool: raw.degreeSchool,
          isUsCitizenOrResident: raw.isUsCitizenOrResident,
          isUsTaxableOther: raw.isUsTaxableOther,
          healthBlockUs:
            typeof raw.healthBlockUs === "boolean" ? raw.healthBlockUs : false,
          updatedAt: updatedAtDate,
        });

        setHealthLoading(false);
      } catch (err) {
        console.error(
          "[AdminOfferDetail] erreur lecture health_lifestyle_3epilier:",
          err
        );
        setHealthSummary(null);
        setHealthLoading(false);
      }
    })();
  }, [data?.clientUid]);

  const config = data?.configSnapshot ?? null;
  const savings = config?.savings ?? null;
  const deathFixed = config?.deathFixed ?? null;
  const deathDecreasing = config?.deathDecreasing ?? null;
  const disabilityAnnuities: any[] =
    (config?.disabilityAnnuities as any[]) ?? [];
  const premiumWaiver = config?.premiumWaiver ?? null;
  const pricingContext = config?.pricingContext ?? null;

  const heightCm: number | null =
    typeof config?.heightCm === "number" ? config.heightCm : null;
  const weightKg: number | null =
    typeof config?.weightKg === "number" ? config.weightKg : null;

  const endAge: number | undefined = config?.endAge;

  const startDate: string | undefined =
    (data as any)?.offerStartDate ??
    (config?.offerStartDate as string | undefined) ??
    (config?.offerStartDateLabel as string | undefined) ??
    (config?.startDate as string | undefined);

  const contractType: string | null = config?.type ?? data?.type ?? null;

  const handleCopy = async (id: string, text: string | null | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

    const handleSetStatusEnCours = async () => {
    if (!data) return;
    if (data.status === "en_cours") return;

    try {
      setStatusUpdating(true);
      const res = await fetch("/api/admin/offers/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: data.id,
          status: "en_cours",
        }),
      });

      if (!res.ok) {
        console.error("Erreur update status", await res.text());
        return;
      }

      // Mise à jour locale pour le header (plus fluide)
      setData((prev) => (prev ? { ...prev, status: "en_cours" } : prev));
    } catch (e) {
      console.error("Erreur handleSetStatusEnCours:", e);
    } finally {
      setStatusUpdating(false);
    }
  };

    const handleSetStatusNouvelle = async () => {
    if (!data) return;
    if (data.status === "nouvelle") return;

    try {
      setStatusUpdating(true);
      const res = await fetch("/api/admin/offers/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: data.id,
          status: "nouvelle",
        }),
      });

      if (!res.ok) {
        console.error("Erreur update status", await res.text());
        return;
      }

      // Mise à jour locale
      setData((prev) => (prev ? { ...prev, status: "nouvelle" } : prev));
    } catch (e) {
      console.error("Erreur handleSetStatusNouvelle:", e);
    } finally {
      setStatusUpdating(false);
    }
  };


  const handleImportOfferPdf = async (offerId: string, file: File) => {
  try {
    console.log("[IMPORT PDF] Start for offerId =", offerId, "file =", file);
    setImportingOfferId(offerId);

    if (!data?.clientUid) {
      console.error(
        "[IMPORT PDF] Impossible d'importer l'offre: clientUid manquant dans data."
      );
      return;
    }

    // 1) Upload du PDF dans Firebase Storage
    const storagePath = `clients/${data.clientUid}/offers_raw/${offerId}.pdf`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    console.log("[IMPORT PDF] Upload terminé vers", storagePath);

    // 2) Appel de l'API OCR+IA pour parser l'offre
    const res = await fetch("/api/offers/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: storagePath }),
    });

    console.log("[IMPORT PDF] /api/offers/parse status =", res.status);

    if (!res.ok) {
      console.error("Erreur /api/offers/parse:", await res.text());
      return;
    }

    const json = await res.json();
    console.log("[IMPORT PDF] /api/offers/parse JSON =", json);

    if (!json.offer) {
      console.error("Réponse /api/offers/parse sans 'offer':", json);
      return;
    }

    const parsed = json.offer as Partial<ManualOffer>;

// 3) On injecte l'offre parsée dans la carte correspondante
setOffers((prev) =>
  prev.map((o) =>
    o.id === offerId
      ? {
          ...o,
          ...parsed,
          coverages: parsed.coverages ?? o.coverages,
          // Ne remplace les valeurs de rachat QUE si l'IA en a fourni des non vides
          surrenderValues:
            parsed.surrenderValues && parsed.surrenderValues.length > 0
              ? parsed.surrenderValues
              : o.surrenderValues,
          surrenderValuesEpl:
            parsed.surrenderValuesEpl && parsed.surrenderValuesEpl.length > 0
              ? parsed.surrenderValuesEpl
              : o.surrenderValuesEpl ?? null,
        }
      : o
  )
);
  } catch (e) {
    console.error("Erreur handleImportOfferPdf:", e);
  } finally {
    setImportingOfferId(null);
  }
};

const handleImportVRPdf = async (offerId: string, file: File) => {
  try {
    console.log("[IMPORT VR PDF] Start for offerId =", offerId, "file =", file);
    setImportingVROfferId(offerId);

    if (!data?.clientUid) {
      console.error(
        "[IMPORT VR PDF] Impossible d'importer les valeurs de rachat : clientUid manquant dans data."
      );
      toast.error("clientUid manquant pour l'import VR.");
      return;
    }

    // 1) Upload du PDF VR dans Firebase Storage
    const storagePath = `clients/${data.clientUid}/offers_vr/${offerId}.pdf`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    console.log("[IMPORT VR PDF] Upload terminé vers", storagePath);

    // 2) Appel de l'API OCR+IA pour parser les valeurs de rachat
    const res = await fetch("/api/offers/parse-vr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: storagePath }),
    });

    console.log("[IMPORT VR PDF] /api/offers/parse-vr status =", res.status);

    if (!res.ok) {
      const txt = await res.text();
      console.error("Erreur /api/offers/parse-vr:", txt);
      toast.error("Erreur lors de l'analyse des valeurs de rachat.");
      return;
    }

    const json = await res.json();
    console.log("[IMPORT VR PDF] /api/offers/parse-vr JSON =", json);

    if (!json.tables) {
      console.error("Réponse /api/offers/parse-vr sans 'tables':", json);
      toast.error("Réponse VR invalide (sans tableaux).");
      return;
    }

    const { surrenderValues, surrenderValuesEpl } = json.tables as {
      surrenderValues?: SurrenderValueRow[];
      surrenderValuesEpl?: SurrenderValueRow[] | null;
    };

    // 3) Injection des tableaux dans l'offre correspondante
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              surrenderValues: surrenderValues ?? o.surrenderValues,
              surrenderValuesEpl:
                surrenderValuesEpl !== undefined
                  ? surrenderValuesEpl
                  : o.surrenderValuesEpl ?? null,
            }
          : o
      )
    );

    toast.success("Valeurs de rachat importées avec succès.");
  } catch (e) {
    console.error("Erreur handleImportVRPdf:", e);
    toast.error("Erreur inattendue lors de l'import VR.");
  } finally {
    setImportingVROfferId(null);
  }
};

  const handleUploadOfferAttachment = async (offerId: string, file: File, category: AttachmentCategory) => {
    if (!data?.clientUid) {
      console.error("[ATTACHMENT] clientUid manquant, impossible d'uploader la pièce jointe.");
      return;
    }

    try {
      setUploadingAttachmentOfferId(offerId);

      const attachmentId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `clients/${data.clientUid}/offers_attachments/${offerId}/${attachmentId}_${safeFileName}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      const newAttachment: ManualOfferAttachment = {
        id: attachmentId,
        name: file.name,
        storagePath,
        mimeType: file.type || null,
        createdAt: new Date().toISOString(),
        category, // 🔹 ici
      };

      setOffers((prev) =>
        prev.map((o) =>
          o.id === offerId
            ? {
                ...o,
                attachments: [...(o.attachments ?? []), newAttachment],
              }
            : o
        )
      );
    } catch (e) {
      console.error("[ATTACHMENT] Erreur upload de la pièce jointe:", e);
      toast.error("Erreur lors de l'upload de la pièce jointe.");
    } finally {
      setUploadingAttachmentOfferId(null);
    }
  };

  const handleOpenOfferAttachment = async (attachment: ManualOfferAttachment) => {
    try {
      const url = await getDownloadURL(ref(storage, attachment.storagePath));
      // Ouvre dans un nouvel onglet, le navigateur gère le PDF / image (affichage ou téléchargement)
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[ATTACHMENT] Erreur lors de l'ouverture de la pièce jointe:", e);
      toast.error("Impossible d'ouvrir la pièce jointe.");
    }
  };

  const updateAttachmentName = (offerId: string, attachmentId: string, newName: string) => {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              attachments: o.attachments.map((att) =>
                att.id === attachmentId ? { ...att, name: newName } : att
              ),
            }
          : o
      )
    );
  };

  const removeAttachment = (offerId: string, attachmentId: string) => {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              attachments: o.attachments.filter((att) => att.id !== attachmentId),
            }
          : o
      )
    );
  };


    const handleAddOffer = () => {
    setOffers((prev) => [...prev, createEmptyOffer(config)]);
  };

  const handleRemoveOffer = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };

  const updateOffer = (offerId: string, patch: Partial<ManualOffer>) => {
    setOffers((prev) =>
      prev.map((o) => (o.id === offerId ? { ...o, ...patch } : o))
    );
  };

  const updateCoverage = (
    offerId: string,
    coverageId: string,
    patch: Partial<OfferCoverageRow>
  ) => {
    setOffers((prev) =>
      prev.map((offer) => {
        if (offer.id !== offerId) return offer;
        return {
          ...offer,
          coverages: offer.coverages.map((c) =>
            c.id === coverageId ? { ...c, ...patch } : c
          ),
        };
      })
    );
  };

  const addCoverage = (offerId: string) => {
  setOffers((prev) =>
    prev.map((offer) =>
      offer.id === offerId
        ? {
            ...offer,
            coverages: [
              ...offer.coverages,
              {
                id: `cov_${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                label: "",
                sumInsured: null,
                premium: null,
                waitingPeriodMonths: null,
              },
            ],
          }
        : offer
    )
  );
};

  const removeCoverage = (offerId: string, coverageId: string) => {
    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === offerId
          ? {
              ...offer,
              coverages: offer.coverages.filter((c) => c.id !== coverageId),
            }
          : offer
      )
    );
  };

const updateSurrenderCell = (
  offerId: string,
  rowId: string,
  field: "guaranteed" | "pess" | "mid" | "opt",
  value: number | null
) => {
  setOffers((prev) =>
    prev.map((offer) =>
      offer.id === offerId
        ? {
            ...offer,
            surrenderValues: offer.surrenderValues.map((row) =>
              row.id === rowId ? { ...row, [field]: value } : row
            ),
          }
        : offer
    )
  );
};

const updateSurrenderDateLabel = (
  offerId: string,
  rowId: string,
  newLabel: string
) => {
  setOffers((prev) =>
    prev.map((offer) =>
      offer.id === offerId
        ? {
            ...offer,
            surrenderValues: offer.surrenderValues.map((row) =>
              row.id === rowId ? { ...row, dateLabel: newLabel } : row
            ),
          }
        : offer
    )
  );
};

const addSurrenderRow = (offerId: string) => {
  setOffers((prev) =>
    prev.map((offer) => {
      if (offer.id !== offerId) return offer;
      return {
        ...offer,
        surrenderValues: [
          ...offer.surrenderValues,
          {
            id: `sv_${Date.now()}`,
            dateLabel: "",
            guaranteed: null,
            pess: null,
            mid: null,
            opt: null,
          },
        ],
      };
    })
  );
};

const updateSurrenderCellEpl = (
  offerId: string,
  rowId: string,
  field: "guaranteed" | "pess" | "mid" | "opt",
  value: number | null
) => {
  setOffers((prev) =>
    prev.map((offer) => {
      if (offer.id !== offerId) return offer;
      const current = offer.surrenderValuesEpl ?? [];
      return {
        ...offer,
        surrenderValuesEpl: current.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row
        ),
      };
    })
  );
};

const updateSurrenderDateLabelEpl = (
  offerId: string,
  rowId: string,
  newLabel: string
) => {
  setOffers((prev) =>
    prev.map((offer) => {
      if (offer.id !== offerId) return offer;
      const current = offer.surrenderValuesEpl ?? [];
      return {
        ...offer,
        surrenderValuesEpl: current.map((row) =>
          row.id === rowId ? { ...row, dateLabel: newLabel } : row
        ),
      };
    })
  );
};

const addSurrenderRowEpl = (offerId: string) => {
  setOffers((prev) =>
    prev.map((offer) => {
      if (offer.id !== offerId) return offer;
      const current = offer.surrenderValuesEpl ?? [];
      return {
        ...offer,
        surrenderValuesEpl: [
          ...current,
          {
            id: `sv_epl_${Date.now()}`,
            dateLabel: "",
            guaranteed: null,
            pess: null,
            mid: null,
            opt: null,
          },
        ],
      };
    })
  );
};

  const handleSaveOffers = async () => {
    if (!data) return;
    try {
      setSavingOffers(true);
      const payload = mapOffersToPayload(offers);
      const res = await fetch("/api/admin/offers/3epilier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: data.id,
          mode: "save",
          offers: payload,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        console.error("[handleSaveOffers] Erreur API:", msg);
        toast.error("Erreur lors de la sauvegarde des offres.");
        return;
      }

      setOffersState("saved");
      toast.success("Offres sauvegardées en brouillon.");
    } catch (e) {
      console.error("[handleSaveOffers] Erreur:", e);
      toast.error("Erreur inattendue lors de la sauvegarde des offres.");
    } finally {
      setSavingOffers(false);
    }
  };

    const handleOpenSendDialog = () => {
    const { errors, warnings } = validateOffersForSend(offers);
    setSendValidationErrors(errors);
    setSendWarnings(warnings);
    setSendDialogOpen(true);
  };

  const handleSendOffers = async () => {
    if (!data) return;
    try {
      setSendingOffers(true);
      const payload = mapOffersToPayload(offers);
      const res = await fetch("/api/admin/offers/3epilier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: data.id,
          mode: "send",
          offers: payload,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        console.error("[handleSendOffers] Erreur API:", msg);
        toast.error("Erreur lors de l'envoi des offres au client.");
        return;
      }

      setOffersState("sent");
      toast.success("Offres envoyées au client.");
    } catch (e) {
      console.error("[handleSendOffers] Erreur:", e);
      toast.error("Erreur inattendue lors de l'envoi des offres.");
    } finally {
      setSendingOffers(false);
    }
  };

  return (
    <RequireAdmin>
      <div className="p-4 md:p-6 space-y-4">
        {/* Barre de retour */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-2"
            onClick={() => router.push("/admin/dashboard")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs md:text-sm">Retour aux demandes</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
            Chargement du dossier…
          </div>
        ) : notFound || !data ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>Dossier introuvable.</p>
            <p className="text-xs">
              Vérifiez que la référence de la demande est correcte.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header dossier */}
            <Card className="border border-primary/10">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base md:text-lg">
                    Demande d&apos;offres 3e pilier
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px]">
                      Réf. {data.id}
                    </span>
                    {data.createdAt && (
                      <>
                        <span>•</span>
                        <span>
                          Créée le {formatDateTime(data.createdAt)}
                        </span>
                      </>
                    )}
                    {data.source && (
                      <>
                        <span>•</span>
                        <span>{data.source}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
  {/* Badge de statut (static ou interactif selon le status) */}
  {data.status === "en_cours" ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">
          <Badge
            variant={statusBadgeVariant(data.status)}
            className={cn(
              "text-[10px] md:text-xs cursor-pointer",
              "border-amber-400 bg-amber-50 text-amber-900"
            )}
          >
            En cours de traitement ▾
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-xs"
          onClick={handleSetStatusNouvelle}
          disabled={statusUpdating}
        >
          Repasser en &laquo; Nouvelle demande &raquo;
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Badge
      variant={statusBadgeVariant(data.status)}
      className={cn(
        "text-[10px] md:text-xs",
        data.status === "nouvelle" &&
          "border-amber-500 bg-amber-50 text-amber-900",
        data.status === "en_attente_client" &&
          "border-slate-300 bg-slate-50 text-slate-800",
        data.status === "terminee" &&
          "border-emerald-400 bg-emerald-50 text-emerald-900"
      )}
    >
      {formatStatusLabel(data.status)}
    </Badge>
  )}

  {/* Badge type de contrat */}
  {contractType && (
    <Badge variant="outline" className="text-[10px] md:text-xs">
      {contractType === "3a"
        ? "3e pilier lié (3a)"
        : contractType === "3b"
        ? "3e pilier libre (3b)"
        : contractType}
    </Badge>
  )}

  {/* Bouton Traiter la demande pour les nouvelles demandes */}
  {data.status === "nouvelle" && (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={handleSetStatusEnCours}
      disabled={statusUpdating}
      className="inline-flex items-center gap-1 text-[11px]"
    >
      <Hammer className="h-3.5 w-3.5" />
      {statusUpdating ? "Mise à jour..." : "Traiter la demande"}
    </Button>
  )}
</div>
              </CardHeader>
            </Card>

            {/* Grille principale : Client / Configuration */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Bloc client */}
              <Card className="border border-primary/10">
                <CardHeader className="flex flex-row items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-sm">Client</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Coordonnées (cliquables pour copier/coller).
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs md:text-sm">
                  {/* Nom complet */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Nom complet
                    </span>
                    {(() => {
                      const fullName =
                        data.clientName ||
                        (data.contact &&
                          [data.contact.firstName, data.contact.lastName]
                            .filter(Boolean)
                            .join(" ")) ||
                        "";
                      return (
                        <button
  type="button"
  onClick={() => handleCopy("client-fullname", fullName || null)}
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-fullname"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span className="truncate">
    {fullName || "Non renseigné"}
  </span>
  {copiedId === "client-fullname" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                      );
                    })()}
                  </div>

                  {/* Email */}
                  {data.contact?.email && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Email
                      </span>
                      <button
  type="button"
  onClick={() =>
    handleCopy("client-email", data.contact?.email)
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-email"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span className="flex items-center gap-2">
    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
    <span className="text-xs">{data.contact.email}</span>
  </span>
  {copiedId === "client-email" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                    </div>
                  )}

                  {/* Téléphone */}
                  {data.contact?.phone && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Téléphone
                      </span>
                      <button
  type="button"
  onClick={() =>
    handleCopy("client-phone", data.contact?.phone)
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-phone"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span className="flex items-center gap-2">
    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
    <span className="text-xs">{data.contact.phone}</span>
  </span>
  {copiedId === "client-phone" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                    </div>
                  )}

                  {/* Adresse : Rue + NPA/Localité */}
                  {(data.contact?.street ||
                    data.contact?.zip ||
                    data.contact?.city) && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Adresse postale
                      </span>
                      {data.contact?.street && (
                        <button
  type="button"
  onClick={() =>
    handleCopy(
      "client-street",
      data.contact?.street ?? null
    )
  }
  className={cn(
    "flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-street"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span className="flex items-center gap-2">
    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
    <span>{data.contact.street}</span>
  </span>
  {copiedId === "client-street" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                      )}

                      {(data.contact?.zip || data.contact?.city) && (
                        <button
  type="button"
  onClick={() =>
    handleCopy(
      "client-zip-city",
      `${data.contact?.zip ?? ""} ${
        data.contact?.city ?? ""
      }`.trim() || null
    )
  }
  className={cn(
    "flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-zip-city"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span>
    {data.contact?.zip} {data.contact?.city}
  </span>
  {copiedId === "client-zip-city" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                      )}
                    </div>
                  )}

                  {/* Sexe / Date naissance / Nationalité / Permis */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {data.contact?.sex && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Sexe
                        </span>
                        <span>{data.contact.sex}</span>
                      </div>
                    )}
                    {data.contact?.birthdate && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Date de naissance
                        </span>
                        <button
  type="button"
  onClick={() =>
    handleCopy(
      "client-birthdate",
      data.contact?.birthdate ?? null
    )
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-birthdate"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span>{data.contact.birthdate}</span>
  {copiedId === "client-birthdate" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                      </div>
                    )}
                    {data.contact?.nationality && (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-medium text-muted-foreground">
      Nationalité
    </span>
    <span>{data.contact.nationality}</span>
  </div>
)}

{data.contact?.etatCivilLabel && (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-medium text-muted-foreground">
      État civil
    </span>
    <button
      type="button"
      onClick={() =>
        handleCopy(
          "client-etat-civil",
          data.contact?.etatCivilLabel ?? null
        )
      }
      className={cn(
        "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
        "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
        copiedId === "client-etat-civil"
          ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
          : "border-muted bg-background"
      )}
    >
      <span>{data.contact.etatCivilLabel}</span>
      {copiedId === "client-etat-civil" ? (
        <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
      ) : (
        <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      )}
    </button>
  </div>
)}

{"residencePermit" in (data.contact || {}) &&
  data.contact?.residencePermit && (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        Permis
      </span>
      <span>{data.contact.residencePermit}</span>
    </div>
  )}
                  </div>

   {/* Profil investisseur (questionnaire MoneyLife) */}
{investorAnswers && (
  <div className="mt-3 space-y-1 rounded-md border bg-muted/40 p-2">
    <p className="text-[11px] font-medium text-muted-foreground">
      Profil d&apos;investisseur – réponses au questionnaire
    </p>

    <div className="mt-1 space-y-1 text-[11px]">
      {(() => {
        const answeredBase = INVESTOR_QUESTIONS.filter(
          (q) => investorAnswers[q.id] && !THEME_QUESTION_IDS.includes(q.id)
        );
        const answeredThemes = INVESTOR_QUESTIONS.filter(
          (q) => investorAnswers[q.id] && THEME_QUESTION_IDS.includes(q.id)
        );

        return (
          <>
            {/* Questions “classiques” (revenu, épargne, horizon, etc.) */}
            {answeredBase.map((q) => {
              const answerId = investorAnswers[q.id];
              const opt = q.options.find((o) => o.id === answerId);
              return (
                <div key={q.id} className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">
                    {q.label}
                  </span>
                  <span className="font-medium">
                    {opt?.label ?? answerId}
                  </span>
                </div>
              );
            })}

            {/* Préférences thématiques */}
            {answeredThemes.length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Préférences thématiques de placement
                </p>
                {answeredThemes.map((q) => {
                  const answerId = investorAnswers[q.id];
                  const opt = q.options.find((o) => o.id === answerId);

                  // petit badge coloré selon like / dislike / neutral
                  let badgeClass =
                    "inline-flex items-center rounded-full px-2 py-[1px] text-[10px]";
                  if (answerId === "like") {
                    badgeClass += " bg-emerald-50 text-emerald-700 border border-emerald-300";
                  } else if (answerId === "dislike") {
                    badgeClass += " bg-red-50 text-red-700 border border-red-300";
                  } else {
                    badgeClass += " bg-slate-50 text-slate-700 border border-slate-300";
                  }

                  return (
                    <div key={q.id} className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">
                        {q.label}
                      </span>
                      <span className={badgeClass}>
                        {opt?.label ?? answerId}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}
    </div>

    {investorProfile &&
      investorProfile.equityMinPct != null &&
      investorProfile.equityMaxPct != null && (
        <div className="mt-2 border-t pt-1 text-[11px] space-y-1">
          <span className="text-[10px] text-muted-foreground">
            Recommandation MoneyLife (part actions 3e pilier)
          </span>
          <p>
            {investorProfile.equityMinPct}% – {investorProfile.equityMaxPct}% en actions.
          </p>

          {/* Choix concret du client */}
          {investorProfile.equityChosenPct != null && (
            <div className="text-[10px] space-y-0.5">
              <p>
                <span className="font-medium">Choix du client :</span>{" "}
                {investorProfile.equityChosenPct}% en actions.
              </p>
              {(() => {
                const min = investorProfile.equityMinPct as number;
                const max = investorProfile.equityMaxPct as number;
                const chosen = investorProfile.equityChosenPct as number;

                if (chosen < min) {
                  return (
                    <p className="text-amber-700">
                      En dessous de la zone recommandée : profil plus prudent que
                      la recommandation (risque de rendement insuffisant).
                    </p>
                  );
                }
                if (chosen > max) {
                  return (
                    <p className="text-amber-700">
                      Au-dessus de la zone recommandée : profil plus risqué que la
                      recommandation (plus forte volatilité).
                    </p>
                  );
                }
                return (
                  <p className="text-emerald-700">
                    Dans la zone recommandée pour son profil d&apos;investisseur.
                  </p>
                );
              })()}

              {/* Décharge si le client est en dehors du profil */}
              {investorProfile.equityChosenPct != null &&
                investorProfile.equityOverrideAck &&
                (investorProfile.equityChosenPct < investorProfile.equityMinPct ||
                  investorProfile.equityChosenPct > investorProfile.equityMaxPct) && (
                  <p className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-[2px] text-[9px] text-amber-900 mt-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    Décharge validée : le client a confirmé qu&apos;il s&apos;écarte
                    de la recommandation MoneyLife.
                  </p>
                )}
            </div>
          )}
          {investorProfile.validatedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Profil validé le {formatDateTime(investorProfile.validatedAt)}
            </p>
          )}
          {investorProfile.summary && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {investorProfile.summary}
            </p>
          )}
        </div>
      )}
  </div>
)} 

  {/* Santé & Lifestyle – questionnaire */}
  <div className="mt-3 space-y-1 rounded-md border bg-muted/40 p-2">
    <p className="text-[11px] font-medium text-muted-foreground">
      Santé &amp; lifestyle – questionnaire
    </p>

    {healthLoading ? (
      <p className="text-[11px] text-muted-foreground">
        Chargement des informations santé…
      </p>
    ) : !healthSummary ? (
      <p className="text-[11px] text-muted-foreground">
        Questionnaire Santé &amp; Lifestyle non complété.
      </p>
    ) : (
      <div className="space-y-2 text-[11px]">
        {/* Profession */}
        {healthSummary.profession && (
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary" />
            <div>
              <p className="font-medium">Profession (tarification)</p>
              <p>{healthSummary.profession}</p>
            </div>
          </div>
        )}

        {/* Pays & statut US */}
        <div className="flex items-start gap-2">
          <Globe2 className="h-3.5 w-3.5 mt-0.5 text-primary" />
          <div>
            <p className="font-medium">Pays & statut US</p>
            <p>
              Pays de résidence :{" "}
              <span className="font-semibold">
                {healthSummary.countryResidence || "Non renseigné"}
              </span>
            </p>
            <p>
              Nationalité / domicile US :{" "}
              <span className="font-semibold">
                {healthSummary.isUsCitizenOrResident === "yes"
                  ? "Oui"
                  : healthSummary.isUsCitizenOrResident === "no"
                  ? "Non"
                  : "Non renseigné"}
              </span>
              {" · "}
              Imposable US pour d&apos;autres raisons :{" "}
              <span className="font-semibold">
                {healthSummary.isUsTaxableOther === "yes"
                  ? "Oui"
                  : healthSummary.isUsTaxableOther === "no"
                  ? "Non"
                  : "Non renseigné"}
              </span>
            </p>
            {healthSummary.healthBlockUs && (
              <p className="mt-1 text-[11px] text-red-700 font-medium">
                ⚠ Statut US bloquant pour ce produit.
              </p>
            )}
          </div>
        </div>

        {/* Tabac */}
        <div className="flex items-start gap-2">
          <Cigarette className="h-3.5 w-3.5 mt-0.5 text-primary" />
          <div>
            <p className="font-medium">Tabac</p>
            <p>
              Fumeur / fumeuse :{" "}
              <span className="font-semibold">
                {healthSummary.isSmoker === true
                  ? "Oui"
                  : healthSummary.isSmoker === false
                  ? "Non"
                  : "Non renseigné"}
              </span>
            </p>
            {healthSummary.isSmoker && (
              <p>
                Cigarettes / jour :{" "}
                <span className="font-semibold">
                  {healthSummary.cigarettesPerDay ?? "Non renseigné"}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Santé & IMC */}
        <div className="flex items-start gap-2">
          <HeartPulse className="h-3.5 w-3.5 mt-0.5 text-primary" />
          <div>
            <p className="font-medium">État de santé</p>
            <p>
              Taille / poids :{" "}
              <span className="font-semibold">
                {healthSummary.heightCm ?? "?"} cm /{" "}
                {healthSummary.weightKg ?? "?"} kg
              </span>
            </p>
            <p>
              IMC estimé :{" "}
              <span className="font-semibold">
                {typeof healthSummary.bmi === "number"
                  ? healthSummary.bmi.toFixed(1)
                  : "Non calculé"}
              </span>
            </p>
            <p>
              Hypertension :{" "}
              <span className="font-semibold">
                {healthSummary.hasHypertension === true
                  ? "Oui"
                  : healthSummary.hasHypertension === false
                  ? "Non"
                  : "Non renseigné"}
              </span>
              {" · "}
              Cholestérol élevé :{" "}
              <span className="font-semibold">
                {healthSummary.hasHighCholesterol === true
                  ? "Oui"
                  : healthSummary.hasHighCholesterol === false
                  ? "Non"
                  : "Non renseigné"}
              </span>
            </p>
          </div>
        </div>

        {/* Études / travail physique */}
        <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-muted-foreground">
          <p>
            Études supérieures :{" "}
            <span className="font-semibold">
              {healthSummary.hasHigherEducation === "yes"
                ? "Oui"
                : healthSummary.hasHigherEducation === "no"
                ? "Non"
                : "—"}
            </span>
          </p>
          <p>
            Travail manuel &gt; 4h/sem :{" "}
            <span className="font-semibold">
              {healthSummary.doesPhysicalWork === "yes"
                ? "Oui"
                : healthSummary.doesPhysicalWork === "no"
                ? "Non"
                : "—"}
            </span>
          </p>
        </div>

        {healthSummary.updatedAt && (
          <p className="text-[10px] text-muted-foreground pt-1">
            Questionnaire mis à jour le{" "}
            {formatDateTime(healthSummary.updatedAt)}
          </p>
        )}
      </div>
    )}
  </div>
                </CardContent>
              </Card>

              {/* Bloc configuration complète 3e pilier */}
              <Card className="border border-primary/10">
                <CardHeader className="flex flex-row items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <ShieldHalf className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-sm">
                      Configuration 3e pilier (pour l&apos;offre)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Champs cliquables pour copier les montants dans tes
                      logiciels d&apos;offres.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs md:text-sm">
                  {/* Section contrat & prime */}
                  <div className="space-y-2">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <PiggyBank className="h-3.5 w-3.5" />
                      Contrat &amp; prime
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Type de contrat
                        </span>
                        <span>
                          {contractType === "3a"
                            ? "3e pilier lié (3a)"
                            : contractType === "3b"
                            ? "3e pilier libre (3b)"
                            : contractType || "Non renseigné"}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Profession
                        </span>
                        <span>{data.profession || "Non renseigné"}</span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Prime souhaitée
                        </span>
                        {(() => {
                          const primeLabel =
                            data.premiumAmount != null
                              ? `${data.premiumAmount.toLocaleString(
                                  "fr-CH"
                                )} CHF ${frequencyLabel(
                                  data.premiumFrequency
                                )}`
                              : "";
                          return (
                            <button
  type="button"
  onClick={() =>
    handleCopy(
      "config-prime",
      data.premiumAmount != null ? String(data.premiumAmount) : null
    )
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "config-prime"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span>
    {primeLabel || "Non renseigné"}
  </span>
  {copiedId === "config-prime" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                          );
                        })()}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Date de début
                        </span>
                        <span>{startDate || "Non renseigné"}</span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Âge de fin de contrat
                        </span>
                        <span>
                          {typeof endAge === "number"
                            ? `${endAge} ans`
                            : "Non renseigné"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section répartition prime */}
                  <div className="space-y-2 border-t pt-3">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Répartition prime (risque / épargne)
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Part risque (max.)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              "config-risk-part",
                              data.totalRiskPremium != null
                                ? String(data.totalRiskPremium)
                                : null
                            )
                          }
                          className={cn(
                            "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                            copiedId === "config-risk-part"
                              ? "border-primary bg-primary/5"
                              : "border-muted"
                          )}
                        >
                          <span>
                            {data.totalRiskPremium != null
                              ? `${data.totalRiskPremium.toLocaleString(
                                  "fr-CH"
                                )} CHF/an`
                              : "Non renseigné"}
                          </span>
                          <CopyIcon className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Part épargne nette
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              "config-savings-part",
                              data.netSavingsPremium != null
                                ? String(data.netSavingsPremium)
                                : null
                            )
                          }
                          className={cn(
                            "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                            copiedId === "config-savings-part"
                              ? "border-primary bg-primary/5"
                              : "border-muted"
                          )}
                        >
                          <span>
                            {data.netSavingsPremium != null
                              ? `${data.netSavingsPremium.toLocaleString(
                                  "fr-CH"
                                )} CHF/an`
                              : "Non renseigné"}
                          </span>
                          <CopyIcon className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section couvertures décès / invalidité */}
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Couvertures décès &amp; invalidité
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Décès fixe */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Capital décès (fixe)
                        </span>
                        {(() => {
                          const val =
                            deathFixed?.enabled && deathFixed?.capital > 0
                              ? Number(
                                  deathFixed.capital
                                )
                              : data.riskDeathCapital ?? null;
                          const label =
                            val != null
                              ? `${val.toLocaleString("fr-CH")} CHF`
                              : "Non renseigné";
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  "config-death-capital",
                                  val != null ? String(val) : null
                                )
                              }
                              className={cn(
                                "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                                copiedId === "config-death-capital"
                                  ? "border-primary bg-primary/5"
                                  : "border-muted"
                              )}
                            >
                              <span>{label}</span>
                              <CopyIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          );
                        })()}
                      </div>

                      {/* Décès décroissant */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Décès capital décroissant
                        </span>
                        {(() => {
                          const val =
                            deathDecreasing?.enabled &&
                            deathDecreasing?.capitalInitial > 0
                              ? Number(deathDecreasing.capitalInitial)
                              : null;
                          const label =
                            val != null
                              ? `${val.toLocaleString(
                                  "fr-CH"
                                )} CHF, sur ${
                                  deathDecreasing?.durationYears ?? "?"
                                } ans`
                              : "Non renseigné";
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  "config-death-decreasing",
                                  val != null ? String(val) : null
                                )
                              }
                              className={cn(
                                "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                                copiedId === "config-death-decreasing"
                                  ? "border-primary bg-primary/5"
                                  : "border-muted"
                              )}
                            >
                              <span>{label}</span>
                              <CopyIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          );
                        })()}
                      </div>

                      {/* Rente invalidité */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Rente invalidité (principale)
                        </span>
                        {(() => {
                          const val = data.riskInvalidityRente;
                          const label =
                            val != null
                              ? `${val.toLocaleString("fr-CH")} CHF/an`
                              : "Non renseigné";
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  "config-invalidity-rente",
                                  val != null ? String(val) : null
                                )
                              }
                              className={cn(
                                "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                                copiedId === "config-invalidity-rente"
                                  ? "border-primary bg-primary/5"
                                  : "border-muted"
                              )}
                            >
                              <span>{label}</span>
                              <CopyIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          );
                        })()}
                      </div>

                      {/* Capital invalidité */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Capital invalidité
                        </span>
                        {(() => {
                          const val = data.riskInvalidityCapital;
                          const label =
                            val != null
                              ? `${val.toLocaleString("fr-CH")} CHF`
                              : "Non renseigné";
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  "config-invalidity-capital",
                                  val != null ? String(val) : null
                                )
                              }
                              className={cn(
                                "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                                copiedId === "config-invalidity-capital"
                                  ? "border-primary bg-primary/5"
                                  : "border-muted"
                              )}
                            >
                              <span>{label}</span>
                              <CopyIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          );
                        })()}
                      </div>

                      {/* Exonération de primes */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Exonération de primes
                        </span>
                        <span>
                          {premiumWaiver?.enabled === true ||
                          data.riskPremiumWaiver === true
                            ? `Oui (${premiumWaiver?.waitingPeriod ?? "délai ?"} mois)`
                            : premiumWaiver?.enabled === false ||
                              data.riskPremiumWaiver === false
                            ? "Non"
                            : "Non renseigné"}
                        </span>
                      </div>
                    </div>

                    {/* Liste détaillée des rentes IG */}
                    {disabilityAnnuities.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[11px] text-muted-foreground">
                          Détail rentes d&apos;incapacité de gain :
                        </p>
                        <ul className="space-y-1 text-[11px]">
                          {disabilityAnnuities.map((rente, index) => (
                            <li key={index} className="leading-tight">
                              <span className="font-medium">
                                {index === 0
                                  ? "Rente principale"
                                  : `Rente différée n°${index}`}
                                :{" "}
                              </span>
                              {Number(rente.annualRente || 0).toLocaleString(
                                "fr-CH"
                              )}{" "}
                              CHF/an · délai {rente.waitingPeriod} mois · début
                              à {rente.startAge ?? "?"} ans
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Section épargne & investissement */}
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Épargne &amp; investissement
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Investi dans des fonds
                        </span>
                        <span>
                          {savings?.withFunds === true
                            ? "Oui"
                            : savings?.withFunds === false
                            ? "Non"
                            : "Non renseigné"}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Profil d&apos;investissement
                        </span>
                        <span>
                          {savings?.investmentProfile === "secure"
                            ? "Sécuritaire"
                            : savings?.investmentProfile === "balanced"
                            ? "Équilibré"
                            : savings?.investmentProfile === "dynamic"
                            ? "Dynamique"
                            : savings?.investmentProfile || "Non renseigné"}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Rendement attendu (projection)
                        </span>
                        <span>
                          {typeof savings?.expectedReturnPct === "number"
                            ? `${savings.expectedReturnPct}% brut/an`
                            : "Non renseigné"}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Capital 3a existant transféré
                        </span>
                        {(() => {
                          const val = savings?.transferAmount3a ?? 0;
                          const label =
                            typeof val === "number" && val > 0
                              ? `${val.toLocaleString("fr-CH")} CHF`
                              : "Aucun";
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  "config-transfer-3a",
                                  typeof val === "number" && val > 0
                                    ? String(val)
                                    : null
                                )
                              }
                              className={cn(
                                "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left",
                                copiedId === "config-transfer-3a"
                                  ? "border-primary bg-primary/5"
                                  : "border-muted"
                              )}
                            >
                              <span>{label}</span>
                              <CopyIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Section profil santé / risque */}
                  {pricingContext && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Profil santé &amp; risque
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Fumeur */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Fumeur
                          </span>
                          <span>
                            {pricingContext.isSmoker
                              ? "Oui"
                              : pricingContext.isSmoker === false
                              ? "Non"
                              : "Non renseigné"}
                          </span>
                        </div>

                        {/* Hypertension */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Hypertension
                          </span>
                          <span>
                            {pricingContext.hasHypertension
                              ? "Oui"
                              : pricingContext.hasHypertension === false
                              ? "Non"
                              : "Non renseigné"}
                          </span>
                        </div>

                        {/* Taille */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Taille
                          </span>
                          <button
  type="button"
  onClick={() =>
    handleCopy(
      "client-height",
      heightCm != null ? String(heightCm) : null
    )
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-height"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span>
    {heightCm != null
      ? `${heightCm} cm`
      : "Non renseigné"}
  </span>
  {copiedId === "client-height" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                        </div>

                        {/* Poids */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Poids
                          </span>
                          <button
  type="button"
  onClick={() =>
    handleCopy(
      "client-weight",
      weightKg != null ? String(weightKg) : null
    )
  }
  className={cn(
    "inline-flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 cursor-pointer",
    "hover:border-primary/60 hover:bg-muted/60 active:scale-[0.98]",
    copiedId === "client-weight"
      ? "border-emerald-400 bg-emerald-50/90 text-emerald-900 shadow-sm"
      : "border-muted bg-background"
  )}
>
  <span>
    {weightKg != null ? `${weightKg} kg` : "Non renseigné"}
  </span>
  {copiedId === "client-weight" ? (
    <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
  ) : (
    <CopyIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  )}
</button>
                        </div>

                        {/* IMC */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            IMC estimé
                          </span>
                          <span>
                            {typeof pricingContext.bmi === "number"
                              ? pricingContext.bmi.toFixed(1)
                              : "Non renseigné"}
                          </span>
                        </div>

                        {/* Classe de risque métier */}
                        {typeof pricingContext.occupationRiskClass ===
                          "number" && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Classe de risque métier
                            </span>
                            <span>{pricingContext.occupationRiskClass}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {data.createdAt && (
                    <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        Demande reçue le {formatDateTime(data.createdAt)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>


            {/* Carte de préparation des offres pour le client */}
            <Card className="border border-dashed border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div className="flex flex-col">
                  <CardTitle className="text-sm">
                    Offres préparées pour le client
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Préparez ici les offres 3e pilier que le client verra dans
                    son espace en ligne.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddOffer}
                  className="inline-flex items-center gap-1 text-[11px]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une offre
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {offers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucune offre pour l&apos;instant. Cliquez sur &laquo; Ajouter
                    une offre &raquo; pour commencer.
                  </p>
                )}

                                {offers.length > 0 && (
                  <>
                    <Accordion
                      type="single"
                      collapsible
                      defaultValue={offers[0]?.id}
                      className="space-y-2"
                    >
                      {offers.map((offer, idx) => {
                        const logoSrc = getInsurerLogo(offer.insurer);

                        return (
                          <AccordionItem
                            key={offer.id}
                            value={offer.id}
                            className={cn(
                              "rounded-lg border-2 shadow-sm bg-white",
                              idx % 3 === 0 && "border-primary/40",
                              idx % 3 === 1 && "border-emerald-400/40",
                              idx % 3 === 2 && "border-amber-400/40"
                            )}
                          >
                            {/* Header de l'accordéon : titre + boutons */}
                            <div className="flex items-center justify-between gap-4 px-4 py-4 border-b bg-muted/30 rounded-t-lg">
                              {/* Toute la zone de gauche (chevron + logo + texte) est cliquable */}
                              <AccordionTrigger className="group flex flex-1 items-center gap-3 px-0 py-0 text-left text-xs md:text-sm">
                                <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 text-primary" />
                                {logoSrc && (
                                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md shadow-sm bg-white">
                                    <Image
                                      src={logoSrc}
                                      alt={offer.insurer || "Compagnie"}
                                      fill
                                      className="object-contain"
                                    />
                                  </div>
                                )}
                                <div className="flex flex-col text-left">
                                  <span className="font-semibold text-sm md:text-base">
                                    Offre {idx + 1}{" "}
                                    {offer.insurer && `– ${offer.insurer}`}
                                  </span>
                                  <span className="text-[12px] text-muted-foreground/80">
                                    Compagnie, forme de contrat, primes et valeurs de rachat.
                                  </span>
                                </div>
                              </AccordionTrigger>

                              {/* Boutons à droite (ne togglent pas l'accordéon) */}
                              <div className="flex items-center gap-2 pl-2">
                                {/* Bouton Importer PDF */}
                                <div>
                                  <input
                                    id={`offer-file-${offer.id}`}
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        console.log(
                                          "[IMPORT PDF] Start for offerId =",
                                          offer.id,
                                          "file =",
                                          file
                                        );
                                        handleImportOfferPdf(offer.id, file);
                                        e.target.value = "";
                                      }
                                    }}
                                  />

                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    disabled={importingOfferId === offer.id}
                                    onClick={() => {
                                      console.log(
                                        "[IMPORT PDF] Click sur le bouton upload pour offerId =",
                                        offer.id
                                      );
                                      const input = document.getElementById(
                                        `offer-file-${offer.id}`
                                      ) as HTMLInputElement | null;
                                      if (input) {
                                        input.click();
                                      }
                                    }}
                                  >
                                    {importingOfferId === offer.id ? (
                                      <Clock className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <UploadCloud className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>

                                {/* Bouton supprimer l'offre avec confirmation */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-red-500"
                                      disabled={importingOfferId === offer.id}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent
                                    className="
                                        animate-in 
                                        fade-in-0 
                                        zoom-in-95 
                                        slide-in-from-bottom-10 
                                        duration-200 
                                    "
                                    >
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Supprimer cette offre ?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Cette action supprimera <span className="font-semibold">
                                          Offre {idx + 1}
                                          {offer.insurer && ` – ${offer.insurer}`}
                                        </span>{" "}
                                        du dossier. Cette opération est définitive.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleRemoveOffer(offer.id)}
                                        className="bg-red-600 text-white hover:bg-red-700"
                                      >
                                        Supprimer l&apos;offre
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>

                            <AccordionContent>
                              <div className="space-y-4 px-4 py-4 text-xs md:text-sm">
                                {/* Ligne 1 : Compagnie + forme */}
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                  <div className="space-y-1">
                                    <Label>Compagnie d&apos;assurance</Label>
                                    <Select
                                      value={offer.insurer}
                                      onValueChange={(val) =>
                                        updateOffer(offer.id, {
                                          insurer: val as InsurerCode,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Choisir..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="AXA">AXA</SelectItem>
                                        <SelectItem value="Swiss Life">
                                          Swiss Life
                                        </SelectItem>
                                        <SelectItem value="Bâloise">
                                          Bâloise
                                        </SelectItem>
                                        <SelectItem value="PAX">PAX</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Numéro d'offre</Label>
                                    <Input
                                      value={offer.offerNumber ?? ""}
                                      onChange={(e) =>
                                        updateOffer(offer.id, { offerNumber: e.target.value })
                                      }
                                      className="h-8 text-xs"
                                      placeholder="106.784.147"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Forme du contrat</Label>
                                    <Select
                                      value={offer.contractForm}
                                      onValueChange={(val) =>
                                        updateOffer(offer.id, {
                                          contractForm: val as ContractForm,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Forme" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="3a">
                                          3a (lié)
                                        </SelectItem>
                                        <SelectItem value="3b">
                                          3b (libre)
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Début du contrat (jj.mm.aaaa)</Label>
                                    <Input
                                      value={offer.startDateLabel}
                                      onChange={(e) =>
                                        updateOffer(offer.id, {
                                          startDateLabel: e.target.value,
                                        })
                                      }
                                      
                                      className="h-8 text-xs"
                                      placeholder="01.12.2025"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                      Par défaut, c&apos;est le 1er du mois suivant – modifie si nécessaire.
                                    </p>
                                  </div>
                                </div>

                                {/* Ligne 2 : Fin + primes */}
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                  <div className="space-y-1">
                                    <Label>Fin du contrat (jj.mm.aaaa)</Label>
                                    <Input
                                      value={offer.endDateLabel}
                                      onChange={(e) =>
                                        updateOffer(offer.id, {
                                          endDateLabel: e.target.value,
                                        })
                                      }
                                      className="h-8 text-xs"
                                      placeholder="31.12.2055"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Prime annuelle (CHF)</Label>
                                    <Input
                                      type="number"
                                      value={offer.premiumAnnual ?? ""}
                                      onChange={(e) =>
                                        updateOffer(offer.id, {
                                          premiumAnnual: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        })
                                      }
                                      onWheel={(e) => e.currentTarget.blur()}
                                      className="h-8 text-xs"
                                      inputMode="decimal"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Prime mensuelle (CHF)</Label>
                                    <Input
                                      type="number"
                                      value={offer.premiumMonthly ?? ""}
                                      onChange={(e) =>
                                        updateOffer(offer.id, {
                                          premiumMonthly: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        })
                                      }
                                      onWheel={(e) => e.currentTarget.blur()}
                                      className="h-8 text-xs"
                                      inputMode="decimal"
                                    />
                                  </div>
                                </div>

                                {/* Options d'assurance */}
                                <div className="space-y-2 border-t pt-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-[11px]">
                                      Options d&apos;assurance (couvertures + prime)
                                    </Label>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => addCoverage(offer.id)}
                                      className="h-7 px-2 text-[11px]"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Ajouter une couverture
                                    </Button>
                                  </div>
                                  {offer.coverages.length === 0 && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Aucune couverture ajoutée pour l&apos;instant.
                                    </p>
                                  )}
                                  <div className="space-y-2">
                                    {offer.coverages.map((cov) => {
                                      const isWaiver =
                                        cov.label ===
                                        "Libération du paiement des primes";

                                      return (
                                        <div
                                          key={cov.id}
                                          className="grid grid-cols-[1fr,120px,120px,auto] gap-2 items-center"
                                        >
                                          {/* Libellé de couverture */}
                                          <Select
                                            value={cov.label || ""}
                                            onValueChange={(val) => {
                                              const isNowWaiver =
                                                val ===
                                                "Libération du paiement des primes";
                                              updateCoverage(offer.id, cov.id, {
                                                label: val,
                                                // si on passe sur libération → on efface le capital et on met un délai par défaut
                                                sumInsured: isNowWaiver
                                                  ? null
                                                  : cov.sumInsured,
                                                waitingPeriodMonths: isNowWaiver
                                                  ? (12 as 3 | 12 | 24)
                                                  : cov.waitingPeriodMonths ??
                                                    null,
                                              });
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue placeholder="Choisir une couverture" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {COVERAGE_OPTIONS.map((opt) => (
                                                <SelectItem
                                                  key={opt.value}
                                                  value={opt.label}
                                                >
                                                  {opt.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          {/* Colonne 2 : montant ou délai d'attente */}
                                          {isWaiver ? (
                                            <Select
                                              value={
                                                cov.waitingPeriodMonths != null
                                                  ? String(
                                                      cov.waitingPeriodMonths
                                                    )
                                                  : ""
                                              }
                                              onValueChange={(val) =>
                                                updateCoverage(
                                                  offer.id,
                                                  cov.id,
                                                  {
                                                    waitingPeriodMonths:
                                                      Number(val) as
                                                        | 3
                                                        | 12
                                                        | 24,
                                                    sumInsured: null,
                                                  }
                                                )
                                              }
                                            >
                                              <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Délai d'attente" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="3">
                                                  3 mois
                                                </SelectItem>
                                                <SelectItem value="12">
                                                  12 mois
                                                </SelectItem>
                                                <SelectItem value="24">
                                                  24 mois
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <Input
                                              type="number"
                                              value={cov.sumInsured ?? ""}
                                              onChange={(e) =>
                                                updateCoverage(
                                                  offer.id,
                                                  cov.id,
                                                  {
                                                    sumInsured: e.target.value
                                                      ? Number(e.target.value)
                                                      : null,
                                                  }
                                                )
                                              }
                                              onWheel={(e) => e.currentTarget.blur()}
                                              className="h-8 text-xs"
                                              placeholder="Montant assuré"
                                            />
                                          )}

                                          {/* Prime */}
                                          <Input
                                            type="number"
                                            value={cov.premium ?? ""}
                                            onChange={(e) =>
                                              updateCoverage(offer.id, cov.id, {
                                                premium: e.target.value
                                                  ? Number(e.target.value)
                                                  : null,
                                              })
                                            }
                                            onWheel={(e) => e.currentTarget.blur()}
                                            className="h-8 text-xs"
                                            placeholder="Prime/an"
                                          />

                                          {/* Bouton supprimer */}
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() =>
                                              removeCoverage(offer.id, cov.id)
                                            }
                                            className="h-7 w-7 text-red-500"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Questionnaire de santé requis ? */}
                                  <div className="mt-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
                                    <div className="flex flex-col">
                                      <span className="text-[11px] font-medium text-amber-900">
                                        Questionnaire de santé nécessaire
                                      </span>
                                      <span className="text-[10px] text-amber-800/80">
                                        Active si l&apos;assureur exige un questionnaire santé formel pour cette offre.
                                      </span>
                                    </div>
                                    <Switch
                                      checked={offer.healthQuestionnaireRequired === true}
                                      onCheckedChange={(checked: boolean) =>
                                        updateOffer(offer.id, {
                                          healthQuestionnaireRequired: checked,
                                        })
                                      }
                                    />
                                  </div>

                                
                                {/* 🔹 Champ lien questionnaire */}
                                  <div className="mt-2">
                                    <Label className="text-[10px] text-amber-900">
                                      Lien du questionnaire de santé (optionnel)
                                    </Label>
                                    <Input
                                      type="url"
                                      value={offer.healthQuestionnaireUrl ?? ""}
                                      onChange={(e) =>
                                        updateOffer(offer.id, {
                                          healthQuestionnaireUrl: e.target.value.trim() || null,
                                        })
                                      }
                                      className="h-8 text-[11px]"
                                      placeholder="https://..."
                                    />
                                    <p className="mt-1 text-[10px] text-amber-800/80">
                                      Colle ici le lien AXA Aura, Swiss Life, etc. S&apos;affichera au client si le questionnaire est requis.
                                    </p>
                                  </div>

                                {/* 🔹 TAN Swiss Life (par défaut = 4 derniers chiffres du téléphone) */}
                                  {offer.insurer === "Swiss Life" && offer.healthQuestionnaireRequired === true && (
                                    <div className="mt-2">
                                      <Label className="text-[10px] text-amber-900">
                                        TAN (Swiss Life) — par défaut: 4 derniers chiffres du téléphone
                                      </Label>
                                      <Input
                                        value={
                                          offer.healthQuestionnaireTan ??
                                          defaultTanFromPhone(data?.contact?.phone) ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          updateOffer(offer.id, {
                                            healthQuestionnaireTan: e.target.value.trim() || null,
                                          })
                                        }
                                        className="h-8 text-[11px]"
                                        placeholder="ex. 1234"
                                        inputMode="numeric"
                                      />
                                      <p className="mt-1 text-[10px] text-amber-800/80">
                                        Modifiable par le collaborateur (sert plus tard dans le flow Swiss Life).
                                      </p>
                                    </div>
                                  )}

                                {/* 🔹 Swiss Life — Lien documents à signer + PIN */}
                                  {offer.insurer === "Swiss Life" && (
                                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
                                      <p className="text-[11px] font-medium text-slate-900">
                                        Swiss Life — Documents à signer
                                      </p>

                                      <div className="mt-2 space-y-1">
                                        <Label className="text-[10px] text-slate-900">URL (documents à signer)</Label>
                                        <Input
                                          type="url"
                                          value={offer.signingDocsUrl ?? ""}
                                          onChange={(e) =>
                                            updateOffer(offer.id, {
                                              signingDocsUrl: e.target.value.trim() || null,
                                            })
                                          }
                                          className="h-8 text-[11px]"
                                          placeholder="https://..."
                                        />
                                      </div>

                                      <div className="mt-2 space-y-1">
                                        <Label className="text-[10px] text-slate-900">PIN (4 chiffres)</Label>
                                        <Input
                                          value={offer.signingDocsPin ?? ""}
                                          onChange={(e) =>
                                            updateOffer(offer.id, {
                                              signingDocsPin: e.target.value.replace(/\D/g, "").slice(0, 4) || null,
                                            })
                                          }
                                          className="h-8 text-[11px]"
                                          placeholder="____"
                                          inputMode="numeric"
                                        />
                                        <p className="mt-1 text-[10px] text-slate-700/80">
                                          Laisser vide si non requis.
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                {/* Capital projeté à l'échéance */}
                                <div className="space-y-2 border-t pt-3">
                                  <Label className="text-[11px]">
                                    Capital projeté à l&apos;échéance (scénario
                                    modéré)
                                  </Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <span className="text-[11px] text-muted-foreground">
                                        Valeur modérée (CHF)
                                      </span>
                                      <Input
                                        type="number"
                                        value={
                                          offer.projectedModerateAmount ?? ""
                                        }
                                        onChange={(e) =>
                                          updateOffer(offer.id, {
                                            projectedModerateAmount:
                                              e.target.value
                                                ? Number(e.target.value)
                                                : null,
                                          })
                                        }
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className="h-8 text-xs"
                                        placeholder="p.ex. 250000"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[11px] text-muted-foreground">
                                        Taux de rendement (en %)
                                      </span>
                                      <Input
                                        type="number"
                                        value={
                                          offer.projectedModerateRatePct ?? ""
                                        }
                                        onChange={(e) =>
                                          updateOffer(offer.id, {
                                            projectedModerateRatePct:
                                              e.target.value
                                                ? Number(e.target.value)
                                                : null,
                                          })
                                        }
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className="h-8 text-xs"
                                        placeholder="p.ex. 3.0"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Valeurs de rachat – tableaux style AXA / Swiss Life */}
<div className="space-y-4 border-t pt-3">
  {/* Tableau normal */}
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px]">
        Valeurs de rachat projetées (par date)
      </Label>
      <div className="flex items-center gap-2">
        {/* Input fichier VR caché */}
        <input
          id={`offer-vr-file-${offer.id}`}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              console.log(
                "[IMPORT VR PDF] Start for offerId =",
                offer.id,
                "file =",
                file
              );
              handleImportVRPdf(offer.id, file);
              e.target.value = "";
            }
          }}
        />

        {/* Bouton Upload VR */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={importingVROfferId === offer.id}
          onClick={() => {
            const input = document.getElementById(
              `offer-vr-file-${offer.id}`
            ) as HTMLInputElement | null;
            if (input) {
              input.click();
            }
          }}
        >
          {importingVROfferId === offer.id ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Import VR…
            </>
          ) : (
            <>
              <UploadCloud className="h-3 w-3 mr-1" />
              Importer VR (PDF)
            </>
          )}
        </Button>

        {/* Bouton Ajouter ligne manuelle */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addSurrenderRow(offer.id)}
          className="h-7 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3 mr-1" />
          Ajouter une ligne
        </Button>
      </div>
    </div>

    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="text-[10px] text-muted-foreground">
            <TableHead className="w-[130px]">Date</TableHead>
            <TableHead>Pessimiste</TableHead>
            <TableHead>Modéré</TableHead>
            <TableHead>Optimiste</TableHead>
            <TableHead>Transformation garantie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {offer.surrenderValues.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="align-middle">
                <Input
                  value={row.dateLabel}
                  onChange={(e) =>
                    updateSurrenderDateLabel(
                      offer.id,
                      row.id,
                      e.target.value
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="01.12.2026"
                  className="h-8 text-[11px]"
                />
              </TableCell>
              <TableCell className="align-middle">
                <Input
                  type="number"
                  value={row.pess ?? ""}
                  onChange={(e) =>
                    updateSurrenderCell(
                      offer.id,
                      row.id,
                      "pess",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-8 text-[11px]"
                  inputMode="decimal"
                />
              </TableCell>
              <TableCell className="align-middle">
                <Input
                  type="number"
                  value={row.mid ?? ""}
                  onChange={(e) =>
                    updateSurrenderCell(
                      offer.id,
                      row.id,
                      "mid",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-8 text-[11px]"
                  inputMode="decimal"
                />
              </TableCell>
              <TableCell className="align-middle">
                <Input
                  type="number"
                  value={row.opt ?? ""}
                  onChange={(e) =>
                    updateSurrenderCell(
                      offer.id,
                      row.id,
                      "opt",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-8 text-[11px]"
                  inputMode="decimal"
                />
              </TableCell>
              <TableCell className="align-middle">
                <Input
                  type="number"
                  value={row.guaranteed ?? ""}
                  onChange={(e) =>
                    updateSurrenderCell(
                      offer.id,
                      row.id,
                      "guaranteed",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="h-8 text-[11px]"
                  inputMode="decimal"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    <p className="text-[10px] text-muted-foreground">
      Les projections pessimiste / modéré / optimiste et les valeurs de
      transformation garanties sont saisies ici à partir de l&apos;offre de
      la compagnie (p. ex. tableau AXA ou Swiss Life).
    </p>
  </div>

  {/* Tableau EPL – seulement si des lignes existent */}
  {offer.surrenderValuesEpl && offer.surrenderValuesEpl.length > 0 && (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px]">
          Valeurs de rachat projetées – Privilèges EPL (Swiss Life)
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addSurrenderRowEpl(offer.id)}
          className="h-7 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3 mr-1" />
          Ajouter une ligne EPL
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="text-[10px] text-muted-foreground">
              <TableHead className="w-[130px]">Date</TableHead>
              <TableHead>Pessimiste</TableHead>
              <TableHead>Modéré</TableHead>
              <TableHead>Optimiste</TableHead>
              <TableHead>Transformation garantie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offer.surrenderValuesEpl.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="align-middle">
                  <Input
                    value={row.dateLabel}
                    onChange={(e) =>
                      updateSurrenderDateLabelEpl(
                        offer.id,
                        row.id,
                        e.target.value
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="01.12.2026"
                    className="h-8 text-[11px]"
                  />
                </TableCell>
                <TableCell className="align-middle">
                  <Input
                    type="number"
                    value={row.pess ?? ""}
                    onChange={(e) =>
                      updateSurrenderCellEpl(
                        offer.id,
                        row.id,
                        "pess",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-8 text-[11px]"
                    inputMode="decimal"
                  />
                </TableCell>
                <TableCell className="align-middle">
                  <Input
                    type="number"
                    value={row.mid ?? ""}
                    onChange={(e) =>
                      updateSurrenderCellEpl(
                        offer.id,
                        row.id,
                        "mid",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-8 text-[11px]"
                    inputMode="decimal"
                  />
                </TableCell>
                <TableCell className="align-middle">
                  <Input
                    type="number"
                    value={row.opt ?? ""}
                    onChange={(e) =>
                      updateSurrenderCellEpl(
                        offer.id,
                        row.id,
                        "opt",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-8 text-[11px]"
                    inputMode="decimal"
                  />
                </TableCell>
                <TableCell className="align-middle">
                  <Input
                    type="number"
                    value={row.guaranteed ?? ""}
                    onChange={(e) =>
                      updateSurrenderCellEpl(
                        offer.id,
                        row.id,
                        "guaranteed",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-8 text-[11px]"
                    inputMode="decimal"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Ce tableau correspond aux &quot;Valeurs de rachat partiel maximales
        privilégiées&quot; utilisées pour les retraits EPL chez Swiss Life.
      </p>
    </div>
  )}
</div>

                                {/* Pièces jointes (PDF, images, etc.) */}
                                <div className="space-y-2 border-t pt-3">
  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
    <div className="space-y-1">
      <Label className="text-[11px]">
        Pièces jointes (offre PDF, annexes, etc.)
      </Label>
      <p className="text-[10px] text-muted-foreground">
        Choisis d&apos;abord la catégorie, puis ajoute le fichier (PDF, image…).
      </p>
    </div>

    <div className="flex items-center gap-2">
      {/* 🔹 Select catégorie */}
      <Select
        value={attachmentCategoryByOffer[offer.id] ?? ""}
        onValueChange={(val) =>
          setAttachmentCategoryByOffer((prev) => ({
            ...prev,
            [offer.id]: val as AttachmentCategory,
          }))
        }
      >
        <SelectTrigger className="h-8 w-[180px] text-[11px]">
          <SelectValue placeholder="Catégorie" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="offre">Offre</SelectItem>
          <SelectItem value="conditions_generales">Conditions générales</SelectItem>
          <SelectItem value="signature">Documents de signature</SelectItem>
          <SelectItem value="autres">Autres</SelectItem>
        </SelectContent>
      </Select>

      {/* Input fichier + bouton */}
      <div>
        <input
          id={`offer-attachment-${offer.id}`}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const category = attachmentCategoryByOffer[offer.id];
            if (file && category) {
              handleUploadOfferAttachment(offer.id, file, category);
            }
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={
            uploadingAttachmentOfferId === offer.id ||
            !attachmentCategoryByOffer[offer.id] // 🔹 blocage si pas de catégorie
          }
          onClick={() => {
            const input = document.getElementById(
              `offer-attachment-${offer.id}`
            ) as HTMLInputElement | null;
            if (input) {
              input.click();
            }
          }}
        >
          {uploadingAttachmentOfferId === offer.id ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Upload…
            </>
          ) : (
            <>
              <UploadCloud className="mr-1 h-3 w-3" />
              Ajouter une pièce jointe
            </>
          )}
        </Button>
      </div>
    </div>
  </div>

                                  {(!offer.attachments || offer.attachments.length === 0) && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Aucune pièce jointe pour l&apos;instant. Ajoute par exemple
                                      le PDF complet de l&apos;offre de la compagnie.
                                    </p>
                                  )}

                                  {offer.attachments && offer.attachments.length > 0 && (
                                    <div className="space-y-2">
                                      {offer.attachments.map((att) => (
                                        <div
                                          key={att.id}
                                          className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5"
                                        >
                                          {/* Badge catégorie */}
                                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                              {att.category === "offre" && "Offre"}
                                              {att.category === "conditions_generales" && "Conditions générales"}
                                              {att.category === "signature" && "Documents de signature"}
                                              {att.category === "autres" && "Autres"}
                                            </span>
                                          <div className="flex-1 flex flex-col gap-1">
                                            <Input
                                              className="h-7 text-[11px]"
                                              value={att.name}
                                              onChange={(e) =>
                                                updateAttachmentName(
                                                  offer.id,
                                                  att.id,
                                                  e.target.value
                                                )
                                              }
                                              placeholder="Nom de la pièce jointe"
                                            />
                                            <p className="text-[10px] text-muted-foreground truncate">
                                              {att.storagePath}
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="text-[11px]"
                                            onClick={() => handleOpenOfferAttachment(att)}
                                          >
                                            Voir le fichier
                                          </Button>
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 text-red-500"
                                            onClick={() =>
                                              removeAttachment(offer.id, att.id)
                                            }
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <p className="text-[10px] text-muted-foreground">
                                    Ces pièces seront disponibles pour le client dans son espace
                                    (téléchargement). Tu peux renommer chaque pièce jointe
                                    pour qu&apos;elle soit compréhensible (p. ex. « Offre complète AXA 3a »).
                                  </p>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>

                    {/* Barre d’actions Save / Send */}
                    <div className="mt-4 border-t pt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        {offersState === "sent"
                          ? "Offres envoyées au client. Toute modification nécessite un nouvel envoi."
                          : offersState === "saved"
                          ? "Offres sauvegardées en brouillon. Non visibles par le client."
                          : "Les offres ne sont pas encore sauvegardées dans le dossier."}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSaveOffers}
                          disabled={offers.length === 0 || savingOffers}
                          className="flex items-center gap-1 text-[11px]"
                        >
                          {savingOffers && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {savingOffers ? "Sauvegarde..." : "Sauvegarder (brouillon)"}
                        </Button>
                        <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={handleOpenSendDialog}
                              disabled={offers.length === 0 || sendingOffers}
                              className="flex items-center gap-1 text-[11px]"
                            >
                              {sendingOffers && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              {sendingOffers
                                ? "Envoi en cours..."
                                : "Envoyer au client"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent
                            className="
                              animate-in 
                              fade-in-0 
                              slide-in-from-bottom-4 
                              duration-150
                            "
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {sendValidationErrors.length > 0
                                  ? "Champs manquants avant l'envoi"
                                  : sendWarnings.length > 0
                                  ? "Envoyer sans couvertures de risque ?"
                                  : "Envoyer les offres au client ?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2">
                              {sendValidationErrors.length > 0 ? (
                                <>
                                  <p className="text-[12px]">
                                    Certaines informations sont manquantes ou incomplètes. Merci de corriger avant d&apos;envoyer les offres au client :
                                  </p>
                                  <ul className="list-disc pl-4 text-[12px] space-y-1">
                                    {sendValidationErrors.map((err, i) => (
                                      <li key={i}>{err}</li>
                                    ))}
                                  </ul>
                                </>
                              ) : sendWarnings.length > 0 ? (
                                <>
                                  <p className="text-[12px]">
                                    Vous êtes sur le point d&apos;envoyer des offres sans aucune couverture de risque (uniquement épargne) pour :
                                  </p>
                                  <ul className="list-disc pl-4 text-[12px] space-y-1">
                                    {sendWarnings.map((warn, i) => (
                                      <li key={i}>{warn}</li>
                                    ))}
                                  </ul>
                                  <p className="text-[12px]">
                                    Confirme que c&apos;est bien ce que tu souhaites avant d&apos;envoyer au client.
                                  </p>
                                </>
                              ) : (
                                <p className="text-[12px]">
                                  Le client pourra consulter ces offres dans son espace en ligne.
                                  Assure-toi que les montants et les compagnies sont corrects avant de confirmer.
                                </p>
                              )}
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={sendValidationErrors.length > 0 || sendingOffers}
                                onClick={async () => {
                                  await handleSendOffers();
                                  setSendDialogOpen(false);
                                }}
                              >
                                {sendingOffers
                                  ? "Envoi en cours..."
                                  : "Confirmer l'envoi"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* TODO plus tard : bloc Offres internes / saisie manuelle */}
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}