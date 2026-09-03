"use client";

// Bandeau d'historique en tête de l'écran d'analyse : les dossiers déjà établis
// pour CE client, ouvrables en lecture seule.
//
// Replié par défaut, et absent tant qu'aucun dossier n'existe : l'écran sert
// d'abord à travailler, l'historique ne doit pas s'interposer.
//
// Ouvrir un dossier renvoie les octets archivés — ce que le client a eu en main
// ce jour-là, pas un nouveau rendu avec le gabarit d'aujourd'hui.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Archive, ChevronDown, Download, Loader2, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Dossier = {
  id: string;
  path: string;
  score: number | null;
  taille: number | null;
  createdAt: string | null;
  conseiller: { nom?: string } | null;
  etabliPar: string | null;
};

const jour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" }) : "—";

export default function DossiersEtablisBand({ uid }: { uid?: string }) {
  const [dossiers, setDossiers] = React.useState<Dossier[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const token = React.useCallback(() => auth.currentUser?.getIdToken(), []);

  React.useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/dossiers?uid=${uid}`, {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        if (!res.ok) return;
        setDossiers((await res.json()).dossiers || []);
      } catch { /* l'historique est un confort : son absence ne bloque pas le travail */ }
    })();
  }, [uid, token]);

  async function ouvrir(d: Dossier) {
    setBusy(d.id);
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
      setBusy(null);
    }
  }

  if (!dossiers.length) return null;

  return (
    <Card className="border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">
          Dossiers établis <span className="text-muted-foreground">({dossiers.length})</span>
        </span>
        <Badge variant="secondary" className="gap-1 font-medium">
          <Lock className="h-3 w-3" /> Lecture seule
        </Badge>
        <span className="text-xs text-muted-foreground">dernier le {jour(dossiers[0]?.createdAt)}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <CardContent className="border-t pt-4">
          <div className="divide-y">
            {dossiers.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{jour(d.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeof d.score === "number" ? `Score ${d.score}` : "—"}
                    {d.conseiller?.nom ? ` · ${d.conseiller.nom}` : d.etabliPar ? ` · ${d.etabliPar}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => ouvrir(d)}
                  disabled={busy === d.id}
                >
                  {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Ouvrir
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Ces dossiers sont figés tels qu&apos;ils ont été remis. Le travail en cours ci-dessous repart du
            précédent : ajustez ce qui a changé, puis établissez un nouveau dossier — les anciens restent intacts.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
