"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// --- Types & utils ---
type Sexe = "H" | "F" | "Autre" | null;
type PresetKey = "Fiscalité max" | "Équilibré" | "Protection famille" | "Recommandation";

type ConfigDoc = {
  createdAt?: any;
  updatedAt?: any;
  clientToken?: string | null;
  source?: "scan" | "manual";
  preset?: PresetKey | null;
  // Champs principaux v4.2
  prime3a?: number | null;        // CHF / an (on affiche aussi /mois)
  capitalDeces?: number | null;   // CHF
  renteAI?: number | null;        // CHF / mois
  horizon?: number | null;        // années
  sexe?: Sexe;                    // obligatoire
  // Status UI
  step?: "configurator" | "personal" | "request";
};

const currency = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("fr-CH").format(n) + " CHF";

const monthly = (annual: number | null | undefined) =>
  annual == null ? "—" : new Intl.NumberFormat("fr-CH").format(Math.round(annual / 12)) + " CHF/mois";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Ranges (à ajuster selon tes règles internes)
const DEFAULTS = {
  prime3a: 6000,       // CHF/an (≈ 500/mois)
  capitalDeces: 200000,
  renteAI: 2000,       // CHF/mois
  horizon: 20,         // années
} as const;

const BOUNDS = {
  prime3a: { min: 1200, max: 7043 }, // plafond 3a 2025 salarié ~7043 CHF (ajuste si besoin)
  capitalDeces: { min: 50000, max: 1000000 },
  renteAI: { min: 1000, max: 6000 },
  horizon: { min: 5, max: 40 },
};

function presetApply(preset: PresetKey, base: ConfigDoc): Partial<ConfigDoc> {
  switch (preset) {
    case "Fiscalité max":
      return { preset, prime3a: BOUNDS.prime3a.max, renteAI: 1500, capitalDeces: 150000, horizon: 25 };
    case "Équilibré":
      return { preset, prime3a: 5500, renteAI: 2000, capitalDeces: 250000, horizon: 20 };
    case "Protection famille":
      return { preset, prime3a: 3600, renteAI: 3000, capitalDeces: 400000, horizon: 20 };
    case "Recommandation":
      // Reco v4.2 : AI 90% & Décès 80% du revenu (ici on ne connaît pas encore le revenu ⇒ set raisonnable)
      return { preset, prime3a: DEFAULTS.prime3a, renteAI: 2500, capitalDeces: 300000, horizon: 20 };
  }
}

export default function ConfiguratorPage() {
  const { configId } = useParams<{ configId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [sexe, setSexe] = useState<Sexe>(null);
  const [prime3a, setPrime3a] = useState<number | null>(null);           // CHF/an
  const [capitalDeces, setCapitalDeces] = useState<number | null>(null); // CHF
  const [renteAI, setRenteAI] = useState<number | null>(null);           // CHF/mois
  const [horizon, setHorizon] = useState<number | null>(null);           // années
  const [preset, setPreset] = useState<PresetKey | null>(null);

  // One-question-per-screen
  const STEPS: Array<{ key: string; title: string; render: React.ReactNode }> = useMemo(() => {
    return [
      {
        key: "sexe",
        title: "Quel est ton sexe ?",
        render: (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["H","F","Autre"] as Sexe[]).map((opt) => (
              <button
                key={opt || "null"}
                onClick={() => setSexe(opt)}
                className={[
                  "rounded-2xl border px-4 py-3 text-center",
                  sexe === opt ? "border-[#0030A8] ring-2 ring-[#0030A8]" : "hover:bg-gray-50"
                ].join(" ")}
              >
                {opt}
              </button>
            ))}
          </div>
        ),
      },
      {
        key: "preset",
        title: "Choisis un preset (modifiable ensuite)",
        render: (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["Fiscalité max","Équilibré","Protection famille","Recommandation"] as PresetKey[]).map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left",
                  preset === p ? "border-[#0030A8] ring-2 ring-[#0030A8]" : "hover:bg-gray-50"
                ].join(" ")}
              >
                <div className="font-medium">{p}</div>
                <div className="text-xs text-gray-500">
                  {p === "Fiscalité max" && "Optimise la déduction fiscale"}
                  {p === "Équilibré" && "Répartition harmonisée"}
                  {p === "Protection famille" && "Accent sur décès/AI"}
                  {p === "Recommandation" && "Point de départ pertinent"}
                </div>
              </button>
            ))}
          </div>
        ),
      },
      {
        key: "prime3a",
        title: "Ta prime 3a (par an)",
        render: (
          <SliderRow
            value={prime3a}
            setValue={(v) => setPrime3a(v)}
            min={BOUNDS.prime3a.min}
            max={BOUNDS.prime3a.max}
            step={10}
            suffix={" CHF/an"}
            helper={monthly(prime3a ?? 0)}
          />
        ),
      },
      {
        key: "capitalDeces",
        title: "Capital décès",
        render: (
          <SliderRow
            value={capitalDeces}
            setValue={(v) => setCapitalDeces(v)}
            min={BOUNDS.capitalDeces.min}
            max={BOUNDS.capitalDeces.max}
            step={5000}
            suffix={" CHF"}
          />
        ),
      },
      {
        key: "renteAI",
        title: "Rente invalidité (par mois)",
        render: (
          <SliderRow
            value={renteAI}
            setValue={(v) => setRenteAI(v)}
            min={BOUNDS.renteAI.min}
            max={BOUNDS.renteAI.max}
            step={100}
            suffix={" CHF/mois"}
          />
        ),
      },
      {
        key: "horizon",
        title: "Horizon (années)",
        render: (
          <SliderRow
            value={horizon}
            setValue={(v) => setHorizon(v)}
            min={BOUNDS.horizon.min}
            max={BOUNDS.horizon.max}
            step={1}
            suffix={" ans"}
          />
        ),
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sexe, preset, prime3a, capitalDeces, renteAI, horizon]);

  const [stepIndex, setStepIndex] = useState(0);
  const current = STEPS[stepIndex];

  // Charger / initialiser la config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const ref = doc(db, "configs", configId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const d = snap.data() as ConfigDoc;
          if (!cancelled) {
            setSexe((d.sexe ?? null) as Sexe);
            setPreset((d.preset ?? null) as PresetKey | null);
            setPrime3a(d.prime3a ?? DEFAULTS.prime3a);
            setCapitalDeces(d.capitalDeces ?? DEFAULTS.capitalDeces);
            setRenteAI(d.renteAI ?? DEFAULTS.renteAI);
            setHorizon(d.horizon ?? DEFAULTS.horizon);
          }
        } else {
          // init doc
          const base: ConfigDoc = {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            clientToken: null,
            source: "manual",
            preset: "Recommandation",
            prime3a: DEFAULTS.prime3a,
            capitalDeces: DEFAULTS.capitalDeces,
            renteAI: DEFAULTS.renteAI,
            horizon: DEFAULTS.horizon,
            sexe: null,
            step: "configurator",
          };
          await setDoc(ref, base, { merge: true });
          if (!cancelled) {
            setPreset("Recommandation");
            setPrime3a(DEFAULTS.prime3a);
            setCapitalDeces(DEFAULTS.capitalDeces);
            setRenteAI(DEFAULTS.renteAI);
            setHorizon(DEFAULTS.horizon);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Impossible de charger la configuration.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [configId]);

  // Autosave (debounced)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => save(false), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sexe, preset, prime3a, capitalDeces, renteAI, horizon]);

  function applyPreset(p: PresetKey) {
    const patch = presetApply(p, {});
    setPreset(p);
    if (patch.prime3a != null) setPrime3a(patch.prime3a);
    if (patch.capitalDeces != null) setCapitalDeces(patch.capitalDeces);
    if (patch.renteAI != null) setRenteAI(patch.renteAI);
    if (patch.horizon != null) setHorizon(patch.horizon);
  }

  async function save(showSpinner = true) {
    try {
      if (showSpinner) setSaving(true);
      setError(null);
      // validations minimales
      if (!sexe) {
        // on laisse l’autosave passer, mais on empêche la suite
      }
      const ref = doc(db, "configs", configId);
      const payload: Partial<ConfigDoc> = {
        updatedAt: serverTimestamp(),
        preset,
        prime3a: prime3a == null ? null : clamp(prime3a, BOUNDS.prime3a.min, BOUNDS.prime3a.max),
        capitalDeces: capitalDeces == null ? null : clamp(capitalDeces, BOUNDS.capitalDeces.min, BOUNDS.capitalDeces.max),
        renteAI: renteAI == null ? null : clamp(renteAI, BOUNDS.renteAI.min, BOUNDS.renteAI.max),
        horizon: horizon == null ? null : clamp(horizon, BOUNDS.horizon.min, BOUNDS.horizon.max),
        sexe: sexe ?? null,
        step: "configurator",
      };
      await updateDoc(ref, payload as any);
    } catch (e: any) {
      setError(e?.message ?? "Échec de la sauvegarde.");
    } finally {
      if (showSpinner) setSaving(false);
    }
  }

  const canNext = (k: string) => {
    if (k === "sexe") return !!sexe;
    return true;
  };

  const goNext = async () => {
    if (!canNext(current.key)) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // fin → aller à l’étape Données personnelles
      await save(true);
      router.push(`/configure/${configId}/personal`);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  return (
    <main className="min-h-[calc(100dvh-4rem)] mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Retour
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Configurer mon 3e pilier (3a)</h1>
          <div className="ml-auto text-xs text-gray-500">
            {saving ? "Enregistrement…" : "Enregistré"}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Mode <b>une question par écran</b>, sauvegarde automatique, tu peux revenir en arrière à tout moment.
        </p>
      </header>

      {/* Progress bar */}
      <div className="mb-6 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full"
          style={{
            width: `${Math.round(((stepIndex + 1) / STEPS.length) * 100)}%`,
            background: "#0030A8",
          }}
        />
      </div>

      {/* Step */}
      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-medium mb-4">{current.title}</h2>
        {current.render}
      </section>

      {/* Footer actions */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={goPrev}
          disabled={stepIndex === 0}
          className="rounded-2xl px-5 py-2.5 border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
        >
          Précédent
        </button>
        <button
          onClick={goNext}
          disabled={!canNext(current.key)}
          className="rounded-2xl px-5 py-2.5 bg-[#0030A8] text-white disabled:opacity-50"
        >
          {stepIndex < STEPS.length - 1 ? "Continuer" : "Étape suivante"}
        </button>

        <div className="ml-auto text-xs text-gray-500">
          Palette : <span className="font-mono">#0030A8</span> / <span className="font-mono">#4fd1c5</span> / <span className="font-mono">#F59E0B</span>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </main>
  );
}

/** Slider + number input compact row */
function SliderRow({
  value,
  setValue,
  min,
  max,
  step,
  suffix,
  helper,
}: {
  value: number | null;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  helper?: string;
}) {
  const v = value ?? min;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full accent-[#0030A8]"
        />
        <div className="w-40">
          <div className="rounded-xl border px-3 py-2 text-sm">
            {new Intl.NumberFormat("fr-CH").format(v)}{suffix || ""}
          </div>
        </div>
      </div>
      {helper && <div className="text-xs text-gray-500">{helper}</div>}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{new Intl.NumberFormat("fr-CH").format(min)}</span>
        <span>{new Intl.NumberFormat("fr-CH").format(max)}</span>
      </div>
    </div>
  );
}
