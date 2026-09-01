"use client";

// Écran de préparation du dossier PDF : on choisit les cinq images, on voit
// comment chacune tombera dans la page, puis on génère.
//
// APERÇU FIDÈLE
// -------------
// Chaque vignette reproduit le RAPPORT EXACT de l'emplacement dans le document
// (couverture 595×560 pt, bandeaux 595×132, clôture 595×300) avec le même
// `cover` que react-pdf. Une image jugée sur une vignette carrée réserve
// systématiquement de mauvaises surprises : un portrait superbe devient une
// bande de front dans un bandeau de 132 pt de haut.
//
// Les fichiers ne sont jamais publics : ils transitent par
// /api/admin/files/view (authentifié) et sont convertis en URL d'objet, ce qui
// sert AUSSI à react-pdf au moment de générer.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Check, ImageOff, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Slot = "cover" | "retraite" | "invalidite" | "deces" | "closing";

/** Emplacements, dans l'ordre du document, avec le format réel de la zone. */
const SLOTS: { key: Slot; label: string; page: string; ratio: number; brief: string }[] = [
  {
    key: "cover", label: "Couverture", page: "Page 1", ratio: 595 / 560,
    brief: "Éditorial mode, noir dominant, angle inhabituel, aucun visage identifiable.",
  },
  {
    key: "retraite", label: "Retraite", page: "Bandeau de thème", ratio: 595 / 132,
    brief: "Paysage large et apaisé, tons clairs et froids, aucun sujet au centre.",
  },
  {
    key: "invalidite", label: "Invalidité", page: "Bandeau de thème", ratio: 595 / 132,
    brief: "Intérieur calme, cadrage serré, pas de visage.",
  },
  {
    key: "deces", label: "Décès", page: "Bandeau de thème", ratio: 595 / 132,
    brief: "Transmission, silhouettes à contre-jour, jamais mortifère.",
  },
  {
    key: "closing", label: "Clôture", page: "Dernière page", ratio: 595 / 300,
    brief: "Matière ou horizon, sombre, sert de respiration finale.",
  },
];

type LibItem = { path: string; name: string; size: number; updated: string | null };
/** Signature imprimée sur la couverture — propre à chaque conseiller. */
type AdvisorCard = { nom: string; fonction: string; agence: string };
/** Affectation : le fichier retenu et son recadrage, en pourcentage sur chaque axe. */
type SlotValue = { path: string; x: number; y: number };

/** Tolère l'ancienne forme (chaîne seule) enregistrée avant le recadrage. */
const asValue = (v: any): SlotValue | undefined =>
  !v ? undefined : typeof v === "string" ? { path: v, x: 50, y: 50 } : { path: v.path, x: v.x ?? 50, y: v.y ?? 50 };

export default function DossierImagesDialog({
  open, onOpenChange, uid, onGenerate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  uid?: string;
  /** Reçoit les URL d'objet prêtes à être passées à react-pdf. */
  onGenerate: (
    images: Partial<Record<Slot, { src: string; x: number; y: number }>>,
    notes: string,
    advisor: AdvisorCard,
  ) => void | Promise<void>;
}) {
  const [loading, setLoading] = React.useState(true);
  const [library, setLibrary] = React.useState<LibItem[]>([]);
  const [house, setHouse] = React.useState<Partial<Record<Slot, SlotValue>>>({});
  const [client, setClient] = React.useState<Partial<Record<Slot, SlotValue>>>({});
  const [active, setActive] = React.useState<Slot>("cover");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  // Les notes ne se SAISISSENT plus ici : elles sont rédigées dans la section
  // « Notes du conseiller » de l'écran d'analyse, et l'entretien clôturé est une
  // pièce datée. Ce dialogue ne fait que choisir ce qui part au client.
  const [blocs, setBlocs] = React.useState<{ cle: string; titre: string; texte: string }[]>([]);
  const [inclus, setInclus] = React.useState<Record<string, boolean>>({});
  /** Le paramétrage (bibliothèque, jeu maison) est réservé au propriétaire. */
  const [canManage, setCanManage] = React.useState(false);
  const [card, setCard] = React.useState<AdvisorCard>({ nom: "", fonction: "", agence: "" });
  const [cardSaved, setCardSaved] = React.useState<"idle" | "saving" | "saved">("idle");

  // Cache path → URL d'objet : une même image sert la vignette de la
  // bibliothèque, l'aperçu ET la génération, sans être retéléchargée.
  const urls = React.useRef<Map<string, string>>(new Map());
  const [, forceRender] = React.useReducer((n) => n + 1, 0);

  const authed = React.useCallback(async (init?: RequestInit, qs = "") => {
    const token = await auth.currentUser?.getIdToken();
    return fetch(`/api/admin/dossier-images${qs}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }, []);

  const objectUrl = React.useCallback(async (path: string) => {
    if (urls.current.has(path)) return urls.current.get(path)!;
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/admin/files/view?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("image illisible");
    const url = URL.createObjectURL(await res.blob());
    urls.current.set(path, url);
    forceRender();
    return url;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed({}, uid ? `?uid=${uid}` : "");
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setLibrary(d.library || []);
      const norm = (o: any) => Object.fromEntries(
        Object.entries(o || {}).map(([k, v]) => [k, asValue(v)]).filter(([, v]) => v),
      );
      setHouse(norm(d.house));
      setClient(norm(d.client));
      setCanManage(!!d.canManage);
      // Précharge les vignettes ; un échec isolé ne doit pas bloquer l'écran.
      (d.library || []).forEach((it: LibItem) => void objectUrl(it.path).catch(() => {}));
      // Les visuels déjà affectés peuvent ne plus être dans la bibliothèque.
    } catch {
      toast.error("Bibliothèque d'images indisponible");
    } finally {
      setLoading(false);
    }
  }, [authed, uid, objectUrl]);

  React.useEffect(() => { if (open) void load(); }, [open, load]);

  // Blocs de notes disponibles pour ce client, cochés par défaut.
  React.useEffect(() => {
    if (!open || !uid) return;
    (async () => {
      try {
        const t = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/notes?uid=${uid}`, { headers: { Authorization: `Bearer ${t}` } });
        if (!res.ok) return;
        const d = await res.json();
        const jour = (iso?: string | null) =>
          iso ? new Date(iso).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" }) : "";
        const out: { cle: string; titre: string; texte: string }[] = [];
        if (d.conseiller?.texte?.trim()) {
          out.push({ cle: "conseiller", titre: `Notes du conseiller${d.conseiller.updatedAt ? ` — ${jour(d.conseiller.updatedAt)}` : ""}`, texte: d.conseiller.texte.trim() });
        }
        if (d.session?.texte) {
          out.push({ cle: "session", titre: `Entretien du ${jour(d.session.date)}`, texte: d.session.texte });
        }
        if (d.brouillon?.texte) {
          out.push({ cle: "brouillon", titre: "Entretien en cours", texte: d.brouillon.texte });
        }
        setBlocs(out);
        setInclus(Object.fromEntries(out.map((b) => [b.cle, true])));
      } catch { /* le dossier imprimera une page réglée vierge */ }
    })();
  }, [open, uid]);

  // Carte du conseiller CONNECTÉ : la route la déduit du jeton, personne ne peut
  // donc modifier la signature d'un collègue.
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/advisor-card", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setCard((await res.json()).card);
      } catch { /* la couverture se passera de signature */ }
    })();
  }, [open]);

  const cardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function onCardChange(patch: Partial<AdvisorCard>) {
    const next = { ...card, ...patch };
    setCard(next);
    if (cardTimer.current) clearTimeout(cardTimer.current);
    setCardSaved("saving");
    cardTimer.current = setTimeout(async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/advisor-card", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        setCardSaved(res.ok ? "saved" : "idle");
      } catch { setCardSaved("idle"); }
    }, 700);
  }

  // Les URL d'objet sont révoquées au démontage, pas à la fermeture : le PDF
  // généré s'en sert encore le temps que react-pdf lise les images.
  React.useEffect(() => {
    const map = urls.current;
    return () => { map.forEach((u) => URL.revokeObjectURL(u)); map.clear(); };
  }, []);

  /** Affectation retenue : exception client, sinon jeu maison. */
  const resolved = (slot: Slot) => client[slot] || house[slot];
  const isException = (slot: Slot) => !!client[slot] && client[slot]?.path !== house[slot]?.path;

  /** Écrit l'affectation d'un emplacement (fichier et/ou recadrage). */
  async function assign(slot: Slot, value: SlotValue | null) {
    const next = { ...client };
    if (value) next[slot] = value; else delete next[slot];
    setClient(next);
    try {
      const res = await authed({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "client", uid, slots: next }),
      });
      if (!res.ok) throw new Error();
      if (value) void objectUrl(value.path).catch(() => {});
    } catch {
      toast.error("Enregistrement impossible");
    }
  }

  /** Fige la sélection courante comme jeu maison, pour tous les dossiers. */
  async function saveAsHouse() {
    const merged = { ...house, ...client };
    setBusy("house");
    try {
      const res = await authed({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "house", slots: merged }),
      });
      if (!res.ok) throw new Error();
      setHouse(merged);
      toast.success("Jeu maison mis à jour");
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await authed({ method: "POST", body: fd });
        const d = await res.json();
        if (!res.ok) { toast.error(d?.error || `Échec : ${f.name}`); continue; }
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function removeFromLibrary(path: string) {
    if (!confirm("Retirer cette image de la bibliothèque ?")) return;
    setBusy(path);
    try {
      const res = await authed({
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error();
      setLibrary((l) => l.filter((i) => i.path !== path));
      toast.success("Image retirée");
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const images: Partial<Record<Slot, { src: string; x: number; y: number }>> = {};
      for (const { key } of SLOTS) {
        const v = resolved(key);
        if (!v) continue;
        try { images[key] = { src: await objectUrl(v.path), x: v.x, y: v.y }; } catch { /* emplacement laissé vide */ }
      }
      // Chaque bloc retenu est précédé de son intitulé daté, dans l'ordre
      // d'affichage : le client sait de quel entretien vient quoi.
      const texte = blocs
        .filter((b) => inclus[b.cle])
        .map((b) => `${b.titre}\n${b.texte}`)
        .join("\n\n");
      await onGenerate(images, texte, card);
      onOpenChange(false);
    } finally {
      setGenerating(false);
    }
  }

  // Recadrage à la souris. Le déplacement est rapporté à la taille du cadre :
  // traverser tout l'aperçu balaie 0 → 100 % de l'image, quel que soit le zoom
  // d'affichage du navigateur.
  const dragBox = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  function onDragStart(e: React.PointerEvent) {
    const v = resolved(active);
    if (!v) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: v.x, py: v.y };
    setDragging(true);
  }
  function onDragMove(e: React.PointerEvent) {
    const d = drag.current, v = resolved(active), box = dragBox.current;
    if (!d || !v || !box) return;
    const r = box.getBoundingClientRect();
    // Sens inverse : tirer l'image vers la gauche montre sa partie droite.
    const nx = Math.min(100, Math.max(0, d.px - ((e.clientX - d.x) / r.width) * 100));
    const ny = Math.min(100, Math.max(0, d.py - ((e.clientY - d.y) / r.height) * 100));
    setClient((c) => ({ ...c, [active]: { ...v, x: nx, y: ny } }));
  }
  function onDragEnd() {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    // Enregistré une seule fois, au relâchement — pas à chaque pixel parcouru.
    const v = resolved(active);
    if (v) void assign(active, v);
  }

  const activeSlot = SLOTS.find((s) => s.key === active)!;
  const activeValue = resolved(active);
  const activePath = activeValue?.path;
  const activeUrl = activePath ? urls.current.get(activePath) : undefined;
  const remplis = SLOTS.filter((s) => resolved(s.key)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `DialogContent` est en `grid` dans le composant de base : on garde cette
          grille (un `flex` ajouté ici entrerait en conflit sur la propriété
          `display`, et le gagnant dépendrait de l'ordre du CSS généré). Trois
          rangées — en-tête, corps extensible, pied — et `minmax(0,1fr)` pour que
          la rangée centrale puisse RÉTRÉCIR, sans quoi son contenu déborde sous
          le bas de la fenêtre au lieu de défiler. */}
      <DialogContent className="max-h-[90vh] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Préparer le dossier</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {remplis} emplacement{remplis > 1 ? "s" : ""} sur {SLOTS.length} rempli{remplis > 1 ? "s" : ""}.
            Un emplacement vide affiche son cahier des charges dans le PDF.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
        <Tabs defaultValue="images" className="flex min-h-0 flex-col overflow-hidden">
          <TabsList className="w-fit">
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="texte">Notes et signature</TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-5 md:grid-cols-[240px_1fr]">
            {/* Emplacements */}
            <div className="space-y-1.5">
              {SLOTS.map((s) => {
                const v = resolved(s.key);
                const url = v ? urls.current.get(v.path) : undefined;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActive(s.key)}
                    className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition ${
                      active === s.key ? "border-slate-900 bg-muted/60" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                          style={{ objectPosition: `${v!.x}% ${v!.y}%` }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {v ? (isException(s.key) ? "Exception client" : "Jeu maison") : "Vide"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              {/* Aperçu au format réel de la zone */}
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm font-medium">{activeSlot.label} — {activeSlot.page}</p>
                  {activePath && (
                    <button
                      onClick={() => assign(active, null)}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Vider l&apos;emplacement
                    </button>
                  )}
                </div>

                <div className="overflow-hidden rounded-md border bg-white p-3">
                  <div
                    ref={dragBox}
                    className={`w-full touch-none overflow-hidden bg-[#F2F1EE] ${
                      activeUrl ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
                    }`}
                    style={{ aspectRatio: String(activeSlot.ratio) }}
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                  >
                    {activeUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeUrl}
                        alt=""
                        draggable={false}
                        className="h-full w-full select-none object-cover"
                        style={{ objectPosition: `${activeValue!.x}% ${activeValue!.y}%` }}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Emplacement image
                        </p>
                        <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                          {activeSlot.brief}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Rappel de ce qui entoure l'image dans la page */}
                  {active === "cover" ? (
                    <div className="px-1 pt-4">
                      <div className="h-1.5 w-10 rounded bg-slate-300" />
                      <div className="mt-2 h-5 w-52 rounded bg-slate-800" />
                      <div className="mt-3 h-px w-14 bg-slate-900" />
                      <div className="mt-3 flex gap-4">
                        {[0, 1, 2].map((i) => <div key={i} className="h-3 w-16 rounded bg-slate-200" />)}
                      </div>
                    </div>
                  ) : active === "closing" ? (
                    <div className="px-1 pt-4">
                      <div className="h-3 w-16 rounded bg-slate-300" />
                      <div className="mt-3 h-2 w-full rounded bg-slate-200" />
                      <div className="mt-1.5 h-2 w-4/5 rounded bg-slate-200" />
                    </div>
                  ) : (
                    <div className="px-1 pt-4">
                      <div className="h-6 w-10 rounded bg-slate-200" />
                      <div className="mt-1.5 h-4 w-32 rounded bg-slate-800" />
                      <div className="mt-2 h-px w-11 bg-slate-900" />
                      <div className="mt-3 h-2 w-full rounded bg-slate-200" />
                      <div className="mt-1.5 h-2 w-3/4 rounded bg-slate-200" />
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {activeUrl
                      ? "Faites glisser l'image pour la recadrer — ce que vous voyez est ce qui sera imprimé."
                      : "Choisissez une image dans la bibliothèque ci-dessous."}
                  </p>
                  {activeValue && (activeValue.x !== 50 || activeValue.y !== 50) && (
                    <button
                      onClick={() => assign(active, { ...activeValue, x: 50, y: 50 })}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Recentrer
                    </button>
                  )}
                </div>
              </div>

              {/* Bibliothèque */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Bibliothèque</p>
                  {canManage ? (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                    {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Ajouter des images
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      multiple
                      className="hidden"
                      onChange={(e) => { void upload(e.target.files); e.target.value = ""; }}
                    />
                  </label>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Bibliothèque gérée par CreditX</span>
                  )}
                </div>

                {library.length === 0 ? (
                  <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    Aucune image. Téléversez vos visuels : ils resteront disponibles pour tous les dossiers.
                  </p>
                ) : (
                  <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pr-1">
                    {library.map((it) => {
                      const url = urls.current.get(it.path);
                      const chosen = resolved(active)?.path === it.path;
                      return (
                        <div key={it.path} className="group relative">
                          <button
                            onClick={() => assign(active, { path: it.path, x: 50, y: 50 })}
                            className={`block aspect-[4/3] w-full overflow-hidden rounded border-2 transition ${
                              chosen ? "border-slate-900" : "border-transparent hover:border-slate-300"
                            }`}
                            title={it.name}
                          >
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={it.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </button>
                          {chosen && (
                            <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-slate-900 p-0.5">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </span>
                          )}
                          {canManage && (
                          <button
                            onClick={() => removeFromLibrary(it.path)}
                            className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-slate-500 hover:text-red-600 group-hover:block"
                            title="Retirer de la bibliothèque"
                          >
                            {busy === it.path ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                          </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="texte" className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              {/* Signature imprimée sur la couverture du dossier */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Votre signature</p>
                <span className="text-[11px] text-muted-foreground">
                  {cardSaved === "saving" ? "Enregistrement…" : cardSaved === "saved" ? "Enregistré" : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={card.nom}
                  onChange={(e) => onCardChange({ nom: e.target.value })}
                  placeholder="Prénom Nom"
                  className="h-8 text-sm"
                />
                <Input
                  value={card.fonction}
                  onChange={(e) => onCardChange({ fonction: e.target.value })}
                  placeholder="Spécialiste en prévoyance"
                  className="h-8 text-sm"
                />
                <Input
                  value={card.agence}
                  onChange={(e) => onCardChange({ agence: e.target.value })}
                  placeholder="Agence de Sion"
                  className="h-8 text-sm"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Apparaît sur la couverture, sous « Votre conseiller ». Une ligne vide est omise.
              </p>
            </div>

            {/* Notes du dossier — sélection, pas saisie */}
            <div>
              <p className="mb-2 text-sm font-medium">Notes à joindre au dossier</p>
              {blocs.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  Aucune note pour ce client. Le dossier imprimera une page réglée vierge.
                  Les notes se rédigent dans la section « Notes du conseiller », en bas de l&apos;écran d&apos;analyse.
                </p>
              ) : (
                <div className="space-y-2">
                  {blocs.map((b) => (
                    <label
                      key={b.cle}
                      className="flex cursor-pointer gap-3 rounded-md border p-3 transition hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={!!inclus[b.cle]}
                        onChange={(e) => setInclus((v) => ({ ...v, [b.cle]: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{b.titre}</span>
                        <span className="mt-0.5 block line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                          {b.texte}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Les blocs cochés s&apos;impriment en page « Notes d&apos;entretien », chacun sous son intitulé daté.
                Rien de coché : la page reste réglée et vierge.
              </p>
            </div>

          </TabsContent>
        </Tabs>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {canManage ? (
            <Button variant="outline" onClick={saveAsHouse} disabled={busy === "house" || loading}>
              {busy === "house" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Définir comme jeu maison
            </Button>
          ) : <span />}
          <Button onClick={generate} disabled={generating || loading} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Générer le dossier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
