// app/page.tsx
import Link from "next/link";
import { PhoneScanMockup } from "@/app/components/PhoneScanMockup";

export const dynamic = "force-static";
export const viewport = { themeColor: "#0b1d33" };

export const metadata = {
  title: "MoneyLife.ch — Analyse de prévoyance en moins de 3 minutes",
  description:
    "Scanner LPP + IA : calculez instantanément vos lacunes, configurez votre 3e pilier 3a et recevez des offres.",
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-[#0b1d33] text-white antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1d33]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoML />
            <span className="text-sm font-semibold tracking-wide">MoneyLife</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <Link href="/scan" className="opacity-80 hover:opacity-100">Scan LPP</Link>
            <Link href="/estimation" className="opacity-80 hover:opacity-100">Estimation 3a</Link>
            <Link
              href="/scan"
              className="rounded-xl bg-[#4fd1c5] px-4 py-2 font-medium text-[#0b1d33] hover:brightness-95"
            >
              Commencer l’analyse
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2">
          {/* Left copy */}
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Analyse de <span className="text-[#0030A8]">prévoyance</span>
              <br /> en <span className="text-[#4fd1c5]">moins de 3 minutes</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
              Grâce à notre technologie de scan & IA, vos lacunes sont calculées instantanément.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/scan"
                className="rounded-2xl bg-[#4fd1c5] px-5 py-3 text-sm font-medium text-[#0b1d33] hover:brightness-95"
              >
                Scanner mon certificat LPP
              </Link>
              <Link
                href="/configure/placeholder/personal"
                className="rounded-2xl border border-white/15 bg-white/0 px-5 py-3 text-sm hover:bg-white/5"
              >
                Configurer sans scan
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-white/60">
              <BadgeDot label="Lien d’accès sécurisé" />
              <BadgeDot label="OCR Google Vision + IA OpenAI" muted />
              <BadgeDot label="Hébergé en Suisse" muted />
            </div>
          </div>

          {/* Right: phone mockup animé (Client Component) */}
          <div className="relative mx-auto w-[82%] max-w-[420px] lg:w-full">
            <PhoneScanMockup />
          </div>
        </div>

        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-8%] h-72 w-72 rounded-full bg-[#4fd1c5] opacity-20 blur-3xl"
        />
      </section>

      {/* COMPARATIF */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-white/15 bg-white/[0.02] px-3 py-2 text-white/70">📄</div>
              <div>
                <div className="text-base font-medium">Analyse traditionnelle</div>
                <div className="text-sm text-white/70">Plusieurs jours à semaines</div>
              </div>
            </div>
          </Card>
          <Card glow>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#4fd1c5]/40 bg-[#4fd1c5]/10 px-3 py-2 text-[#4fd1c5]">📱</div>
              <div>
                <div className="text-base font-medium">
                  Analyse <span className="text-[#4fd1c5]">MoneyLife</span>
                </div>
                <div className="text-sm text-white/70">Moins de minutes</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* PROCESS */}
      <section className="mx-auto max-w-6xl px-6 pb-14 sm:pb-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 text-center text-sm">
          <Process icon="🧾" label="Scan LPP" />
          <Divider />
          <Process icon="🧠" label="Analyse" />
          <Divider />
          <Process icon="⚙️" label="Configurateur 3a" />
          <Divider />
          <Process icon="📑" label="Offres" />
        </div>
      </section>

      {/* DATA x CREDIBILITY */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 pb-14 sm:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-medium text-white/90">Lacunes de prévoyance</div>
          <MiniBarsStatic />
        </Card>
        <Card>
          <div className="mb-2 text-base">
            Propulsé par <b>OCR Google Vision</b> + <b>IA OpenAI</b>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-white/70">
            <TrustPill>🔒 Données chiffrées</TrustPill>
            <TrustPill>🇨🇭 Hébergement CH</TrustPill>
            <TrustPill>🏛️ Partenaires OAR</TrustPill>
          </div>
        </Card>
      </section>

      {/* FOUNDER SECTION */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 rounded-3xl border border-white/12 bg-white/[0.03] p-6 sm:grid-cols-[1.1fr,0.9fr] sm:p-8">
          <div>
            <h3 className="text-xl font-semibold">La prévoyance suisse, version fintech</h3>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Je suis Habib, 10 ans d’expérience en prévoyance. J’ai créé MoneyLife pour rendre ce
              monde enfin simple, rapide et transparent — avec un scanner IA qui décode vos certificats LPP.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/scan"
                className="rounded-2xl bg-[#4fd1c5] px-5 py-3 text-sm font-medium text-[#0b1d33] hover:brightness-95"
              >
                Essayer le scan maintenant
              </Link>
              <Link
                href="/legal/securite"
                className="text-sm text-white/80 underline-offset-2 hover:underline"
              >
                Sécurité & conformité
              </Link>
            </div>
          </div>
          {/* Portrait placeholder */}
          <div className="relative isolate overflow-hidden rounded-2xl border border-white/12 bg-white/[0.02]">
            <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(79,209,197,0.18),transparent_70%)]" />
            <div className="flex h-56 items-end justify-end p-4 sm:h-64">
              <div className="h-40 w-32 rounded-xl border border-white/10 bg-white/5" />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/60">
        © {new Date().getFullYear()} MoneyLife.ch — 3e pilier 3a
      </footer>
    </main>
  );
}

/* ========= UI bits (server-safe) ========= */
function LogoML() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-2xl font-black leading-none text-[#0030A8]">M</span>
      <span className="text-2xl font-black leading-none text-[#4fd1c5]">L</span>
    </div>
  );
}

function Card({ children, glow }: { children: React.ReactNode; glow?: boolean }) {
  return (
    <div
      className={`rounded-3xl border p-5 sm:p-6 ${
        glow
          ? "border-[#4fd1c5]/35 bg-[#4fd1c5]/[0.06] shadow-[0_0_0_1px_rgba(79,209,197,0.15)_inset]"
          : "border-white/12 bg-white/[0.03]"
      }`}
    >
      {children}
    </div>
  );
}

function Process({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-2xl border border-white/15 bg-white/[0.02] px-3 py-2">{icon}</div>
      <div className="text-white/80">{label}</div>
    </div>
  );
}

function Divider() {
  return <div className="hidden h-px w-10 shrink-0 bg-white/10 sm:block" />;
}

function TrustPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.02] px-3 py-2 text-center">
      {children}
    </div>
  );
}

function BadgeDot({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${muted ? "bg-white/30" : ""}`}
        style={!muted ? { background: "#4fd1c5" } : undefined}
      />
      <span className="opacity-75">{label}</span>
    </div>
  );
}

/* Mini graphe statique pour la section “Data x Credibility” */
function MiniBarsStatic() {
  const bars = [48, 64, 80, 72, 60];
  return (
    <div className="flex h-40 items-end gap-2">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-6 rounded-t-md bg-gradient-to-b from-[#4fd1c5] to-[#0030A8]"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
