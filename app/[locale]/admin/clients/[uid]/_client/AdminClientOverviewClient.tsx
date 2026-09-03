"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  FileText,
  UserRound,
  ArrowRight,
  RefreshCw,
  FileSignature,
  Download,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Gift,
  StickyNote,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";

// Import du composant de transfert
import { TransferToolDialog } from "./TransferToolDialog";
import NouveauRendezVousDialog from "./NouveauRendezVousDialog";

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
    email?: string;
    /** Code 0-5 — cf. Enter_EtatCivil. `null` = non renseigné (0 = Célibataire). */
    etatCivil?: number | null;
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

const REF_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Inscrit",
  REWARD_DUE: "À verser",
  PAID: "Versé",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
};
/** Codes de `Enter_etatCivil` (0-5), cf. app/lib/core/types.ts. */
const ETAT_CIVIL_LABELS: Record<number, string> = {
  0: "Célibataire",
  1: "Marié·e",
  2: "Divorcé·e",
  3: "Partenariat enregistré",
  4: "Concubinage",
  5: "Veuf·ve",
};
/** `?? null` en amont : 0 est un état civil valide, pas une absence de donnée. */
function etatCivilLabel(code?: number | null): string {
  return code === null || code === undefined ? "—" : ETAT_CIVIL_LABELS[code] || "—";
}

function refStatusLabel(s: string): string {
  return REF_STATUS_LABELS[s] || s;
}

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

  // Parrainage (recommandé par / filleuls / coordonnées bancaires)
  const [referral, setReferral] = useState<any>(null);

  // États Notes
  const [metaLoading, setMetaLoading] = useState(true);
  const [internalNotes, setInternalNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  // Prospect (compte sans email) → conversion en compte connectable.
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertResult, setConvertResult] = useState<{ email: string; tempPassword: string } | null>(null);

  // État Dialog
  const [transferOpen, setTransferOpen] = useState(false);

  // Rendez-vous à venir du client (agenda du conseiller + fiche Firestore).
  const [rdvOpen, setRdvOpen] = useState(false);
  const [rendezvous, setRendezvous] = useState<{ id: string; debut: string; objectif: string; lieu: string; conseiller: any; rappelSms: boolean }[]>([]);

  const fetchRendezvous = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/rdv?uid=${uid}&avenir=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setRendezvous((await res.json()).rendezvous || []);
    } catch { /* la carte est informative : son absence ne bloque pas l'aperçu */ }
  };

  const annulerRdv = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/rdv?uid=${uid}&id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setRendezvous((l) => l.filter((r) => r.id !== id));
      toast("Rendez-vous annulé", { description: "Retiré de votre agenda Google également." });
    } catch {
      toast("Annulation impossible");
    }
  };

  // Masque la zone confidentielle conseiller quand l'écran fait face au client.
  // MASQUÉ PAR DÉFAUT : l'aperçu est montré au client pendant l'entretien, donc
  // le cas sûr doit être celui qui ne demande aucun geste. Afficher se décide,
  // masquer ne doit pas s'oublier.
  const [hidePrivate, setHidePrivate] = useState(true);

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
      setClientEmail(j?.email ?? null);
      setNotesDirty(false);
    } catch {
      setInternalNotes("");
    } finally {
      setMetaLoading(false);
    }
  };

  // Prospect → compte : ajoute l'email au MÊME compte Auth (uid inchangé, dossier conservé).
  const convertToAccount = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Saisis un email pour activer le compte.");
      return;
    }
    try {
      setConvertLoading(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/set-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, email }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur activation");

      setConvertResult({ email: j.email, tempPassword: j.tempPassword });
      setClientEmail(j.email);
      toast("Compte activé ✅", { description: "Email ajouté — dossier intégralement conservé." });
    } catch (e: any) {
      toast.error(e?.message || "Impossible d'activer le compte.");
    } finally {
      setConvertLoading(false);
    }
  };

  const fetchReferral = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const url = new URL("/api/admin/clients/referral", window.location.origin);
      url.searchParams.set("uid", uid);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setReferral(await res.json());
    } catch { /* non bloquant */ }
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
    fetchReferral();
    fetchRendezvous();
  }, [uid]);

  const dp = data?.donneesPersonnelles;

  return (
    <div className="space-y-5">
      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Aperçu du dossier</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={hidePrivate ? "default" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => setHidePrivate((v) => !v)}
            title="Masquer les informations confidentielles quand l'écran fait face au client"
          >
            {hidePrivate ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {hidePrivate ? "Confidentiel masqué" : "Masquer le confidentiel"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl"
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
      </div>

      {/* PROSPECT → conversion en compte connectable (email ajouté, dossier conservé) */}
      {!metaLoading && clientEmail === null && !hidePrivate && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <UserRound className="h-4 w-4" />
            Prospect — aucun compte pour l'instant
          </div>
          {convertResult ? (
            <div className="mt-2 space-y-1 text-xs text-amber-900">
              <div>
                Compte activé pour <span className="font-medium">{convertResult.email}</span>.
              </div>
              <div className="flex items-center gap-2">
                <span>Mot de passe temporaire :</span>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono">{convertResult.tempPassword}</code>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    navigator.clipboard?.writeText(convertResult.tempPassword);
                    toast("Copié ✅");
                  }}
                >
                  Copier
                </button>
              </div>
              <div className="opacity-80">À transmettre une seule fois — le client le changera à la connexion.</div>
            </div>
          ) : (
            <>
              <div className="mt-1 text-xs text-amber-800">
                Le dossier est déjà accessible et modifiable. Ajoute un email quand tu veux pour activer
                le compte — <span className="font-medium">toutes les modifications déjà faites sont conservées</span>{" "}
                (même identifiant client).
              </div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  placeholder="email@client.ch"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="bg-white sm:max-w-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") convertToAccount();
                  }}
                />
                <Button onClick={convertToAccount} disabled={convertLoading || !newEmail.trim()}>
                  {convertLoading ? "Activation…" : "Activer le compte"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* CARTE : DONNÉES PERSONNELLES */}
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="font-bold text-slate-900">Données personnelles</span>
                </span>
                {dp?.exists ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                    Complet
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                    À compléter
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nom</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{dp?.lastName || dp?.Enter_nom || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prénom</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{dp?.firstName || dp?.Enter_prenom || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Naissance</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{dp?.birthdate || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">État civil</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{etatCivilLabel(dp?.etatCivil)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">E-mail</div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-slate-900" title={dp?.email || clientEmail || ""}>
                    {dp?.email || clientEmail || "—"}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adresse postale</div>
                  {dp?.address || dp?.npa || dp?.localite ? (
                    <div className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                      {/* Deux lignes, comme sur une enveloppe — pas « rue, npa, localité » en enfilade. */}
                      {dp?.address ? <div>{dp.address}</div> : null}
                      <div>{[dp?.npa, dp?.localite].filter(Boolean).join(" ") || null}</div>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-slate-900">—</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-400">
                  Dernière mise à jour : <span className="font-medium text-slate-600">{formatTs(dp?.updatedAt ?? null)}</span>
                </div>
                <Link href={`/admin/clients/${uid}/donnees-personnelles`}>
                  <Button size="sm" className="rounded-xl">Éditer <ArrowRight className="h-4 w-4 ml-2" /></Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* CARTE : RENDEZ-VOUS À VENIR
              Emplacement réservé — la gestion des rendez-vous arrive ensuite.
              La carte est affichée dès maintenant (et non masquée jusqu'à ce que
              la fonctionnalité existe) pour que l'aperçu 360 ait sa forme
              définitive : rien ne se déplacera sous les yeux du conseiller. */}
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <span className="font-bold text-slate-900">Rendez-vous à venir</span>
                </span>
                {rendezvous.length > 0 && (
                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-600">
                    {rendezvous.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rendezvous.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                  <CalendarClock className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">Aucun rendez-vous à venir</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Fixez-en un depuis votre agenda, en voyant vos plages libres.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rendezvous.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold capitalize text-slate-900">
                          {new Intl.DateTimeFormat("fr-CH", {
                            timeZone: "Europe/Zurich", weekday: "long", day: "numeric",
                            month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
                          }).format(new Date(r.debut))}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[r.objectif, r.lieu, r.conseiller?.nom].filter(Boolean).join(" · ")}
                          {r.rappelSms ? " · rappel SMS la veille" : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-slate-400 hover:text-red-600"
                        onClick={() => annulerRdv(r.id)}
                      >
                        Annuler
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button className="mt-4 w-full rounded-xl" onClick={() => setRdvOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" /> Nouveau rendez-vous
              </Button>
            </CardContent>
          </Card>

          {/* CARTE : DOCUMENTS SIGNÉS */}
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="font-bold text-slate-900">Documents signés</span>
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

        {/* SIDEBAR : ACTIONS (côté client-safe) */}
        <Card className="rounded-3xl border-slate-200 shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <FileSignature className="h-4 w-4" />
              </span>
              <span className="font-bold text-slate-900">Actions &amp; outils</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href={`/admin/clients/${uid}/donnees-personnelles`} className="block">
              <Button variant="secondary" className="w-full justify-between rounded-xl">
                Données perso <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Button
              variant="outline"
              className="w-full justify-between rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
              onClick={() => setTransferOpen(true)}
            >
              Résiliation et transfert 3ème pilier <FileSignature className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ─────────── ESPACE CONSEILLER — CONFIDENTIEL ─────────── */}
      <Card className="overflow-hidden rounded-3xl border-amber-200 bg-amber-50/30 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Lock className="h-4 w-4" />
              </span>
              <span className="flex flex-col">
                <span className="font-bold text-slate-900">Espace conseiller</span>
                <span className="text-xs font-normal text-amber-600">Confidentiel</span>
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-amber-700 hover:bg-amber-100"
              onClick={() => setHidePrivate((v) => !v)}
            >
              {hidePrivate ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
              {hidePrivate ? "Afficher" : "Masquer"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hidePrivate ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              <EyeOff className="h-6 w-6 text-amber-400" />
              <p className="text-sm font-medium text-amber-700">Contenu confidentiel masqué</p>
              <p className="text-xs text-amber-600">Cliquez sur « Afficher » pour le révéler.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Notes internes */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <StickyNote className="h-4 w-4 text-amber-600" /> Notes internes
                </div>
                <textarea
                  className="w-full min-h-[160px] rounded-2xl border border-amber-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-amber-400/50"
                  placeholder="Ajouter une note interne (visible conseiller uniquement)…"
                  value={internalNotes}
                  onChange={(e) => { setInternalNotes(e.target.value); setNotesDirty(true); }}
                  spellCheck={false}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={saveNotes}
                    disabled={metaLoading || notesSaving || !notesDirty}
                  >
                    {notesSaving ? "..." : "Enregistrer"}
                  </Button>
                </div>
              </div>

              {/* Parrainage */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Gift className="h-4 w-4 text-amber-600" /> Parrainage
                </div>
                {referral?.referredBy && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    <Gift className="h-3.5 w-3.5" /> Recommandé par {referral.referredBy.name}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">IBAN (versement)</div>
                    <div className="mt-0.5 break-all text-sm font-medium text-slate-900">{referral?.bank?.iban || "— (non renseigné)"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Code de parrainage</div>
                    <div className="mt-0.5 font-mono text-sm font-medium text-slate-900">{referral?.referralCode || "—"}</div>
                  </div>
                </div>
                <div className="mt-3 border-t border-amber-200/70 pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Filleuls ({referral?.referees?.length ?? 0})
                  </div>
                  {(referral?.referees?.length ?? 0) === 0 ? (
                    <div className="text-sm text-slate-400">Aucun filleul pour le moment.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {referral.referees.map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">{r.name}</span>
                          <Badge variant="secondary" className="rounded-full text-[10px]">
                            {refStatusLabel(r.status)}{r.amountCHF ? ` · ${r.amountCHF} CHF` : ""}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hors du bloc `dp &&` : on doit pouvoir fixer un rendez-vous même si les
          données personnelles ne sont pas encore remplies. */}
      <NouveauRendezVousDialog
        open={rdvOpen}
        onOpenChange={setRdvOpen}
        uid={uid}
        clientNom={`${dp?.firstName || ""} ${dp?.lastName || ""}`.trim()}
        onCree={fetchRendezvous}
      />

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