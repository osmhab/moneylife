"use client";

// Les documents du client, tels qu'IL les voit dans son coffre-fort.
//
// POURQUOI RELIRE LES MÊMES SOURCES PLUTÔT QUE DE STOCKER UNE LISTE
// -----------------------------------------------------------------
// Le coffre du client n'est pas une collection : c'est une VUE qui fusionne
// deux origines — les documents attachés à un plan (`metadata.sourceFile*`,
// posés au scan) et les documents libres qu'il dépose lui-même
// (`clients/{uid}/documents`). Recopier une liste ici la ferait diverger dès
// qu'un plan est rescanné ou qu'un document est supprimé. On relit donc les
// deux sources, avec les mêmes règles de titre et de type.
//
// Conséquence utile : le conseiller voit EXACTEMENT ce que le client voit — y
// compris les documents que le client a ajoutés lui-même depuis son app.

import * as React from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { buildSourceDocTitle } from "@/lib/core/documentTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, FileText, ExternalLink, Smartphone } from "lucide-react";

type Doc = {
  id: string;
  titre: string;
  type: string;
  url: string;
  origine: "plan" | "coffre";
  quand: Date | null;
};

const jour = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "—";

export default function DocumentsClientBand({ uid }: { uid?: string }) {
  const [depuisPlans, setDepuisPlans] = React.useState<Doc[]>([]);
  const [depuisCoffre, setDepuisCoffre] = React.useState<Doc[]>([]);
  const [ouvert, setOuvert] = React.useState(false);

  React.useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, "clients", uid, "plans"), (snap) => {
      const docs: Doc[] = [];
      for (const d of snap.docs) {
        const p: any = d.data();
        const url = p.metadata?.sourceFileUrl;
        if (!url) continue;
        docs.push({
          id: `plan_${d.id}`,
          // Repli sur la règle déterministe pour les plans scannés AVANT que la
          // classification n'existe : le coffre du client fait exactement pareil.
          titre: p.metadata?.sourceDocTitle
            || buildSourceDocTitle(p.type, p.institutionName || p.label || ""),
          type: p.metadata?.sourceDocType || "Document original",
          url,
          origine: "plan",
          quand: p.metadata?.createdAt?.toDate?.() || null,
        });
      }
      setDepuisPlans(docs);
    });
  }, [uid]);

  React.useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, "clients", uid, "documents"), (snap) => {
      setDepuisCoffre(
        snap.docs.map((d) => {
          const x: any = d.data();
          return {
            id: `coffre_${d.id}`,
            titre: x.name || x.title || "Document",
            type: x.types?.[0] || "Autre",
            url: x.url || "",
            origine: "coffre" as const,
            quand: x.uploadedAt?.toDate?.() || (x.uploadedAt ? new Date(x.uploadedAt) : null),
          };
        }),
      );
    });
  }, [uid]);

  const tous = React.useMemo(
    () => [...depuisPlans, ...depuisCoffre].sort((a, b) => (b.quand?.getTime() || 0) - (a.quand?.getTime() || 0)),
    [depuisPlans, depuisCoffre],
  );

  if (!tous.length) return null;

  return (
    <Card className="border-slate-200">
      <button type="button" onClick={() => setOuvert((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">
          Documents du client <span className="text-muted-foreground">({tous.length})</span>
        </span>
        <span className="text-xs text-muted-foreground">tels qu&apos;il les voit dans son app</span>
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && (
        <CardContent className="border-t pt-4">
          <div className="divide-y">
            {tous.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.titre}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-medium">{d.type}</Badge>
                    <span>{jour(d.quand)}</span>
                    {d.origine === "coffre" && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Smartphone className="h-3 w-3" /> ajouté par le client
                      </span>
                    )}
                  </p>
                </div>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3 w-3" /> Ouvrir
                  </a>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
