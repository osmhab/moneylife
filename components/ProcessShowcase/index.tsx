import Link from "next/link";
import RightScene from "./RightScene.client";

export default function ProcessShowcase({ className = "" }: { className?: string }) {
  return (
    <section className={`w-full bg-slate-50 ${className}`} aria-labelledby="process-title">
      <div className="w-full py-16 lg:py-24">
        {/* ⬇️ même disposition que le hero */}
        <div
          className="
            mx-auto grid max-w-7xl
            grid-cols-1 items-center
            gap-10 lg:gap-16 xl:gap-24
            px-6
            lg:grid-cols-[1.05fr_0.95fr]
          "
        >
          {/* LEFT — contenu SEO (SSR) */}
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
              MoneyLife • Analyse IA
            </p>

            <h2
              id="process-title"
              className="max-w-[20ch] text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.08] tracking-tight text-slate-900"
            >
              Configurez votre 3<sup>e</sup> pilier
              <br className="hidden sm:block" />
              en quelques minutes
            </h2>

            <p className="mt-5 max-w-xl text-[17px] leading-7 text-slate-600">
              Scannez votre certificat LPP, laissez l’IA analyser vos couvertures et obtenez une
              configuration claire et actionnable — sans friction.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-[#0030A8] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,48,168,0.25)] hover:opacity-95 active:translate-y-px"
              >
                Commencer l’analyse
              </Link>
              <Link href="/legal/securite" className="text-sm font-medium text-slate-600 hover:underline">
                Sécurité & conformité
              </Link>
            </div>

            <ul className="mt-8 space-y-1 text-sm text-slate-600">
              <li>
                <Link href="/legal/securite" className="text-[#0030A8] hover:underline">
                  Sécurité des données
                </Link>{" "}
                — chiffrement, hébergement CH, accès restreint.
              </li>
              <li>
                <Link href="/pricing" className="text-[#0030A8] hover:underline">
                  Tarifs
                </Link>{" "}
                — transparents, sans engagement.
              </li>
            </ul>
          </div>

          {/* RIGHT — scène interactive (client) */}
          <RightScene />
        </div>
      </div>
    </section>
  );
}
