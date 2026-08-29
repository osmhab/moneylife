//app/admin/clients/_client/ClientsCrmPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  Search,
  ArrowRight,
  Archive,
  ShieldCheck,
  Undo2,
  Trash2,
  UserPlus,
  Copy,
  Mail,
  X,
} from "lucide-react";

type ClientRow = {
  uid: string;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  status?: string; // active | archived | deleted
  createdAt?: number;
  updatedAt?: number;
  referred?: boolean; // venu par recommandation
  hasDonneesPersonnelles: boolean;
};

type FilterHasDP = "all" | "yes" | "no";
type FilterStatus = "all" | "active" | "archived" | "deleted";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatDateTs(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toLocaleString("fr-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copié", { description: "Texte copié dans le presse-papiers." });
  } catch {
    toast("Copie impossible", { description: "Copie manuelle requise." });
  }
}

export default function ClientsCrmPageClient() {
  const locale = useLocale();
  // Recherche + filtres restaurés depuis sessionStorage : au retour depuis une fiche
  // client (fil d'Ariane), la liste et les résultats précédents réapparaissent.
  const [q, setQ] = useState<string>(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("crm_clients_q") || "",
  );
  const qDebounced = useDebouncedValue(q, 250);

  const [hasDP, setHasDP] = useState<FilterHasDP>(() =>
    typeof window === "undefined" ? "all" : (sessionStorage.getItem("crm_clients_hasDP") as FilterHasDP) || "all",
  );
  const [status, setStatus] = useState<FilterStatus>(() =>
    typeof window === "undefined" ? "all" : (sessionStorage.getItem("crm_clients_status") as FilterStatus) || "all",
  );

  // Persiste la recherche/les filtres à chaque changement.
  useEffect(() => {
    try {
      sessionStorage.setItem("crm_clients_q", q);
      sessionStorage.setItem("crm_clients_hasDP", hasDP);
      sessionStorage.setItem("crm_clients_status", status);
    } catch {
      /* quota / mode privé */
    }
  }, [q, hasDP, status]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // confirm delete (soft)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteUid, setPendingDeleteUid] = useState<string | null>(null);

  // create client dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createBirthdate, setCreateBirthdate] = useState(""); // dd.MM.yyyy

  const [createdResult, setCreatedResult] = useState<null | {
    uid: string;
    email: string | null;
    tempPassword: string | null;
    isProspect: boolean;
  }>(null);

  const [resetLink, setResetLink] = useState<string>("");
  const [resetLinkLoading, setResetLinkLoading] = useState(false);

  const [sendResetLoading, setSendResetLoading] = useState(false);
  const [sendWelcomeLoading, setSendWelcomeLoading] = useState(false);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const url = new URL("/api/admin/clients/list", window.location.origin);
      if (qDebounced.trim()) url.searchParams.set("q", qDebounced.trim());
      url.searchParams.set("hasDP", hasDP);
      if (status !== "all") url.searchParams.set("status", status);
      url.searchParams.set("limit", "80");

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Erreur API");

      const rows = (j?.items || []) as ClientRow[];
      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const setClientStatus = async (
    uid: string,
    nextStatus: "active" | "archived" | "deleted"
  ) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Non authentifié");
    const token = await user.getIdToken();

    const res = await fetch("/api/admin/clients/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid, status: nextStatus }),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(j?.error || "Erreur status");
  };

  const createClient = async () => {
    const email = createEmail.trim().toLowerCase();
    const firstName = createFirstName.trim();
    const lastName = createLastName.trim();
    // Sans email → PROSPECT : nom + prénom requis à la place.
    if (!email && (!firstName || !lastName)) {
      toast("Infos manquantes", {
        description: "Saisis un email, ou au moins nom + prénom pour créer un prospect.",
      });
      return;
    }

    try {
      setCreateLoading(true);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          birthdate: createBirthdate.trim() || undefined,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur create");

      setCreatedResult({
        uid: j.uid,
        email: j.email ?? null,
        tempPassword: j.tempPassword ?? null,
        isProspect: !!j.isProspect,
      });

      toast(j.isProspect ? "Prospect créé ✅" : "Client créé", {
        description: j.isProspect
          ? "Dossier prêt (sans email). Ajoute un email plus tard pour activer le compte."
          : "Compte créé avec succès.",
      });

      // refresh list (le nouveau client doit apparaître)
      fetchItems();
    } catch (e: any) {
      toast("Erreur", {
        description: e?.message || "Impossible de créer le client.",
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const generateResetLink = async () => {
    if (!createdResult?.email) return;

    try {
      setResetLinkLoading(true);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/reset-password-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: createdResult.email,
          continueUrl: `${window.location.origin}/login`,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur reset link");

      setResetLink(j.link || "");
      toast("Lien généré", { description: "Lien de reset password prêt." });
    } catch (e: any) {
      toast("Erreur", {
        description: e?.message || "Impossible de générer le lien.",
      });
    } finally {
      setResetLinkLoading(false);
    }
  };

  const sendResetEmail = async () => {
    if (!createdResult?.email) return;

    if (!resetLink) {
      toast("Lien manquant", {
        description: "Génère d’abord le lien reset.",
      });
      return;
    }

    try {
      setSendResetLoading(true);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/send-reset-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          toEmail: createdResult.email,
          resetLink,
          firstName: createFirstName.trim() || undefined,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur envoi email");

      toast("Email envoyé ✅", {
        description: `Lien envoyé à ${createdResult.email}`,
      });
    } catch (e: any) {
      toast("Erreur", {
        description: e?.message || "Impossible d’envoyer l’email.",
      });
    } finally {
      setSendResetLoading(false);
    }
  };

  const sendWelcomeEmail = async () => {
    if (!createdResult?.email) return;

    try {
      setSendWelcomeLoading(true);

      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/clients/send-welcome-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          toEmail: createdResult.email,
          firstName: createFirstName.trim() || undefined,
          loginUrl: `${window.location.origin}/login`,
          // on inclut le resetLink si dispo (très pratique)
          resetLink: resetLink || undefined,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Erreur envoi email bienvenue");

      toast("Bienvenue envoyé ✅", {
        description: `Email envoyé à ${createdResult.email}`,
      });
    } catch (e: any) {
      toast("Erreur", {
        description: e?.message || "Impossible d’envoyer l’email de bienvenue.",
      });
    } finally {
      setSendWelcomeLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateEmail("");
    setCreateFirstName("");
    setCreateLastName("");
    setCreateBirthdate("");
    setCreatedResult(null);

    setResetLink("");
    setResetLinkLoading(false);

    setSendResetLoading(false);
    setSendWelcomeLoading(false);
  };

  // La liste ne se charge QUE lorsqu'une recherche est active. Au repos : rien.
  useEffect(() => {
    if (qDebounced.trim().length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, hasDP, status]);

  const filtered = useMemo(() => {
    let out = items;

    if (hasDP !== "all") {
      out = out.filter((r) =>
        hasDP === "yes" ? r.hasDonneesPersonnelles : !r.hasDonneesPersonnelles
      );
    }

    if (status !== "all") {
      out = out.filter((r) => (r.status || "").toLowerCase() === status);
    }

    return out;
  }, [items, hasDP, status]);

  const total = filtered.length;
  const isSearching = qDebounced.trim().length > 0;

  const statusBadge = (s?: string) => {
    const v = (s || "active").toLowerCase();
    if (v === "deleted") return <Badge className="rounded-full">Supprimé</Badge>;
    if (v === "archived")
      return (
        <Badge variant="secondary" className="rounded-full">
          Archivé
        </Badge>
      );
    return (
      <Badge variant="secondary" className="rounded-full">
        Actif
      </Badge>
    );
  };

  const onArchive = async (uid: string) => {
    try {
      await setClientStatus(uid, "archived");
      toast("Archivé", { description: "Le client a été archivé." });
      fetchItems();
    } catch (e: any) {
      toast("Erreur", { description: e?.message || "Impossible d’archiver." });
    }
  };

  const onRestore = async (uid: string) => {
    try {
      await setClientStatus(uid, "active");
      toast("Réactivé", { description: "Le client est actif." });
      fetchItems();
    } catch (e: any) {
      toast("Erreur", { description: e?.message || "Impossible de réactiver." });
    }
  };

  const onAskDelete = (uid: string) => {
    setPendingDeleteUid(uid);
    setConfirmOpen(true);
  };

  const onConfirmDelete = async () => {
    const uid = pendingDeleteUid;
    if (!uid) return;
    try {
      await setClientStatus(uid, "deleted");
      toast("Supprimé (soft)", {
        description: "Statut du client = deleted.",
      });
      setConfirmOpen(false);
      setPendingDeleteUid(null);
      fetchItems();
    } catch (e: any) {
      toast("Erreur", { description: e?.message || "Impossible de supprimer." });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-6">
        {/* En-tête du dashboard conseiller */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tableau de bord</h1>
            <p className="text-sm text-slate-400">Recherchez un client ou ouvrez un dossier.</p>
          </div>
          <Button
            className="rounded-xl"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Créer un client
          </Button>
        </div>

        {/* Barre de recherche */}
        <div className={`mx-auto w-full max-w-2xl ${isSearching ? "pt-4" : ""}`}>
          <div className="relative">
            <Search className="h-5 w-5 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, prénom, email, UID, date de naissance…"
              className="h-16 pl-14 pr-14 rounded-2xl border-slate-200 bg-white text-lg shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Effacer"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

      {!isSearching && (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-white/50 p-10 text-center">
          <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
            <Search className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-slate-700">Recherchez un client</p>
          <p className="mt-1 text-sm text-slate-400">
            Tapez un nom, un email ou collez un UID — les résultats apparaîtront ici.
          </p>
        </div>
      )}

      {isSearching && (
        <div className="w-full space-y-4 pt-8">
          {/* Compteur + filtres compacts */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500">
              {loading ? "Recherche…" : `${total} résultat${total > 1 ? "s" : ""}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Select value={hasDP} onValueChange={(v) => setHasDP(v as FilterHasDP)}>
                <SelectTrigger className="h-9 w-[185px] rounded-xl bg-white">
                  <SelectValue placeholder="Données perso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes complétudes</SelectItem>
                  <SelectItem value="yes">Avec données perso</SelectItem>
                  <SelectItem value="no">Sans données perso</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as FilterStatus)}>
                <SelectTrigger className="h-9 w-[145px] rounded-xl bg-white">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="active">Actifs</SelectItem>
                  <SelectItem value="archived">Archivés</SelectItem>
                  <SelectItem value="deleted">Supprimés</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              {error ? (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  {error}
                </div>
              ) : null}

          <div className="mt-2 rounded-xl border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              <div className="col-span-4">Client</div>
              <div className="col-span-3">UID</div>
              <div className="col-span-2">Naissance</div>
              <div className="col-span-2">Données</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            <Separator />

            {loading ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                Chargement…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                Aucun résultat.
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((c) => {
                  const displayName =
                    c.lastName || c.firstName
                      ? `${c.lastName || ""} ${c.firstName || ""}`.trim()
                      : c.email || "Client";

                  const isDeleted = (c.status || "").toLowerCase() === "deleted";
                  const isArchived =
                    (c.status || "").toLowerCase() === "archived";
                  const isActive = !isDeleted && !isArchived;

                  return (
                    <div
                      key={c.uid}
                      className="grid grid-cols-12 gap-2 px-3 py-3 items-center"
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">
                            {displayName}
                          </div>
                          {statusBadge(c.status)}
                          {c.referred && (
                            <span className="shrink-0 rounded-full bg-amber-100 text-amber-900 text-[10px] font-semibold px-2 py-0.5">
                              🎁 Recommandé
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.email || "—"}{" "}
                          {c.updatedAt ? `• maj ${formatDateTs(c.updatedAt)}` : ""}
                        </div>
                      </div>

                      <div className="col-span-3">
                        <div className="font-mono text-xs truncate">{c.uid}</div>
                      </div>

                      <div className="col-span-2 text-sm">
                        {c.birthdate || "—"}
                      </div>

                      <div className="col-span-2">
                        {c.hasDonneesPersonnelles ? (
                          <Badge className="rounded-full">OK</Badge>
                        ) : (
                          <Badge variant="secondary" className="rounded-full">
                            À compléter
                          </Badge>
                        )}
                      </div>

                      <div className="col-span-1 flex justify-end gap-2">
                        <Link
                          href={`/admin/clients/${c.uid}`}
                          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        >
                          Voir <ArrowRight className="h-4 w-4" />
                        </Link>

                        <Link
                          href={`/${locale}/admin/audit/${c.uid}`}
                          title="Piste d'audit (FINMA)"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-muted transition"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Link>

                        {isActive ? (
                          <button
                            type="button"
                            title="Archiver"
                            onClick={() => onArchive(c.uid)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-muted transition"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Réactiver"
                            onClick={() => onRestore(c.uid)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-muted transition"
                          >
                            <Undo2 className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          title="Supprimer (soft)"
                          onClick={() => onAskDelete(c.uid)}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-muted transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            </CardContent>
          </Card>
        </div>
      )}

      {/* Soft delete confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est un <b>soft delete</b> : le statut passe à{" "}
              <span className="font-mono">deleted</span>. Les données ne sont pas
              effacées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create client dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer un client</DialogTitle>
            <DialogDescription>
              Crée un compte client (Auth) + un doc CRM{" "}
              <span className="font-mono">clients/{`{uid}`}</span>.
            </DialogDescription>
          </DialogHeader>

          {createdResult ? (
            createdResult.isProspect ? (
              <div className="space-y-3">
                <div className="rounded-xl border p-3">
                  <div className="text-sm font-medium">Prospect créé ✅</div>
                  <div className="text-xs text-muted-foreground mt-1">UID</div>
                  <div className="font-mono text-sm break-all">{createdResult.uid}</div>
                  <div className="text-xs text-muted-foreground mt-3">
                    Dossier prêt, sans email. Prépare l&apos;entretien ; tu pourras ajouter un email
                    à tout moment depuis la fiche pour activer le compte — toutes les modifications
                    sont conservées.
                  </div>
                  <div className="mt-3">
                    <Link href={`/admin/clients/${createdResult.uid}`} className="inline-flex">
                      <Button>
                        Ouvrir la fiche <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
            <div className="space-y-3">
              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium">Créé ✅</div>

                <div className="text-xs text-muted-foreground mt-1">UID</div>
                <div className="font-mono text-sm break-all">
                  {createdResult.uid}
                </div>

                <div className="text-xs text-muted-foreground mt-3">Email</div>
                <div className="text-sm break-all">{createdResult.email}</div>

                <div className="text-xs text-muted-foreground mt-3">
                  Mot de passe temporaire
                </div>
                <div className="font-mono text-sm break-all">
                  {createdResult.tempPassword}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => copyToClipboard(createdResult.tempPassword ?? "")}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copier le mot de passe
                  </Button>

                  <Link
                    href={`/admin/clients/${createdResult.uid}`}
                    className="inline-flex"
                  >
                    <Button>
                      Ouvrir la fiche <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>

                <div className="mt-4 rounded-xl border p-3">
                  <div className="text-sm font-medium">
                    Reset password (recommandé)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Génère un lien officiel Firebase pour que le client définisse
                    son propre mot de passe, puis envoie-le par email.
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="secondary"
                      onClick={generateResetLink}
                      disabled={resetLinkLoading}
                    >
                      {resetLinkLoading ? "Génération…" : "Générer lien reset"}
                    </Button>

                    {resetLink ? (
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard(resetLink)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copier le lien
                      </Button>
                    ) : null}

                    {resetLink ? (
                      <Button
                        variant="secondary"
                        onClick={sendResetEmail}
                        disabled={sendResetLoading}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {sendResetLoading ? "Envoi…" : "Envoyer reset password par email"}
                      </Button>
                    ) : null}

                    <Button
                      variant="secondary"
                      onClick={sendWelcomeEmail}
                      disabled={sendWelcomeLoading}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {sendWelcomeLoading ? "Envoi…" : "Email bienvenue + reset"}
                    </Button>
                  </div>

                  {resetLink ? (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground">Lien</div>
                      <div className="font-mono text-xs break-all">
                        {resetLink}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-muted-foreground mt-3">
                  ⚠️ Le mot de passe temporaire est utile pour tests. En prod,
                  privilégie le reset password.
                </div>
              </div>
            </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Email (optionnel)</Label>
                <Input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="client@email.ch"
                  inputMode="email"
                />
                <div className="text-xs text-muted-foreground">
                  Laisser vide = <b>prospect</b> (dossier sans email, à activer plus tard). Dans ce
                  cas, <b>nom + prénom</b> sont requis.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Prénom</Label>
                  <Input
                    value={createFirstName}
                    onChange={(e) => setCreateFirstName(e.target.value)}
                    placeholder="Ex. Marie"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Nom</Label>
                  <Input
                    value={createLastName}
                    onChange={(e) => setCreateLastName(e.target.value)}
                    placeholder="Ex. Dupont"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Date de naissance</Label>
                <Input
                  value={createBirthdate}
                  onChange={(e) => setCreateBirthdate(e.target.value)}
                  placeholder="jj.mm.aaaa"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {!createdResult ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setCreateOpen(false)}
                  disabled={createLoading}
                >
                  Annuler
                </Button>
                <Button onClick={createClient} disabled={createLoading}>
                  {createLoading ? "Création…" : "Créer"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setCreateOpen(false)}>Fermer</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}