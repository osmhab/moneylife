"use client";

// Prise de rendez-vous depuis le CRM.
//
// L'agenda affiché est celui du CONSEILLER CONNECTÉ : la grille vient de son
// Google Agenda, via son adresse e-mail. Deux conseillers voient donc deux
// plannings différents sans rien avoir à choisir.
//
// Composant volontairement autonome (il ne reçoit que l'uid et le nom du
// client) : le wizard de conseil doit pouvoir l'ouvrir tel quel pour fixer le
// prochain rendez-vous, sans dupliquer la grille ni les règles de rappel.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Creneau = { debut: string; fin: string; heure: string; libre: boolean; passe: boolean };
type Jour = { date: string; weekend: boolean; creneaux: Creneau[] };

const DUREES = [30, 60, 90] as const;

const OBJECTIFS = [
  "Analyse de prévoyance",
  "Présentation des offres & signatures",
  "Complément d'audit de situation",
  "Vérification annuelle",
];

/** "2026-09-04" → "jeu. 4 sept." */
function libelleJour(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function ajouteJours(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function NouveauRendezVousDialog({
  open,
  onOpenChange,
  uid,
  clientNom,
  onCree,
  differe = false,
  onChoisi,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  uid: string;
  clientNom?: string;
  onCree?: () => void;
  /**
   * Mode DIFFÉRÉ : ne crée rien, remonte simplement la sélection.
   * Utilisé par le wizard de conseil, où le rendez-vous ne doit exister qu'une
   * fois la session scellée — sinon un entretien abandonné laisserait un
   * rendez-vous bien réel dans l'agenda et un e-mail déjà parti au client.
   */
  differe?: boolean;
  onChoisi?: (choix: {
    debut: string; fin: string; objectif: string; lieu: string;
    rappelSms: boolean; rappelDocuments: boolean; quandLisible: string;
  }) => void;
}) {
  const [debutSemaine, setDebutSemaine] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [jours, setJours] = React.useState<Jour[]>([]);
  const [agendaPartage, setAgendaPartage] = React.useState(true);
  const [compteDeService, setCompteDeService] = React.useState("");
  const [chargement, setChargement] = React.useState(false);

  // On garde le JOUR avec le créneau : `debut` est en UTC, et en découper la
  // date afficherait le lendemain pour un créneau de fin de journée en été.
  const [choisi, setChoisi] = React.useState<{ creneau: Creneau; date: string } | null>(null);
  const [duree, setDuree] = React.useState<number>(60);
  const [objectif, setObjectif] = React.useState(OBJECTIFS[0]);
  const [lieu, setLieu] = React.useState("Place de l'Aubade 3, 1950 Sion");
  const [rappelSms, setRappelSms] = React.useState(true);
  const [rappelDocuments, setRappelDocuments] = React.useState(true);
  const [envoi, setEnvoi] = React.useState(false);

  const token = React.useCallback(() => auth.currentUser?.getIdToken(), []);

  React.useEffect(() => {
    if (!open) return;
    let annule = false;
    (async () => {
      setChargement(true);
      try {
        const res = await fetch(`/api/admin/rdv/disponibilites?from=${debutSemaine}&jours=7`, {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        const j = await res.json();
        if (annule) return;
        setAgendaPartage(j.agendaPartage !== false);
        setCompteDeService(j.compteDeService || "");
        setJours(j.jours || []);
      } catch {
        if (!annule) toast.error("Agenda indisponible");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [open, debutSemaine, token]);

  /**
   * Un rendez-vous d'une heure occupe DEUX créneaux de trente minutes : il ne
   * suffit pas que le premier soit libre. Sans ce contrôle, on poserait un
   * rendez-vous d'une heure à cheval sur un créneau déjà pris.
   */
  function creneauxSuffisants(jour: Jour, index: number): boolean {
    const necessaires = duree / 30;
    for (let k = 0; k < necessaires; k++) {
      const c = jour.creneaux[index + k];
      if (!c || !c.libre) return false;
      // Les créneaux doivent se suivre sans trou (fin de l'un = début du suivant).
      if (k > 0 && jour.creneaux[index + k - 1].fin !== c.debut) return false;
    }
    return true;
  }

  async function enregistrer() {
    if (!choisi) return;
    const fin = new Date(new Date(choisi.creneau.debut).getTime() + duree * 60000).toISOString();

    if (differe) {
      onChoisi?.({
        debut: choisi.creneau.debut, fin, objectif, lieu, rappelSms, rappelDocuments,
        quandLisible: `${libelleJour(choisi.date)} à ${choisi.creneau.heure}`,
      });
      onOpenChange(false);
      return;
    }

    setEnvoi(true);
    try {
      const res = await fetch(`/api/admin/rdv?uid=${uid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ debut: choisi.creneau.debut, fin, objectif, lieu, rappelSms, rappelDocuments }),
      });
      const j = await res.json();

      if (!res.ok) {
        toast.error(j?.error === "AGENDA_NON_PARTAGE" ? "Agenda non partagé" : "Enregistrement impossible", {
          description: j?.message || j?.error,
        });
        return;
      }

      // On dit franchement ce qui n'est PAS parti : le conseiller doit savoir
      // s'il doit prévenir le client autrement.
      const manques: string[] = [];
      if (j.motifSansEmail === "client_sans_email") manques.push("aucun e-mail au dossier");
      if (j.motifSansEmail === "envoi_echoue") manques.push("l'envoi de l'e-mail a échoué");
      if (rappelSms && j.smsPossible === false) manques.push("aucun numéro pour le SMS");

      toast.success("Rendez-vous enregistré", {
        description: manques.length ? `Attention : ${manques.join(", ")}.` : "Agenda, e-mail et rappel programmés.",
      });
      onCree?.();
      onOpenChange(false);
      setChoisi(null);
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90vh] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-violet-600" />
            Nouveau rendez-vous{clientNom ? ` — ${clientNom}` : ""}
          </DialogTitle>
          <DialogDescription>
            Les créneaux grisés sont déjà occupés dans votre Google Agenda.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto p-5">
          {!agendaPartage ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">Accès à votre agenda refusé</p>
                  <p className="mt-1 text-amber-800">
                    La délégation au niveau du domaine doit être autorisée dans la console
                    d&apos;administration Google : <strong>Sécurité</strong> → <strong>Accès aux données</strong> →{" "}
                    <strong>Délégation au niveau du domaine</strong>, avec l&apos;ID client du compte de
                    service et le champ d&apos;application Calendar.
                  </p>
                  {compteDeService && (
                    <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700">
                      {compteDeService}
                    </code>
                  )}
                  <p className="mt-2 text-xs text-amber-700">
                    Tant que l&apos;accès est refusé, vos plages occupées sont invisibles — nous préférons
                    ne rien afficher plutôt qu&apos;un agenda qui paraîtrait entièrement libre.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setDebutSemaine((d) => ajouteJours(d, -7))}>
                  <ChevronLeft className="h-4 w-4" /> Semaine précédente
                </Button>
                <span className="text-sm font-semibold text-slate-600">
                  {chargement ? "Chargement…" : `${libelleJour(debutSemaine)} → ${libelleJour(ajouteJours(debutSemaine, 6))}`}
                </span>
                <Button variant="outline" size="sm" onClick={() => setDebutSemaine((d) => ajouteJours(d, 7))}>
                  Semaine suivante <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {jours.map((jour) => (
                  <div key={jour.date} className={`rounded-xl border p-2 ${jour.weekend ? "bg-slate-50" : "bg-white"}`}>
                    <div className="mb-2 text-center text-xs font-bold text-slate-600">{libelleJour(jour.date)}</div>
                    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                      {jour.creneaux.map((c, i) => {
                        const possible = creneauxSuffisants(jour, i);
                        const actif = choisi?.creneau.debut === c.debut;
                        return (
                          <button
                            key={c.debut}
                            type="button"
                            disabled={!possible}
                            onClick={() => setChoisi({ creneau: c, date: jour.date })}
                            className={`rounded-md px-1.5 py-1 text-xs font-medium transition ${
                              actif
                                ? "bg-violet-600 text-white"
                                : possible
                                  ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                  : "cursor-not-allowed bg-slate-100 text-slate-300"
                            }`}
                            title={possible ? "" : c.passe ? "Créneau passé" : "Occupé ou trop court pour la durée choisie"}
                          >
                            {c.heure}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Durée</Label>
                  <div className="flex gap-2">
                    {DUREES.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={duree === d ? "default" : "outline"}
                        onClick={() => { setDuree(d); setChoisi(null); }}
                      >
                        {d} min
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Objet de l&apos;entretien</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    value={objectif}
                    onChange={(e) => setObjectif(e.target.value)}
                  >
                    {OBJECTIFS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Lieu</Label>
                  <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
                </div>

                <label className="flex items-start gap-3 rounded-xl border p-3">
                  <Switch checked={rappelSms} onCheckedChange={setRappelSms} />
                  <span className="text-sm">
                    <span className="font-semibold">Rappel SMS</span>
                    <span className="block text-xs text-slate-500">Envoyé la veille du rendez-vous.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border p-3">
                  <Switch checked={rappelDocuments} onCheckedChange={setRappelDocuments} />
                  <span className="text-sm">
                    <span className="font-semibold">Rappel documents</span>
                    <span className="block text-xs text-slate-500">Ajoute la liste à l&apos;e-mail et au SMS.</span>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <span className="mr-auto text-sm text-slate-500">
            {choisi
              ? `Le ${libelleJour(choisi.date)} à ${choisi.creneau.heure} · ${duree} min`
              : "Choisissez un créneau"}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={enregistrer} disabled={!choisi || envoi || !agendaPartage}>
            {envoi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {differe ? "Choisir ce créneau" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
