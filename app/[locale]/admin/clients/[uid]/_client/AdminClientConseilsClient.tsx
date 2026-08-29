"use client";

// Vue CONSEILLER des sessions de conseil (onglet CRM « Notes d'entretien »).
// Relit `clients/{uid}/conseils_sessions` (écrites par le wizard offres-wizard et par
// admin/conseil) — jusqu'ici JAMAIS relues côté admin, seulement par le dashboard client.
// Affiche aussi le BROUILLON en cours (`conseils_drafts/current`) s'il existe : un
// entretien commencé mais non clôturé, pour ne plus perdre de notes.

import * as React from "react";
import { usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, getDocs, doc, getDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, StickyNote, FileText, CalendarClock, Gift, PencilLine } from "lucide-react";

type AnyObj = Record<string, any>;

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

const PRIORITY_LABELS: Record<string, string> = {
  impots: "Réduction fiscale",
  retraite: "Lacunes retraite",
  famille: "Protection famille",
  immobilier: "Immobilier / EPL",
};

function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(v: any, fallback?: string): string {
  const d = tsToDate(v);
  if (!d) return fallback || "Date inconnue";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" }) +
    " · " + d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

// Le texte des notes vit sous des noms différents selon l'outil d'écriture :
// wizard → `notesRaw` ; admin/conseil → `quickNotesSnapshot`.
function extractNotes(s: AnyObj): string {
  return (s.notesRaw ?? s.quickNotesSnapshot ?? s.notes ?? "").toString().trim();
}

// `nextRdvPlanifie` peut être une chaîne (ancien format) OU un objet {date, time, objectf}
// (écrit par admin/conseil). On le normalise en texte lisible.
function formatNextRdv(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const parts: string[] = [];
  if (v.date) parts.push(String(v.date));
  if (v.time) parts.push(String(v.time));
  const when = parts.join(" ");
  return v.objectf ? (when ? `${when} — ${v.objectf}` : String(v.objectf)) : when;
}

export default function AdminClientConseilsClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<AnyObj[]>([]);
  const [draft, setDraft] = React.useState<AnyObj | null>(null);

  React.useEffect(() => {
    if (!uid) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("Non authentifié.");
        setLoading(false);
        return;
      }
      try {
        const ref = collection(db, "clients", uid, "conseils_sessions");
        const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const draftSnap = await getDoc(doc(db, "clients", uid, "conseils_drafts", "current"));
        if (draftSnap.exists()) {
          const d = draftSnap.data() as AnyObj;
          const hasContent = !!(d.notes?.trim?.()) || Object.values(d.priorities || {}).some(Boolean);
          setDraft(hasContent ? d : null);
        }
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Erreur de chargement des sessions.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [uid]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des entretiens…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <StickyNote className="h-5 w-5" />
        </span>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Notes d&apos;entretien</h2>
        <Badge variant="secondary" className="ml-1 rounded-full">{sessions.length}</Badge>
      </div>

      {error && (
        <Card className="rounded-2xl border-rose-300">
          <CardContent className="py-4 text-sm text-rose-600">{error}</CardContent>
        </Card>
      )}

      {/* Brouillon en cours (entretien non clôturé) */}
      {draft && (
        <Card className="rounded-2xl border-amber-300 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
              <PencilLine className="h-4 w-4" /> Brouillon en cours (non clôturé)
              <span className="ml-auto text-xs font-normal text-amber-600">
                Modifié le {formatDate(draft.updatedAt)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <PriorityChips priorities={draft.priorities} />
            {draft.notes?.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aucune note saisie pour l&apos;instant.</p>
            )}
            <p className="text-xs text-amber-600 pt-1">
              Cet entretien n&apos;a pas encore été clôturé dans le wizard. Rouvrez le conseil pour le finaliser.
            </p>
          </CardContent>
        </Card>
      )}

      {sessions.length === 0 && !draft ? (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune session de conseil enregistrée pour ce client.
          </CardContent>
        </Card>
      ) : (
        sessions.map((s) => {
          const notes = extractNotes(s);
          return (
            <Card key={s.id} className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  {formatDate(s.createdAt, s.dateSession)}
                  {s.status && (
                    <Badge variant={s.status === "COMPLETED" ? "default" : "secondary"}>{s.status}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <PriorityChips priorities={s.priorities} />

                {notes ? (
                  <div className="flex gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{notes}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Aucune note libre pour cette session.</p>
                )}

                {s.advisorNotes && (
                  <p className="text-xs text-muted-foreground">{s.advisorNotes}</p>
                )}

                <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                  {formatNextRdv(s.nextRdvPlanifie) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> Prochain RDV : {formatNextRdv(s.nextRdvPlanifie)}
                    </span>
                  )}
                  {s.referralCode && (
                    <span className="inline-flex items-center gap-1">
                      <Gift className="h-3.5 w-3.5" /> Code parrainage : {s.referralCode}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function PriorityChips({ priorities }: { priorities?: Record<string, boolean> }) {
  const active = Object.entries(priorities || {}).filter(([, v]) => v).map(([k]) => k);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((k) => (
        <Badge key={k} variant="outline" className="rounded-full">
          {PRIORITY_LABELS[k] || k}
        </Badge>
      ))}
    </div>
  );
}
