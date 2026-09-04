"use client";

// Bibliothèque des règlements de caisse de pension.
//
// Un règlement dit à quelles conditions les montants d'un certificat sont
// versés. Chaque document ici sert à TOUS les assurés de cette caisse — présents
// et à venir — sans qu'aucun d'eux ait à le scanner.
//
// Ce n'est pas une donnée personnelle : c'est le contrat-cadre de la caisse,
// remis à tous ses affiliés. Seules les RÈGLES sont conservées ; le PDF scanné
// par un client reste dans son coffre-fort privé.
//
// LE TRAVAIL DE COLLABORATEUR
// Trois champs ne s'extraient pas d'un document de façon fiable — la page
// d'origine n'y figure même pas. Les renseigner une fois par caisse suffit à
// rendre le règlement surveillable : l'agent revient alors sur cette page voir
// si une version plus récente est parue. Sans adresse, il ne fait rien.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import {
  BookOpen, Upload, Loader2, RefreshCw, AlertTriangle, Eye, EyeOff, Save, CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Reglement = {
  cle: string; caisse: string; enVigueurAu: string | null;
  annexes: number; clients: number; misAJourLe: string | null;
  capitalDeces: string | null;
  caisseNomComplet: string | null; pageUrl: string | null; dateEdition: string | null;
  dernierPassage: string | null; derniereErreur: string | null;
};
type Journal = { cle: string; statut: string; source: string; le: string | null };

/** Ce que le règlement dit du capital décès, en clair. */
const CAPITAL: Record<string, string> = {
  TOUJOURS: "versé dans tous les cas",
  SI_AUCUNE_RENTE_PARTENAIRE: "seulement si aucune rente de partenaire",
  REDUIT_DU_FINANCEMENT_RENTE: "réduit du financement de la rente",
  NON_PREVU: "non prévu",
};

const STATUT: Record<string, { texte: string; ton: string }> = {
  AJOUTE: { texte: "ajouté", ton: "bg-emerald-100 text-emerald-800" },
  REMPLACE: { texte: "version plus récente", ton: "bg-blue-100 text-blue-800" },
  DEJA_CONNU: { texte: "déjà connu", ton: "bg-slate-100 text-slate-600" },
  PAS_UN_REGLEMENT: { texte: "écarté", ton: "bg-amber-100 text-amber-800" },
};

export default function ReglementsPageClient() {
  const [reglements, setReglements] = React.useState<Reglement[]>([]);
  const [journal, setJournal] = React.useState<Journal[]>([]);
  const [chargement, setChargement] = React.useState(true);
  const [envoi, setEnvoi] = React.useState(false);
  const [urlDepot, setUrlDepot] = React.useState("");
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const entree = React.useRef<HTMLInputElement>(null);

  const jeton = React.useCallback(() => auth.currentUser?.getIdToken(), []);

  const recharger = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reglements", {
        headers: { Authorization: `Bearer ${await jeton()}` },
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setReglements(d.reglements ?? []);
      setJournal(d.journal ?? []);
    } catch {
      toast.error("Bibliothèque illisible");
    } finally {
      setChargement(false);
    }
  }, [jeton]);

  React.useEffect(() => { recharger(); }, [recharger]);

  async function deposer(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setEnvoi(true);
    // Un fichier à la fois : une erreur sur l'un ne doit pas emporter les autres.
    for (const f of Array.from(fichiers)) {
      const corps = new FormData();
      corps.append("file", f);
      if (urlDepot.trim()) corps.append("pageUrl", urlDepot.trim());
      try {
        const res = await fetch("/api/admin/reglements", {
          method: "POST",
          headers: { Authorization: `Bearer ${await jeton()}` },
          body: corps,
        });
        const d = await res.json();
        if (!res.ok) { toast.error(`${f.name} — ${d.error ?? "échec"}`); continue; }
        toast.success(`${d.caisse} — ${STATUT[d.statut]?.texte ?? d.statut}`);
      } catch {
        toast.error(`${f.name} — envoi impossible`);
      }
    }
    setEnvoi(false);
    setUrlDepot("");
    if (entree.current) entree.current.value = "";
    recharger();
  }

  const aCompleter = reglements.filter((r) => !r.pageUrl).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Règlements de caisse
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Chaque règlement sert à tous les assurés de sa caisse, sans qu&apos;aucun ne le
            scanne. Un document déjà connu n&apos;est pas réanalysé — seule une version plus
            récente remplace l&apos;existante.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={recharger} disabled={chargement}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* DÉPÔT */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://… page d'où vient le document"
              value={urlDepot}
              onChange={(e) => setUrlDepot(e.target.value)}
              className="flex-1"
            />
            <input
              ref={entree} type="file" accept="application/pdf" multiple hidden
              onChange={(e) => deposer(e.target.files)}
            />
            <Button onClick={() => entree.current?.click()} disabled={envoi}>
              {envoi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {envoi ? "Analyse en cours…" : "Déposer un règlement"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Notez la page d&apos;où vous avez téléchargé le PDF : c&apos;est elle que l&apos;agent
            reviendra consulter pour voir si une nouvelle version paraît. Sans elle, le
            règlement est enregistré mais jamais surveillé.
          </p>
          {envoi && (
            <p className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Une analyse prend environ une minute par document. Ne fermez pas cette page.
            </p>
          )}
        </CardContent>
      </Card>

      {aCompleter > 0 && (
        <p className="text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {aCompleter} règlement{aCompleter > 1 ? "s" : ""} sans page d&apos;origine —{" "}
          {aCompleter > 1 ? "ils ne sont" : "il n'est"} pas surveillé{aCompleter > 1 ? "s" : ""}.
        </p>
      )}

      {/* BIBLIOTHÈQUE */}
      <Card>
        <CardContent className="p-0">
          {chargement ? (
            <p className="p-6 text-sm text-slate-500">Chargement…</p>
          ) : reglements.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Aucun règlement. Déposez un PDF pour commencer la bibliothèque.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">Caisse</th>
                  <th className="px-4 py-3">En vigueur</th>
                  <th className="px-4 py-3">Capital décès</th>
                  <th className="px-4 py-3">Surveillance</th>
                  <th className="px-4 py-3 text-right">Clients</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {reglements.map((r) => (
                  <React.Fragment key={r.cle}>
                    <tr className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {r.caisseNomComplet || r.caisse}
                        {r.caisseNomComplet && (
                          <span className="block text-xs text-slate-400">{r.caisse}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.dateEdition || r.enVigueurAu || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.capitalDeces ? CAPITAL[r.capitalDeces] ?? r.capitalDeces : (
                          <span className="text-amber-700">règle non extraite</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.derniereErreur ? (
                          <span className="text-rose-700 text-xs">{r.derniereErreur}</span>
                        ) : r.pageUrl ? (
                          <span className="text-emerald-700 text-xs inline-flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {r.dernierPassage
                              ? `vu le ${new Date(r.dernierPassage).toLocaleDateString("fr-CH")}`
                              : "en attente"}
                          </span>
                        ) : (
                          <span className="text-amber-700 text-xs inline-flex items-center gap-1">
                            <EyeOff className="h-3.5 w-3.5" /> non surveillé
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{r.clients}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm"
                          onClick={() => setOuvert(ouvert === r.cle ? null : r.cle)}>
                          {ouvert === r.cle ? "Fermer" : "Compléter"}
                        </Button>
                      </td>
                    </tr>
                    {ouvert === r.cle && (
                      <tr className="border-b bg-slate-50">
                        <td colSpan={6} className="px-4 py-4">
                          <FicheReglement reglement={r} jeton={jeton} onEnregistre={() => { setOuvert(null); recharger(); }} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {journal.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-2">Dernières ingestions</h2>
          <div className="space-y-1">
            {journal.map((j, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                <Badge variant="secondary" className={STATUT[j.statut]?.ton ?? ""}>
                  {STATUT[j.statut]?.texte ?? j.statut}
                </Badge>
                <span className="font-mono text-xs">{j.cle}</span>
                <span className="text-slate-400">{j.source}</span>
                <span className="text-slate-400 ml-auto">
                  {j.le ? new Date(j.le).toLocaleString("fr-CH") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Seules les règles sont conservées ici. Le PDF scanné par un client reste dans son coffre-fort.
      </p>
    </div>
  );
}

/** Les trois champs qu'un collaborateur renseigne, une fois par caisse. */
function FicheReglement({
  reglement, jeton, onEnregistre,
}: {
  reglement: Reglement;
  jeton: () => Promise<string | undefined> | undefined;
  onEnregistre: () => void;
}) {
  const [nom, setNom] = React.useState(reglement.caisseNomComplet ?? reglement.caisse);
  const [url, setUrl] = React.useState(reglement.pageUrl ?? "");
  const [date, setDate] = React.useState(reglement.dateEdition ?? "");
  const [enCours, setEnCours] = React.useState(false);

  async function enregistrer() {
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/reglements", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await jeton()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cle: reglement.cle, caisseNomComplet: nom, pageUrl: url, dateEdition: date }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Échec"); return; }
      toast.success("Fiche enregistrée");
      onEnregistre();
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs text-slate-500 space-y-1">
          <span>Nom complet de la caisse</span>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="AXA Fondation LPP Suisse romande" />
        </label>
        <label className="text-xs text-slate-500 space-y-1 md:col-span-2">
          <span>Page où se trouve le document</span>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs text-slate-500 space-y-1">
          <span>Date d&apos;édition (mois et année)</span>
          <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="01.2026" />
        </label>
        <div className="flex items-end">
          <Button onClick={enregistrer} disabled={enCours}>
            {enCours ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Enregistrer
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Renseigner la page suffit à rendre ce règlement surveillé : l&apos;agent y reviendra
        périodiquement voir si une version plus récente est parue.
      </p>
    </div>
  );
}
