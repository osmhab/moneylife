"use client";

// Page de capture ouverte sur le TÉLÉPHONE du collaborateur, depuis le lien SMS.
//
// Sous `[locale]` — non pour être traduite, mais parce que c'est le SEUL endroit
// où un layout importe `globals.css`. Placée à la racine de `app/`, elle tombait
// sur le layout minimal généré par Next et s'affichait sans aucun style.
// Elle n'affiche aucune donnée du client — ni nom, ni dossier — uniquement le
// type de document attendu : un téléphone posé sur une table pendant un
// entretien ne doit rien laisser voir.
//
// PARTI PRIS DE MISE EN PAGE
// --------------------------
// Écran tenu à une main, souvent debout, parfois d'une main occupée à tenir le
// document. Donc : une seule action visible à la fois, des cibles de frappe
// hautes (~64 px), et les boutons ANCRÉS EN BAS, à portée du pouce, plutôt
// qu'au fil du contenu. Le reste est délibérément vide.
//
// `capture="environment"` ouvre directement l'appareil photo arrière sur mobile,
// tout en laissant le choix d'un fichier existant sur ordinateur.

import * as React from "react";
import { use } from "react";

type Etat = "chargement" | "pret" | "invalide" | "envoye";

export default function ScanMobilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [etat, setEtat] = React.useState<Etat>("chargement");
  const [libelle, setLibelle] = React.useState("");
  const [deposes, setDeposes] = React.useState(0);
  const [envoi, setEnvoi] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const champ = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/scan-mobile/${token}`);
        const j = await res.json();
        if (!res.ok || !j.valide) { setEtat("invalide"); return; }
        setLibelle(j.libelle);
        setDeposes(j.deposes || 0);
        setEtat(j.termine ? "envoye" : "pret");
      } catch {
        setEtat("invalide");
      }
    })();
  }, [token]);

  async function envoyer(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const form = new FormData();
      for (const f of Array.from(fichiers)) form.append("file", f);
      const res = await fetch(`/api/scan-mobile/${token}`, { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) { setErreur(j?.error || "Envoi impossible"); return; }
      setDeposes(j.deposes);
    } catch {
      setErreur("Envoi impossible — vérifiez votre connexion.");
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  }

  async function terminer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/scan-mobile/${token}?action=terminer`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) { setErreur(j?.error || "Envoi impossible"); return; }
      setEtat("envoye");
    } catch {
      setErreur("Envoi impossible — vérifiez votre connexion.");
    } finally {
      setEnvoi(false);
    }
  }

  if (etat === "chargement") {
    return (
      <Page>
        <div className="flex flex-1 items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
        </div>
      </Page>
    );
  }

  if (etat === "invalide") {
    return (
      <Page>
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Lien expiré</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
            Ce lien n&apos;est plus valable. Relancez « Scan mobile » depuis l&apos;analyse
            pour en recevoir un nouveau.
          </p>
        </div>
      </Page>
    );
  }

  if (etat === "envoye") {
    return (
      <Page>
        <div className="flex flex-1 flex-col justify-center">
          <span className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Envoyé</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
            {deposes} page{deposes > 1 ? "s" : ""} transmise{deposes > 1 ? "s" : ""}.
            Le scan démarre sur votre ordinateur — vous pouvez fermer cette page.
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Scan mobile</p>
        <h1 className="mt-2 text-3xl font-black leading-[1.1] tracking-tight text-slate-900">{libelle}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
          Cadrez la page entière, à plat et bien éclairée.
        </p>

        {deposes > 0 && (
          <div className="mt-8 flex items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
              {deposes}
            </span>
            <span className="text-[15px] font-semibold text-emerald-900">
              page{deposes > 1 ? "s" : ""} prise{deposes > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {erreur && (
          <p className="mt-6 rounded-2xl bg-red-50 px-5 py-4 text-[15px] font-medium text-red-700">{erreur}</p>
        )}
      </div>

      <input
        ref={champ}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => envoyer(e.target.files)}
      />

      {/* Ancrés en bas : c'est là que se trouve le pouce. */}
      <div className="space-y-3 pt-8">
        <button
          type="button"
          disabled={envoi}
          onClick={() => champ.current?.click()}
          className="w-full rounded-2xl bg-slate-900 py-5 text-[17px] font-black text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          {envoi ? "Envoi…" : deposes ? "Page suivante" : "Prendre la photo"}
        </button>

        {/* Le scan ne démarre QUE sur ce bouton : un document de plusieurs pages
            doit pouvoir être photographié en entier avant de partir. */}
        {deposes > 0 && (
          <button
            type="button"
            disabled={envoi}
            onClick={terminer}
            className="w-full rounded-2xl border-2 border-slate-900 py-5 text-[17px] font-black text-slate-900 transition active:scale-[0.98] disabled:opacity-40"
          >
            Terminer et lancer le scan
          </button>
        )}
      </div>
    </Page>
  );
}

/** Ossature commune : logo discret en tête, contenu, actions en bas. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white px-6 pb-10 pt-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* `self-start` indispensable : le conteneur est en `flex flex-col`, donc
          `align-items: stretch` étirerait l'image sur toute la largeur et
          écraserait `w-auto` — le logo s'affichait déformé. */}
      <img src="/creditx-logo-black.png" alt="CreditX" className="mb-10 h-7 w-auto self-start" />
      {children}
    </div>
  );
}
