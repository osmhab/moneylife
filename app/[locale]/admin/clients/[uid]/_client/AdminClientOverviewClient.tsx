"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { 
  FileText, 
  Shield, 
  UserRound, 
  ArrowRight, 
  RefreshCw, 
  FileSignature,
  Download,
  CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";

// Import du composant de transfert
import { TransferToolDialog } from "./TransferToolDialog";

type OverviewPayload = {
  ok: boolean;
  uid: string;
  donneesPersonnelles: {
    exists: boolean;
    firstName: string;
    lastName: string;
    birthdate: string;
    Enter_prenom?: string;
    Enter_nom?: string;
    Enter_adresse?: string;
    Enter_npa?: string;
    Enter_localite?: string;
    address?: string;    
    npa?: string;        
    localite?: string;   
    updatedAt: number | null;
  };
};

type SignedDoc = {
  id: string;
  signedAt: number;
  details: {
    oldInstitution: string;
    contractNumber: string;
  };
  pdfPath: string;
};

function formatTs(ts: number | null) {
  if (!ts || !Number.isFinite(ts)) return "—";
  try {
    return new Date(ts).toLocaleString("fr-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

export default function AdminClientOverviewClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  // États principaux
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [signedDocs, setSignedDocs] = useState<SignedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  // États Notes
  const [metaLoading, setMetaLoading] = useState(true);
  const [internalNotes, setInternalNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  // État Dialog
  const [transferOpen, setTransferOpen] = useState(false);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/overview", window.location.origin);
      url.searchParams.set("uid", uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Erreur API");
      setData(j as OverviewPayload);
    } catch (e: any) {
      setError(e?.message || "Erreur");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignedDocs = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/transfer-letter/list", window.location.origin);
      url.searchParams.set("uid", uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json();
      if (res.ok) setSignedDocs(j.docs || []);
    } catch (e) {
      console.error("Erreur chargement documents signés", e);
    }
  };

  const fetchMeta = async () => {
    try {
      setMetaLoading(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/meta", window.location.origin);
      url.searchParams.set("uid", uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json();
      setInternalNotes(j?.internalNotes || "");
      setNotesDirty(false);
    } catch {
      setInternalNotes("");
    } finally {
      setMetaLoading(false);
    }
  };

  const saveNotes = async () => {
    try {
      setNotesSaving(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/notes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, internalNotes }),
      });

      if (!res.ok) throw new Error("Erreur sauvegarde");
      setNotesDirty(false);
      toast("Notes enregistrées ✅");
    } catch (e: any) {
      toast.error("Erreur notes");
    } finally {
      setNotesSaving(false);
    }
  };

  const downloadPdf = async (path: string, fileName: string) => {
    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();
      
      const url = new URL("/api/admin/files/view", window.location.origin);
      url.searchParams.set("path", path);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error();

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      toast.error("Erreur lors du téléchargement");
    }
  };

  useEffect(() => {
    if (!uid) return;
    fetchOverview();
    fetchMeta();
    fetchSignedDocs();
  }, [uid]);

  const dp = data?.donneesPersonnelles;
  const displayName =
    dp && (dp.firstName || dp.Enter_prenom || dp.lastName || dp.Enter_nom)
      ? `${dp.lastName || dp.Enter_nom || ""} ${dp.firstName || dp.Enter_prenom || ""}`.trim()
      : "Client";

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-muted flex items-center justify-center">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">
                {loading ? "Chargement…" : displayName}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{uid}</div>
            </div>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            fetchOverview();
            fetchSignedDocs();
            toast("Rafraîchissement...");
          }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* CARTE : DONNÉES PERSONNELLES */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Données personnelles
                </span>
                {dp?.exists ? (
                  <Badge className="rounded-full">OK</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    À compléter
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Nom</div>
                  <div className="font-medium">{dp?.lastName || dp?.Enter_nom || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Prénom</div>
                  <div className="font-medium">{dp?.firstName || dp?.Enter_prenom || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Naissance</div>
                  <div className="font-medium">{dp?.birthdate || "—"}</div>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Dernière mise à jour : <span className="font-medium text-foreground">{formatTs(dp?.updatedAt ?? null)}</span>
                </div>
                <Link href={`/admin/clients/${uid}/donnees-personnelles`}>
                  <Button size="sm">Éditer <ArrowRight className="h-4 w-4 ml-2" /></Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* CARTE : DOCUMENTS SIGNÉS */}
          <Card className="rounded-2xl border-green-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Documents signés
              </CardTitle>
            </CardHeader>
            <CardContent>
              {signedDocs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Aucun transfert signé pour le moment.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {signedDocs.map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-3 rounded-xl bg-green-50/50 border border-green-100 transition-colors hover:bg-green-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {doc.details.oldInstitution}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          Signé le {formatTs(doc.signedAt)} • Contrat: {doc.details.contractNumber}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 text-green-700 hover:text-green-800 hover:bg-green-100"
                        onClick={() => downloadPdf(doc.pdfPath, `Resiliation_${doc.details.oldInstitution}.pdf`)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SIDEBAR : ACTIONS */}
        <Card className="rounded-2xl h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actions & Outils</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href={`/admin/clients/${uid}/donnees-personnelles`} className="block">
              <Button variant="secondary" className="w-full justify-between">
                Données perso <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Link href={`/admin/clients/${uid}/sante`} className="block">
              <Button variant="secondary" className="w-full justify-between">
                Santé <Shield className="h-4 w-4" />
              </Button>
            </Link>

            <Button 
              variant="outline" 
              className="w-full justify-between border-blue-200 text-blue-600 hover:bg-blue-50"
              onClick={() => setTransferOpen(true)}
            >
              Résiliation et transfert 3ème pilier <FileSignature className="h-4 w-4" />
            </Button>

            <div className="pt-2">
              <div className="text-sm font-medium">Notes internes</div>
              <textarea
                className="mt-2 w-full min-h-[160px] rounded-xl border bg-background p-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                placeholder="Ajouter une note..."
                value={internalNotes}
                onChange={(e) => { setInternalNotes(e.target.value); setNotesDirty(true); }}
                spellCheck={false}
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={saveNotes}
                  disabled={metaLoading || notesSaving || !notesDirty}
                >
                  {notesSaving ? "..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DIALOG TRANSFERT */}
      {dp && (
        <TransferToolDialog 
          client={{
            uid: uid,
            firstName: dp.firstName || dp.Enter_prenom || "",
            lastName: dp.lastName || dp.Enter_nom || "",
            address: dp.address || dp.Enter_adresse || "",
            npa: dp.npa || dp.Enter_npa || "",
            localite: dp.localite || dp.Enter_localite || ""
          }} 
          open={transferOpen} 
          onOpenChange={setTransferOpen} 
        />
      )}
    </div>
  );
}