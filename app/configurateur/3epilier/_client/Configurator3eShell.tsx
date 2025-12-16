// app/configurateur/3epilier/_client/Configurator3eShell.tsx
"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  PiggyBank,
  TrendingUp,
  ShieldCheck,
  UserRoundCheck,
  CheckCircle2,
  HeartPulse,
} from "lucide-react";

import SpinCardLoader from "@/app-components/SpinCardLoader";

import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, limit, orderBy, query, doc, setDoc } from "firebase/firestore";

import { subscribeDonneesPersonnelles } from "@/lib/data/donneesPersonnelles";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";

import { HealthWizardShell } from "./health-wizard/HealthWizardShell";

import type {
  Config_3e_Pilier,
  Config_3e_Type,
  ClientData,
  Legal_Settings,
} from "@/lib/core/types";

import {
  computeRiskAndSavings,
  type RiskPricingContext,
  getAgeAtDate,
} from "@/lib/calculs/3epilier";

import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import { computeInvaliditeMaladie } from "@/lib/calculs/events/invaliditeMaladie";
import { computeInvaliditeAccident } from "@/lib/calculs/events/invaliditeAccident";
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import { normalizeDateMask, isValidDateMask } from "@/lib/core/dates";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { Progress } from "@/components/ui/progress";



// === Légal 2025 (identique à /profil/results) ===
const { meta } = Legal_Echelle44_2025;

const DEFAULT_LEGAL_2025: Legal_Settings = {
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
  Legal_ijAccidentTaux: 80,
  Legal_BTE_AnnualCredit: meta?.Legal_EduCreditCHF ?? 45_360,
  Legal_BTA_AnnualCredit: meta?.Legal_CareCreditCHF ?? 45_360,
  Legal_BTE_SplitMarried: 0.5,
};

type AnalysisGapPoint = {
  year: number;
  age: number;
  annualGap: number; // CHF/an (>=0)
};

type AnalysisGaps = {
  invalidity: AnalysisGapPoint[];      // lacunes IG maladie/accident
  death: AnalysisGapPoint[];           // lacunes décès maladie/accident
  deathExistingLumpSum: number;        // capitaux déjà versés en cas de décès
};

function birthYearFromMask(mask?: string) {
  if (!mask || !isValidDateMask(mask)) return undefined;
  const [dd, mm, yyyy] = normalizeDateMask(mask).split(".");
  return Number(yyyy);
}

function currentYear() {
  return new Date().getFullYear();
}

function yearDate(y: number) {
  return new Date(y, 0, 1);
}

/**
 * Reconstruit les lacunes Invalidité / Décès à partir des calculs métier,
 * sans avoir besoin d'afficher les matrices.
 *
 * ⚠️ On suppose que client.Enter_salaireAnnuel est bien rempli.
 */
/**
 * Reconstruit les lacunes Invalidité / Décès à partir des calculs métier,
 * sans avoir besoin d'afficher les matrices.
 *
 * ⚠️ On suppose que client.Enter_salaireAnnuel est bien rempli.
 */
function buildAnalysisGapsForClient(client: ClientData | any): AnalysisGaps | null {
  if (!client) return null;

  const legal = DEFAULT_LEGAL_2025;
  const need = client.Enter_salaireAnnuel ?? 0;
  if (!need || need <= 0) return null;

  const by = birthYearFromMask(client.Enter_dateNaissance);
  const startY = currentYear();
  const endY = Math.max(
    startY,
    (by ?? startY) + legal.Legal_AgeRetraiteAVS
  );
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  /* ----------------------- INVALIDITÉ (Maladie / Accident) ---------------------- */
  const invalidity: AnalysisGapPoint[] = [];

  years.forEach((y) => {
    const ref = yearDate(y);

    // Accident – phase rentes uniquement (on ignore les IJ)
    const resAcc = computeInvaliditeAccident(
      client,
      legal,
      Legal_Echelle44_2025.rows,
      { referenceDate: ref }
    );
    const aiAcc = resAcc.phaseRente.annual.aiTotal;
    const lppAcc = resAcc.phaseRente.annual.lppAfterCap;
    const laaAcc = resAcc.phaseRente.annual.laaAfterCap;
    const totalAcc = aiAcc + lppAcc + laaAcc;
    const gapAcc = need - totalAcc;

    // Maladie – phase rentes uniquement (on ignore les IJ)
    const resMal = computeInvaliditeMaladie(
      ref,
      client,
      legal,
      Legal_Echelle44_2025.rows
    );
    const annualMal = resMal.phaseRente.annual as any;
    const aiMal = annualMal.aiTotal ?? annualMal.ai ?? 0;
    const lppMal =
      (annualMal.lppInvalidite ?? 0) + (annualMal.lppEnfants ?? 0);
    const totalMal = aiMal + lppMal;
    const gapMal = need - totalMal;

    // 👇 On prend la plus grande lacune des deux (jamais négative)
    const combinedGap = Math.max(0, gapAcc, gapMal);
    const age = by != null ? y - by : 0;

    invalidity.push({
      year: y,
      age,
      annualGap: combinedGap,
    });
  });

  /* ----------------------------- DÉCÈS (identique) ----------------------------- */
  const death: AnalysisGapPoint[] = [];
  const deathRef = new Date();
  const capitalYear = startY;
  let existingLumpSum = 0;

  years.forEach((y, idx) => {
    // Accident
    const resAcc = computeDecesAccident(
      deathRef,
      client,
      legal,
      Legal_Echelle44_2025.rows,
      { paymentRef: yearDate(y) }
    );
    const aiAcc = resAcc.annual.avs;
    const lppAcc = resAcc.annual.lppAfterCap;
    const laaAcc = resAcc.annual.laaAfterCap;
    const totalAcc = aiAcc + lppAcc + laaAcc;
    const gapAcc = need - totalAcc;
    const capAcc =
      y === capitalYear ? resAcc.capitals.totalCapitalsAccident ?? 0 : 0;

    // Maladie
    const resMal = computeDecesMaladie(
      deathRef,
      client,
      legal,
      Legal_Echelle44_2025.rows,
      { paymentRef: yearDate(y) }
    );
    const aiMal = resMal.annual.avs;
    const lppMal = resMal.annual.lppRentes;
    const totalMal = aiMal + lppMal;
    const gapMal = need - totalMal;
    const capMal =
      y === capitalYear ? resMal.capitals.totalCapitalsMaladie ?? 0 : 0;

    if (idx === 0) {
      existingLumpSum = capAcc + capMal;
    }

    const combinedGap = Math.max(0, gapAcc, gapMal);
    const age = by != null ? y - by : 0;

    death.push({
      year: y,
      age,
      annualGap: combinedGap,
    });
  });

  return {
    invalidity,
    death,
    deathExistingLumpSum: existingLumpSum,
  };
}

/**
 * Construit des rentes IG (principale + différées) à partir des lacunes.
 */
/**
 * Construit des rentes IG (principale + différées) à partir des lacunes.
 *
 * Contraintes :
 * - chaque rente a un montant STRICTEMENT supérieur à la précédente
 * - chaque rente commence à un âge STRICTEMENT supérieur à la précédente
 * - les rentes se cumulent pour essayer de suivre l'évolution des lacunes
 */
function buildInvalidityRentesFromGaps(
  gaps: AnalysisGapPoint[],
  currentAge: number,
  endAge: number | null
): { annualRente: number; startAge: number; waitingPeriod: 3 | 12 | 24 }[] {
  if (!gaps.length || !endAge || !Number.isFinite(endAge)) return [];

  // On ne garde que :
  // - des âges raisonnables (après entrée dans le contrat)
  // - au moins 2 ans avant la fin du contrat
  // - des lacunes significatives (> 1'000)
  const relevant = gaps
    .filter(
      (g) =>
        Number.isFinite(g.age) &&
        g.age >= currentAge + 2 &&
        g.age <= endAge - 2 &&
        (g.annualGap || 0) > 1000
    )
    .sort((a, b) => a.age - b.age);

  if (!relevant.length) return [];

  const MIN_RENTE = 6000;
  const MIN_DELTA_GAP = 1000; // ⬅ seuil que tu as demandé
  const round1k = (x: number) => Math.round(x / 1000) * 1000;

  const maxAllowedStart = endAge - 2;
  const wait: 3 | 12 | 24 = 24;
  const minStartFromWait = currentAge + Math.ceil(wait / 12);

  const rentes: {
    annualRente: number;
    startAge: number;
    waitingPeriod: 3 | 12 | 24;
  }[] = [];

  // --- 1) Rente principale : on prend la première vraie lacune ---
  const first = relevant[0];

  let mainAmount = round1k(first.annualGap);
  if (mainAmount < MIN_RENTE) mainAmount = MIN_RENTE;

  let mainStartAge = Math.min(
    Math.max(first.age, minStartFromWait),
    maxAllowedStart
  );

  if (mainStartAge >= endAge) {
    // Trop tard pour démarrer une rente crédible
    return [];
  }

  rentes.push({
    annualRente: mainAmount,
    startAge: mainStartAge,
    waitingPeriod: wait,
  });

  // Références pour la suite
  let lastRenteAmount = mainAmount;
  let lastRenteStartAge = mainStartAge;
  let lastRefGap = first.annualGap;

  // --- 2) Rentes différées : dès que la lacune se creuse de ≥ 1'000 CHF/an ---
  for (const point of relevant.slice(1)) {
    const targetGap = point.annualGap || 0;
    const targetAge = point.age;

    if (targetAge >= endAge - 2) continue;

    const deltaGap = targetGap - lastRefGap;

    // Si la lacune ne s'est pas creusée d'au moins 1'000 CHF/an → on ignore
    if (deltaGap < MIN_DELTA_GAP) continue;

    // Montant = lacune de ce moment (arrondie), pas un "complément"
    let newAmount = round1k(targetGap);
    if (newAmount < MIN_RENTE) newAmount = MIN_RENTE;

    // Respect : nouvelle rente > précédente (strictement)
    if (newAmount <= lastRenteAmount) {
      newAmount = lastRenteAmount + 1000;
    }

    // Âge de début :
    // - au moins l'âge de la lacune
    // - au moins 1 an après la rente précédente
    // - après le délai d'attente
    let newStartAge = Math.max(
      targetAge,
      lastRenteStartAge + 1,
      minStartFromWait
    );

    if (newStartAge >= endAge - 2) {
      // Trop tard → pas de nouvelle rente
      continue;
    }

    rentes.push({
      annualRente: newAmount,
      startAge: newStartAge,
      waitingPeriod: wait,
    });

    // Mise à jour des références pour les prochaines rentes
    lastRenteAmount = newAmount;
    lastRenteStartAge = newStartAge;
    lastRefGap = targetGap;
  }

  return rentes;
}

/**
 * Capital décès recommandé à partir des lacunes :
 * - lacune annuelle max × 5
 * - − capitaux existants
 * - jamais < 0
 */
function buildDeathCapitalFromGaps(
  gaps: AnalysisGapPoint[],
  existingLumpSum: number
): number {
  if (!gaps.length) return 0;
  const maxAnnualGap = Math.max(...gaps.map((g) => g.annualGap || 0));
  const raw = maxAnnualGap * 5;
  return Math.max(0, raw - (existingLumpSum || 0));
}


function createNewConfigId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // Navigateur moderne
    
    return crypto.randomUUID();
  }
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialConfig(): Config_3e_Pilier {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const startDate = `${yyyy}-${mm}-${dd}`;

  return {
    id: createNewConfigId(),
    clientUid: "",
    type: "3a",
    offerName: "Offre 1",
    premiumAmount: 300,
    premiumFrequency: "monthly",
    startDate,
    endAge: 65,
    deathFixed: {
      enabled: false,
      capital: 0,
    },
    deathDecreasing: {
      enabled: false,
      capitalInitial: 0,
      durationYears: 20,
    },
    disabilityAnnuities: [],
    premiumWaiver: {
      enabled: false,
      waitingPeriod: 12,
    },
    savings: {
      withFunds: true,
      investmentProfile: "balanced",
      expectedReturnPct: 3,
      transferAmount3a: 0,
    },
    healthStatus: "not_required",
    healthNotes: "",
    healthQA: [],
    totalRiskPremium: 0,
    netSavingsPremium: 300,
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function getPremiumBounds(
  type: Config_3e_Type,
  freq: "monthly" | "yearly"
): { min: number; max: number } {
  if (type === "3a") {
    return freq === "monthly"
      ? { min: 50, max: 604.8 }
      : { min: 600, max: 7258 };
  }
  // 3b
  return freq === "monthly"
    ? { min: 50, max: 5000 }
    : { min: 600, max: 60000 };
}

function getMaxAge(type: Config_3e_Type): number {
  // Âge max du client pour validation (pas l'âge de fin de contrat)
  return type === "3a" ? 60 : 65;
}

function formatDateDotted(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}



function normalizeBirthdateToIso(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();

  // Si c'est déjà du YYYY-MM-DD, on laisse tel quel
  if (trimmed.includes("-")) {
    return trimmed;
  }

  // Gérer formats type "dd.MM.yyyy" ou "dd/MM/yyyy"
  const parts = trimmed.split(/[./]/);
  if (parts.length === 3) {
    const [dStr, mStr, yStr] = parts;
    const d = Number(dStr);
    const m = Number(mStr);
    let y = Number(yStr);

    if (y < 100) {
      // Cas d'une année sur 2 chiffres (très rare)
      y += y > 30 ? 1900 : 2000;
    }

    const yyyy = String(y).padStart(4, "0");
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  }

  return trimmed;
}


// Retourne true si la chaîne contient au moins un numéro (ex. "Rue X 12" -> true)
function hasStreetNumber(street?: string): boolean {
  if (!street) return false;
  // On vérifie la présence d'un chiffre suivi éventuellement d'une lettre (ex. 12, 12A, 12-14)
  return /\d+([ -]?[A-Za-z]?\d*)?$/.test(street.trim());
}

// --- Questionnaire Profil Investisseur (IA) ---
const buildInvestorQuestions = (clientData: any) => {
  const salaireAnnuel = Number(
    clientData?.Enter_salaireAnnuel ??
      clientData?.SalaireAnnuel ??
      clientData?.annualIncome ??
      0
  );

  const base10 = Math.round((salaireAnnuel / 12) * 0.1);
  const base20 = Math.round((salaireAnnuel / 12) * 0.2);

  return [
    {
      id: "experience_actions",
      label:
        "Avez-vous des connaissances et de l’expérience dans le domaine des actions ?",
      options: [
        {
          id: "yes",
          label:
            "Oui, j’ai déjà des connaissances et de l’expérience dans le domaine des actions.",
        },
        {
          id: "no",
          label:
            "Non, je n’ai aucune connaissance ni expérience dans le domaine des actions.",
        },
      ],
    },
    {
      id: "revenu_annuel",
      label:
        "Quel est votre revenu annuel brut provenant de votre activité lucrative ou d'autres sources régulières ?",
      options: [
        { id: "0_30", label: "Entre CHF 0 et CHF 29 999" },
        { id: "30_75", label: "Entre CHF 30 000 et CHF 74 999" },
        { id: "75_149", label: "Entre CHF 75 000 et CHF 149 000" },
        { id: "150_250", label: "Entre CHF 150 000 et CHF 250 000" },
        { id: "250_plus", label: "Plus de 250 000" },
      ],
    },
    {
      id: "revenu_evolution",
      label: "Selon vous, comment vos revenus vont-ils évoluer ces trois prochaines années ?",
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
      label: "Combien pouvez-vous épargner tous les mois ?",
      options: [
        { id: "none", label: "Je n’arrive pas à mettre de l’argent de côté" },
        {
          id: "lt10",
          label: `Moins de ${base10.toLocaleString("fr-CH")} CHF par mois`,
        },
        {
          id: "10_20",
          label: `Entre ${base10.toLocaleString("fr-CH")} et ${base20.toLocaleString("fr-CH")} CHF par mois`,
        },
        {
          id: "gt20",
          label: `Plus de ${base20.toLocaleString("fr-CH")} CHF par mois`,
        },
      ],
    },
    {
      id: "fortune_totale",
      label:
        "À combien s’élève votre fortune totale (biens immobiliers inclus, sans déduire dettes) ?",
      options: [
        { id: "none", label: "Je n’ai pas de fortune" },
        { id: "lt50", label: "Moins de CHF 50 000" },
        { id: "50_249", label: "Entre CHF 50 000 et CHF 249 999" },
        { id: "250_999", label: "Entre CHF 250 000 et CHF 999 999" },
        { id: "1_3m", label: "Entre CHF 1 Mio. et CHF 3 Mio." },
        { id: "gt3m", label: "Plus de CHF 3 Mio." },
      ],
    },
    {
      id: "dettes_totales",
      label:
        "À combien s’élèvent vos dettes (hypothèques et dettes privées incluses) ?",
      options: [
        { id: "none", label: "Je n’ai pas de dettes" },
        { id: "lt50", label: "Moins de CHF 50 000" },
        { id: "50_249", label: "Entre CHF 50 000 et CHF 249 999" },
        { id: "250_999", label: "Entre CHF 250 000 et CHF 999 999" },
        { id: "1_3m", label: "Entre CHF 1 Mio. et CHF 3 Mio." },
        { id: "gt3m", label: "Plus de CHF 3 Mio." },
      ],
    },
    {
      id: "depenses_importantes",
      label:
        "Prévoyez-vous des dépenses importantes ces prochaines années nécessitant de puiser dans votre épargne ?",
      options: [
        { id: "yes", label: "Oui" },
        { id: "no", label: "Non" },
      ],
    },
    {
      id: "securite_reserve",
      label:
        "Pendant combien de temps votre réserve de sécurité vous permet de vivre ?",
      options: [
        { id: "lt3", label: "Moins de 3 mois" },
        { id: "3_6", label: "Entre 3 et 6 mois" },
        { id: "7_12", label: "Entre 7 et 12 mois" },
        { id: "gt12", label: "Plus de 12 mois" },
      ],
    },
    {
      id: "dependants",
      label: "Combien de personnes dépendent financièrement de vous ?",
      options: [
        { id: "0", label: "Aucune" },
        { id: "1", label: "1" },
        { id: "2_3", label: "2 ou 3" },
        { id: "4_5", label: "4 ou 5" },
        { id: "gt5", label: "Plus de 5" },
      ],
    },

    // 🔹 NOUVELLES QUESTIONS — AVANT DURABILITÉ

    {
      id: "but_investissement",
      label: "Quel est le but de votre investissement ? (propension au risque)",
      options: [
        {
          id: "secure",
          label:
            "Le risque de perte doit être aussi faible que possible. Réaliser des gains n’est pas ma priorité.",
        },
        {
          id: "moderate",
          label:
            "Je suis prêt à accepter un certain risque de perte pour profiter de perspectives de gains modérées.",
        },
        {
          id: "aggressive",
          label:
            "Je suis prêt à prendre un risque de perte élevé pour réaliser des gains potentiellement importants.",
        },
      ],
    },
    {
      id: "choix_gain_perte",
      label:
        "En admettant qu’il existe des possibilités de placement offrant les rendements suivants, quelle solution choisiriez-vous ?",
      options: [
        {
          id: "p1",
          label: "Perte possible -1%, gain possible : +1%",
        },
        {
          id: "p2",
          label: "Perte possible -3%, gain possible : +5%",
        },
        {
          id: "p3",
          label: "Perte possible -8%, gain possible : +12%",
        },
        {
          id: "p4",
          label: "Perte possible -13%, gain possible : +19%",
        },
        {
          id: "p5",
          label: "Perte possible -18%, gain possible : +26%",
        },
      ],
    },
    {
      id: "reaction_perte10",
      label:
        "Imaginez que l’un de vos investissements perde 10% de sa valeur en l’espace de quelques mois. Comment réagissez-vous ?",
      options: [
        {
          id: "sell_all",
          label:
            "Je vends tout afin d’éviter une perte encore plus importante.",
        },
        {
          id: "sell_some",
          label:
            "Je vends une partie afin de limiter mes pertes si les cours continuent de baisser.",
        },
        {
          id: "hold",
          label:
            "Je ne fais rien pour l’instant, car je sais que les marchés peuvent être soumis à des fluctuations.",
        },
        {
          id: "buy_more",
          label:
            "J’investis davantage d’argent, car je vois là une opportunité de gagner de l’argent.",
        },
      ],
    },
    {
      id: "horizon_placement",
      label: "Quel est votre horizon de placement ?",
      options: [
        { id: "lt15", label: "14 ans maximum" },
        { id: "gte15", label: "15 ans ou plus" },
      ],
    },

    // 🔹 PRÉFÉRENCES PAR THÈMES DE PLACEMENT

    {
      id: "theme_us_tech",
      label:
        "Tech américaine (Apple, Nvidia, Microsoft, Google, Tesla, …)",
      options: [
        {
          id: "like",
          label: "👍 J’aime bien ce type de placements",
        },
        {
          id: "dislike",
          label: "👎 Je n’aime pas trop ce thème",
        },
        {
          id: "neutral",
          label: "😐 Pas d’avis particulier",
        },
      ],
    },
    {
      id: "theme_ch_equity",
      label:
        "100% Suisse (Nestlé, Roche, Julius Baer, Novartis, Lonza, …)",
      options: [
        {
          id: "like",
          label: "👍 J’aime bien ce type de placements",
        },
        {
          id: "dislike",
          label: "👎 Je n’aime pas trop ce thème",
        },
        {
          id: "neutral",
          label: "😐 Pas d’avis particulier",
        },
      ],
    },
    {
      id: "theme_net_zero",
      label:
        "Net zéro émissions / transition énergétique (Nvidia, Apple, Microsoft, Visa, Itron, …)",
      options: [
        {
          id: "like",
          label: "👍 J’aime bien ce type de placements",
        },
        {
          id: "dislike",
          label: "👎 Je n’aime pas trop ce thème",
        },
        {
          id: "neutral",
          label: "😐 Pas d’avis particulier",
        },
      ],
    },
    {
      id: "theme_ch_real_estate",
      label: "Immobilier Suisse (fonds immobiliers, sociétés immobilières, …)",
      options: [
        {
          id: "like",
          label: "👍 J’aime bien ce type de placements",
        },
        {
          id: "dislike",
          label: "👎 Je n’aime pas trop ce thème",
        },
        {
          id: "neutral",
          label: "😐 Pas d’avis particulier",
        },
      ],
    },

    // 🔹 QUESTION EXISTANTE — DURABILITÉ

    {
      id: "durabilite",
      label: "Des aspects de durabilité doivent-ils être pris en compte ?",
      options: [
        { id: "none", label: "Aucune préférence" },
        {
          id: "esg",
          label:
            "Oui, critères ESG (Environnement, Social, Gouvernance) importants",
        },
        {
          id: "objectifs",
          label:
            "Oui, au moins 1 objectif de durabilité doit être pris en compte",
        },
      ],
    },
  ];
};

// Libellés d'état civil (indices 0–5 selon Enter_EtatCivil)
const ETAT_CIVIL_LABELS: string[] = [
  "Célibataire",          // 0
  "Marié·e",              // 1
  "Divorcé·e",            // 2
  "Partenariat enregistré", // 3
  "Concubinage",          // 4
  "Veuf·ve",              // 5
];

// Liste de nationalités (code ISO + nom + drapeau)
// 👉 Complète si besoin avec d'autres pays.
const NATIONALITIES: { code: string; name: string; flag: string }[] = [
{ code: "CH", name: "Suisse", flag: "🇨🇭" },
{ code: "DE", name: "Allemagne", flag: "🇩🇪" },
{ code: "AT", name: "Autriche", flag: "🇦🇹" },
{ code: "FR", name: "France", flag: "🇫🇷" },
{ code: "IT", name: "Italie", flag: "🇮🇹" },
{ code: "AL", name: "Albanie", flag: "🇦🇱" },
{ code: "AD", name: "Andorre", flag: "🇦🇩" },
{ code: "AM", name: "Arménie", flag: "🇦🇲" },
{ code: "AZ", name: "Azerbaïdjan", flag: "🇦🇿" },
{ code: "BY", name: "Biélorussie", flag: "🇧🇾" },
{ code: "BE", name: "Belgique", flag: "🇧🇪" },
{ code: "BA", name: "Bosnie-Herzégovine", flag: "🇧🇦" },
{ code: "BG", name: "Bulgarie", flag: "🇧🇬" },
{ code: "HR", name: "Croatie", flag: "🇭🇷" },
{ code: "CY", name: "Chypre", flag: "🇨🇾" },
{ code: "CZ", name: "Tchéquie", flag: "🇨🇿" },
{ code: "DK", name: "Danemark", flag: "🇩🇰" },
{ code: "EE", name: "Estonie", flag: "🇪🇪" },
{ code: "FI", name: "Finlande", flag: "🇫🇮" },
{ code: "GE", name: "Géorgie", flag: "🇬🇪" },

{ code: "GR", name: "Grèce", flag: "🇬🇷" },
{ code: "HU", name: "Hongrie", flag: "🇭🇺" },
{ code: "IS", name: "Islande", flag: "🇮🇸" },
{ code: "IE", name: "Irlande", flag: "🇮🇪" },

{ code: "KZ", name: "Kazakhstan", flag: "🇰🇿" },
{ code: "LV", name: "Lettonie", flag: "🇱🇻" },
{ code: "LI", name: "Liechtenstein", flag: "🇱🇮" },
{ code: "LT", name: "Lituanie", flag: "🇱🇹" },
{ code: "LU", name: "Luxembourg", flag: "🇱🇺" },
{ code: "MT", name: "Malte", flag: "🇲🇹" },
{ code: "MD", name: "Moldavie", flag: "🇲🇩" },
{ code: "MC", name: "Monaco", flag: "🇲🇨" },
{ code: "ME", name: "Monténégro", flag: "🇲🇪" },
{ code: "NL", name: "Pays-Bas", flag: "🇳🇱" },
{ code: "MK", name: "Macédoine du Nord", flag: "🇲🇰" },
{ code: "NO", name: "Norvège", flag: "🇳🇴" },
{ code: "PL", name: "Pologne", flag: "🇵🇱" },
{ code: "PT", name: "Portugal", flag: "🇵🇹" },
{ code: "RO", name: "Roumanie", flag: "🇷🇴" },
{ code: "RU", name: "Russie", flag: "🇷🇺" },
{ code: "SM", name: "Saint-Marin", flag: "🇸🇲" },
{ code: "RS", name: "Serbie", flag: "🇷🇸" },
{ code: "SK", name: "Slovaquie", flag: "🇸🇰" },
{ code: "SI", name: "Slovénie", flag: "🇸🇮" },
{ code: "ES", name: "Espagne", flag: "🇪🇸" },
{ code: "SE", name: "Suède", flag: "🇸🇪" },

{ code: "TR", name: "Turquie", flag: "🇹🇷" },
{ code: "UA", name: "Ukraine", flag: "🇺🇦" },
{ code: "GB", name: "Royaume-Uni", flag: "🇬🇧" },
{ code: "VA", name: "Vatican", flag: "🇻🇦" },
{ code: "AG", name: "Antigua-et-Barbuda", flag: "🇦🇬" },
{ code: "AR", name: "Argentine", flag: "🇦🇷" },
{ code: "BS", name: "Bahamas", flag: "🇧🇸" },
{ code: "BB", name: "Barbade", flag: "🇧🇧" },
{ code: "BZ", name: "Belize", flag: "🇧🇿" },
{ code: "BO", name: "Bolivie", flag: "🇧🇴" },
{ code: "BR", name: "Brésil", flag: "🇧🇷" },
{ code: "CA", name: "Canada", flag: "🇨🇦" },
{ code: "CL", name: "Chili", flag: "🇨🇱" },
{ code: "CO", name: "Colombie", flag: "🇨🇴" },
{ code: "CR", name: "Costa Rica", flag: "🇨🇷" },
{ code: "CU", name: "Cuba", flag: "🇨🇺" },
{ code: "DM", name: "Dominique", flag: "🇩🇲" },
{ code: "DO", name: "République Dominicaine", flag: "🇩🇴" },
{ code: "EC", name: "Équateur", flag: "🇪🇨" },
{ code: "SV", name: "Salvador", flag: "🇸🇻" },
{ code: "GD", name: "Grenade", flag: "🇬🇩" },
{ code: "GT", name: "Guatemala", flag: "🇬🇹" },
{ code: "GY", name: "Guyana", flag: "🇬🇾" },
{ code: "HT", name: "Haïti", flag: "🇭🇹" },
{ code: "HN", name: "Honduras", flag: "🇭🇳" },
{ code: "JM", name: "Jamaïque", flag: "🇯🇲" },
{ code: "MX", name: "Mexique", flag: "🇲🇽" },
{ code: "NI", name: "Nicaragua", flag: "🇳🇮" },
{ code: "PA", name: "Panama", flag: "🇵🇦" },
{ code: "PY", name: "Paraguay", flag: "🇵🇾" },
{ code: "PE", name: "Pérou", flag: "🇵🇪" },
{ code: "KN", name: "Saint-Kitts-et-Nevis", flag: "🇰🇳" },
{ code: "LC", name: "Sainte-Lucie", flag: "🇱🇨" },
{ code: "VC", name: "Saint-Vincent-et-les-Grenadines", flag: "🇻🇨" },
{ code: "SR", name: "Suriname", flag: "🇸🇷" },
{ code: "TT", name: "Trinité-et-Tobago", flag: "🇹🇹" },
{ code: "US", name: "États-Unis", flag: "🇺🇸" },
{ code: "UY", name: "Uruguay", flag: "🇺🇾" },
{ code: "VE", name: "Venezuela", flag: "🇻🇪" },
{ code: "DZ", name: "Algérie", flag: "🇩🇿" },
{ code: "AO", name: "Angola", flag: "🇦🇴" },
{ code: "BJ", name: "Bénin", flag: "🇧🇯" },
{ code: "BW", name: "Botswana", flag: "🇧🇼" },
{ code: "BF", name: "Burkina Faso", flag: "🇧🇫" },
{ code: "BI", name: "Burundi", flag: "🇧🇮" },
{ code: "CM", name: "Cameroun", flag: "🇨🇲" },
{ code: "CV", name: "Cap-Vert", flag: "🇨🇻" },
{ code: "CF", name: "République Centrafricaine", flag: "🇨🇫" },
{ code: "TD", name: "Tchad", flag: "🇹🇩" },
{ code: "KM", name: "Comores", flag: "🇰🇲" },
{ code: "CG", name: "Congo", flag: "🇨🇬" },
{ code: "CD", name: "RDC", flag: "🇨🇩" },
{ code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮" },
{ code: "DJ", name: "Djibouti", flag: "🇩🇯" },
{ code: "EG", name: "Égypte", flag: "🇪🇬" },
{ code: "GQ", name: "Guinée équatoriale", flag: "🇬🇶" },
{ code: "ER", name: "Érythrée", flag: "🇪🇷" },
{ code: "SZ", name: "Eswatini", flag: "🇸🇿" },
{ code: "ET", name: "Éthiopie", flag: "🇪🇹" },
{ code: "GA", name: "Gabon", flag: "🇬🇦" },
{ code: "GM", name: "Gambie", flag: "🇬🇲" },
{ code: "GH", name: "Ghana", flag: "🇬🇭" },
{ code: "GN", name: "Guinée", flag: "🇬🇳" },
{ code: "GW", name: "Guinée-Bissau", flag: "🇬🇼" },
{ code: "KE", name: "Kenya", flag: "🇰🇪" },
{ code: "LS", name: "Lesotho", flag: "🇱🇸" },
{ code: "LR", name: "Libéria", flag: "🇱🇷" },
{ code: "LY", name: "Libye", flag: "🇱🇾" },
{ code: "MG", name: "Madagascar", flag: "🇲🇬" },
{ code: "MW", name: "Malawi", flag: "🇲🇼" },
{ code: "ML", name: "Mali", flag: "🇲🇱" },
{ code: "MR", name: "Mauritanie", flag: "🇲🇷" },
{ code: "MU", name: "Maurice", flag: "🇲🇺" },
{ code: "MA", name: "Maroc", flag: "🇲🇦" },
{ code: "MZ", name: "Mozambique", flag: "🇲🇿" },
{ code: "NA", name: "Namibie", flag: "🇳🇦" },
{ code: "NE", name: "Niger", flag: "🇳🇪" },
{ code: "NG", name: "Nigeria", flag: "🇳🇬" },
{ code: "RW", name: "Rwanda", flag: "🇷🇼" },
{ code: "ST", name: "São Tomé-et-Principe", flag: "🇸🇹" },
{ code: "SN", name: "Sénégal", flag: "🇸🇳" },
{ code: "SC", name: "Seychelles", flag: "🇸🇨" },
{ code: "SL", name: "Sierra Leone", flag: "🇸🇱" },
{ code: "SO", name: "Somalie", flag: "🇸🇴" },
{ code: "ZA", name: "Afrique du Sud", flag: "🇿🇦" },
{ code: "SS", name: "Soudan du Sud", flag: "🇸🇸" },
{ code: "SD", name: "Soudan", flag: "🇸🇩" },
{ code: "TZ", name: "Tanzanie", flag: "🇹🇿" },
{ code: "TG", name: "Togo", flag: "🇹🇬" },
{ code: "TN", name: "Tunisie", flag: "🇹🇳" },
{ code: "UG", name: "Ouganda", flag: "🇺🇬" },
{ code: "ZM", name: "Zambie", flag: "🇿🇲" },
{ code: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
{ code: "AF", name: "Afghanistan", flag: "🇦🇫" },
{ code: "BH", name: "Bahreïn", flag: "🇧🇭" },
{ code: "BD", name: "Bangladesh", flag: "🇧🇩" },
{ code: "BT", name: "Bhoutan", flag: "🇧🇹" },
{ code: "BN", name: "Brunei", flag: "🇧🇳" },
{ code: "KH", name: "Cambodge", flag: "🇰🇭" },
{ code: "CN", name: "Chine", flag: "🇨🇳" },
{ code: "HK", name: "Hong Kong", flag: "🇭🇰" },
{ code: "MO", name: "Macao", flag: "🇲🇴" },
{ code: "IN", name: "Inde", flag: "🇮🇳" },
{ code: "ID", name: "Indonésie", flag: "🇮🇩" },
{ code: "IR", name: "Iran", flag: "🇮🇷" },
{ code: "IQ", name: "Irak", flag: "🇮🇶" },
{ code: "IL", name: "Israël", flag: "🇮🇱" },
{ code: "JP", name: "Japon", flag: "🇯🇵" },
{ code: "JO", name: "Jordanie", flag: "🇯🇴" },
{ code: "KW", name: "Koweït", flag: "🇰🇼" },
{ code: "KG", name: "Kirghizistan", flag: "🇰🇬" },
{ code: "LA", name: "Laos", flag: "🇱🇦" },
{ code: "LB", name: "Liban", flag: "🇱🇧" },
{ code: "MY", name: "Malaisie", flag: "🇲🇾" },
{ code: "MV", name: "Maldives", flag: "🇲🇻" },
{ code: "MN", name: "Mongolie", flag: "🇲🇳" },
{ code: "MM", name: "Myanmar", flag: "🇲🇲" },
{ code: "NP", name: "Népal", flag: "🇳🇵" },
{ code: "KP", name: "Corée du Nord", flag: "🇰🇵" },
{ code: "OM", name: "Oman", flag: "🇴🇲" },
{ code: "PK", name: "Pakistan", flag: "🇵🇰" },
{ code: "PH", name: "Philippines", flag: "🇵🇭" },
{ code: "QA", name: "Qatar", flag: "🇶🇦" },
{ code: "SA", name: "Arabie Saoudite", flag: "🇸🇦" },
{ code: "SG", name: "Singapour", flag: "🇸🇬" },
{ code: "KR", name: "Corée du Sud", flag: "🇰🇷" },
{ code: "LK", name: "Sri Lanka", flag : "🇱🇰"}
];

export const Configurator3eShell: React.FC = () => {
  const router = useRouter();
// --- ÉTATS DE L'ACTUAIRE IA (métier uniquement) ---
const [aiOpen, setAiOpen] = useState(false);
const [aiLoading, setAiLoading] = useState(false);
const [aiConversation, setAiConversation] = useState<
  { role: "user" | "assistant"; content: string }[]
>([]);
const [aiUnderwriting, setAiUnderwriting] = useState<any | null>(null);
const [occupationRiskClass, setOccupationRiskClass] = useState<number | null>(
  null
);
const [professionConfirmed, setProfessionConfirmed] = useState(false);
const [isAiBackgroundLoading, setIsAiBackgroundLoading] = useState(false);


  const [config, setConfig] = useState<Config_3e_Pilier>(() =>
    createInitialConfig()
  );

    // Nom lisible de l'offre (renommable par le client)
  const [offerName, setOfferName] = useState<string>(
    createInitialConfig().offerName ?? "Offre 1"
  );

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // --- Switch Recommandation MoneyLife ---
  const [recoSwitchOn, setRecoSwitchOn] = useState(false);

// --- ÉTATS DU PROFIL INVESTISSEUR ---
const [equityMinPct, setEquityMinPct] = useState<number | null>(null);
const [equityMaxPct, setEquityMaxPct] = useState<number | null>(null);
const [equityChosenPct, setEquityChosenPct] = useState<number | null>(null);
const [equityOverrideAck, setEquityOverrideAck] = useState(false);
const [investorProfileConfirmed, setInvestorProfileConfirmed] =
  useState(false);



  const [clientData, setClientData] = useState<any>(null);

    const analysisGaps = useMemo<AnalysisGaps | null>(() => {
    if (!clientData) return null;
    return buildAnalysisGapsForClient(clientData as ClientData);
  }, [clientData]);

  useEffect(() => {
    let unsubData: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // On nettoie l'ancien abonnement Firestore si l'utilisateur change
      if (unsubData) {
        unsubData();
        unsubData = undefined;
      }

      if (!user) {
        setClientData(null);
        return;
      }

      // On met à jour le clientUid dans la config
      setConfig((prev) => ({
        ...prev,
        clientUid: user.uid,
      }));

      // Pré-remplit l'e-mail depuis l'auth si possible
        if (user.email) {
        setEmail((prev) => prev || user.email || "");
        }

      // On s'abonne aux données personnelles de ce user
      unsubData = subscribeDonneesPersonnelles(user.uid, (data: any) => {
        setClientData(data);
        console.log("[3e pilier] Données personnelles client :", data);
      });
    });

    return () => {
      unsubAuth();
      if (unsubData) {
        unsubData();
      }
    };
  }, []);

    // Progression de scroll pour la barre sticky
  useEffect(() => {
    const handleScroll = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = doc.scrollHeight - window.innerHeight;

      if (scrollHeight <= 0) {
        setScrollProgress(0);
        return;
      }

      const pct = (scrollTop / scrollHeight) * 100;
      setScrollProgress(Math.min(100, Math.max(0, pct)));
    };

    handleScroll(); // init
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Âge à partir des données personnelles
  const [age, setAge] = useState<number>(35);

  useEffect(() => {
    if (!clientData) return;

    const rawBirthdate: string | undefined =
  (clientData?.Enter_dateNaissance as string | undefined) ??
  (clientData?.birthdate as string | undefined);

    if (!rawBirthdate) return;

    const iso = normalizeBirthdateToIso(rawBirthdate);
    const computedAge = getAgeAtDate(iso, new Date());

    if (!Number.isFinite(computedAge)) return;

    setAge(computedAge);
  }, [clientData]);



  // Profil investisseur
const [investorQuestions, setInvestorQuestions] = useState<any[]>([]);
const [investorStep, setInvestorStep] = useState<number>(0);
const [investorAnswers, setInvestorAnswers] = useState<Record<string, string>>({});
const [investorOpen, setInvestorOpen] = useState(false);
const [investorLoading, setInvestorLoading] = useState(false);

const investorScrollRef = React.useRef<HTMLDivElement | null>(null);

// Charger le dernier profil investisseur enregistré dans Firestore
useEffect(() => {
  const uid = config.clientUid;
  if (!uid) return;

  (async () => {
    try {
      // 1. On essaye d'abord la nouvelle sous-collection
      let snap = await getDocs(
        query(
          collection(db, "clients", uid, "investor_profile_3epilier"),
          orderBy("updatedAt", "desc"),
          limit(1)
        )
      );

      // 2. Si rien → fallback sur l'ancienne "investorProfiles"
      if (snap.empty) {
        snap = await getDocs(
          query(
            collection(db, "clients", uid, "investorProfiles"),
            orderBy("updatedAt", "desc"),
            limit(1)
          )
        );
        if (snap.empty) return;
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data() as any;

      // Réponses du questionnaire
      if (data.answers && typeof data.answers === "object") {
        setInvestorAnswers(data.answers);
      }

// Profil évalué (fourchette d'actions)
if (data.profile) {
  const p = data.profile;
  if (
    typeof p.equityMinPct === "number" &&
    typeof p.equityMaxPct === "number"
  ) {
    setEquityMinPct(p.equityMinPct);
    setEquityMaxPct(p.equityMaxPct);
    setInvestorProfileConfirmed(true);

    // Si un choix personnalisé a déjà été enregistré, on le reprend.
    // Sinon, on met par défaut le max de la fourchette.
    if (typeof p.equityChosenPct === "number") {
      setEquityChosenPct(p.equityChosenPct);
    } else {
      setEquityChosenPct(p.equityMaxPct);
    }

    // On restaure aussi la décharge si elle a déjà été cochée.
    if (typeof p.equityOverrideAck === "boolean") {
      setEquityOverrideAck(p.equityOverrideAck);
    } else {
      setEquityOverrideAck(false);
    }
  }
}
    } catch (err) {
      console.error(
        "[3e pilier] erreur chargement profil investisseur Firestore :",
        err
      );
    }
  })();
}, [config.clientUid]);


  // Santé & profil
  const [isSmoker, setIsSmoker] = useState<boolean>(false);
  const [hasHypertension, setHasHypertension] = useState<boolean>(false);
  const [hasHealthIssues, setHasHealthIssues] = useState<boolean>(false);

  const [healthWizardOpen, setHealthWizardOpen] = useState(false);
  const [healthQuestionnaireCompleted, setHealthQuestionnaireCompleted] = useState(false);
  const [healthBlockUs, setHealthBlockUs] = useState(false);

  const [profession, setProfession] = useState<string>("");
    // Profession principale : lue en lecture seule depuis le profil
  useEffect(() => {
    if (!clientData) return;

    const prof: string =
      (clientData?.Enter_professionPrincipale as string | undefined) ??
      (clientData?.Enter_profession as string | undefined) ??
      (clientData?.ProfessionPrincipale as string | undefined) ??
      (clientData?.professionPrincipale as string | undefined) ??
      (clientData?.profession as string | undefined) ??
      "";

    // On écrase simplement la valeur locale avec celle du profil
    setProfession(prof || "");
  }, [clientData]);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);

  // Date de début de l'offre (1er du mois courant / suivant / +2 mois)
  // Règle: on a besoin de ~15 jours pour une offre signée.
  // → Le 1er du mois courant n'est autorisé que si on est au plus le 5 du mois.
  const offerDateOptions = useMemo(() => {
    const today = new Date();
    const day = today.getDate();

    const firstCurrent = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const firstNext2 = new Date(today.getFullYear(), today.getMonth() + 2, 1);

    const options: { label: string; date: Date }[] = [];

    // 1er du mois courant seulement si on est au plus le 5
    if (day <= 5) {
      options.push({
        label: formatDateDotted(firstCurrent),
        date: firstCurrent,
      });
    }

    // Toujours proposer le 1er du mois suivant et le mois encore suivant
    options.push(
      { label: formatDateDotted(firstNext), date: firstNext },
      { label: formatDateDotted(firstNext2), date: firstNext2 }
    );

    return options;
  }, []);

  const [offerStartDate, setOfferStartDate] = useState<string>("");

  useEffect(() => {
    if (!offerStartDate && offerDateOptions.length > 0) {
      setOfferStartDate(offerDateOptions[0].label);
    }
  }, [offerDateOptions, offerStartDate]);

  // Données personnelles (pour la demande d'offres)
  const [nationality, setNationality] = useState("");
  const [residencePermit, setResidencePermit] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Recherche nationalité (code ou nom)
  const [nationalitySearch, setNationalitySearch] = useState("");

  const filteredNationalities = useMemo(
    () => {
      const s = nationalitySearch.trim().toLowerCase();
      if (!s) return NATIONALITIES;

      return NATIONALITIES.filter((n) =>
        n.code.toLowerCase().includes(s) ||
        n.name.toLowerCase().includes(s)
      );
    },
    [nationalitySearch]
  );

  const isSwiss = nationality === "CH";
  const nationalityName =
    NATIONALITIES.find((n) => n.code === nationality)?.name ?? "";

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLocked = config.status !== "draft";

  const hasDisabilityRente =
    Array.isArray((config as any).disabilityAnnuities) &&
    (config as any).disabilityAnnuities.length > 0;

  // Règles d'âge de fin de contrat
  const minEndAge = config.type === "3a" ? 60 : age + 10; // 3a: 60–65, 3b: durée min 10 ans
  const maxEndAge = config.type === "3a" ? 65 : getMaxAge(config.type) + 5;

  const premiumBounds = useMemo(
    () => getPremiumBounds(config.type, config.premiumFrequency),
    [config.type, config.premiumFrequency]
  );

  const pricingContext = useMemo<RiskPricingContext>(
    () => {
      let bmi = 22;

      if (heightCm && weightKg && heightCm > 0) {
        bmi = weightKg / Math.pow(heightCm / 100, 2);
      }

      return {
        age,
        type: config.type,
        isSmoker,
        bmi,
        hasHypertension,
        hasHealthIssues,
        occupationRiskClass,
      };
    },
    [
      age,
      config.type,
      isSmoker,
      hasHypertension,
      hasHealthIssues,
      heightCm,
      weightKg,
      occupationRiskClass,
    ]
  );

  

const { totalRiskPremium, netSavingsPremium, breakdown } = useMemo(
  () => computeRiskAndSavings(config, pricingContext),
  [config, pricingContext]
);

  // Capitaux projetés (pessimiste / modéré / optimiste)
  const projectedCapitals = useMemo(() => {
    if (!config.endAge || !Number.isFinite(config.endAge) || !Number.isFinite(age)) {
      return null;
    }

    const years = Math.max(config.endAge - age, 0);
    const transfer = config.savings.transferAmount3a ?? 0;

    const contribPerYear =
      config.premiumFrequency === "monthly"
        ? netSavingsPremium * 12
        : netSavingsPremium;

    if (years === 0) {
      return {
        pessimistic: Math.max(transfer, 0),
        moderate: Math.max(transfer, 0),
        optimistic: Math.max(transfer, 0),
        pessimisticRate: 0,
        moderateRate: 0,
        optimisticRate: 0,
      };
    }

    const basePct = config.savings.expectedReturnPct ?? 0;

    // On centre sur la valeur choisie par le client (modéré),
    // puis on construit deux scénarios autour.
    const moderateRate = basePct;
    const pessimisticRate = config.savings.withFunds
      ? Math.max(moderateRate - 2, 0)
      : 0; // sans fonds, on peut rester à 0%
    const optimisticRate = config.savings.withFunds
      ? moderateRate + 2
      : moderateRate;

    const computeCap = (ratePct: number) => {
      const r = ratePct / 100;
      if (r > 0) {
        const factor = Math.pow(1 + r, years);
        return transfer * factor + contribPerYear * ((factor - 1) / r);
      }
      // r = 0% → pas d'intérêts
      return transfer + contribPerYear * years;
    };

    return {
      pessimistic: computeCap(pessimisticRate),
      moderate: computeCap(moderateRate),
      optimistic: computeCap(optimisticRate),
      pessimisticRate,
      moderateRate,
      optimisticRate,
    };
  }, [
    config.endAge,
    config.savings.transferAmount3a,
    config.savings.expectedReturnPct,
    config.savings.withFunds,
    config.premiumFrequency,
    netSavingsPremium,
    age,
  ]);

    // Résumé lisible des couvertures sélectionnées
  const hasAnyCover =
    config.deathFixed.enabled ||
    config.deathDecreasing.enabled ||
    hasDisabilityRente ||
    config.premiumWaiver.enabled;

  // Booléen: dès qu'il existe au moins une couverture de risque,
  // on part du principe qu'un questionnaire de santé sera demandé.
  const requiresHealthQuestionnaire = hasAnyCover;


    const saveHealthQuestionnaireToFirestore = async (payload: {
    isSmoker: boolean;
    cigarettesPerDay: number | null;
    hasHypertension: boolean;
    hasHighCholesterol: boolean;
    heightCm: number | null;
    weightKg: number | null;
    healthBlockUs: boolean;
    rawAnswers: any;
  }) => {
    if (!config.clientUid) return;

    try {
      const ref = doc(
        collection(db, "clients", config.clientUid, "health_lifestyle_3epilier")
      );

      const bmi =
        payload.heightCm && payload.weightKg && payload.heightCm > 0
          ? payload.weightKg / Math.pow(payload.heightCm / 100, 2)
          : null;

      await setDoc(ref, {
        clientUid: config.clientUid,
        configId: config.id,
        profession: profession.trim() || null,

        // Facteurs de risque “techniques”
        isSmoker: payload.isSmoker,
        cigarettesPerDay: payload.cigarettesPerDay,
        hasHypertension: payload.hasHypertension,
        hasHighCholesterol: payload.hasHighCholesterol,
        heightCm: payload.heightCm,
        weightKg: payload.weightKg,
        bmi,

        // Réponses brutes du questionnaire
        ...payload.rawAnswers,

        healthBlockUs: payload.healthBlockUs,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error("[3e pilier] saveHealthQuestionnaireToFirestore error:", e);
    }
  };


    // --- Recalcul IA automatique après le questionnaire Santé & Lifestyle ---
  useEffect(() => {
    // On déclenche seulement si :
    // - le questionnaire santé est terminé
    // - une profession est renseignée
    // - au moins une couverture de risque est active
    if (!healthQuestionnaireCompleted) return;
    if (!profession.trim()) return;
    if (!hasAnyCover) return;

    let cancelled = false;
    setIsAiBackgroundLoading(true);

    const run = async () => {
      try {
        const res = await fetch("/api/underwriting/3epilier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            pricingContext,
            profession: profession.trim(),
            conversationHistory: [],
            mode: "health_update", // indicatif pour ton backend si tu veux différencier
          }),
        });

        const json = await res.json();
        if (!json.ok || cancelled) {
          console.error("[AI underwriting health] erreur :", json.error);
          return;
        }

        const { underwriting } = json;
        if (!underwriting || cancelled) return;

        setAiUnderwriting(underwriting);

        // Classe de risque métier mise à jour en fonction de l’ensemble (métier + santé)
        if (
          typeof underwriting.occupationRiskClass === "number" &&
          Number.isFinite(underwriting.occupationRiskClass)
        ) {
          setOccupationRiskClass(underwriting.occupationRiskClass);
        }
      } catch (err) {
        console.error("[AI underwriting health] erreur :", err);
      } finally {
        if (!cancelled) {
          setIsAiBackgroundLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    healthQuestionnaireCompleted,
    isSmoker,
    hasHypertension,
    heightCm,
    weightKg,
    profession,
    hasAnyCover,
    config,
    pricingContext,
  ]);



  const transferredCapital = config.savings.transferAmount3a ?? 0;
  const hasTransferredCapital = transferredCapital > 0;

    // Données personnelles en lecture seule depuis Firestore (ClientData)
  const firstName: string =
    (clientData?.Enter_prenom as string | undefined) ??
    (clientData?.Prenom as string | undefined) ??
    (clientData?.firstName as string | undefined) ??
    "";

  const lastName: string =
    (clientData?.Enter_nom as string | undefined) ??
    (clientData?.Nom as string | undefined) ??
    (clientData?.lastName as string | undefined) ??
    "";

  const sexValue: number | undefined =
    (clientData?.Enter_sexe as number | undefined);

  const sexLabel: string =
    typeof sexValue === "number"
      ? sexValue === 0
        ? "Masculin"
        : sexValue === 1
        ? "Féminin"
        : ""
      : "";

  const birthdateLabel: string =
    (clientData?.Enter_dateNaissance as string | undefined) ??
    (clientData?.birthdate as string | undefined) ??
    "";


// --- État civil ---
const ETAT_CIVIL_LABELS = [
  "Célibataire",
  "Marié(e)",
  "Divorcé(e)",
  "Partenariat enregistré",
  "Concubinage",
  "Veuf(ve)",
];

const etatCivilIndex: number | undefined =
  (clientData?.Enter_EtatCivil as number | undefined) ??
  (clientData?.Enter_etatCivil as number | undefined);

const etatCivilLabel: string =
  typeof etatCivilIndex === "number" &&
  etatCivilIndex >= 0 &&
  etatCivilIndex < ETAT_CIVIL_LABELS.length
    ? ETAT_CIVIL_LABELS[etatCivilIndex]
    : "";

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // Âge actuel
    if (age < 18 || age > getMaxAge(config.type)) {
      errors.push(
        `L'âge doit être compris entre 18 et ${getMaxAge(
          config.type
        )} ans pour un ${config.type.toUpperCase()}.`
      );
    }

    // Âge de fin de contrat & durée
    if (!config.endAge || !Number.isFinite(config.endAge)) {
      errors.push("Merci d'indiquer un âge de la fin contrat.");
    } else {
      // Toujours logique: endAge > age
      if (config.endAge <= age) {
        errors.push(
          "Vôtre âge à la fin de contrat doit être supérieur à votre âge actuel."
        );
      }

      if (config.type === "3a") {
        if (config.endAge < 60 || config.endAge > 65) {
          errors.push(
            "Pour un 3e pilier lié (3a), l'âge de fin du contrat doit être compris entre 60 et 65 ans."
          );
        }
      } else if (config.type === "3b") {
        const duration = config.endAge - age;
        if (duration < 10) {
          errors.push(
            "Pour un 3e pilier libre (3b), la durée du contrat doit être d'au moins 10 ans."
          );
        }
      }
    }

    // Métier obligatoire (à remplir dans le profil)
    if (!profession.trim()) {
      errors.push(
        "Merci d'indiquer votre profession principale dans votre profil."
      );
    }

        // État civil requis (doit être renseigné dans le profil)
    if (!etatCivilLabel) {
      errors.push("Merci d'indiquer votre état civil dans votre profil.");
    }

    // Questionnaire Santé & Lifestyle obligatoire
    if (!healthQuestionnaireCompleted) {
      errors.push("Merci de compléter le questionnaire Santé & Lifestyle.");
    }

    // Statut US bloquant
    if (healthBlockUs) {
      errors.push(
        "En raison de votre statut fiscal ou de votre nationalité américaine, vous ne pouvez pas souscrire à ce produit."
      );
    }

        // Profession confirmée par l'IA (classe de risque métier) *uniquement* si des risques sont assurés
    if (hasAnyCover && (!occupationRiskClass || !professionConfirmed)) {
      errors.push(
        "Merci de confirmer votre profession avec l’assistant MoneyLife pour pouvoir calculer la prime de risque."
      );
    }

        // Données personnelles obligatoires pour la demande d'offres
    if (!nationality) {
      errors.push("Merci d'indiquer votre nationalité.");
    }

    if (!isSwiss && !residencePermit.trim()) {
      errors.push("Merci d'indiquer votre autorisation de séjour.");
    }

    // Adresse : on exige rue + numéro, NPA et localité
if (!street.trim() || !zip.trim() || !city.trim()) {
  errors.push(
    "Merci de compléter votre adresse postale (rue, NPA et localité)."
  );
} else if (!hasStreetNumber(street)) {
  // cas où une rue est fournie mais sans numéro
  errors.push(
    'Merci d’indiquer votre adresse complète (rue + numéro). Ex. "Rue de la Gare 54".'
  );
}

    if (!email.trim()) {
      errors.push("Merci d'indiquer votre adresse e-mail.");
    }

    if (!phone.trim()) {
      errors.push("Merci d'indiquer votre numéro de téléphone.");
    }

    // Prime min / max
    if (
      config.premiumAmount < premiumBounds.min ||
      config.premiumAmount > premiumBounds.max
    ) {
      const unit = config.premiumFrequency === "monthly" ? "par mois" : "par an";
      errors.push(
        `La prime doit être comprise entre ${premiumBounds.min.toFixed(
          2
        )} et ${premiumBounds.max.toFixed(2)} CHF ${unit}.`
      );
    }

        // Si investissement en fonds activé, le profil IA doit être confirmé
    if (config.savings.withFunds && !investorProfileConfirmed) {
      errors.push(
        "Merci de compléter le questionnaire pour définir votre profil d'investisseur."
      );
    }

        // Si profil investi existant : vérifier que le slider est positionné et,
    // en cas d'écart, que le client a coché la décharge.
        if (
      config.savings.withFunds &&
      investorProfileConfirmed &&
      equityMinPct != null &&
      equityMaxPct != null
    ) {
      const chosen = equityChosenPct ?? equityMaxPct ?? equityMinPct;
      const within =
        chosen >= equityMinPct && chosen <= equityMaxPct;
      const below = chosen < equityMinPct;
      const above = chosen > equityMaxPct;

      if (equityChosenPct == null) {
        errors.push(
          "Merci de choisir votre pourcentage d'investissement en actions sur le slider."
        );
      } else if (!within && !equityOverrideAck) {
        errors.push(
          "Votre choix d'investissement en actions ne respecte pas la recommandation MoneyLife. Merci de confirmer que vous comprenez ce risque."
        );
      }
    }

    // 3b : au moins un capital décès
    if (
      config.type === "3b" &&
      !config.deathFixed.enabled &&
      !config.deathDecreasing.enabled
    ) {
      errors.push(
        "Pour un 3e pilier libre (3b), un capital décès (fixe ou décroissant) est obligatoire."
      );
    }

    // Rentes d'incapacité de gain : multi-rente (rente principale + rentes différées)
    const disabilityList: any[] =
      (config as any).disabilityAnnuities && Array.isArray((config as any).disabilityAnnuities)
        ? (config as any).disabilityAnnuities
        : [];

    if (disabilityList.length > 0) {
      let previousAmount = 0;
      let previousStartAge = age;

      disabilityList.forEach((rente, index) => {
        if (!rente) return;
        const label =
          index === 0
            ? "Rente IG principale"
            : `Rente différée n°${index}`;

        // --- MONTANT ---
        if (!rente.annualRente || rente.annualRente <= 0) {
          errors.push(
            `${label} : merci d'indiquer un montant annuel de rente supérieur à 0.`
          );
        }

        // Montants croissants : chaque rente différée doit être > précédente (donc au moins 1 CHF de plus)
        if (index > 0 && rente.annualRente <= previousAmount) {
          errors.push(
            `${label} : le montant doit être strictement supérieur (au moins 1 CHF de plus) à la rente précédente.`
          );
        }
        previousAmount = rente.annualRente || previousAmount;

        // --- DÉBUT DE RENTE ---
        const startAge = rente.startAge;
        if (!startAge || !Number.isFinite(startAge)) {
          errors.push(`${label} : merci d'indiquer un âge de début de rente.`);
        } else {
          if (index === 0) {
            // Rente principale : respecter le délai d'attente
            const waitMonths = rente.waitingPeriod ?? 0;
            const minStartAgeFromWait =
              age + Math.ceil((waitMonths > 0 ? waitMonths : 0) / 12);

            if (startAge < minStartAgeFromWait) {
              errors.push(
                `${label} : compte tenu d'un délai d'attente de ${waitMonths} mois, l'âge de début ne peut pas être inférieur à ${minStartAgeFromWait} ans.`
              );
            }
          } else {
            // Rentes différées : au minimum 1 an après la rente précédente
            const requiredMinStartAge = previousStartAge + 1;
            if (startAge < requiredMinStartAge) {
              errors.push(
                `${label} : l'âge de début doit être au minimum 1 an après la rente précédente (au moins ${requiredMinStartAge} ans).`
              );
            }
          }

          // Toujours au moins 2 ans avant la fin du contrat
          if (config.endAge && config.endAge - startAge < 2) {
            errors.push(
              `${label} : le début de la rente doit être au moins 2 ans avant la fin du contrat.`
            );
          }
        }

        // Pour la prochaine boucle, la "rente précédente" devient celle-ci
        previousStartAge = rente.startAge || previousStartAge;
      });
    }

    // Risque > prime
    if (totalRiskPremium > config.premiumAmount) {
      errors.push(
        "Les couvertures de risque dépassent la prime totale. Réduisez les montants de risque ou augmentez la prime."
      );
    }

        // Date de début de l'offre obligatoire
    if (!offerStartDate) {
      errors.push(
        "Merci de choisir une date de début de l'offre (1er du mois courant ou des deux mois suivants)."
      );
    }



    return errors;
  }, [
    age,
    config.type,
    config.endAge,
    config.premiumAmount,
    premiumBounds,
    totalRiskPremium,
    profession,
    heightCm,
    weightKg,
    config.disabilityAnnuities,
    nationality,
    residencePermit,
    street,
    zip,
    city,
    email,
    phone,
    occupationRiskClass,
    professionConfirmed,
    etatCivilLabel,
    offerStartDate,
    investorProfileConfirmed,
    equityMinPct,
    equityMaxPct,
    equityChosenPct,
    equityOverrideAck,
    healthQuestionnaireCompleted,
    healthBlockUs,
  ]);

  const canRequestOffers = validationErrors.length === 0;

    // --- Flags d'erreur par champ (pour les contours orange) ---

  const hasPrimeBoundsError = validationErrors.some((err) =>
    err.startsWith("La prime doit être comprise")
  );

  const hasProfessionError = validationErrors.some((err) =>
    err.includes("profession principale")
  );


  const hasNationalityError = validationErrors.some((err) =>
    err.includes("nationalité")
  );

  const hasResidencePermitError = validationErrors.some((err) =>
    err.includes("autorisation de séjour")
  );

  const hasAddressError = validationErrors.some((err) =>
    err.includes("adresse postale")
  );

  const hasEmailError = validationErrors.some((err) =>
    err.includes("adresse e-mail")
  );

  const hasPhoneError = validationErrors.some((err) =>
    err.includes("numéro de téléphone")
  );

    // --- Flags de complétion par grande section (pour les chips verts) ---

  // 1) Type & prime : pas d'erreur d'âge / fin de contrat / prime
  const hasTypeOrPremiumError = validationErrors.some((err) =>
    err.includes("âge") || err.includes("prime doit être comprise")
  );
  const isTypePrimeComplete = !hasTypeOrPremiumError;

  // 2) Couvertures de risque : pas d'erreur sur 3b sans capital, rentes IG ou prime > risque
  const hasRiskCoverError = validationErrors.some(
    (err) =>
      err.startsWith("Pour un 3e pilier libre (3b)") ||
      err.startsWith("Rente IG principale") ||
      err.startsWith("Rente différée") ||
      err.startsWith("Les couvertures de risque")
  );
  const isRiskCoversComplete = !hasRiskCoverError;

  // 3) Santé & lifestyle : questionnaire complet + pas de blocage US
  const hasHealthError = validationErrors.some(
    (err) =>
      err.includes("questionnaire Santé & Lifestyle") ||
      err.includes("statut fiscal ou de votre nationalité américaine")
  );
  const isHealthStepComplete = healthQuestionnaireCompleted && !hasHealthError;

  // 4) Données personnelles : nationalité, permis, adresse, email, téléphone OK
  const hasPersonalDataError = validationErrors.some(
    (err) =>
      err.includes("nationalité") ||
      err.includes("autorisation de séjour") ||
      err.includes("adresse postale") ||
      err.includes("adresse e-mail") ||
      err.includes("numéro de téléphone")
  );
  const isPersonalDataComplete = !hasPersonalDataError;

  // 5) Profil investisseur (uniquement si withFunds = true)
  const hasInvestorError = validationErrors.some((err) =>
    err.includes("profil d'investisseur")
  );
  const isInvestorStepComplete =
    config.savings.withFunds && !hasInvestorError && investorProfileConfirmed;

    const mainRente = (config as any).disabilityAnnuities?.[0];
  const mainWaitMonths = mainRente?.waitingPeriod ?? 0;
  const mainMinStartAge =
    age + Math.ceil((mainWaitMonths > 0 ? mainWaitMonths : 0) / 12);

  const currentYear = new Date().getFullYear();
  const contractEndYear =
    Number.isFinite(config.endAge) && Number.isFinite(age)
      ? currentYear + (config.endAge - age)
      : null;

    // --- Logique du slider d'actions ---
  const effectiveEquity = equityChosenPct ?? equityMaxPct ?? equityMinPct ?? 0;

  const hasProfileRange =
    equityMinPct != null && equityMaxPct != null && equityMinPct <= equityMaxPct;

  const isWithinProfile =
    hasProfileRange &&
    effectiveEquity >= (equityMinPct as number) &&
    effectiveEquity <= (equityMaxPct as number);

  const isBelowProfile =
    hasProfileRange && effectiveEquity < (equityMinPct as number);

  const isAboveProfile =
    hasProfileRange && effectiveEquity > (equityMaxPct as number);

  const expectedReturnLabel =
    config.savings.withFunds && config.savings.expectedReturnPct != null
      ? `${config.savings.expectedReturnPct}% brut/an`
      : "selon vos versements actuels";

  const disabilityList = ((config as any).disabilityAnnuities || []) as any[];

  const handleApplyRecoPreset = () => {
  if (!analysisGaps) {
    toast("Analyse de prévoyance manquante", {
      description:
        "Nous n’avons pas encore pu reconstruire vos lacunes de prévoyance. Revenez après avoir complété votre profil et votre analyse.",
    });
    return;
  }

  // On choisit d'office un 3e pilier A
  const recoType: Config_3e_Type = "3a";

  // Début de l’offre : le plus tôt possible (1er choix des options)
  const earliestOfferDate = offerDateOptions[0];
  const recoOfferStartLabel = earliestOfferDate?.label ?? offerStartDate;

  // Âge de fin : le plus tard possible pour un 3a → 65 ans
  const recoEndAge = 65;

  // Prime : mensuelle, au maximum légal pour 3a
  const recoPremiumFrequency: "monthly" | "yearly" = "monthly";
  const recoBounds = getPremiumBounds(recoType, recoPremiumFrequency);
  const recoPremiumAmount = recoBounds.max;

  // 1) Rentes IG recommandées (basées sur les lacunes max Maladie / Accident)
  const invalidityRentes = buildInvalidityRentesFromGaps(
    analysisGaps.invalidity,
    age,
    recoEndAge
  );

  // 2) Capital décès recommandé
  const deathCapital = buildDeathCapitalFromGaps(
    analysisGaps.death,
    analysisGaps.deathExistingLumpSum
  );

  setOfferStartDate(recoOfferStartLabel);

  setConfig((prev) => {
    // Choix du délai d’attente pour la libération des primes
    // - si prime mensuelle → 3 mois
    // - sinon → 12 mois
    const recommendedWaiverWait: 3 | 12 | 24 =
      recoPremiumFrequency === "monthly" ? 3 : 12;

    return {
      ...prev,
      type: recoType,
      endAge: recoEndAge,
      premiumFrequency: recoPremiumFrequency,
      premiumAmount: recoPremiumAmount,

      // Décès : capital fixe basé sur les lacunes
      deathFixed: {
        ...prev.deathFixed,
        enabled: deathCapital > 0,
        capital:
          deathCapital > 0
            ? Math.round(deathCapital / 10_000) * 10_000 // arrondi à 10'000
            : 0,
      },
      // On coupe le décès décroissant dans la reco par défaut
      deathDecreasing: {
        ...prev.deathDecreasing,
        enabled: false,
      },
      // Rentes IG multi-rente (principale + différées)
      disabilityAnnuities: invalidityRentes.map((r) => ({
        enabled: true,
        annualRente: r.annualRente,
        startAge: r.startAge,
        waitingPeriod: r.waitingPeriod,
      })),
      // Libération du paiement des primes → toujours activée en reco
      premiumWaiver: {
        ...prev.premiumWaiver,
        enabled: true,
        waitingPeriod: recommendedWaiverWait,
      },
    };
  });

  toast("Recommandation appliquée ✅", {
    description:
      "Type de contrat, prime, décès, incapacité de gain et libération des primes ont été ajustés selon vos lacunes de prévoyance.",
  });
};

  const handleTypeChange = (type: Config_3e_Type) => {
    setConfig((prev) => ({
      ...prev,
      type,
      // Ajuster éventuellement l'âge de fin aux nouvelles règles
      endAge:
        type === "3a"
          ? Math.min(Math.max(prev.endAge || 60, 60), 65)
          : Math.max(prev.endAge || age + 10, age + 10),
      savings: {
        ...prev.savings,
        // En 3b, pas de transfert 3a possible
        transferAmount3a: type === "3a" ? prev.savings.transferAmount3a ?? 0 : 0,
      },
    }));
  };

  const handleProfessionBlur = async () => {
    const trimmed = profession.trim();

    if (!trimmed) {
      setOccupationRiskClass(null);
      setProfessionConfirmed(false);
      return;
    }

    setIsAiBackgroundLoading(true);
    try {
      const res = await fetch("/api/underwriting/3epilier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          pricingContext,
          profession: trimmed,
          conversationHistory: [],
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        console.error("[AI underwriting blur] erreur:", json.error);
        return;
      }

      const { underwriting } = json;
      if (!underwriting) return;

      setAiUnderwriting(underwriting);

      // Si le métier est confirmé et normalisé, on le met à jour
      if (
        underwriting.professionConfirmed === true &&
        underwriting.normalizedProfession &&
        typeof underwriting.normalizedProfession === "string"
      ) {
        setProfession(underwriting.normalizedProfession);
        setProfessionConfirmed(true);
      } else {
        setProfessionConfirmed(false);
      }

      // Classe de risque métier
      if (
        typeof underwriting.occupationRiskClass === "number" &&
        Number.isFinite(underwriting.occupationRiskClass)
      ) {
        setOccupationRiskClass(underwriting.occupationRiskClass);
      } else {
        setOccupationRiskClass(null);
      }

      // Si l'IA a besoin de précision sur le métier -> ouvrir le modal
      if (underwriting.professionQuestion) {
        setAiConversation([
          { role: "assistant", content: underwriting.professionQuestion },
        ]);
        setAiOpen(true);
      }
    } catch (err) {
      console.error("[AI underwriting blur] erreur:", err);
    } finally {
      setIsAiBackgroundLoading(false);
    }
  };


    const handleInvestorFinalSubmit = async (finalAnswers: Record<string, string>) => {
    setInvestorLoading(true);

    try {
      const res = await fetch("/api/investor-profile/3epilier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          pricingContext,
          contact: {
            firstName,
            lastName,
            sex: sexLabel,
            birthdate: birthdateLabel,
            nationality,
            etatCivilLabel,
          },
          answers: finalAnswers,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Erreur IA");

      const profile = json.profile || json; // au cas où

      if (
  typeof profile.equityMinPct === "number" &&
  typeof profile.equityMaxPct === "number"
) {
  setEquityMinPct(profile.equityMinPct);
  setEquityMaxPct(profile.equityMaxPct);
  setInvestorProfileConfirmed(true);

  // Par défaut : on place le slider sur le haut de la fourchette
  const defaultChosen =
    typeof profile.equityMaxPct === "number"
      ? profile.equityMaxPct
      : profile.equityMinPct ?? null;

  setEquityChosenPct(defaultChosen);
  setEquityOverrideAck(false);
}

      toast("Profil d'investisseur évalué ✅", {
        description:
          profile.summary ||
          "Vos réponses ont permis de définir une recommandation d'investissement.",
      });

      setInvestorOpen(false);
    } catch (err) {
      console.error("[investor-profile] erreur:", err);
      toast("Erreur IA", {
        description:
          "Impossible d'analyser votre profil d'investisseur pour le moment.",
      });
    } finally {
      setInvestorLoading(false);
    }
  };


  const scrollInvestorToTop = () => {
    if (investorScrollRef.current) {
      investorScrollRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  // Sauvegarde du choix d'allocation en actions dans Firestore
  const saveEquityChoiceToFirestore = async (
    value: number,
    overrideAck?: boolean
  ) => {
    if (!config.clientUid || !config.id) return;

    try {
      await fetch("/api/investor-profile/3epilier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "updateChoice",
          config: {
            clientUid: config.clientUid,
            id: config.id,
          },
          equityChosenPct: value,
          // on n'envoie equityOverrideAck que s'il est défini (true/false)
          ...(typeof overrideAck === "boolean"
            ? { equityOverrideAck: overrideAck }
            : {}),
        }),
      });
    } catch (e) {
      console.error(
        "[3e pilier] saveEquityChoiceToFirestore error:",
        e
      );
    }
  };


    const handleRequestOffers = async () => {
    if (isLocked || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/offers/3epilier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config,
          offerName,
          pricingContext,
          totalRiskPremium,
          netSavingsPremium,
          profession,
          heightCm,
          weightKg,
          offerStartDate,
          requiresHealthQuestionnaire,
          contact: {
            firstName,
            lastName,
            sex: sexLabel,
            birthdate: birthdateLabel,
            nationality: nationalityName || nationality,
            residencePermit: isSwiss ? null : residencePermit || null,
            street,
            zip,
            city,
            email,
            phone,
            etatCivilLabel,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} – ${text || "Erreur inconnue"}`);
      }

      const json = await res.json().catch(() => ({}));
      const requestId: string | undefined = json?.id;

      setConfig((prev) => ({
        ...prev,
        status: "offers_requested",
        updatedAt: Date.now(),
      }));

      toast("Demande d'offres envoyée ✅", {
        description:
          "Votre configuration a été transmise à MoneyLife. Vous recevrez les offres dès qu'elles seront disponibles.",
        style: {
          backgroundColor: "#4FD1C5",
          color: "#0b0b0b",
          border: "none",
          fontWeight: "600",
        },
      });

      // 👉 Redirige le client vers la page de ses offres en préparation
      // (on pourrait aussi passer le requestId en query si tu veux cibler une demande précise)
      router.push("/dashboard/offres/en-preparation");
    } catch (err) {
      console.error("Erreur lors de la demande d'offres 3e pilier :", err);

      toast("Erreur lors de l'envoi ❌", {
        description:
          "Une erreur est survenue pendant la demande d'offres. Réessayez plus tard ou contactez MoneyLife.",
        style: {
          backgroundColor: "#EF4444",
          color: "#fff",
          border: "none",
          fontWeight: "600",
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewConfig = () => {
    const next = createInitialConfig();
    setConfig((prev) => ({
      ...next,
      clientUid: prev.clientUid, // on garde le même client
    }));
    setOfferName(next.offerName ?? "Offre 1");
    setIsSmoker(false);
    setHasHypertension(false);
    setHasHealthIssues(false);
    setProfession("");
    setHeightCm(null);
    setWeightKg(null);
  };





  // --- Détection d'une prime insuffisante pour les couvertures ---
  const hasRiskExceedsPremiumError = validationErrors.some((err) =>
    err.startsWith("Les couvertures de risque dépassent la prime totale")
  );

  const premiumUnit =
    config.premiumFrequency === "monthly" ? "CHF/mois" : "CHF/an";

  const premiumLabel =
    config.premiumAmount != null && Number.isFinite(config.premiumAmount)
      ? `${config.premiumAmount.toLocaleString("fr-CH")} ${premiumUnit}`
      : `0 ${premiumUnit}`;

  const isAddressInvalid = useMemo(() => {
  if (!street || !zip || !city) return true;
  if (!hasStreetNumber(street)) return true;
  return false;
}, [street, zip, city]);

  const riskCardRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToRiskSection = () => {
  if (riskCardRef.current) {
    riskCardRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
};
  
{/* Gros return */}
return (
  <>
    {/* Header sticky/fixed en pleine largeur (viewport) */}
        <div className="fixed inset-x-0 top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Bouton retour à gauche */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (config.status === "offers_requested") {
              window.location.href = "/dashboard";
            } else {
              setLeaveDialogOpen(true);
            }
          }}
        >
          ← Retour à mon Dashboard
        </Button>

        {/* Titre centré */}
        <div className="flex-1 flex justify-center">
          <span className="text-xs font-medium md:text-sm">
            Configurateur 3e pilier
          </span>
        </div>

        {/* Nom de l'offre à droite (optionnel) */}
        <span className="hidden text-[11px] text-muted-foreground md:inline text-right">
          {offerName || "Offre 1"}
        </span>
      </div>

      {/* Barre de progression pleine largeur */}
      <div className="h-1 w-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{
            width: `${scrollProgress}%`,
            backgroundImage:
              "linear-gradient(to right, #0030A8, #4fd1c5, #F59E0B)",
          }}
        />
      </div>
    </div>

    {hasRiskExceedsPremiumError && (
  <div className="sticky top-[60px] z-30 w-full px-4">
    <div
      className="
        relative 
        rounded-md 
        border border-red-500/30 
        bg-red-50/60 
        text-red-700 
        px-4 py-5 
        shadow-sm
        backdrop-blur-sm
      "
    >
      <div className="flex items-start gap-3 pr-28">
        {/* Icône Shadcn */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 mt-0.5 text-red-600 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3m0 3h.01M10.29 3.86 1.82 18a1.7 1.7 0 0 0 1.47 2.56h17.42A1.7 1.7 0 0 0 22.18 18L13.71 3.86a1.7 1.7 0 0 0-2.94 0Z"
          />
        </svg>

        <p className="text-sm leading-snug">
          Votre prime totale de{" "}
          <strong className="font-semibold">{premiumLabel}</strong> ne suffit pas.
          Réduisez vos couvertures d’assurance ou optez pour un 3e pilier{" "}
          <strong>B</strong>.
        </p>
      </div>

      {/* CTA Shadcn intégré */}
      <div className="absolute right-3 bottom-4">
  <Button
    size="sm"
    variant="secondary"
    className="
      h-7 px-3 text-[11px] 
      rounded-md 
      bg-white/70 
      hover:bg-white 
      text-red-700 
      border border-red-200
    "
    onClick={scrollToRiskSection}
  >
    Ajuster
  </Button>
</div>
    </div>
  </div>
)}

    {/* WRAPPER de la page (largeur limitée) */}
    <div className="mt-[60px] flex flex-col gap-4 pb-12 mx-auto w-full max-w-4xl px-4">

          {/* Bouton Recommandation global */}
            {/* Recommandation MoneyLife – Switch Shadcn */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground">
            Recommandation automatique MoneyLife
          </span>
          <span className="text-[11px] text-muted-foreground">
            Activez pour préremplir type, prime et couvertures selon vos lacunes de prévoyance.
          </span>
        </div>

        <div
          className="
            inline-flex items-center gap-2
            rounded-full border border-border
            bg-muted/70 px-3 py-1
          "
        >
          <span className="text-[11px] text-muted-foreground">Recommandation</span>
          <Switch
            checked={recoSwitchOn}
            disabled={isLocked}
            onCheckedChange={(checked) => {
              setRecoSwitchOn(checked);
              if (checked) {
                handleApplyRecoPreset();
              }
            }}
          />
        </div>
      </div>

        {isAiBackgroundLoading && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70">
                <SpinCardLoader size={80} />
                </div>
            )}
      {/* Carte Type + Prime */}
      <Card>
        <CardHeader className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <div className="flex flex-col gap-1">
      <CardTitle className="text-base">
        Type de 3e pilier &amp; prime
      </CardTitle>
      {isTypePrimeComplete && (
        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[11px] font-medium text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Étape complétée</span>
        </div>
      )}
    </div>
    <Badge variant="outline" className="text-[11px]">
      MoneyLife Configurator V.1
    </Badge>
  </div>
  <p className="text-xs text-muted-foreground">
    Choisissez le type de contrat, , le début et la fin du contrat et la prime maximale que vous souhaitez investir
  </p>
</CardHeader>
        <CardContent className="space-y-4">
          {/* Type 3a / 3b */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isLocked}
              variant={config.type === "3a" ? "default" : "outline"}
              onClick={() => handleTypeChange("3a")}
            >
              3e pilier lié (3a)
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isLocked}
              variant={config.type === "3b" ? "default" : "outline"}
              onClick={() => handleTypeChange("3b")}
            >
              3e pilier libre (3b)
            </Button>
          </div>

          {/* Âge actuel */}
<div className="space-y-1">
  <Label>Âge actuel</Label>
  <Input type="number" value={age || ""} readOnly disabled />
  <p className="text-[11px] text-muted-foreground">
    Âge calculé automatiquement à partir de vos données personnelles.
  </p>
</div>

{/* Date de début de l'offre — toujours seule sur sa ligne */}
<div className="space-y-2 mt-4">
  <Label>Date de début de l&apos;offre</Label>
  <p className="text-[11px] text-muted-foreground">
    Vous pouvez choisir le 1er du mois actuel ou des deux mois suivants.
  </p>

  <div className="flex flex-wrap gap-2">
    {offerDateOptions.map((opt) => (
      <Button
        key={opt.label}
        type="button"
        size="sm"
        variant={offerStartDate === opt.label ? "default" : "outline"}
        onClick={() => setOfferStartDate(opt.label)}
        disabled={isLocked}
      >
        {opt.label}
      </Button>
    ))}
  </div>

  <p className="text-[11px] text-muted-foreground">
    Date choisie : <span className="font-medium">{offerStartDate || "—"}</span>
  </p>
</div>

{/* Âge de fin de contrat */}
<div className="space-y-1 mt-4">
  <Label>Vôtre âge à la fin du contrat</Label>
  <Input
    type="number"
    value={config.endAge || ""}
    onChange={(e) => {
      const v = Number(e.target.value);
      setConfig((prev) => ({
        ...prev,
        endAge: Number.isFinite(v) ? v : prev.endAge,
      }));
    }}
    min={minEndAge}
    max={maxEndAge}
    disabled={isLocked}
  />
  <p className="text-[11px] text-muted-foreground">
    {config.type === "3a"
      ? "Pour un 3e pilier 3a, l'âge de fin doit être entre 60 et 65 ans."
      : "Pour un 3e pilier 3b, la durée du contrat doit être d'au moins 10 ans."}
  </p>
</div>

          {/* Prime + fréquence */}
<div
  className={
    hasRiskExceedsPremiumError
      ? "space-y-3 rounded-lg border border-amber-400/70 bg-amber-50/60 px-3 py-2 -mx-3"
      : "space-y-3"
  }
>
  <div className="flex items-center justify-between gap-2">
    <Label>
      Prime{" "}
      {config.premiumFrequency === "monthly" ? "mensuelle" : "anuelle"}{" "}
      (CHF)
    </Label>
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={
          config.premiumFrequency === "monthly"
            ? "default"
            : "outline"
        }
        onClick={() =>
          setConfig((prev) => ({
            ...prev,
            premiumFrequency: "monthly",
          }))
        }
        disabled={isLocked}
      >
        Mensuel
      </Button>
      <Button
        type="button"
        size="sm"
        variant={
          config.premiumFrequency === "yearly" ? "default" : "outline"
        }
        onClick={() =>
          setConfig((prev) => ({
            ...prev,
            premiumFrequency: "yearly",
          }))
        }
        disabled={isLocked}
      >
        Annuel
      </Button>
    </div>
  </div>

    <Input
    type="number"
    value={config.premiumAmount || ""}
    onChange={(e) => {
      const v = Number(e.target.value);
      setConfig((prev) => ({
        ...prev,
        premiumAmount: Number.isFinite(v) ? v : prev.premiumAmount,
      }));
    }}
    min={premiumBounds.min}
    max={premiumBounds.max}
    disabled={isLocked}
    className={
      hasPrimeBoundsError || hasRiskExceedsPremiumError
        ? "border-amber-500 focus-visible:ring-amber-500/70 bg-amber-50/60"
        : ""
    }
  />

  <Slider
    value={[
      Math.min(
        Math.max(config.premiumAmount, premiumBounds.min),
        premiumBounds.max
      ),
    ]}
    min={premiumBounds.min}
    max={premiumBounds.max}
    step={config.premiumFrequency === "monthly" ? 10 : 100}
    onValueChange={([val]) =>
      setConfig((prev) => ({
        ...prev,
        premiumAmount: val,
      }))
    }
    disabled={isLocked}
  />

  <p className="text-[11px] text-muted-foreground">
    Bornes actuelles : {premiumBounds.min.toFixed(2)} –{" "}
    {premiumBounds.max.toFixed(2)} CHF{" "}
    {config.premiumFrequency === "monthly" ? "par mois" : "par an"}.
  </p>
</div>
        </CardContent>
      </Card>



{/* Carte Couvertures de risque */}
<Card
  ref={riskCardRef}
  className={
    hasRiskExceedsPremiumError
      ? "border-red-500/70 shadow-[0_0_0_1px_rgba(220,38,38,0.35)] bg-red-50/40"
      : ""
  }
>
  <CardHeader className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <CardTitle className="text-base">Couvertures de risque</CardTitle>
        {isRiskCoversComplete && !hasRiskExceedsPremiumError && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[11px] font-medium text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            OK
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ajoutez ou retirez des couvertures. La part de prime dédiée au
        risque se met à jour automatiquement.
      </p>
      {hasRiskExceedsPremiumError && (
        <p className="mt-1 text-[11px] font-medium text-red-600">
          Vos couvertures dépassent la prime disponible. Réduisez un ou plusieurs montants de risque.
        </p>
      )}
    </div>
  </div>
</CardHeader>
        <CardContent className="space-y-4">
          {/* Capital décès fixe */}
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Capital décès fixe</Label>
                <p className="text-[11px] text-muted-foreground">
                  Montant versé si décès pendant la durée du contrat.
                </p>
              </div>
              <Switch
                checked={config.deathFixed.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    deathFixed: {
                      ...prev.deathFixed,
                      enabled: checked,
                    },
                  }))
                }
                disabled={isLocked}
              />
            </div>

            {config.deathFixed.enabled && (
              <div className="space-y-1">
                <Label>Capital assuré (CHF)</Label>
                <Input
                  type="number"
                  value={config.deathFixed.capital || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setConfig((prev) => ({
                      ...prev,
                      deathFixed: {
                        ...prev.deathFixed,
                        capital: Number.isFinite(v) ? v : prev.deathFixed.capital,
                      },
                    }));
                  }}
                  min={0}
                  step={10000}
                  disabled={isLocked}
                />
              </div>
            )}
          </div>

          {/* Capital décès décroissant */}
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Capital décès décroissant</Label>
                <p className="text-[11px] text-muted-foreground">
                  Le capital diminue chaque année jusqu&apos;à 0 en fin de
                  contrat (utile pour couvrir un crédit, par ex.).
                </p>
              </div>
              <Switch
                checked={config.deathDecreasing.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    deathDecreasing: {
                      ...prev.deathDecreasing,
                      enabled: checked,
                    },
                  }))
                }
                disabled={isLocked}
              />
            </div>

            {config.deathDecreasing.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Capital initial (CHF)</Label>
                  <Input
                    type="number"
                    value={config.deathDecreasing.capitalInitial || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setConfig((prev) => ({
                        ...prev,
                        deathDecreasing: {
                          ...prev.deathDecreasing,
                          capitalInitial: Number.isFinite(v)
                            ? v
                            : prev.deathDecreasing.capitalInitial,
                        },
                      }));
                    }}
                    min={0}
                    step={10000}
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Durée de décroissance (années)</Label>
                  <Input
                    type="number"
                    value={config.deathDecreasing.durationYears || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setConfig((prev) => ({
                        ...prev,
                        deathDecreasing: {
                          ...prev.deathDecreasing,
                          durationYears: Number.isFinite(v)
                            ? v
                            : prev.deathDecreasing.durationYears,
                        },
                      }));
                    }}
                    min={5}
                    max={40}
                    disabled={isLocked}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rente d'incapacité de gain (multi-rente avec rentes différées) */}
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Rente en cas d&apos;incapacité de gain</Label>
                <p className="text-[11px] text-muted-foreground">
                  Une seule couverture, avec possibilité de définir des rentes différées
                  (montants croissants dans le temps).
                </p>
              </div>
              <Switch
                checked={hasDisabilityRente}
                onCheckedChange={(checked) => {
                  setConfig((prev) => {
                    if (!checked) {
                      // On désactive entièrement la couverture IG
                      return {
                        ...prev,
                        disabilityAnnuities: [],
                      } as any;
                    }

                    const list =
                      ((prev as any).disabilityAnnuities as any[]) || [];

                    // Si déjà des rentes définies, on ne change rien
                    if (list.length > 0) {
                      return prev;
                    }

                      // Sinon, on crée une rente principale
                      const defaultWait: 3 | 12 | 24 = 24;
                      const minStartFromWait =
                        age + Math.ceil((defaultWait > 0 ? defaultWait : 0) / 12);

                      const first = {
                        enabled: true,
                        annualRente: 24000,
                        // Âge de début par défaut = âge actuel + délai d'attente (en années)
                        startAge: minStartFromWait,
                        waitingPeriod: defaultWait,
                      };

                      return {
                        ...prev,
                        disabilityAnnuities: [first],
                      } as any;
                  });
                }}
                disabled={isLocked}
              />
            </div>

            {hasDisabilityRente && (
              <div className="space-y-3">
                {((config as any).disabilityAnnuities || []).map(
  (rente: any, index: number, arr: any[]) => {
    const prev = arr[index - 1];

    // Montant minimum :
    // - Rente principale : au moins 6'000 CHF
    // - Rente différée : au moins (montant rente précédente + 1 CHF)
    const minAmountForThis =
      index === 0 ? 6000 : (prev?.annualRente ?? 0) + 1;

    // Âge minimum :
    // - Rente principale : lié au délai d'attente (mainMinStartAge)
    // - Rente différée : au moins (âge début rente précédente + 1 an)
    const minStartAgeForThis =
      index === 0
        ? mainMinStartAge
        : ((prev?.startAge ?? mainMinStartAge) + 1);

    return (
      <div
        key={index}
        className="space-y-2 rounded-lg border border-muted p-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            {index === 0 ? "Rente principale" : `Rente différée n°${index}`}
          </p>
          {index > 0 && !isLocked && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setConfig((prevCfg) => {
                  const list = [
                    ...((prevCfg as any).disabilityAnnuities || []),
                  ];
                  list.splice(index, 1);
                  return {
                    ...prevCfg,
                    disabilityAnnuities: list,
                  } as any;
                });
              }}
            >
              Supprimer
            </Button>
          )}
        </div>

        {index === 0 ? (
          // Rente principale : montant + délai d'attente + début
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Rente annuelle (CHF)</Label>
              <Input
                type="number"
                value={rente.annualRente || ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setConfig((prevCfg) => {
                    const list = [
                      ...((prevCfg as any).disabilityAnnuities || []),
                    ];
                    list[index] = {
                      ...list[index],
                      annualRente: Number.isFinite(v)
                        ? v
                        : list[index].annualRente,
                    };
                    return {
                      ...prevCfg,
                      disabilityAnnuities: list,
                    } as any;
                  });
                }}
                min={minAmountForThis}
                step={1000}
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1">
              <Label>Délai d&apos;attente (mois)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={rente.waitingPeriod}
                  onChange={(e) => {
                  const v = Number(e.target.value) as 3 | 12 | 24;
                  setConfig((prevCfg) => {
                    const list = [
                      ...((prevCfg as any).disabilityAnnuities || []),
                    ];
                    const current = list[index] || {};

                    // Nouveau minimum autorisé pour l'âge de début
                    const minStartFromWait =
                      age + Math.ceil((v > 0 ? v : 0) / 12);

                    list[index] = {
                      ...current,
                      waitingPeriod: v,
                      // Si l'âge actuel est trop bas, on le remonte au minimum
                      startAge:
                        typeof current.startAge === "number" &&
                        Number.isFinite(current.startAge) &&
                        current.startAge >= minStartFromWait
                          ? current.startAge
                          : minStartFromWait,
                    };

                    return {
                      ...prevCfg,
                      disabilityAnnuities: list,
                    } as any;
                  });
                }}
                disabled={isLocked}
              >
                <option value={3}>3 mois</option>
                <option value={12}>12 mois</option>
                <option value={24}>24 mois</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Âge de début</Label>
              <Input
                type="number"
                value={rente.startAge || ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setConfig((prevCfg) => {
                    const list = [
                      ...((prevCfg as any).disabilityAnnuities || []),
                    ];
                    list[index] = {
                      ...list[index],
                      startAge: Number.isFinite(v)
                        ? v
                        : list[index].startAge,
                    };
                    return {
                      ...prevCfg,
                      disabilityAnnuities: list,
                    } as any;
                  });
                }}
                min={minStartAgeForThis}
                max={config.endAge ? config.endAge - 2 : undefined}
                disabled={isLocked}
              />
              <p className="text-[11px] text-muted-foreground">
                Doit être au moins 2 ans avant l&apos;âge de fin du contrat.
              </p>
            </div>
          </div>
        ) : (
          // Rentes différées : montant + début
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Rente annuelle (CHF)</Label>
              <Input
                type="number"
                value={rente.annualRente || ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setConfig((prevCfg) => {
                    const list = [
                      ...((prevCfg as any).disabilityAnnuities || []),
                    ];
                    list[index] = {
                      ...list[index],
                      annualRente: Number.isFinite(v)
                        ? v
                        : list[index].annualRente,
                    };
                    return {
                      ...prevCfg,
                      disabilityAnnuities: list,
                    } as any;
                  });
                }}
                min={minAmountForThis}
                step={1000}
                disabled={isLocked}
              />
              <p className="text-[11px] text-muted-foreground">
                Montant strictement supérieur à la rente précédente.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Âge de début</Label>
              <Input
                type="number"
                value={rente.startAge || ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setConfig((prevCfg) => {
                    const list = [
                      ...((prevCfg as any).disabilityAnnuities || []),
                    ];
                    list[index] = {
                      ...list[index],
                      startAge: Number.isFinite(v)
                        ? v
                        : list[index].startAge,
                    };
                    return {
                      ...prevCfg,
                      disabilityAnnuities: list,
                    } as any;
                  });
                }}
                min={minStartAgeForThis}
                max={config.endAge ? config.endAge - 2 : undefined}
                disabled={isLocked}
              />
              <p className="text-[11px] text-muted-foreground">
                Cette rente prend le relais au moins 1 an après la précédente.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
)}

                {/* Bouton ajout nouvelle rente différée */}
                {!isLocked && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => {
                      setConfig((prev) => {
                        const list =
                          ((prev as any).disabilityAnnuities as any[]) || [];
                        if (list.length === 0) {
                          const defaultWait: 3 | 12 | 24 = 24;
                          const minStartFromWait =
                            age + Math.ceil((defaultWait > 0 ? defaultWait : 0) / 12);

                          const first = {
                            enabled: true,
                            annualRente: 24000,
                            // Âge de début par défaut = âge actuel + délai d'attente (arrondi en années)
                            startAge: minStartFromWait,
                            waitingPeriod: defaultWait,
                          };

                          return {
                            ...prev,
                            disabilityAnnuities: [first],
                          } as any;
                        }
                        const last = list[list.length - 1];
                        const next = {
                          enabled: true,
                          annualRente: (last.annualRente || 24000) + 6000,
                          startAge: (last.startAge || age + 5) + 2,
                          waitingPeriod: last.waitingPeriod ?? 24,
                        };
                        return {
                          ...prev,
                          disabilityAnnuities: [...list, next],
                        } as any;
                      });
                    }}
                  >
                    Ajouter une rente différée
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Libération de primes */}
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Libération du paiement des primes</Label>
                <p className="text-[11px] text-muted-foreground">
                  En cas d&apos;invalidité, l&apos;assureur paie la prime à votre
                  place.
                </p>
              </div>
              <Switch
                checked={config.premiumWaiver.enabled}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    premiumWaiver: {
                      ...prev.premiumWaiver,
                      enabled: checked,
                    },
                  }))
                }
                disabled={isLocked}
              />
            </div>

            {config.premiumWaiver.enabled && (
              <div className="space-y-1">
                <Label>Délai d&apos;attente (mois)</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={config.premiumWaiver.waitingPeriod}
                  onChange={(e) => {
                    const v = Number(e.target.value) as 3 | 12 | 24;
                    setConfig((prev) => ({
                      ...prev,
                      premiumWaiver: {
                        ...prev.premiumWaiver,
                        waitingPeriod: v,
                      },
                    }));
                  }}
                  disabled={isLocked}
                >
                  <option value={3}>3 mois</option>
                  <option value={12}>12 mois</option>
                  <option value={24}>24 mois</option>
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

            {/* Carte Épargne & investissement */}
      <Card>
        <CardHeader className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <div>
      <CardTitle className="text-base">Épargne &amp; investissement</CardTitle>
      <p className="text-xs text-muted-foreground">
        Nous utilisons un questionnaire intelligent pour déterminer votre profil
        d&apos;investisseur (horizon, tolérance au risque, durabilité).
      </p>
    </div>
    {isInvestorStepComplete && (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[11px] font-medium text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        OK
      </span>
    )}
  </div>
</CardHeader>
        <CardContent className="space-y-4">
          {/* Avec ou sans fonds */}
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Souhaitez-vous investir dans des fonds ?</Label>
                <p className="text-[11px] text-muted-foreground">
                  Cela permet d&apos;espérer un meilleur rendement en échange d&apos;une
                  fluctuation plus importante de votre capital. Important : La pluspart des offres sur le marché actuel, inclent un minimum d'investissement obligatoire dans des fonds en actions.
                </p>
              </div>
              <Switch
                checked={config.savings.withFunds}
                onCheckedChange={(checked) => {
                  // Si le user coupe, on annule le profil IA
                  if (!checked) {
                    setInvestorProfileConfirmed(false);
                    setEquityMinPct(null);
                    setEquityMaxPct(null);
                  }
                  setConfig((prev) => ({
                    ...prev,
                    savings: {
                      ...prev.savings,
                      withFunds: checked,
                    },
                  }));
                }}
                disabled={isLocked}
              />
            </div>

            {config.savings.withFunds && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-[11px] text-muted-foreground">
                  Pour définir un profil adapté, nous vous posons quelques questions
                  sur vos connaissances, votre horizon de placement et votre capacité à
                  assumer les risques.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                        const qs = buildInvestorQuestions(clientData);
                        setInvestorQuestions(qs);

                        // Aller à la première question non répondue, sinon revenir au début
                        const firstUnansweredIndex = qs.findIndex(
                        (q) => !investorAnswers[q.id]
                        );

                        setInvestorStep(
                        firstUnansweredIndex === -1 ? 0 : firstUnansweredIndex
                        );

                        setInvestorOpen(true);
                    }}
                    disabled={isLocked}
                    >
                    Répondre au questionnaire Profil d'investisseur
                    </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // User refuse → pas de fonds
                      setConfig((prev) => ({
                        ...prev,
                        savings: {
                          ...prev.savings,
                          withFunds: false,
                        },
                      }));
                      setInvestorProfileConfirmed(false);
                      setEquityMinPct(null);
                      setEquityMaxPct(null);
                      toast("Investissement en fonds désactivé", {
                        description:
                          "Nous partons du principe que vous ne souhaitez pas investir dans des fonds.",
                      });
                    }}
                    disabled={isLocked}
                  >
                    Je ne souhaite pas répondre
                  </Button>
                </div>

                {investorProfileConfirmed && equityMinPct != null && equityMaxPct != null && (
                  <div className="mt-2 rounded-md bg-muted/40 p-2 text-[11px] space-y-2">
                    <p className="font-medium text-xs">
                      Recommandation MoneyLife (profil d&apos;investisseur)
                    </p>
                    <p className="text-muted-foreground">
                      Sur la base de vos réponses, MoneyLife recommande un taux
                      possible d&apos;investissement en actions entre{" "}
                      <span className="font-semibold">{equityMinPct}%</span> et{" "}
                      <span className="font-semibold">{equityMaxPct}%</span>.
                    </p>

                    {/* Slider de choix de la part en actions */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Votre choix d&apos;actions</span>
                        <span className="font-semibold">
                          {(equityChosenPct ?? equityMaxPct ?? equityMinPct).toFixed(0)}%
                        </span>
                      </div>

                      <Slider
                        value={[
                          equityChosenPct ?? equityMaxPct ?? equityMinPct,
                        ]}
                        min={0}
                        max={100}
                        step={5}
                          onValueChange={([val]) => {
                          setEquityChosenPct(val);
                          setEquityOverrideAck(false);
                          // à chaque mouvement, on sauvegarde le nouveau choix
                          // et on remet overrideAck à false côté Firestore
                          saveEquityChoiceToFirestore(val, false);
                        }}
                        disabled={isLocked}
                      />

                      {/* Barre verte = zone conforme au profil */}
                      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden relative">
                        {/* zone verte */}
                        <div
                          className="absolute inset-y-0 bg-emerald-500/70"
                          style={{
                            left: `${equityMinPct}%`,
                            width: `${Math.max(equityMaxPct - equityMinPct, 0)}%`,
                          }}
                        />
                      </div>

                      {/* Message d'interprétation */}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(() => {
                          const chosen = equityChosenPct ?? equityMaxPct ?? equityMinPct;
                          if (chosen < equityMinPct) {
                            return "Vous êtes en dessous de la zone recommandée : vous prenez moins de risque que prévu mais pourriez manquer des opportunités de rendement.";
                          }
                          if (chosen > equityMaxPct) {
                            return "Vous êtes au-dessus de la zone recommandée : votre portefeuille sera plus risqué que ce que suggère votre profil.";
                          }
                          return "Vous êtes dans la zone recommandée pour votre profil d'investisseur.";
                        })()}
                      </p>

                      {/* Décharge si en dehors du profil */}
                      {(() => {
                        const chosen = equityChosenPct ?? equityMaxPct ?? equityMinPct;
                        const isOutside = chosen < equityMinPct || chosen > equityMaxPct;
                        if (!isOutside) return null;
                        return (
                          <label className="mt-1 flex items-start gap-2 text-[10px] text-muted-foreground">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3 w-3"
                              checked={equityOverrideAck}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEquityOverrideAck(checked);

                                const chosen =
                                  equityChosenPct ?? equityMaxPct ?? equityMinPct ?? 0;

                                if (typeof chosen === "number" && !Number.isNaN(chosen)) {
                                  // on persiste le choix + le fait que le client accepte ou non de s'écarter
                                  saveEquityChoiceToFirestore(chosen, checked);
                                }
                              }}
                              disabled={isLocked}
                            />
                            <span>
                              Je comprends que mon choix ne respecte pas la recommandation
                              de MoneyLife et j&apos;accepte le risque de m&apos;en écarter.
                            </span>
                          </label>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transfert 3a existant - seulement pour 3a */}
          {config.type === "3a" && (
            <div className="space-y-2 rounded-xl border border-dashed p-3">
              <div className="space-y-1">
                <Label>Capital 3a existant à transférer (CHF)</Label>
                <Input
                  type="number"
                  value={config.savings.transferAmount3a ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setConfig((prev) => ({
                      ...prev,
                      savings: {
                        ...prev.savings,
                        transferAmount3a: Number.isFinite(v) ? v : 0,
                      },
                    }));
                  }}
                  min={0}
                  step={1000}
                  disabled={isLocked}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ce capital sera ajouté à votre épargne 3a dès le départ et
                participera aux intérêts composés dans le même profil
                d&apos;investissement.
              </p>
            </div>
          )}

          {config.type === "3b" && (
            <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Le transfert d&apos;un ancien 3a n&apos;est pas possible dans un
              3e pilier libre (3b). Si vous avez déjà un 3a, il sera géré
              séparément.
            </div>
          )}
        </CardContent>
      </Card>

            {/* Carte Santé simplifiée */}
      <Card>
          <CardHeader className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div>
        <CardTitle className="text-base">Profil de santé &amp; lifestyle</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ces informations servent uniquement à estimer les primes de risque.
          Le questionnaire complet est obligatoire pour demander des offres.
        </p>
      </div>
      {isHealthStepComplete && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[11px] font-medium text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          OK
        </span>
      )}
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
              {/* Métier */}
              <div className="space-y-1">
              <Label>Profession principale</Label>
              <Input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                onBlur={handleProfessionBlur}
                placeholder="Employé·e de commerce, infirmier·ère, enseignant·e, ..."
                disabled={isLocked}
                className={
                  hasProfessionError
                    ? "border-amber-500 bg-amber-50/60 focus-visible:ring-amber-500/70"
                    : ""
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Votre métier influence l&apos;analyse de risque (travail physique,
                horaires de nuit, etc.). MoneyLife peut vous poser une ou deux
                questions de précision si nécessaire.
              </p>
            </div>

    {/* Info sur le questionnaire */}
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
      <HeartPulse className="h-3.5 w-3.5 text-primary" />
      <span>
        Répondez à quelques questions simples sur votre santé et votre mode de vie
        (tabac, taille, poids, tension, etc.). Cela évite un long formulaire
        assureur dès le début.
      </span>
    </div>

    {/* CTA pour ouvrir le wizard */}
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setHealthWizardOpen(true)}
      disabled={isLocked}
    >
      Ouvrir le questionnaire Santé &amp; Lifestyle
    </Button>

    {healthBlockUs && (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800">
        Selon vos réponses, vous ne pouvez pas souscrire à ce produit
        (statut fiscal US). Merci de votre conseiller bancaire ou postal.
      </div>
    )}
  </CardContent>
</Card>




            {/* Carte Données personnelles */}
      <Card>
        <CardHeader className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <div>
      <CardTitle className="text-base">Données personnelles</CardTitle>
      <p className="text-xs text-muted-foreground">
        Ces informations sont nécessaires pour préparer vos offres
        personnalisées. Tous les champs sont obligatoires.
      </p>
    </div>
    {isPersonalDataComplete && (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[11px] font-medium text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        OK
      </span>
    )}
  </div>
</CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prénom</Label>
              <Input value={firstName} disabled readOnly />
            </div>
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input value={lastName} disabled readOnly />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Sexe</Label>
              <Input value={sexLabel} disabled readOnly />
            </div>
            <div className=" space-y-1">
              <Label>Date de naissance</Label>
              <Input value={birthdateLabel} disabled readOnly />
            </div>
            <div className="space-y-1">
              <Label>État civil</Label>
              <Input value={etatCivilLabel} disabled readOnly />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nationalité</Label>
                <Select
                value={nationality}
                onValueChange={(value) => {
                  setNationality(value);
                  setNationalitySearch("");
                }}
                disabled={isLocked}
              >
                <SelectTrigger
                  className={
                    hasNationalityError
                      ? "border-amber-500 focus-visible:ring-amber-500/70 bg-amber-50/60"
                      : ""
                  }
                >
                  <SelectValue placeholder="Sélectionnez votre nationalité" />
                </SelectTrigger>
                                <SelectContent className="max-h-64">
                  {/* Barre de recherche code/pays */}
                  <div className="px-2 pb-1 pt-1.5">
                    <Input
                      autoFocus
                      placeholder="Recherche (code ou pays)…"
                      className="h-7 text-[11px]"
                      value={nationalitySearch}
                      onChange={(e) => setNationalitySearch(e.target.value)}
                    />
                  </div>

                  {filteredNationalities.map((n) => (
                    <SelectItem key={n.code} value={n.code}>
                      <span className="flex items-center gap-2">
                        <span className="text-base leading-none">{n.flag}</span>
                        <span className="text-xs">
                          {n.name}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            ({n.code})
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Autorisation de séjour (si non Suisse)</Label>
              <Select
                value={residencePermit}
                onValueChange={(value) => setResidencePermit(value)}
                disabled={isLocked || isSwiss}
              >
                <SelectTrigger
                    className={
                      hasResidencePermitError
                        ? "border-amber-500 focus-visible:ring-amber-500/70 bg-amber-50/60"
                        : ""
                    }
                  >
                    <SelectValue
                      placeholder={
                        isSwiss
                          ? "Non applicable (Suisse)"
                          : "Sélectionnez votre autorisation"
                      }
                  />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B">
                    Autorisation de séjour B
                  </SelectItem>
                  <SelectItem value="C">
                    Autorisation de séjour C
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  {/* Adresse (rue + n°) */}
  <div className="space-y-1 sm:col-span-2">
    <Label>Adresse (rue et n°)</Label>

    {/* Contour d'erreur comme les autres champs */}
    <div
      className={
        isAddressInvalid
          ? "rounded-md border border-amber-500 bg-amber-50/60 p-1"
          : "p-1"
      }
    >
      <AddressAutocomplete
        label="" // ⬅️ on supprime le label interne
        placeholder="Commencez à taper votre adresse… (ex. Rue de la Gare 54)"
        disabled={isLocked}
        initialStreet={street}
        initialZip={zip}
        initialCity={city}
        onAddressSelected={(addr) => {
          setStreet(addr.street);
          setZip(addr.zip);
          setCity(addr.city);
        }}
      />
    </div>

    {isAddressInvalid && (
      <p className="mt-1 text-[11px] text-amber-800">
        Merci d’indiquer une adresse complète : rue <strong>et</strong> numéro
        (ex. <span className="font-medium">Rue de la Gare&nbsp;54</span>).
      </p>
    )}
  </div>

  {/* NPA / Localité */}
  <div className="space-y-1">
    <Label>NPA / Localité</Label>
    <div className="flex gap-2">
      <Input
        className={
          "w-24 " +
          (isAddressInvalid
            ? "border-amber-500 bg-amber-50/60 focus-visible:ring-amber-500/70"
            : "")
        }
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        disabled={isLocked}
        placeholder="1950"
      />
      <Input
        className={
          "flex-1 " +
          (isAddressInvalid
            ? "border-amber-500 bg-amber-50/60 focus-visible:ring-amber-500/70"
            : "")
        }
        value={city}
        onChange={(e) => setCity(e.target.value)}
        disabled={isLocked}
        placeholder="Sion"
      />
    </div>
  </div>
</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Adresse e-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLocked}
                placeholder="vous@exemple.ch"
                className={
                  hasEmailError
                    ? "border-amber-500 focus-visible:ring-amber-500/70 bg-amber-50/60"
                    : ""
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Téléphone</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLocked}
                placeholder="+41 79 123 45 67"
                className={
                  hasPhoneError
                    ? "border-amber-500 focus-visible:ring-amber-500/70 bg-amber-50/60"
                    : ""
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résumé & CTA */}
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">Résumé de votre configuration</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ajustez les curseurs jusqu&apos;à trouver l&apos;équilibre idéal entre
            protection et épargne.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Nom de l'offre */}
          <div className="space-y-1">
            <Label>Nom de votre offre</Label>
            <Input
              type="text"
              value={offerName}
              onChange={(e) => {
                const value = e.target.value || "";
                setOfferName(value || "Offre 1");
                // on garde aussi une trace dans la config (utile pour backend/admin)
                setConfig((prev) => ({
                  ...prev,
                  offerName: value || "Offre 1",
                }));
              }}
              maxLength={60}
              disabled={isLocked}
              placeholder="Offre 1, Offre famille, Offre maison principale..."
            />
            <p className="text-[10px] text-muted-foreground">
              Ce nom est visible uniquement dans votre espace client MoneyLife.
            </p>
          </div>
                      {/* Profil investisseur - mise en évidence */}
          {investorProfileConfirmed &&
            equityMinPct != null &&
            equityMaxPct != null && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3">
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <UserRoundCheck size={14} className="text-primary" />
                  Profil d&apos;investisseur
                </p>
                <p className="text-sm">
                  MoneyLife estime que vous pouvez investir environ{" "}
                  <span className="font-semibold">
                    {equityMinPct}% à {equityMaxPct}%
                  </span>{" "}
                  de votre épargne 3e pilier en actions.
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Cette recommandation est basée sur vos réponses au
                  questionnaire (revenu, capacité d&apos;épargne, horizon,
                  sécurité et durabilité).
                </p>
              </div>
            )}
            {projectedCapitals !== null && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <TrendingUp size={14} className="text-primary" />
                  Capitaux projetés à {config.endAge} ans
                </p>

                {/* Scénario modéré */}
                <p className="text-sm font-semibold">
                  Scénario modéré{" "}
                  <span className="font-normal text-[11px] text-muted-foreground">
                    ({projectedCapitals.moderateRate.toFixed(1)}% brut/an)
                  </span>
                  <br />
                  <span className="text-base">
                    {Math.round(projectedCapitals.moderate).toLocaleString(
                      "fr-CH"
                    )}{" "}
                    CHF
                  </span>
                </p>

                {/* Scénario pessimiste */}
                <p className="text-xs text-muted-foreground">
                  Pessimiste ({projectedCapitals.pessimisticRate.toFixed(1)}% brut/an) :{" "}
                  <span className="font-medium">
                    {Math.round(projectedCapitals.pessimistic).toLocaleString(
                      "fr-CH"
                    )}{" "}
                    CHF
                  </span>
                </p>

                {/* Scénario optimiste */}
                <p className="text-xs text-muted-foreground">
                  Optimiste ({projectedCapitals.optimisticRate.toFixed(1)}% brut/an) :{" "}
                  <span className="font-medium">
                    {Math.round(projectedCapitals.optimistic).toLocaleString(
                      "fr-CH"
                    )}{" "}
                    CHF
                  </span>
                </p>

                {hasTransferredCapital && (
                  <p className="text-[10px] text-muted-foreground">
                    Dont capital 3a transféré :{" "}
                    <span className="font-medium">
                      {transferredCapital.toLocaleString("fr-CH")} CHF
                    </span>
                  </p>
                )}
              </div>
            )}

        {offerStartDate && (
            <p className="text-[10px] text-muted-foreground">
                Début de l&apos;offre :{" "}
                <span className="font-medium">{offerStartDate}</span>
            </p>
            )}

          {/* Vos protections en cas de coup dur */}
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ShieldCheck size={14} className="text-primary" />
            Vos protections en cas de coup dur
            </p>

            {!hasAnyCover && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">
                  Aucune couverture de risque ajoutée. Vous faites uniquement de
                  l&apos;épargne.
                </p>
              </div>
            )}

            {hasAnyCover && (
              <div className="rounded-md border bg-muted/40 p-3">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {config.deathFixed.enabled && (
  <li className="flex gap-2">
    <ShieldCheck size={14} className="mt-0.5" />
    <div className="flex flex-col leading-tight">
      <span className="font-medium">
        Montant versé en cas de décès (capital fixe)
      </span>
      <span>
        {Number(config.deathFixed.capital || 0).toLocaleString("fr-CH")} CHF
      </span>
    </div>
  </li>
)}

{config.deathDecreasing.enabled && (
  <li className="flex gap-2">
    <ShieldCheck size={14} className="mt-0.5" />
    <div className="flex flex-col leading-tight">
      <span className="font-medium">
        Montant versé en cas d&apos;décès (capital décroissant)
      </span>
      <span>
        {Number(
          config.deathDecreasing.capitalInitial || 0
        ).toLocaleString("fr-CH")}{" "}
        CHF au départ, sur {config.deathDecreasing.durationYears} ans
      </span>
    </div>
  </li>
)}

                  {hasDisabilityRente &&
                    ((config as any).disabilityAnnuities || []).map(
                      (rente: any, index: number) => {
                        const label =
                          index === 0
                            ? "Rente annuelle en cas d'incapacité de gain (maladie/accident)"
                            : `Rente annuelle différée n°${index}`;
                        const startYear =
                          typeof rente.startAge === "number" &&
                          Number.isFinite(rente.startAge) &&
                          Number.isFinite(age)
                            ? currentYear + (rente.startAge - age)
                            : null;

                        return (
                          <li key={index} className="flex gap-2">
                            <ShieldCheck size={14} className="mt-0.5" />
                            <div className="flex flex-col leading-tight">
                                <span className="font-medium">{label}</span>
                                <span>
                                {Number(rente.annualRente || 0).toLocaleString("fr-CH")} CHF/an • 
                                délai {rente.waitingPeriod} mois • 
                                début à {startYear ?? "?"} • fin en {contractEndYear ?? "?"}
                                </span>
                            </div>
                            </li>
                        );
                      }
                    )}

                  {config.premiumWaiver.enabled && (
                    <li className="flex gap-2">
                        <ShieldCheck size={14} className="mt-0.5" />
                        <div className="flex flex-col leading-tight">
                        <span className="font-medium">Libération du paiement des primes</span>
                        <span>
                            Délai d&apos;attente : {config.premiumWaiver.waitingPeriod ?? config.premiumWaiver.waitingPeriod} mois
                        </span>
                        </div>
                    </li>
                    )}
                </ul>
              </div>
            )}
          </div>

          {/* Détails techniques (facultatif) */}
          <div className="space-y-2 border-t pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Détails techniques
            </p>
            <div className="grid gap-3 text-[11px] sm:grid-cols-2">
              <div className="space-y-0.5">
                <p className="text-muted-foreground">Type de contrat</p>
                <p className="font-medium text-foreground">
                  {config.type === "3a"
                    ? "3e pilier lié (3a)"
                    : "3e pilier libre (3b)"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">Répartition estimée</p>
                <p className="font-medium text-foreground">
                  Risque ~{" "}
                    {config.premiumAmount > 0
                        ? ((totalRiskPremium / config.premiumAmount) * 100).toFixed(1)
                        : "0"}
                    % / Épargne ~{" "}
                    {config.premiumAmount > 0
                        ? (
                            100 -
                            Math.min(
                            (totalRiskPremium / config.premiumAmount) * 100,
                            100
                            )
                        ).toFixed(1)
                        : "0"}
                    %
                </p>
              </div>
              <div className="space-y-0.5 col-span-2">
                <p className="text-muted-foreground">ID configuration</p>
                <p className="font-mono text-[10px] break-all text-muted-foreground">
                  {config.id}
                </p>
              </div>
            </div>

            {/* Barre visuelle répartition risque / épargne */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                    <ShieldCheck size={12} className="text-primary" /> Risque
                    </span>

                    <span className="flex items-center gap-1">
                    <PiggyBank size={12} className="text-primary" /> Épargne
                    </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                {config.premiumAmount > 0 ? (
                  <div className="flex h-full w-full">
                    <div
                      className="h-full bg-amber-500/80"
                      style={{
                        width: `${Math.min(
                            (totalRiskPremium / config.premiumAmount) * 100,
                            100
                        ).toFixed(1)}%`,
                        }}
                    />
                    <div
                        className="h-full bg-emerald-500/80"
                        style={{
                            width: `${Math.max(
                            0,
                            100 -
                                Math.min(
                                (totalRiskPremium / config.premiumAmount) * 100,
                                100
                                )
                            ).toFixed(1)}%`,
                        }}
                        />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Erreurs de validation */}
          {validationErrors.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                À ajuster avant la demande d&apos;offres :
              </p>
              <ul className="list-disc pl-4">
                {validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {isSubmitting && (
            <div className="flex justify-center py-4">
              <SpinCardLoader size={80} />
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              Une fois validé, envoyez vos demandes d'offres et comparez des offres réelles en vous rendant sous l'onglet "Mes offres" de votre Dashboard.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!canRequestOffers || isLocked || isSubmitting}
                onClick={handleRequestOffers}
              >
                {isLocked
                  ? "Configuration envoyée"
                  : isSubmitting
                  ? "Envoi en cours..."
                  : "Demander mes offres"}
              </Button>

              {isLocked && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleNewConfig}
                >
                  Nouvelle configuration
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>


        <HealthWizardShell
      open={healthWizardOpen}
      onOpenChange={setHealthWizardOpen}
      initialHeightCm={heightCm}
      initialWeightKg={weightKg}
      initialHasHypertension={hasHypertension}
      initialIsSmoker={isSmoker}
      professionLabel={profession}
      onCompleted={async (data) => {
        // 1) Met à jour l’état pour le pricing
        setIsSmoker(data.isSmoker);
        setHasHypertension(data.hasHypertension);
        setHeightCm(data.heightCm);
        setWeightKg(data.weightKg);
        setHasHealthIssues(data.hasHighCholesterol || data.hasHypertension);
        setHealthQuestionnaireCompleted(true);
        setHealthBlockUs(data.healthBlockUs);

        // 2) Sauvegarde complète dans Firestore
        await saveHealthQuestionnaireToFirestore(data);
      }}
    />           


   {/* Dialogue Actuaire IA */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="w-[80vw] max-w-none max-h-[80vh] p-6 flex flex-col">
          <DialogHeader>
            <DialogTitle>MoneyLife Assitant – Précision sur votre métier</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm h-full">
  {/* Zone scrollable : historique + formulaire */}
  <div className="flex-1 overflow-y-auto space-y-3">
    {/* Historique des messages */}
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
      {aiConversation.length === 0 && !aiLoading && (
        <p className="text-muted-foreground">
          MoneyLife a besoin d’une précision sur votre métier. Répondez simplement à la question ci-dessus.
        </p>
      )}

      {aiConversation.map((m, idx) => (
        <div
          key={idx}
          className={`flex ${
            m.role === "assistant" ? "justify-start" : "justify-end"
          }`}
        >
          <div
            className={`rounded-xl px-2 py-1 ${
              m.role === "assistant"
                ? "bg-muted text-xs"
                : "bg-primary text-xs text-primary-foreground"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}

      {aiLoading && (
        <p className="text-muted-foreground text-xs">Analyse MoneyLife…</p>
      )}
    </div>

    {/* Champ réponse */}
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const answer = String(fd.get("answer") || "").trim();
        if (!answer) return;

        // On ajoute la réponse côté UI
        setAiConversation((prev) => [
          ...prev,
          { role: "user", content: answer },
        ]);
        form.reset();
        setAiLoading(true);

        try {
          const res = await fetch("/api/underwriting/3epilier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            config,
            pricingContext,
            profession,
            conversationHistory: [
                ...aiConversation,
                { role: "user", content: answer },
            ],
            }),
          });

          const json = await res.json();
          if (!json.ok) throw new Error(json.error || "Erreur IA");

          const { underwriting } = json;
          setAiUnderwriting(underwriting);

          // Si le métier vient d'être confirmé dans cette réponse, on met à jour le champ "Profession principale"
          if (
            underwriting.professionConfirmed === true &&
            underwriting.normalizedProfession &&
            typeof underwriting.normalizedProfession === "string"
          ) {
            setProfession(underwriting.normalizedProfession);
            setProfessionConfirmed(true);
          } else {
            setProfessionConfirmed(false);
          }

          // Mettre à jour la classe de risque métier
          if (
            typeof underwriting.occupationRiskClass === "number" &&
            Number.isFinite(underwriting.occupationRiskClass)
          ) {
            setOccupationRiskClass(underwriting.occupationRiskClass);
          } else {
            setOccupationRiskClass(null);
          }

          if (underwriting.nextQuestion || underwriting.professionQuestion) {
            // Si l'IA veut encore poser une question, on l'ajoute dans la conversation
            const nextQ =
              underwriting.nextQuestion || underwriting.professionQuestion;
            if (nextQ) {
              setAiConversation((prev) => [
                ...prev,
                { role: "assistant", content: nextQ },
              ]);
            }
          } else {
            // Plus de questions: on peut fermer le modal
            toast("Métier confirmé ✅", {
              description: underwriting.decisionMessage,
            });
            setAiOpen(false);
          }
        } catch (err) {
          console.error(err);
          toast("Erreur IA", {
            description:
              "Impossible de poursuivre la discussion avec l’IA pour le moment.",
          });
        } finally {
          setAiLoading(false);
        }
      }}
    >
      <Textarea
        name="answer"
        placeholder="Votre réponse…"
        className="text-sm min-h-[80px]"
        disabled={aiLoading}
      />
      <DialogFooter className="mt-1">
        <Button type="submit" size="sm" disabled={aiLoading}>
          Envoyer
        </Button>
      </DialogFooter>
    </form>
  </div>

  {/* Résumé toujours visible en bas */}
  {aiUnderwriting?.decisionMessage && (
    <div className="rounded-md border bg-muted/40 p-2 text-xs">
      <p className="font-medium">Résumé provisoire</p>
      <p className="text-muted-foreground">
        {aiUnderwriting.decisionMessage}
      </p>
    </div>
  )}
</div>
        </DialogContent>
      </Dialog>
            {/* Dialogue IA — Profil d'investisseur */}
      <Dialog open={investorOpen} onOpenChange={(open) => {
        if (!investorLoading) {
          setInvestorOpen(open);
        }
      }}>
        <DialogContent className="w-[100vw] max-w-lg h-[100vh] sm:w-[90vw] sm:h-[90vh] max-h-[100vh] p-6 flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Profil d&apos;investisseur</DialogTitle>
          </DialogHeader>

            <div
            ref={investorScrollRef}
            className="flex-1 overflow-y-auto space-y-4 mt-2"
            >
            {/* Question en cours */}
                        {investorQuestions[investorStep] && (
                        <div className="space-y-3">
                            <p className="font-medium text-sm">
                            {investorQuestions[investorStep].label}
                            </p>
                            <div className="flex flex-col gap-2">
                            {investorQuestions[investorStep].options.map((opt: any) => (
                            <Button
                                key={opt.id}
                                type="button"
                                variant={
                                investorAnswers[investorQuestions[investorStep].id] === opt.id
                                    ? "default"
                                    : "outline"
                                }
                                className="w-full justify-start text-left text-xs whitespace-normal break-words"
                                disabled={investorLoading}
                                onClick={() => {
                                const qid = investorQuestions[investorStep].id;
                                const nextAnswers = {
                                    ...investorAnswers,
                                    [qid]: opt.id,
                                };
                                setInvestorAnswers(nextAnswers);

                                if (investorStep + 1 < investorQuestions.length) {
                                    setInvestorStep((s) => s + 1);
                                    scrollInvestorToTop();
                                } else {
                                    // Dernière question → on envoie à l'IA
                                    handleInvestorFinalSubmit(nextAnswers);
                                    scrollInvestorToTop();
                                }
                                }}
                            >
                                {opt.label}
                            </Button>
                            ))}
                            </div>
                            <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">
                                Question {investorStep + 1} sur {investorQuestions.length}
                            </p>
                            <Progress
                                value={
                                investorQuestions.length > 0
                                    ? ((investorStep + 1) / investorQuestions.length) * 100
                                    : 0
                                }
                                className="h-1"
                            />
                            </div>
                        </div>
                        )}

            {investorLoading && (
              <div className="flex justify-center py-4">
                <SpinCardLoader size={60} />
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={investorLoading}
              onClick={() => {
                // Refus → pas de fonds
                setConfig((prev) => ({
                  ...prev,
                  savings: {
                    ...prev.savings,
                    withFunds: false,
                  },
                }));
                setInvestorProfileConfirmed(false);
                setEquityMinPct(null);
                setEquityMaxPct(null);
                setInvestorOpen(false);
                toast("Investissement en fonds désactivé", {
                  description:
                    "Nous partons du principe que vous ne souhaitez pas investir dans des fonds.",
                });
              }}
            >
              Je ne souhaite pas répondre
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={investorLoading || investorStep === 0}
              onClick={() => {
                setInvestorStep((s) => Math.max(0, s - 1));
              }}
            >
              Question précédente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog quitter sans envoyer */}
<Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>Quitter cette configuration ?</DialogTitle>
      <DialogDescription>
        Vous n&apos;avez pas encore envoyé votre demande d&apos;offres.
        Si vous quittez maintenant, votre configuration risque d&apos;être perdue.
      </DialogDescription>
    </DialogHeader>
    <div className="mt-4 flex justify-end gap-2">
      <Button
        variant="outline"
        onClick={() => setLeaveDialogOpen(false)}
        size="sm"
      >
        Rester ici
      </Button>
      <Button
        size="sm"
        className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-1 focus-visible:ring-red-500"
        onClick={() => {
          window.location.href = "/dashboard";
        }}
      >
        Quitter quand même
      </Button>
    </div>
  </DialogContent>
</Dialog>
    </div> 
    </>
  );
};