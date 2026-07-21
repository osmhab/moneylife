// components/PoweredByCreditXSection.tsx
import React from "react";
import { ShieldCheck, Lock, Building2 } from "lucide-react";

type Props = { className?: string };

export default function PoweredByCreditXSection({ className = "" }: Props) {
  return (
    <section className={`w-full ${className}`} style={{ backgroundColor: "#001D38" }}>
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Un cœur de métier,
            <br className="hidden sm:block" />
            entièrement repensé pour vous.
            </h2>

        {/* Logos MoneyLife × CreditX */}
<div className="mt-6 flex items-center gap-6">
  <img
    src="/logoMoneyLifeWhite.svg"
    alt="MoneyLife"
    className="h-7 sm:h-8 w-auto opacity-95"
  />

  <img
    src="/LogoCreditXWhite.svg"
    alt="CreditX"
    className="h-7 sm:h-8 w-auto opacity-90"
  />
</div>

        <p className="mt-6 max-w-3xl text-white/75 text-base sm:text-lg leading-7">
          MoneyLife est propulsée par CreditX, et conçue pour rendre la prévoyance suisse simple, rapide
          et transparente — sans compromis sur la qualité du conseil, la conformité et la sécurité.
        </p>

        {/* 3 cards */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <TrustCard
            Icon={Building2}
            title="Propulsé par CreditX"
            text="CreditX combine une approche de conseil exigeante (prévoyance & finance) et une expérience digitale moderne, pensée pour la nouvelle génération d’assurés."
          />

          <TrustCard
            Icon={ShieldCheck}
            title="FINMA & LBA"
            text="CreditX opère dans le cadre réglementaire suisse. Nous appliquons des processus internes stricts de conformité, de traçabilité et de contrôle."
          />

          <TrustCard
            Icon={Lock}
            title="Données sécurisées"
            text="Vos données sont une priorité : échanges chiffrés (TLS), contrôles d’accès, séparation des rôles et logs d’audit. Nous minimisons la collecte au strict nécessaire."
          />
        </div>
      </div>
    </section>
  );
}

function TrustCard({
  Icon,
  title,
  text,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
}) {
  return (
    <div
  className="
    group
    rounded-3xl
    bg-white/5
    p-6 sm:p-7
    shadow-[0_30px_80px_rgba(0,0,0,0.28)]
    ring-1 ring-white/10
    backdrop-blur

    transition-all duration-300 ease-out

    hover:-translate-y-1
    hover:bg-white/10
    hover:shadow-[0_40px_110px_rgba(0,0,0,0.35)]
  "
>
      <div className="flex items-center gap-3">
        <div
  className="
    grid h-11 w-11 place-items-center rounded-2xl
    bg-white/10
    transition-all duration-300

    group-hover:bg-white/20
    group-hover:shadow-[0_0_30px_rgba(255,255,255,0.25)]
  "
>
          <Icon className="h-6 w-6 text-white" strokeWidth={2.2} />
        </div>
        <h3 className="text-white font-semibold text-base">{title}</h3>
      </div>

      <p className="mt-4 text-white/75 text-sm sm:text-base leading-7">{text}</p>

      <div className="mt-5 h-px w-full bg-white/10" />

      <div className="mt-4 text-xs text-white/60">
        Transparence • Rigueur • Sécurité
      </div>
    </div>
  );
}