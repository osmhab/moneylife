"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// Types
type Sexe = "H" | "F" | "Autre";
type ClientDoc = {
  createdAt?: any;
  updatedAt?: any;
  // champs requis v4.2
  prenom?: string;
  nom?: string;
  sexe?: Sexe | null;
  dateNaissance?: string; // yyyy-mm-dd
  adresse?: {
    rueNumero?: string;
    npa?: string;
    localite?: string;
  };
  statutPro?: "salarié" | "indépendant" | "";
  fumeur?: boolean | null;
  santeDeclaration?: string;
  nationalite?: string;
  permisSejour?: string | null;
  revenuAnnuel?: number | null;
  // liens
  fromConfig?: string;        // configId
};

// Helpers
const fmt = new Intl.NumberFormat("fr-CH");
const toNumber = (s: string) => {
  const n = Number(String(s).replace(/[’'`_\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export default function PersonalPage() {
  const { configId } = useParams<{ configId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On stocke le client sous un token stable = configId pour simplifier (tu pourras lier plus tard à un vrai clientToken)
  const clientToken = useMemo(() => configId, [configId]);

  // State formulaire
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [sexe, setSexe] = useState<Sexe | null>(null);
  const [dateNaissance, setDateNaissance] = useState("");
  const [rueNumero, setRueNumero] = useState("");
  const [npa, setNpa] = useState("");
  const [localite, setLocalite] = useState("");
  const [statutPro, setStatutPro] = useState<"salarié" | "indépendant" | "">("");
  const [fumeur, setFumeur] = useState<boolean | null>(null);
  const [santeDeclaration, setSanteDeclaration] = useState("");
  const [nationalite, setNationalite] = useState("");
  const [permisSejour, setPermisSejour] = useState<string | null>(null);
  const [revenuAnnuel, setRevenuAnnuel] = useState<number | null>(null);

  // Steps (une question par écran)
  const STEPS: Array<{ key: string; title: string; render: React.ReactNode; required?: boolean }> = useMemo(() => [
    {
      key: "sexe",
      title: "Quel est ton sexe ?",
      render: (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["H","F","Autre"] as Sexe[]).map((opt) => (
            <button
              key={opt}
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
      required: true,
    },
    {
      key: "identite",
      title: "Ton identité",
      render: (
        <div className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Prénom" value={prenom} onChange={setPrenom} required />
            <Input label="Nom" value={nom} onChange={setNom} required />
          </div>
          <Input label="Date de naissance" type="date" value={dateNaissance} onChange={setDateNaissance} required />
        </div>
      ),
      required: true,
    },
    {
      key: "adresse",
      title: "Ton adresse",
      render: (
        <div className="grid gap-3">
          <Input label="Rue & numéro" value={rueNumero} onChange={setRueNumero} required />
          <div className="grid sm:grid-cols-3 gap-3">
            <Input label="NPA" value={npa} onChange={setNpa} required />
            <div className="sm:col-span-2">
              <Input label="Localité" value={localite} onChange={setLocalite} required />
            </div>
          </div>
        </div>
      ),
      required: true,
    },
    {
      key: "statut",
      title: "Statut professionnel",
      render: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["salarié","indépendant"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatutPro(s)}
              className={[
                "rounded-2xl border px-4 py-3 text-center",
                statutPro === s ? "border-[#0030A8] ring-2 ring-[#0030A8]" : "hover:bg-gray-50"
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
      ),
      required: true,
    },
    {
      key: "habitudes",
      title: "Habitudes & santé",
      render: (
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm">Fumeur ?</span>
            <button
              onClick={() => setFumeur(true)}
              className={"rounded-xl border px-3 py-1.5 text-sm " + (fumeur === true ? "border-[#0030A8] ring-2 ring-[#0030A8]" : "hover:bg-gray-50")}
            >
              Oui
            </button>
            <button
              onClick={() => setFumeur(false)}
              className={"rounded-xl border px-3 py-1.5 text-sm " + (fumeur === false ? "border-[#0030A8] ring-2 ring-[#0030A8]" : "hover:bg-gray-50")}
            >
              Non
            </button>
          </div>
          <Input label="Déclaration de santé (court)" value={santeDeclaration} onChange={setSanteDeclaration} placeholder="Ex.: aucune maladie chronique déclarée" />
        </div>
      ),
    },
    {
      key: "papiers",
      title: "Nationalité et permis",
      render: (
        <div className="grid gap-3">
          <Input label="Nationalité" value={nationalite} onChange={setNationalite} required />
          <Input label="Permis de séjour (optionnel)" value={permisSejour ?? ""} onChange={(v) => setPermisSejour(v || null)} placeholder="B, C, G, L..." />
        </div>
      ),
      required: true,
    },
    {
      key: "revenu",
      title: "Revenu annuel (optionnel)",
      render: (
        <div className="grid gap-2">
          <Input
            label="Revenu annuel (CHF)"
            value={revenuAnnuel == null ? "" : String(revenuAnnuel)}
            onChange={(v) => setRevenuAnnuel(toNumber(v))}
            placeholder="p.ex. 90'000"
            type="text"
          />
          <p className="text-xs text-gray-500">Indiquer le revenu aide à calibrer la recommandation (AI 90%, Décès 80%).</p>
        </div>
      ),
    },
  ], [sexe, prenom, nom, dateNaissance, rueNumero, npa, localite, statutPro, fumeur, santeDeclaration, nationalite, permisSejour, revenuAnnuel]);

  const [stepIndex, setStepIndex] = useState(0);
  const current = STEPS[stepIndex];

  // Init: préremplir sexe depuis configs.sexe et charger clients/{clientToken}
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Préremplissage sexe depuis config
        const cfg = await getDoc(doc(db, "configs", configId));
        const cfgSexe = (cfg.exists() ? (cfg.data() as any).sexe : null) as Sexe | null;

        // Client
        const cref = doc(db, "clients", clientToken);
        const csnap = await getDoc(cref);

        if (!csnap.exists()) {
          await setDoc(cref, {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            fromConfig: configId,
            sexe: cfgSexe ?? null,
          } as ClientDoc);
          if (cfgSexe && !cancelled) setSexe(cfgSexe);
        } else {
          const c = csnap.data() as ClientDoc;
          if (!cancelled) {
            setPrenom(c.prenom || "");
            setNom(c.nom || "");
            setSexe((c.sexe ?? cfgSexe ?? null) as Sexe | null);
            setDateNaissance(c.dateNaissance || "");
            setRueNumero(c.adresse?.rueNumero || "");
            setNpa(c.adresse?.npa || "");
            setLocalite(c.adresse?.localite || "");
            setStatutPro((c.statutPro as any) || "");
            setFumeur(c.fumeur ?? null);
            setSanteDeclaration(c.santeDeclaration || "");
            setNationalite(c.nationalite || "");
            setPermisSejour(c.permisSejour ?? null);
            setRevenuAnnuel(c.revenuAnnuel ?? null);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Impossible de charger les données personnelles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [configId, clientToken]);

  // Autosave (debounced)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => save(false), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prenom, nom, sexe, dateNaissance, rueNumero, npa, localite, statutPro, fumeur, santeDeclaration, nationalite, permisSejour, revenuAnnuel]);

  async function save(showSpinner = true) {
    try {
      if (showSpinner) setSaving(true);
      setError(null);
      const cref = doc(db, "clients", clientToken);
      const payload: ClientDoc = {
        updatedAt: serverTimestamp(),
        prenom, nom,
        sexe: sexe ?? null,
        dateNaissance: dateNaissance || "",
        adresse: { rueNumero, npa, localite },
        statutPro: (statutPro || "") as any,
        fumeur,
        santeDeclaration,
        nationalite,
        permisSejour: permisSejour ?? null,
        revenuAnnuel: revenuAnnuel ?? null,
        fromConfig: configId,
      };
      await updateDoc(cref, payload as any);
      // Miroir: pousse aussi sexe dans la config si absent
      if (sexe) {
        await updateDoc(doc(db, "configs", configId), { sexe, updatedAt: serverTimestamp() } as any);
      }
    } catch (e: any) {
      setError(e?.message ?? "Échec de la sauvegarde.");
    } finally {
      if (showSpinner) setSaving(false);
    }
  }

  const requiredOk = (stepKey: string) => {
    switch (stepKey) {
      case "sexe": return !!sexe;
      case "identite": return !!prenom && !!nom && !!dateNaissance;
      case "adresse": return !!rueNumero && !!npa && !!localite;
      case "statut": return !!statutPro;
      case "papiers": return !!nationalite;
      default: return true;
    }
  };

  const goNext = async () => {
    if (!requiredOk(current.key)) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      await save(true);
      // Fin de l'étape → on va créer la demande d'offres ensuite
      router.push(`/client/${clientToken}/offres`);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  return (
    <main className="min-h-[calc(100dvh-4rem)] mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50">
            Retour
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Données personnelles</h1>
          <div className="ml-auto text-xs text-gray-500">
            {saving ? "Enregistrement…" : "Enregistré"}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Ces infos minimum permettent d’envoyer des demandes d’offres aux partenaires (3a).
        </p>
      </header>

      {/* Progress */}
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

      {/* Footer */}
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
          disabled={!requiredOk(current.key)}
          className="rounded-2xl px-5 py-2.5 bg-[#0030A8] text-white disabled:opacity-50"
        >
          {stepIndex < STEPS.length - 1 ? "Continuer" : "Terminer"}
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

/* ---- UI input helper ---- */
function Input({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}{required ? " *" : ""}</span>
      <input
        type={type}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0030A8]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
