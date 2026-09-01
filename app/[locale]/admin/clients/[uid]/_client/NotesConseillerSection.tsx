"use client";

// Section « Notes du conseiller », en fin d'écran d'analyse.
//
// Trois blocs, deux natures :
//   · les notes RÉDIGÉES ici — modifiables, enregistrées automatiquement, et les
//     seules que Gemini peut reformuler ;
//   · le dernier entretien clôturé et le brouillon en cours — pièces datées,
//     affichées en lecture seule. Un compte rendu ne se réécrit pas après coup.
//
// L'accordéon est replié par défaut : l'en-tête suffit à savoir s'il y a
// quelque chose (« Vide » / « Rédigées · modifié le … »), sans dérouler.

import * as React from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { NotebookPen, ChevronDown, Sparkles, Loader2, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Bloc = { texte: string; date: string | null };

const jour = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" }) : "";

export default function NotesConseillerSection({ uid }: { uid?: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [texte, setTexte] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<Bloc | null>(null);
  const [brouillon, setBrouillon] = React.useState<Bloc | null>(null);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");

  // Proposition de Gemini, affichée à côté de l'original tant qu'elle n'est pas
  // acceptée. On ne remplace jamais le texte du conseiller sans son accord.
  const [proposition, setProposition] = React.useState<string | null>(null);
  const [improving, setImproving] = React.useState(false);

  const token = React.useCallback(() => auth.currentUser?.getIdToken(), []);

  React.useEffect(() => {
    if (!uid) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/admin/notes?uid=${uid}`, {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        if (!res.ok) throw new Error();
        const d = await res.json();
        setTexte(d.conseiller?.texte || "");
        setUpdatedAt(d.conseiller?.updatedAt || null);
        setSession(d.session || null);
        setBrouillon(d.brouillon || null);
      } catch {
        toast.error("Notes indisponibles");
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, token]);

  // Enregistrement différé : une frappe ne doit pas provoquer une écriture.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function onChange(v: string) {
    setTexte(v);
    if (!uid) return;
    if (timer.current) clearTimeout(timer.current);
    setSaved("saving");
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/notes?uid=${uid}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ texte: v }),
        });
        if (!res.ok) throw new Error();
        setSaved("saved");
        setUpdatedAt(new Date().toISOString());
      } catch {
        setSaved("idle");
        toast.error("Enregistrement impossible");
      }
    }, 700);
  }

  async function improve() {
    setImproving(true);
    try {
      const res = await fetch("/api/admin/notes/improve", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ texte }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d?.error || "Reformulation impossible"); return; }
      setProposition(d.texte);
    } catch {
      toast.error("Reformulation impossible");
    } finally {
      setImproving(false);
    }
  }

  const rempli = texte.trim().length > 0;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">Notes du conseiller</span>

        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant={rempli ? "default" : "secondary"} className={rempli ? "bg-slate-900" : ""}>
            {rempli ? "Rédigées" : "Vide"}
          </Badge>
        )}
        {updatedAt && !loading && (
          <span className="text-xs text-muted-foreground">modifié le {jour(updatedAt)}</span>
        )}
        {session && !loading && (
          <span className="text-xs text-muted-foreground">· entretien du {jour(session.date)}</span>
        )}

        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <CardContent className="space-y-5 border-t pt-4">
          {/* Notes rédigées ici */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Vos notes</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {saved === "saving" ? "Enregistrement…" : saved === "saved" ? "Enregistré" : ""}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={improve}
                  disabled={improving || texte.trim().length < 15}
                  title="Proposer une version structurée et relue"
                >
                  {improving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Améliorer la rédaction
                </Button>
              </div>
            </div>

            <Textarea
              value={texte}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ce qui a été dit, décidé, à revoir. Ces notes pourront être ajoutées au dossier remis au client."
              className="min-h-[130px] resize-y text-sm"
              maxLength={8000}
            />

            {proposition !== null && (
              <div className="mt-3 rounded-md border border-slate-300 bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium">Proposition — comparez avant d&apos;accepter</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{proposition}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => { onChange(proposition); setProposition(null); }}
                  >
                    <Check className="h-3 w-3" /> Remplacer mes notes
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setProposition(null)}
                  >
                    <X className="h-3 w-3" /> Garder l&apos;original
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Pièces datées, en lecture seule */}
          {session && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Entretien du {jour(session.date)} — compte rendu
              </p>
              <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                {session.texte}
              </p>
            </div>
          )}

          {brouillon && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Entretien en cours — brouillon</p>
              <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                {brouillon.texte}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Au moment de préparer le dossier PDF, vous choisirez lesquels de ces blocs y figurent.
            Ils sont proposés cochés par défaut.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
