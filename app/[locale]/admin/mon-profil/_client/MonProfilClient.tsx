"use client";

// Fiche du collaborateur connecté.
//
// POURQUOI UNE PAGE À PART
// ------------------------
// Ces champs vivaient dans le dialogue « Préparer le dossier », ouvert par le
// bouton d'impression — lui-même désactivé tant qu'aucune analyse n'a tourné.
// Renseigner son mobile supposait donc de lancer une analyse complète chez un
// client pour atteindre un réglage qui ne concerne ni ce client ni cette
// analyse. Ils sont désormais là où on les cherche.
//
// Le dialogue du dossier garde sa copie des trois lignes de signature : on les
// ajuste parfois juste avant d'imprimer. Les deux écrans écrivent le même
// document `staff/{uid}`, il n'y a pas de seconde source.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Loader2, UserRound, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Carte = { nom: string; fonction: string; agence: string; telephone: string };

const VIDE: Carte = { nom: "", fonction: "", agence: "", telephone: "" };

export default function MonProfilClient() {
  const [carte, setCarte] = React.useState<Carte>(VIDE);
  const [email, setEmail] = React.useState("");
  const [chargement, setChargement] = React.useState(true);
  const [envoi, setEnvoi] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        setEmail(auth.currentUser?.email || "");
        const res = await fetch("/api/admin/advisor-card", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json();
        if (j?.card) setCarte({ ...VIDE, ...j.card });
      } catch {
        toast.error("Fiche illisible");
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  async function enregistrer() {
    setEnvoi(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Les quatre champs partent ensemble : la route les réécrit tous, un
      // envoi partiel viderait les autres.
      const res = await fetch("/api/admin/advisor-card", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(carte),
      });
      if (!res.ok) throw new Error();
      toast.success("Fiche enregistrée");
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  }

  const champ = (k: keyof Carte) => ({
    value: carte[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCarte((c) => ({ ...c, [k]: e.target.value })),
  });

  if (chargement) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mon profil</h1>
        <p className="text-sm text-slate-400">
          Connecté en tant que <span className="font-medium text-slate-600">{email}</span>
        </p>
      </div>

      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="font-bold text-slate-900">Signature du dossier client</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Prénom et nom</Label>
            <Input placeholder="Habib Osmani" {...champ("nom")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fonction</Label>
              <Input placeholder="Spécialiste en prévoyance" {...champ("fonction")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Agence</Label>
              <Input placeholder="Agence de Sion" {...champ("agence")} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ces trois lignes apparaissent sur la couverture du dossier, sous « Votre conseiller ».
            Une ligne vide est simplement omise.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Smartphone className="h-4 w-4" />
            </span>
            <span className="font-bold text-slate-900">Mobile professionnel</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="079 123 45 67" inputMode="tel" {...champ("telephone")} />
          <p className="text-[11px] text-muted-foreground">
            Reçoit le lien « Scan mobile » depuis l&apos;analyse de prévoyance, pour photographier
            les documents d&apos;un client avec votre téléphone. <strong>N&apos;apparaît pas</strong> sur
            le dossier client.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={enregistrer} disabled={envoi} className="rounded-xl">
          {envoi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
