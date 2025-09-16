// app/page.tsx
import Link from "next/link";

export const viewport = { themeColor: "#ffffff" };
// (et retire themeColor de export const metadata)

export const dynamic = "force-static";
export const metadata = {
  title: "MoneyLife.ch — 3e pilier 3a simple et rapide",
  description:
    "Scanne tes documents LPP, compare des offres 3a et choisis en quelques clics. Palette #0030A8 / #4fd1c5 / #F59E0B.",
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-14 sm:pt-20 sm:pb-20">
          <div className="flex flex-col gap-8 sm:gap-10 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: "#4fd1c5" }} />
                Nouveau : parcours 3a en 3 minutes
              </div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Ton <span className="text-[#0030A8]">3e pilier (3a)</span>, sans prise de tête.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600 sm:text-base">
                Scanne tes certificats LPP, laisse l’IA détecter tes couvertures, reçois des
                <b> offres partenaires</b> et <b>choisis & signe</b> directement avec l’assureur.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/scan"
                  className="rounded-2xl bg-[#0030A8] px-5 py-3 text-sm font-medium text-white hover:opacity-95"
                >
                  Commencer maintenant
                </Link>
                <Link
                  href="/configure/placeholder/personal"
                  className="rounded-2xl border px-5 py-3 text-sm hover:bg-gray-50"
                >
                  Je préfère configurer sans scan
                </Link>
                <span className="text-xs text-gray-500">
                  Palette : <code>#0030A8</code> / <code>#4fd1c5</code> / <code>#F59E0B</code>
                </span>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-gray-500">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#4fd1c5" }} />
                  Lien d’accès sécurisé (sans mot de passe)
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-200" />
                  OCR Google & IA OpenAI
                </div>
              </div>
            </div>

            {/* Card résumé process */}
            <div className="flex-1">
              <div className="rounded-3xl border p-5 shadow-sm sm:p-6">
                <h2 className="mb-4 text-base font-medium">Comment ça marche</h2>
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0030A8] text-[11px] font-semibold text-white">
                      1
                    </span>
                    <div>
                      <b>Scan LPP</b> — dépose tes PDF/images. L’IA extrait tes couvertures
                      (vieillesse, invalidité, décès) et calcule tes <b>gaps</b>.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0030A8] text-[11px] font-semibold text-white">
                      2
                    </span>
                    <div>
                      <b>Configure ton 3a</b> — presets (Fiscalité, Équilibré, Protection famille),
                      sliders et sauvegarde auto.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0030A8] text-[11px] font-semibold text-white">
                      3
                    </span>
                    <div>
                      <b>Reçois des offres</b> — compare primes, garanties, participation & frais,
                      puis <b style={{ color: "#0f766e" }}>Choisir & signer</b>.
                    </div>
                  </li>
                </ol>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="rounded-2xl border p-3">
                    <div className="text-[11px] text-gray-500">Cible AI</div>
                    <div className="text-base font-semibold">90%</div>
                  </div>
                  <div className="rounded-2xl border p-3">
                    <div className="text-[11px] text-gray-500">Cible Décès</div>
                    <div className="text-base font-semibold">80%</div>
                  </div>
                  <div className="rounded-2xl border p-3">
                    <div className="text-[11px] text-gray-500">Délais</div>
                    <div className="text-base font-semibold">jusqu’à 48h</div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border-l-4 p-3 text-xs"
                  style={{ borderLeftColor: "#F59E0B", background: "#FFF7ED" }}>
                  Astuce : tu peux <b>bypasser le scan</b> et configurer directement, puis saisir tes
                  infos perso en 60 secondes.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* fond dégradé subtil */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] h-64 w-64 rounded-full blur-3xl opacity-20"
          style={{ background: "#4fd1c5" }}
        />
      </section>

      {/* TRUST / BENEFITS */}
      <section className="mx-auto max-w-6xl px-6 pb-14 sm:pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <Benefit
            title="Simple"
            text="Une question par écran, sauvegarde auto et accès par lien sécurisé."
          />
          <Benefit
            title="Rapide"
            text="Envoi aux partenaires en 1 clic. Offres reçues et comparées en un seul endroit."
          />
          <Benefit
            title="Transparence"
            text="Primes, garanties, participation, frais & rendement affichés clairement."
          />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/scan"
            className="rounded-2xl bg-[#0030A8] px-5 py-3 text-sm font-medium text-white hover:opacity-95"
          >
            Démarrer le scan
          </Link>
          <Link
            href="/configure/placeholder/personal"
            className="rounded-2xl border px-5 py-3 text-sm hover:bg-gray-50"
          >
            Configurer sans scan
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t py-8 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} MoneyLife.ch by CreditX — 3e pilier 3a
      </footer>
    </main>
  );
}

function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border p-5">
      <div className="mb-2 text-base font-medium">{title}</div>
      <div className="text-sm text-gray-600">{text}</div>
    </div>
  );
}
