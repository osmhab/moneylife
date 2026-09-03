"use client";

// Section « Analyses » : l'historique des dossiers RÉELLEMENT remis aux clients.
//
// Ces entrées sont en lecture seule par construction — la route d'archivage n'a
// ni PUT ni PATCH. Ouvrir un dossier renvoie les octets d'origine, donc ce que
// le client a eu en main, quel que soit l'état actuel du gabarit.

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Loader2, Download, Lock, Calendar, User, PenLine, Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

type Dossier = {
  id: string;
  clientUid: string;
  clientNom: string;
  conseiller: { nom?: string; fonction?: string; agence?: string } | null;
  score: number | null;
  lacunes: Record<string, number> | null;
  path: string;
  taille: number | null;
  createdAt: string | null;
  etabliPar: string | null;
};

const jour = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" }) +
      " · " + new Date(iso).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })
    : "—";

const poids = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(1)} Mo` : "");

/** Analyse commencée mais pas encore établie — déduite des traces du conseiller. */
type EnCours = {
  clientUid: string;
  clientNom: string;
  email: string;
  elements: string[];
  modifieLe: string | null;
  dejaEtabli: boolean;
};

export default function AnalysesPageClient() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const locale = pathname.split("/").filter(Boolean)[0] || "fr";

  const [dossiers, setDossiers] = React.useState<Dossier[]>([]);
  const [enCours, setEnCours] = React.useState<EnCours[]>([]);
  // Retrait d'une analyse de la liste : range l'entrée, n'efface aucun travail.
  const [aRetirer, setARetirer] = React.useState<EnCours | null>(null);
  const [retraitEnCours, setRetraitEnCours] = React.useState(false);

  async function retirerDeLaListe() {
    if (!aRetirer) return;
    setRetraitEnCours(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/analyse/en-cours?uid=${aRetirer.clientUid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setEnCours((l) => l.filter((e) => e.clientUid !== aRetirer.clientUid));
      toast("Retirée de la liste", { description: `${aRetirer.clientNom} — le travail déjà fait est conservé.` });
      setARetirer(null);
    } catch {
      toast("Retrait impossible", { description: "Réessayez dans un instant." });
    } finally {
      setRetraitEnCours(false);
    }
  }
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [ouverture, setOuverture] = React.useState<string | null>(null);

  const [picker, setPicker] = React.useState(false);
  const [clients, setClients] = React.useState<{ uid: string; nom: string; email: string }[]>([]);
  const [clientsLoading, setClientsLoading] = React.useState(false);
  const [qClient, setQClient] = React.useState("");

  const token = React.useCallback(() => auth.currentUser?.getIdToken(), []);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/dossiers", {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        if (!res.ok) throw new Error();
        const d = await res.json();
        setDossiers(d.dossiers || []);
        setEnCours(d.enCours || []);
      } catch {
        toast.error("Historique indisponible");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  /** Ouvre le PDF archivé — les octets d'origine, jamais un nouveau rendu. */
  async function ouvrir(d: Dossier) {
    setOuverture(d.id);
    try {
      const res = await fetch(`/api/admin/files/view?path=${encodeURIComponent(d.path)}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error("Ouverture impossible");
    } finally {
      setOuverture(null);
    }
  }

  /** Liste des clients pour « Créer nouveau ». */
  async function ouvrirPicker() {
    setPicker(true);
    if (clients.length) return;
    setClientsLoading(true);
    try {
      const snap = await getDocs(collection(db, "clients"));
      const out: { uid: string; nom: string; email: string }[] = [];
      for (const c of snap.docs) {
        const p = c.data() as any;
        // Le document racine `clients/{uid}` porte `firstName`/`lastName` ou
        // `displayName` selon l'origine du compte (création admin ou inscription).
        // Les champs `Enter_*` vivent dans DonneePersonnelles, pas ici.
        const nom = `${p.firstName || ""} ${p.lastName || ""}`.trim() || String(p.displayName || "").trim();
        out.push({ uid: c.id, nom: nom || p.email || c.id.slice(0, 8), email: p.email || "" });
      }
      out.sort((a, b) => a.nom.localeCompare(b.nom));
      setClients(out);
    } catch {
      toast.error("Liste des clients indisponible");
    } finally {
      setClientsLoading(false);
    }
  }

  const enCoursFiltres = enCours.filter((e) => {
    const t = q.trim().toLowerCase();
    return !t || e.clientNom.toLowerCase().includes(t) || e.email.toLowerCase().includes(t);
  });

  const filtres = dossiers.filter((d) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [d.clientNom, d.conseiller?.nom, d.etabliPar].some((v) => String(v || "").toLowerCase().includes(t));
  });

  const clientsFiltres = clients.filter((c) => {
    const t = qClient.trim().toLowerCase();
    return !t || c.nom.toLowerCase().includes(t) || c.email.toLowerCase().includes(t);
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
            <FileText className="text-indigo-600" size={28} />
            Analyses
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Les dossiers remis aux clients, tels qu&apos;ils ont été présentés. Consultation et réimpression seules.
          </p>
        </div>
        <Button onClick={ouvrirPicker} className="gap-2">
          <Plus className="h-4 w-4" /> Créer nouveau
        </Button>
      </header>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client, un conseiller…"
          className="h-12 rounded-xl border-slate-200 bg-white pl-11 font-medium"
        />
      </div>

      {/* ── EN COURS : travail commencé, pas encore établi ── */}
      {!loading && enCoursFiltres.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-black uppercase tracking-widest text-slate-500">
            En cours — {enCoursFiltres.length}
          </h2>
          <p className="mb-3 text-xs font-medium text-slate-500">
            Analyses commencées dont aucun dossier n&apos;a été établi depuis. Reprenez où vous en étiez.
          </p>
          <div className="divide-y divide-amber-100 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
            {enCoursFiltres.map((e) => (
              <div key={e.clientUid} className="flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-black text-slate-900">{e.clientNom}</p>
                    <Badge variant="outline" className="gap-1 border-amber-300 bg-white font-medium text-amber-800">
                      <PenLine className="h-3 w-3" /> En cours
                    </Badge>
                    {e.dejaEtabli && (
                      <Badge variant="secondary" className="font-medium">Modifiée depuis le dernier dossier</Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />{jour(e.modifieLe)}
                    </span>
                    <span>{e.elements.join(" · ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => router.push(`/${locale}/admin/clients/${e.clientUid}/analyse-prevoyance`)}
                    className="h-10 gap-2 font-bold"
                  >
                    <PenLine className="h-4 w-4" /> Reprendre
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer ${e.clientNom} de la liste`}
                    title="Retirer de la liste"
                    className="h-10 w-10 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setARetirer(e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AlertDialog open={!!aRetirer} onOpenChange={(o) => { if (!o) setARetirer(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer de la liste ?</AlertDialogTitle>
            <AlertDialogDescription>
              {aRetirer?.clientNom} disparaîtra des analyses en cours. Les besoins ajustés,
              les notes et les dossiers déjà établis sont conservés — seule l&apos;entrée
              de la liste est retirée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retraitEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => { ev.preventDefault(); void retirerDeLaListe(); }}
              disabled={retraitEnCours}
              className="bg-red-600 hover:bg-red-700"
            >
              {retraitEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!loading && dossiers.length > 0 && (
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">
          Dossiers établis — {dossiers.length}
        </h2>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
          <Loader2 className="animate-spin" size={18} /> Chargement…
        </div>
      ) : dossiers.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <FileText size={40} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-black text-slate-900">
              {enCours.length ? "Aucun dossier établi pour l'instant" : "Aucun dossier établi"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-500">
              Un dossier apparaît ici lorsqu&apos;il a été <strong>établi</strong> depuis l&apos;écran de préparation.
              Les aperçus ne sont pas conservés : seul ce qui a été remis au client entre dans l&apos;historique.
            </p>
            <Button onClick={ouvrirPicker} className="mt-6 gap-2">
              <Plus className="h-4 w-4" /> Créer nouveau
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filtres.length === 0 && (
            <p className="p-6 text-sm font-medium text-slate-500">Aucun résultat.</p>
          )}
          {filtres.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-4 p-5 transition hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-black text-slate-900">{d.clientNom || "Client"}</p>
                  <Badge variant="secondary" className="gap-1 font-medium">
                    <Lock className="h-3 w-3" /> Lecture seule
                  </Badge>
                  {typeof d.score === "number" && (
                    <Badge variant="outline" className="font-medium">Score {d.score}</Badge>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />{jour(d.createdAt)}</span>
                  {d.conseiller?.nom && (
                    <span className="inline-flex items-center gap-1.5"><User className="h-3 w-3" />{d.conseiller.nom}</span>
                  )}
                  {d.taille ? <span>{poids(d.taille)}</span> : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/${locale}/admin/clients/${d.clientUid}/analyse-prevoyance`)}
                  className="h-10 font-bold"
                >
                  Fiche client
                </Button>
                <Button onClick={() => ouvrir(d)} disabled={ouverture === d.id} className="h-10 gap-2 font-bold">
                  {ouverture === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Ouvrir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sélecteur de client pour « Créer nouveau » */}
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="max-h-[80vh] max-w-lg grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Pour quel client ?</DialogTitle>
          </DialogHeader>
          <Input
            value={qClient}
            onChange={(e) => setQClient(e.target.value)}
            placeholder="Rechercher…"
            className="h-10"
            autoFocus
          />
          <div className="min-h-0 space-y-1 overflow-y-auto pr-1">
            {clientsLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : clientsFiltres.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun client.</p>
            ) : (
              clientsFiltres.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => router.push(`/${locale}/admin/clients/${c.uid}/analyse-prevoyance`)}
                  className="w-full rounded-md px-3 py-2 text-left transition hover:bg-muted"
                >
                  <span className="block text-sm">{c.nom}</span>
                  {c.email && c.email !== c.nom && (
                    <span className="block text-xs text-muted-foreground">{c.email}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
