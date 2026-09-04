"use client";

// Bibliothèque des règlements de caisse de pension.
//
// Un règlement dit à quelles conditions les montants d'un certificat sont
// versés. Chaque document déposé ici sert à TOUS les assurés de cette caisse —
// présents et à venir — sans qu'aucun d'eux ait à le scanner lui-même.
//
// Ce n'est pas une donnée personnelle : c'est le contrat-cadre de la caisse,
// remis à tous ses affiliés. Seules les RÈGLES sont conservées ici ; le PDF
// scanné par un client reste dans son coffre-fort privé.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { BookOpen, Upload, Loader2, CheckCircle2, RefreshCw, AlertTriangle, Globe, Plus, Radar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Reglement = {
  cle: string; caisse: string; enVigueurAu: string | null;
  annexes: number; clients: number; misAJourLe: string | null;
  capitalDeces: string | null;
};
type Journal = { cle: string; statut: string; source: string; le: string | null };
type Caisse = {
  cle: string; nom: string; site: string | null; actif: boolean; clients: number;
  dernierPassage: string | null; dernierResultat: string | null; derniereErreur: string | null;
};

/** Ce que le règlement dit du capital décès, en clair. */
const CAPITAL: Record<string, string> = {
  TOUJOURS: "versé dans tous les cas",
  SI_AUCUNE_RENTE_PARTENAIRE: "seulement si aucune rente de partenaire",
  REDUIT_DU_FINANCEMENT_RENTE: "réduit du financement de la rente",
  NON_PREVU: "non prévu",
};

const STATUT: Record<string, { texte: string; ton: string }> = {
  AJOUTE: { texte: "ajouté", ton: "bg-emerald-100 text-emerald-800" },
  REMPLACE: { texte: "millésime plus récent", ton: "bg-blue-100 text-blue-800" },
  DEJA_CONNU: { texte: "déjà connu", ton: "bg-slate-100 text-slate-600" },
  PAS_UN_REGLEMENT: { texte: "écarté", ton: "bg-amber-100 text-amber-800" },
};

export default function ReglementsPageClient() {
  const [reglements, setReglements] = React.useState<Reglement[]>([]);
  const [journal, setJournal] = React.useState<Journal[]>([]);
  const [registre, setRegistre] = React.useState<Caisse[]>([]);
  const [nom, setNom] = React.useState("");
  const [site, setSite] = React.useState("");
  const [chargement, setChargement] = React.useState(true);
  const [envoi, setEnvoi] = React.useState(false);
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
      const res2 = await fetch("/api/admin/caisses", {
        headers: { Authorization: `Bearer ${await jeton()}` },
      });
      if (res2.ok) setRegistre((await res2.json()).registre ?? []);
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
    // Un fichier à la fois : chaque règlement est un document distinct, et une
    // erreur sur l'un ne doit pas emporter les autres.
    for (const f of Array.from(fichiers)) {
      const corps = new FormData();
      corps.append("file", f);
      try {
        const res = await fetch("/api/admin/reglements", {
          method: "POST",
          headers: { Authorization: `Bearer ${await jeton()}` },
          body: corps,
        });
        const d = await res.json();
        if (!res.ok) { toast.error(`${f.name} — ${d.error ?? "échec"}`); continue; }
        const s = STATUT[d.statut]?.texte ?? d.statut;
        toast.success(`${d.caisse} — ${s}`);
      } catch {
        toast.error(`${f.name} — envoi impossible`);
      }
    }
    setEnvoi(false);
    if (entree.current) entree.current.value = "";
    recharger();
  }

  async function enregistrerCaisse() {
    try {
      const res = await fetch("/api/admin/caisses", {
        method: "POST",
        headers: { Authorization: `Bearer ${await jeton()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nom, site }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Échec"); return; }
      toast.success(`${nom} enregistrée`);
      setNom(""); setSite("");
      recharger();
    } catch { toast.error("Enregistrement impossible"); }
  }

  async function amorcer() {
    try {
      const res = await fetch("/api/admin/caisses", {
        method: "PUT",
        headers: { Authorization: `Bearer ${await jeton()}` },
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Échec"); return; }
      toast.success(`${d.caisses} caisse(s) trouvée(s) chez vos clients, ${d.ajoutees} nouvelle(s)`);
      recharger();
    } catch { toast.error("Amorçage impossible"); }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Règlements de caisse
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Chaque règlement déposé ici sert à tous les assurés de cette caisse, sans
            qu&apos;aucun d&apos;eux ait à le scanner. Un document déjà connu n&apos;est pas
            réanalysé — seul un millésime plus récent remplace l&apos;existant.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={recharger} disabled={chargement}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <input
            ref={entree} type="file" accept="application/pdf" multiple hidden
            onChange={(e) => deposer(e.target.files)}
          />
          <Button onClick={() => entree.current?.click()} disabled={envoi}>
            {envoi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {envoi ? "Analyse en cours…" : "Déposer un règlement"}
          </Button>
        </div>
      </div>

      {envoi && (
        <p className="text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Une analyse prend environ une minute par document. Ne fermez pas cette page.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {chargement ? (
            <p className="p-6 text-sm text-slate-500">Chargement…</p>
          ) : reglements.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Aucun règlement pour l&apos;instant. Déposez un PDF pour commencer la bibliothèque.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">Caisse</th>
                  <th className="px-4 py-3">En vigueur</th>
                  <th className="px-4 py-3">Capital décès</th>
                  <th className="px-4 py-3 text-right">Annexes</th>
                  <th className="px-4 py-3 text-right">Clients</th>
                </tr>
              </thead>
              <tbody>
                {reglements.map((r) => (
                  <tr key={r.cle} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{r.caisse}</td>
                    <td className="px-4 py-3 text-slate-600">{r.enVigueurAu ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.capitalDeces ? CAPITAL[r.capitalDeces] ?? r.capitalDeces : (
                        <span className="text-amber-700">règle non extraite</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{r.annexes}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{r.clients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Radar className="h-5 w-5" /> Caisses surveillées
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              L&apos;agent visite ces sites une fois par mois et rapporte les règlements de
              prévoyance qu&apos;il y trouve. Une caisse sans adresse n&apos;est jamais visitée :
              l&apos;URL doit être vérifiée à la main, pour que le document vienne bien du site
              officiel de la caisse.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={amorcer}>
            <Plus className="h-4 w-4 mr-2" /> Amorcer depuis les clients
          </Button>
        </div>

        <div className="flex gap-2">
          <Input placeholder="Nom de la caisse" value={nom} onChange={(e) => setNom(e.target.value)} className="max-w-xs" />
          <Input placeholder="https://… page des documents" value={site} onChange={(e) => setSite(e.target.value)} className="flex-1" />
          <Button variant="secondary" onClick={enregistrerCaisse} disabled={!nom.trim()}>Enregistrer</Button>
        </div>

        {registre.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400 border-b">
                  <tr>
                    <th className="px-4 py-3">Caisse</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Dernier passage</th>
                    <th className="px-4 py-3 text-right">Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {registre.map((c) => (
                    <tr key={c.cle} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{c.nom}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.site ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-slate-400" />
                            <span className="truncate max-w-md">{c.site}</span>
                          </span>
                        ) : (
                          <span className="text-amber-700">adresse à compléter</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.derniereErreur
                          ? <span className="text-rose-700">{c.derniereErreur}</span>
                          : c.dernierPassage
                            ? `${new Date(c.dernierPassage).toLocaleDateString("fr-CH")} — ${c.dernierResultat ?? ""}`
                            : "jamais"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.clients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

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
