// components/FeatureLinksLight.tsx
import Link from "next/link";
import {
  BarChart3,          // Analyse détaillée
  SlidersHorizontal,  // Configurateur
  GitCompare,         // Comparateur
  FileSignature,      // Signature en ligne
} from "lucide-react";

/** Bande “icônes + texte” (clair, sans cartes/hover) */
export default function FeatureLinksLight({ className = "" }: { className?: string }) {
  return (
    <section aria-labelledby="features-links" className={`w-full bg-white ${className}`}>
      <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
        <h2 id="features-links" className="sr-only">Explorer MoneyLife</h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <Item
            Icon={BarChart3}
            title="Analyse de prévoyance détaillée"
            desc="Réalisez votre analyse de prévoyance en ligne : lacunes en cas d'incapacité de gain, décès et situation financière à la retraite."
            href="/docs"
            cta="Voir la documentation"
          />

          <Item
            Icon={SlidersHorizontal}
            title="Configurateur de 3e pilier"
            desc="Configurez votre 3e pilier et estimez vos primes (risque/épargne) et votre capital projeté en temps réel."
            href="/docs/agents"
            cta="Consulter les guides"
          />

          <Item
            Icon={GitCompare}
            title="Comparateur"
            desc="Comparez vos offres reçues avec transparence et clarté."
            href="/integrations"
            cta="Parcourir les intégrations"
          />

          <Item
            Icon={FileSignature}
            title="Signature en ligne"
            desc="Choisissez l'offre qui vous convient le mieux et signez votre contrat en ligne."
            href="/partners"
            cta="Découvrir l’espace partenaires"
          />
        </div>
      </div>
    </section>
  );
}

function Item({
  Icon,
  title,
  desc,
  href,
  cta,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="relative flex flex-col gap-2">
      {/* Icône avec halo rainbow */}
      <div
        className="inline-grid h-10 w-10 place-items-center rounded-xl ring-1 ring-slate-200"
        style={{
          background:
            "linear-gradient(135deg,#21E3B0 0%,#4fd1c5 35%,#0030A8 70%,#7c3aed 100%)",
        }}
      >
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/95">
          <Icon className="h-5 w-5 text-slate-900" strokeWidth={2.2} />
        </div>
      </div>

      <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm leading-6 text-slate-600">{desc}</p>

      <Link href={href} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[#0030A8]">
        {cta} <span aria-hidden>→</span>
      </Link>

      {/* séparateur subtil entre colonnes (optionnel) */}
      <span className="pointer-events-none absolute right-0 top-0 hidden h-full w-px bg-slate-200/60 lg:block" />
    </div>
  );
}
