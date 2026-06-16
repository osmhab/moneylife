// app/verifier-3e-pilier/rappel/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, PhoneCall, Check, ChevronLeft, CheckCircle2 } from "lucide-react";

type Verdict = "green" | "orange" | "red";

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHHMM(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDayChip(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleDateString("fr-CH", { weekday: "short" }); // lun., mar.
  const day = dt.getDate();
  const month = dt.toLocaleDateString("fr-CH", { month: "short" }); // janv.
  return { dow, day: String(day), month };
}

function isWeekend(d: Date) {
  const day = d.getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

function nextBusinessDays(count: number) {
  const out: string[] = [];
  const cur = new Date();
  cur.setHours(12, 0, 0, 0); // avoid DST edge cases

  while (out.length < count) {
    if (!isWeekend(cur)) out.push(yyyyMmDd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// --- PHONE HELPERS (CH) ---
function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function formatSwissMobileLocal(digits: string) {
  const d = digits.slice(0, 9);
  const a = d.slice(0, 2);
  const b = d.slice(2, 5);
  const c = d.slice(5, 7);
  const e = d.slice(7, 9);
  const parts = [a, b, c, e].filter(Boolean);
  return parts.join(" ");
}

function isValidSwissLocal9(digits: string) {
  return /^\d{9}$/.test(digits) && digits.startsWith("7");
}

export default function RappelPage() {
  const router = useRouter();
  const params = useSearchParams();

  const verdict = (params.get("verdict") as Verdict) || "orange";
  const sid = params.get("sid"); // ✅ Audit3a sessionId (optionnel)

  const [name, setName] = useState("");
  const [phoneLocalDigits, setPhoneLocalDigits] = useState("");
  const [email, setEmail] = useState("");

  // 7 prochains jours ouvrés (sans samedi/dimanche)
  const dayOptions = useMemo(() => nextBusinessDays(7), []);
  const [date, setDate] = useState(() => dayOptions[0] ?? yyyyMmDd(new Date()));

  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headerLabel = useMemo(() => {
    if (verdict === "red") return "Prioritaire";
    if (verdict === "orange") return "Conseillé";
    return "Optionnel";
  }, [verdict]);

  // Buffer: we don't allow booking within the next 30 minutes
  const minStartMs = useMemo(() => Date.now() + 30 * 60 * 1000, []);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    setError(null);
    setSelected(null);

    fetch(`/api/rappel/slots?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;

        const raw: { start: string; end: string }[] = data.available || [];

        const filtered = raw.filter((s) => {
          const startMs = new Date(s.start).getTime();
          return startMs >= minStartMs;
        });

        setSlots(filtered);
      })
      .catch(() => active && setError("Impossible de charger les créneaux."))
      .finally(() => active && setLoadingSlots(false));

    return () => {
      active = false;
    };
  }, [date, minStartMs]);

  async function book() {
    if (!selected) return;
    setBooking(true);
    setError(null);

    const phoneE164 = `+41${phoneLocalDigits}`;

    const res = await fetch("/api/rappel/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: phoneE164,
        email,
        verdict,
        start: selected.start,
        end: selected.end,
        sid: sid || null, // ✅ lien vers audit3a_leads/{sid}
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      setError("Ce créneau vient d’être pris. Merci d’en choisir un autre.");
      setBooking(false);
      return;
    }

    if (!res.ok) {
      setError(data?.error || "Erreur lors de la réservation.");
      setBooking(false);
      return;
    }

    setSuccess(true);

    // GA4 event: callback booked
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "rappel_booked", {
        event_category: "verifier_3epilier",
        verdict,
      });
    }

    setBooking(false);
  }

  const phoneIsValid = isValidSwissLocal9(phoneLocalDigits);
  const canSubmit = name.trim().length >= 2 && phoneIsValid && !!selected && !booking;

  const phoneDisplay = formatSwissMobileLocal(phoneLocalDigits);

  return (
    <main className="h-[100dvh] overflow-y-auto overscroll-contain bg-[#F6F7F9] px-4 py-12 pb-24">
      <div className="mx-auto w-full max-w-md">
        {/* Back */}
        <button
          type="button"
          className="mb-6 flex items-center gap-2 text-gray-500 hover:text-gray-900"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>

        {/* Header */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#EAF8F5] px-3 py-1 text-sm text-[#0F766E]">
            <CalendarClock className="h-4 w-4" />
            {headerLabel}
          </span>

          <h1 className="mt-4 text-3xl font-semibold text-gray-900">Demander un rappel</h1>

          <p className="mt-2 text-gray-600">
            Choisissez un créneau libre dans l’agenda.
            <strong className="text-gray-800"> Sans engagement.</strong>
          </p>
        </div>

        {/* Card – identité */}
        <div className="rounded-3xl bg-white p-5 shadow-sm space-y-3">
          <Input placeholder="Votre prénom" value={name} onChange={(e) => setName(e.target.value)} />

          {/* Phone input: fixed +41 prefix, user types the rest */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>

            <div className="relative flex items-center rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 text-gray-700 bg-gray-50 border-r border-gray-200 font-medium">+41</div>

              <input
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="79 123 45 67"
                value={phoneDisplay}
                onChange={(e) => {
                  const digits = onlyDigits(e.target.value);
                  setPhoneLocalDigits(digits.slice(0, 9));
                }}
                className="w-full px-3 py-2 pr-10 outline-none text-gray-900 placeholder-gray-400"
              />

              {phoneIsValid && <CheckCircle2 className="absolute right-3 h-5 w-5 text-emerald-500" />}
            </div>

            {!phoneIsValid && phoneLocalDigits.length > 0 && (
              <p className="mt-2 text-sm text-red-600">Entrez un numéro valide (ex: 79 123 45 67).</p>
            )}
          </div>

          <Input
            placeholder="Votre email (optionnel)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Date selector (7 prochains jours ouvrés) */}
        <div className="mt-6">
          <div className="mb-2 text-sm font-medium text-gray-700">Choisir un jour</div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {dayOptions.map((dStr) => {
              const active = date === dStr;
              const chip = formatDayChip(dStr);

              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => setDate(dStr)}
                  className={[
                    "shrink-0 rounded-2xl border px-4 py-3 text-left transition",
                    active
                      ? "bg-[#4FD1C5] text-black border-transparent"
                      : "bg-white text-gray-800 border-gray-200 hover:bg-[#F3F4F6]",
                  ].join(" ")}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {chip.dow}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="text-lg font-semibold leading-none">{chip.day}</div>
                    <div className="text-xs opacity-70">{chip.month}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 text-xs text-gray-500">(Week-ends exclus)</div>
        </div>

        {/* Slots */}
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-gray-700">{formatDateLabel(date)}</div>

          {loadingSlots ? (
            <p className="text-gray-500">Chargement…</p>
          ) : slots.length === 0 ? (
            <p className="text-gray-500">Aucun créneau disponible</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.slice(0, 30).map((s) => {
                const active = selected?.start === s.start;
                return (
                  <button
                    type="button"
                    key={s.start}
                    onClick={() => setSelected(s)}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[#4FD1C5] text-black"
                        : "bg-[#F0F1F3] text-gray-800 hover:bg-[#E5E7EB]",
                    ].join(" ")}
                  >
                    {formatHHMM(s.start)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {/* CTA */}
        {!success ? (
          <Button
            className="mt-6 w-full rounded-2xl bg-[#4FD1C5] hover:bg-[#3CBFB3] text-black text-lg"
            disabled={!canSubmit}
            onClick={book}
          >
            <PhoneCall className="h-5 w-5 mr-2" />
            {booking ? "Réservation…" : "Demander ce rappel"}
          </Button>
        ) : (
          <div className="mt-6 rounded-3xl bg-[#EAF8F5] p-5">
            <div className="flex items-center gap-2 text-[#0F766E] font-semibold">
              <Check className="h-5 w-5" />
              Rappel planifié
            </div>
            <p className="mt-2 text-sm text-gray-700">Votre créneau est réservé. Vous pouvez fermer cette page.</p>
          </div>
        )}

        {/* Footer minimal confiance */}
        <footer className="mt-10 text-center text-xs text-gray-400">
          <div className="mb-2">
            <img
              src="/logoMoneyLifeIconeDark.svg"
              alt="MoneyLife"
              className="mx-auto h-6 opacity-60"
            />
          </div>

          <p>© MoneyLife · Données traitées de manière confidentielle</p>

          <p className="mt-1">
            <a
              href="/legal/confidentialite"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Politique de confidentialité
            </a>{" "}
            ·{" "}
            <a
              href="/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Mentions légales
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}