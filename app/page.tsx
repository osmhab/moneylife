//app/page.tsx
import Link from "next/link";
import ProcessShowcase from "@/components/ProcessShowcase";
import RainbowFlow from "@/components/RainbowFlow";
import { HeartPulse, Activity } from "lucide-react";
import { Scan, ChevronRight } from "lucide-react";
import NavBar from "@/components/NavBar";
import FeatureLinksDark from "@/components/FeatureLinksDark";





export const dynamic = "force-static";
export const viewport = { themeColor: "#0B1021" };

export const metadata = {
  title: "MoneyLife.ch — Analyse de prévoyance en moins de 3 minutes",
  description:
    "Scanner LPP + IA : calculez instantanément vos lacunes, configurez votre 3e pilier 3a et recevez des offres.",
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-white text-slate-900 antialiased">
      
      
      {/* HERO — fond arc-en-ciel + H1 + mockup */}
      <section className="relative overflow-hidden lg:overflow-visible">
        {/* Fond arc-en-ciel animé */}
        <RainbowFlow />

        {/* NavBar effet glass */}
  <div className="relative z-20">
    <NavBar
      Logo={<img src="/logoMoneyLife.svg" alt="MoneyLife" className="h-6 w-auto" />}
      links={[
        { href: "/scan", label: "Scanner" },
        { href: "/pricing", label: "Tarifs" },
        { href: "/legal/securite", label: "Sécurité" },
      ]}
      ctaHref="/login"
      ctaLabel="Login"
      variant="glass"
      border
    />
  </div>

        {/* Fade bas */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-24 bg-gradient-to-b from-transparent to-white" />

        <div
          className="
            relative z-10 mx-auto grid max-w-7xl
            grid-cols-1 items-start lg:items-center
            gap-10 lg:gap-16 xl:gap-24
            px-6
            pt-10 sm:pt-14 lg:pt-16
            pb-16 lg:pb-20
            min-h-[68vh] lg:min-h-[76vh]
            lg:grid-cols-[1.05fr_0.95fr]
          "
        >
          {/* LEFT — titre, texte, badges */}
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.03] tracking-tight text-slate-900 max-w-[16ch]">
              La prévoyance
              <br />
              repensée
              <br />
              pour vous.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Scannez votre Certificat LPP, découvrez vos lacunes de prévoyance et configurez votre solution de prévoyance sur mesure directement avec MoneyLife.
            </p>

            <div className="mt-6">
  <Link
    href="/scan"
    className="
      group inline-flex w-full sm:w-auto items-center justify-center gap-2
      rounded-full bg-[#11243E] px-6 py-4
      text-white text-base sm:text-lg font-semibold
      shadow-[0_12px_24px_rgba(17,36,62,0.25)]
      transition hover:bg-[#11243E]/70 active:translate-y-px
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#11243E] focus-visible:ring-offset-2
    "
  >
    <Scan className="h-5 w-5 -ml-1 opacity-90" aria-hidden="true" />
    <span>Scannez votre certificat LPP</span>
    <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </Link>
</div>


            <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-slate-500">
              
            </div>
          </div>

{/* RIGHT — phone un peu à gauche, desktop à DROITE derrière, qui “dépasse” en haut-droite */}
<div className="relative min-h-[620px] lg:min-h-[700px] justify-self-end">
  {/* Desktop derrière — aligné sur la même DROITE que le phone, mais plus HAUT + scale */}
  <div
    className="
      hidden lg:block pointer-events-none
      absolute top-1/2 -translate-y-[110%]    /* ← monte le desktop pour qu'il dépasse en haut-droite */
      right-[0px] xl:right-[-50px]         /* ← même 'right' que le phone pour NE PAS dépasser à droite */
      origin-top-right scale-[0.9] xl:scale-[0.94]
      z-[30]
    "
  >
    <DesktopGlassPeek className="w-[520px] h-[340px]" />
  </div>

  {/* Phone devant — même 'right', centré verticalement */}
  <div
    className="
      hidden lg:block pointer-events-none
      absolute top-1/2 -translate-y-1/2
      right-[200px] xl:right-[210px]         /* ← même ancrage que le desktop */
      z-[100]
    "
  >
    <DevicePhone className="rotate-0 scale-[0.98] xl:scale-75" />
  </div>
</div>






        </div>
      </section>
    

{/* Bandes de cartes – style Stripe */}
<FeatureLinksDark />

{/* Section texte + iPhone */}
<ProcessShowcase className="mt-4" />



      

      {/* VALUE — 2 cartes */}
      <section className="mx-auto max-w-7xl px-6 pb-12">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">📄</div>
              <div>
                <div className="text-base font-medium">Analyse traditionnelle</div>
                <div className="text-sm text-slate-500">Plusieurs jours à semaines</div>
              </div>
            </div>
          </Card>
          <Card glow>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#4fd1c5]/40 bg-[#4fd1c5]/10 px-3 py-2 text-[#4fd1c5]">📱</div>
              <div>
                <div className="text-base font-medium">Expérience MoneyLife</div>
                <div className="text-sm text-slate-500">Instantanée, élégante, sans friction</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* PROCESS pins */}
      <section className="mx-auto max-w-7xl px-6 pb-14 sm:pb-20">
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

      {/* DATA & TRUST */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 pb-14 sm:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-medium text-slate-800">Lacunes de prévoyance</div>
          <MiniBarsStatic />
        </Card>
        <Card>
          <div className="mb-2 text-base">
            Propulsé par <b>OCR Google Vision</b> + <b>IA OpenAI</b>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-500">
            <TrustPill>🔒 Données chiffrées</TrustPill>
            <TrustPill>🇨🇭 Hébergement CH</TrustPill>
            <TrustPill>🏛️ Partenaires OAR</TrustPill>
          </div>
        </Card>
      </section>

      {/* FOUNDER */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid gap-6 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-[1.1fr,0.9fr] sm:p-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">La prévoyance suisse, version fintech</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Je suis Habib, 10 ans d’expérience en prévoyance. J’ai créé MoneyLife pour rendre ce monde enfin simple,
              rapide et transparent — avec un scanner IA qui décode vos certificats LPP.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/scan"
                className="rounded-2xl bg-[#0030A8] px-5 py-3 text-sm font-medium text-white shadow transition hover:opacity-90"
              >
                Essayer le scan maintenant
              </Link>
              <Link
                href="/legal/securite"
                className="text-sm text-slate-600 underline-offset-2 hover:underline"
              >
                Sécurité & conformité
              </Link>
            </div>
          </div>
          <div className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(79,209,197,0.10),transparent_70%)]" />
            <div className="flex h-56 items-end justify-end p-4 sm:h-64">
              <div className="h-40 w-32 rounded-xl border border-slate-200 bg-white" />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} MoneyLife.ch — 3e pilier 3a
      </footer>
    </main>
  );
}

/* ========= UI HELPERS ========= */
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
        glow ? "border-[#4fd1c5]/40 bg-[#4fd1c5]/5 shadow" : "border-slate-200 bg-white"
      }`}
    >
      {children}
    </div>
  );
}

function Process({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">{icon}</div>
      <div className="text-slate-600">{label}</div>
    </div>
  );
}

function Divider() {
  return <div className="hidden h-px w-10 shrink-0 bg-slate-200 sm:block" />;
}

function TrustPill({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">{children}</div>;
}

function BadgeDot({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${muted ? "bg-slate-300" : "bg-[#4fd1c5]"}`} />
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

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

/* ===== Phone realistic mockup (foreground) ===== */
function DevicePhone({ className = "" }: { className?: string }) {
    return (
    <div
      className={
        // Cadre iPhone droit, gros arrondi, ombres douces
        "aspect-[9/19] w-[320px] rounded-[44px] bg-white " +
        "shadow-[0_40px_100px_rgba(2,6,23,0.28)] border border-slate-200/70 " +
        "ring-1 ring-white/60 relative overflow-hidden " +
        

        className
      }
    >
      {/* liseré doux autour */}
      <div className="pointer-events-none absolute inset-0 rounded-[44px] bg-gradient-to-br from-white/40 to-slate-200/40" />
      {/* écran (bezel) */}
      <div className="relative h-full w-full p-3 shadow-inner">
        <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-white ring-1 ring-black/5">
          {/* Notch centré */}
          
          <PhoneUI />
        </div>
      </div>
    </div>
  );
}

function PhoneUI() {
  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-slate-900">Paramètres rapides</div>
          <div className="text-[10px] text-slate-500">Modifier</div>
        </div>
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        </div>
      </div>

      {/* Toggles */}
<div className="shrink-0 grid grid-cols-2 gap-2">
  {/* Actif : Maladie */}
  <button
    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-sm"
    type="button"
  >
    <HeartPulse className="h-4 w-4 text-[#0030A8]" strokeWidth={2.2} aria-hidden="true" />
    Maladie
  </button>

  {/* Inactif : Accident */}
  <button
    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/60 px-3 py-2 text-xs text-slate-600"
    type="button"
  >
    <Activity className="h-4 w-4 text-slate-500" strokeWidth={2.2} aria-hidden="true" />
    Accident
  </button>
</div>


      {/* Carte Invalidité — occupe tout le reste */}
      <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex h-full flex-col">
          {/* Titres */}
          <div className="shrink-0">
            <div className="text-sm font-semibold text-slate-900">Invalidité</div>
            <div className="mt-1 text-[11px] text-slate-500">Scénario : Maladie</div>
          </div>

          {/* Zone principale */}
          <div className="mt-3 flex-1 min-h-0 grid grid-rows-[1fr_auto_auto_auto] gap-3">
            {/* Donut centré */}
            <div className="grid place-items-center">
              <Donut72 />
            </div>

            {/* Tuiles chiffres */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
                <div className="text-[10px] text-amber-700">Lacune (CHF/mois)</div>
                <div className="text-lg font-semibold text-slate-900 tabular-nums">1801</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] text-slate-500">Prestations (CHF/mois)</div>
                <div className="text-lg font-semibold text-slate-900 tabular-nums">4620</div>
              </div>
            </div>

            {/* Slider + valeur à droite */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-600">
                <span>Objectif Invalidité (% du revenu actuel)</span>
                <span className="font-medium tabular-nums">90%</span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-slate-200">
                <div className="absolute left-0 top-0 h-2 rounded-full bg-[#0030A8]" style={{ width: "90%" }} />
                <span className="absolute left-[90%] top-1/2 -translate-x-1/2 -translate-y-1/2 block h-4 w-4 rounded-full bg-white ring-2 ring-[#0030A8]" />
              </div>
            </div>

            {/* Légende + Voir détails */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <LegendDot color="#0030A8">AVS/AI</LegendDot>
                <LegendDot color="#3B82F6">LPP</LegendDot>
                <LegendDot color="#22C55E">LAA</LegendDot>
                <LegendDot color="#4fd1c5">3e pilier</LegendDot>
                <LegendDot color="#94A3B8">Lacune</LegendDot>
              </div>
              <button className="text-[12px] font-medium text-slate-700 hover:underline">Voir détails</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* petite aide pour la légende */
function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{children}</span>
    </span>
  );
}


function Donut72() {
  const size = 132;       // un poil plus grand pour aérer
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = 72;         // valeur fixe

  const offset = c * (1 - pct / 100);

  return (
    <svg width={size} height={size} className="block">
      <defs>
        {/* fond gris */}
        <linearGradient id="ml-donut" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#4fd1c5" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        {/* base */}
        <circle r={r} fill="transparent" stroke="#EEF2F7" strokeWidth={stroke} />
        {/* arc couverture */}
        <circle
          r={r}
          fill="transparent"
          stroke="url(#ml-donut)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform="rotate(-90)"
          style={{ filter: "drop-shadow(0 2px 4px rgba(2,6,23,0.12))" }}
        />
      </g>
      {/* centre */}
      <foreignObject x="0" y="0" width={size} height={size}>
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center leading-tight">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">72%</div>
            <div className="text-[11px] text-slate-500">couverture</div>
          </div>
        </div>
      </foreignObject>
    </svg>
  );
}


function DesktopGlassPeek({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative rounded-[28px] border border-slate-200/70 bg-white/70 ring-1 ring-black/5 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Barre top */}
        <div className="flex items-center justify-between rounded-t-[28px] border-b border-slate-200/80 bg-white/70 px-6 py-3">
          <div className="text-sm font-medium text-slate-800">Dashboard</div>
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="h-2 w-2 rounded-full bg-slate-300" />
          </div>
        </div>

        {/* Corps compact */}
        <div className="relative h-full">
          {/* Wedge (volet) masqué sous le phone à gauche */}
          <div
            className="absolute left-0 top-0 h-full w-[180px] bg-white/85"
            style={{ clipPath: "polygon(0 0, 100% 0, 74% 100%, 0% 100%)" }}
          />

          {/* Zone utile décalée à droite (c’est ce qu’on veut voir) */}
          <div className="relative h-full pl-[200px] pr-5 py-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Carte “Aujourd’hui” (petite) */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-600">Capital AXA Privé</div>
                <svg viewBox="0 0 100 28" className="mt-2 h-14 w-full">
                  <polyline fill="none" stroke="#0030A8" strokeWidth="1.6"
                    points="0,26 10,24 20,22 30,18 40,20 50,14 60,16 70,10 80,13 90,9 100,6" />
                  <polygon fill="rgba(79,209,197,0.18)"
                    points="0,28 0,26 10,24 20,22 30,18 40,20 50,14 60,16 70,10 80,13 90,9 100,6 100,28" />
                </svg>
                <div className="mt-2 text-sm">
                  <span className="font-semibold text-slate-900">39 274 CHF</span>{" "}
                  <span className="text-emerald-600">+32.8%</span>
                </div>
              </div>

              {/* Carte KPI */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-600">Rente SwissLife</div>
                <div className="mt-1 text-lm font-semibold text-slate-600 tabular-nums">
                  CHF 950
                </div>
                <div className="text-[11px] text-slate-600">Par mois</div>
              </div>

              {/* Large graphe (ligne), occupe toute la largeur, ancré à droite */}
              <div className="col-span-2 rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="mb-1 text-sm font-medium text-slate-900">Rendement net par an : 6.34%</div>
                <svg viewBox="0 0 100 30" className="h-24 w-full">
                  <defs>
                    <linearGradient id="ml-today" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline fill="none" stroke="#0030A8" strokeWidth="1.8"
                    points="0,24 8,24 16,23 24,20 32,20 40,18 48,18 56,16 64,12 72,14 80,10 88,11 100,9" />
                  <polygon fill="url(#ml-today)"
                    points="0,30 0,24 8,24 16,23 24,20 32,20 40,18 48,18 56,16 64,12 72,14 80,10 88,11 100,9 100,30" />
                </svg>
              </div>
            </div>
          </div>

          {/* Ombre basse douce */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/5 to-transparent" />
        </div>
      </div>
    </div>
  );
}





function ChartSurvivantsPreview() {
  return (
    <svg viewBox="0 0 1400 300" className="block">
      {/* Grille légère */}
      <defs>
        <pattern id="ml-grid" width="120" height="60" patternUnits="userSpaceOnUse">
          <path d="M 120 0 L 0 0 0 60" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1"/>
        </pattern>
        <linearGradient id="ml-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0.12"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1400" height="300" fill="url(#ml-grid)" />

      {/* Zone 3e pilier */}
      <path d="M60,260 L60,210 L1360,210 L1360,260 Z" fill="url(#ml-fill)" />

      {/* Ligne Cible */}
      <path d="M60,150 L1360,150" stroke="#0030A8" strokeWidth="6" strokeLinecap="round" />

      {/* Courbes “intéressantes” vers la droite */}
      <polyline
        fill="none"
        stroke="#0F172A" strokeOpacity="0.35" strokeWidth="2.5"
        points="900,210  980,205 1020,195 1060,205 1100,190 1140,198 1180,182 1220,188 1260,172 1300,180 1360,160"
      />

      {/* Marqueur Aujourd’hui (à droite) */}
      <g transform="translate(1150, 0)">
        <path d="M0,40 L0,260" stroke="rgba(15,23,42,0.35)" strokeDasharray="6 6" strokeWidth="2" />
        <rect x="8" y="38" rx="6" width="118" height="24" fill="white" stroke="rgba(15,23,42,0.12)"/>
        <text x="16" y="55" fontSize="12" fill="#334155">Aujourd’hui</text>
      </g>

      {/* Légende compacte (à droite) */}
      <g transform="translate(1050,270)">
        <circle r="6" fill="#4fd1c5" />
        <text x="12" y="5" fontSize="12" fill="#334155">3e pilier</text>
        <circle cx="100" r="6" fill="#0030A8" />
        <text x="112" y="5" fontSize="12" fill="#334155">Cible</text>
      </g>
    </svg>
  );
}




function TinyLineChartSVG() {
  return (
    <svg viewBox="0 0 100 36" className="mt-2 h-24 w-full">
      <defs>
        <linearGradient id="ml-line" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="#0030A8"
        strokeWidth="1.6"
        points="0,30 12,29 22,28 32,23 42,25 52,19 62,21 72,13 82,17 100,10"
      />
      <polygon
        fill="url(#ml-line)"
        points="0,36 0,30 12,29 22,28 32,23 42,25 52,19 62,21 72,13 82,17 100,10 100,36"
      />
      <circle cx="100" cy="10" r="1.8" fill="#4fd1c5" />
    </svg>
  );
}
