"use client";

// ============================================================================
// ADMIN — Traductions de l'app iOS (appTranslations)
//
// Édite les libellés d'interface (fr/en/de/it) stockés dans Firestore
// `appTranslations/{locale}`. L'app iOS charge ces documents au lancement et
// écrase ses défauts embarqués → une modif ici apparaît au prochain lancement
// (ou pull-to-refresh) de l'app.
//
// ⚠️ Les clés contiennent des points (« wizard3a.step1_title »). On écrit avec
// setDoc(..., { merge: true }) — qui traite les clés LITTÉRALEMENT — et surtout
// PAS updateDoc(), qui interpréterait le point comme un chemin imbriqué.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LOCALES = ["fr", "en", "de", "it"] as const;
type Locale = (typeof LOCALES)[number];
const LOCALE_LABEL: Record<Locale, string> = { fr: "🇫🇷 FR", en: "🇬🇧 EN", de: "🇩🇪 DE", it: "🇮🇹 IT" };

type Data = Record<Locale, Record<string, string>>;

export default function TranslationsEntry() {
  const [data, setData] = useState<Data>({ fr: {}, en: {}, de: {}, it: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState<Set<string>>(new Set()); // "locale|key"
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const next: Data = { fr: {}, en: {}, de: {}, it: {} };
      await Promise.all(
        LOCALES.map(async (loc) => {
          const snap = await getDoc(doc(db, "appTranslations", loc));
          next[loc] = (snap.exists() ? (snap.data() as Record<string, string>) : {}) || {};
        })
      );
      setData(next);
      setLoading(false);
    })();
  }, []);

  // Union de toutes les clés, triées (par écran puis par clé).
  const allKeys = useMemo(() => {
    const set = new Set<string>();
    for (const loc of LOCALES) for (const k of Object.keys(data[loc])) set.add(k);
    return [...set].sort();
  }, [data]);

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter(
      (k) => k.toLowerCase().includes(q) || LOCALES.some((loc) => (data[loc][k] || "").toLowerCase().includes(q))
    );
  }, [allKeys, search, data]);

  // Regroupe par écran (préfixe avant le premier point).
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const k of filteredKeys) {
      const g = k.includes(".") ? k.split(".")[0] : "divers";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(k);
    }
    return [...map.entries()];
  }, [filteredKeys]);

  function edit(loc: Locale, key: string, value: string) {
    setData((d) => ({ ...d, [loc]: { ...d[loc], [key]: value } }));
    setDirty((s) => new Set(s).add(`${loc}|${key}`));
  }

  async function save() {
    if (!dirty.size) return;
    setSaving(true);
    // Regroupe les cellules modifiées par langue → une écriture merge par doc.
    const perLocale: Record<string, Record<string, string>> = {};
    for (const entry of dirty) {
      const [loc, key] = entry.split("|");
      (perLocale[loc] ||= {})[key] = data[loc as Locale][key] ?? "";
    }
    try {
      await Promise.all(
        Object.entries(perLocale).map(([loc, fields]) =>
          // merge:true + clés littérales (surtout PAS updateDoc, cf. en-tête).
          setDoc(doc(db, "appTranslations", loc), fields, { merge: true })
        )
      );
      setDirty(new Set());
      setSavedAt(new Date().toLocaleTimeString("fr-CH"));
    } catch (e: any) {
      alert("Échec de l'enregistrement : " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-slate-500">Chargement des traductions…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* En-tête collant */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 pb-4 mb-6 -mx-6 px-6 pt-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Traductions de l&apos;app</h1>
            <p className="text-sm text-slate-500">
              {allKeys.length} clés · fr/en/de/it · les modifs apparaissent au prochain lancement de l&apos;app
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && !dirty.size && <span className="text-xs text-emerald-600 font-semibold">Enregistré à {savedAt}</span>}
            <button
              onClick={save}
              disabled={!dirty.size || saving}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${
                dirty.size && !saving ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {saving ? "Enregistrement…" : dirty.size ? `Enregistrer (${dirty.size})` : "À jour"}
            </button>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une clé ou un texte…"
          className="mt-4 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      {groups.map(([group, keys]) => (
        <section key={group} className="mb-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{group}</h2>
          <div className="space-y-4">
            {keys.map((key) => (
              <div key={key} className="rounded-2xl border border-slate-100 p-4 bg-white shadow-sm">
                <div className="text-[11px] font-mono text-slate-400 mb-2">{key}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {LOCALES.map((loc) => {
                    const isDirty = dirty.has(`${loc}|${key}`);
                    return (
                      <label key={loc} className="block">
                        <span className="text-[10px] font-bold text-slate-500">{LOCALE_LABEL[loc]}</span>
                        <textarea
                          value={data[loc][key] ?? ""}
                          onChange={(e) => edit(loc, key, e.target.value)}
                          rows={Math.max(1, Math.ceil((data[loc][key]?.length || 0) / 60))}
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm resize-y focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                            isDirty ? "border-amber-400 bg-amber-50" : "border-slate-200"
                          }`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!filteredKeys.length && <div className="text-slate-400 text-sm">Aucune clé ne correspond à « {search} ».</div>}
    </div>
  );
}
