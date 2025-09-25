"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Star } from "lucide-react";

// Couleurs brand (mémo)
// primary: #0030A8 / success: #4fd1c5 / warning: #F59E0B

// ---- Plans ----
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Commencer en toute simplicité",
    popular: false,
    features: [
      "Scan LPP basique (3 min)",
      "1 espace client",
      "Comparatif offres 3a (limité)",
      "Support par email",
    ],
    prices: { monthly: 0, yearly: 0 },
    cta: { label: "Choisir Starter", href: "/checkout?plan=starter" },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Pour aller vite et bien",
    popular: true,
    features: [
      "Scan LPP avancé + OCR",
      "Espace client illimité",
      "Comparatif 3a temps réel",
      "Export PDF brandé MoneyLife",
      "Priorité parsing offres (Gmail)",
    ],
    prices: { monthly: 29, yearly: 290 }, // 2 mois off
    cta: { label: "Choisir Pro", href: "/checkout?plan=pro" },
  },
  {
    id: "business",
    name: "Business",
    tagline: "Pour les équipes & partenaires",
    popular: false,
    features: [
      "Tout Pro",
      "Accès multi‑collaborateurs",
      "SLA & support prioritaire",
      "Signature Swisscom Sign (add‑on)",
      "Intégration CRM/API",
    ],
    prices: { monthly: 79, yearly: 790 }, // 2 mois off
    cta: { label: "Contacter les ventes", href: "/contact?topic=business" },
  },
] as const;

type Billing = "monthly" | "yearly";

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");

  const subtitle = useMemo(
    () =>
      billing === "monthly"
        ? "Facturation mensuelle, annulable à tout moment"
        : "Facturation annuelle (2 mois off)",
    [billing]
  );

  return (
    <main className="min-h-[100dvh] bg-white">
      {/* HERO */}
      <section className="relative border-b">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-neutral-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#4fd1c5" }} />
              MoneyLife — Abonnements 3a
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
              Choisis l’abo qui te fait gagner du temps
            </h1>
            <p className="max-w-2xl text-neutral-600">
              Un design sobre, des perfs solides, une approche "tech" façon Stripe. Passe au
              niveau supérieur en quelques clics.
            </p>
            <BillingToggle billing={billing} onChange={setBilling} />
            <p className="text-sm text-neutral-500">{subtitle}</p>
          </div>
        </div>
      </section>

      {/* PRICING GRID */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-10 sm:grid-cols-3 sm:gap-8 sm:py-16">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} billing={billing} />
          ))}
        </div>

        {/* Notes */}
        <div className="mx-auto max-w-6xl px-6 pb-16 text-xs text-neutral-500">
          <p className="leading-relaxed">
            Les prix sont indiqués en CHF, TVA en sus. Le plan Starter est gratuit pour tester le
            scan LPP et le comparatif d’offres 3a. Les fonctionnalités Swisscom Sign sont
            disponibles en add‑on payant.
          </p>
        </div>
      </section>
    </main>
  );
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border p-1 text-sm">
      <button
        onClick={() => onChange("monthly")}
        className={
          "rounded-full px-3 py-1 transition " +
          (billing === "monthly"
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100")
        }
      >
        Mensuel
      </button>
      <button
        onClick={() => onChange("yearly")}
        className={
          "rounded-full px-3 py-1 transition " +
          (billing === "yearly"
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100")
        }
      >
        Annuel
      </button>
    </div>
  );
}

function PlanCard({ plan, billing }: { plan: typeof PLANS[number]; billing: Billing }) {
  const price = plan.prices[billing];
  const isFree = price === 0;

  return (
    <div
      className={
        "relative flex h-full flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm " +
        (plan.popular ? "ring-2 ring-[#4fd1c5]" : "")
      }
    >
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow-sm">
          <Star className="h-3.5 w-3.5" />
          Populaire
        </div>
      )}

      <div>
        <h3 className="text-xl font-semibold text-neutral-900">{plan.name}</h3>
        <p className="mt-1 text-sm text-neutral-600">{plan.tagline}</p>

        <div className="mt-6 flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight text-neutral-900">
            {isFree ? "0" : price}
          </span>
          <span className="text-sm text-neutral-500">{isFree ? "" : "/mois"}</span>
        </div>

        {billing === "yearly" && !isFree && (
          <div className="mt-1 text-xs text-neutral-500">{price} CHF/mois facturé annuellement</div>
        )}

        <ul className="mt-6 space-y-3 text-sm">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-neutral-700">
              <span
                className="mt-1 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full"
                style={{ backgroundColor: "#ECFEF8", border: "1px solid #bef5ee" }}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <Link
          href={plan.cta.href}
          className={
            "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition " +
            (plan.popular
              ? "bg-neutral-900 text-white hover:opacity-90"
              : "border text-neutral-900 hover:bg-neutral-50")
          }
          aria-label={plan.cta.label}
        >
          {plan.cta.label}
        </Link>

        {/* Lien secondaire */}
        {!plan.popular && !isFree && (
          <p className="mt-3 text-center text-xs text-neutral-500">
            Besoin d’aide ? <Link href="/contact" className="underline">Parler à un humain</Link>
          </p>
        )}
      </div>
    </div>
  );
}
