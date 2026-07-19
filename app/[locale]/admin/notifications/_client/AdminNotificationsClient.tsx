"use client";

// Inbox du BACK-OFFICE — lit la collection racine `admin_notifications`,
// alimentée côté serveur par `notifyAdmin` (app/lib/server/notify.ts).
//
// Pourquoi une page dédiée : ces alertes signalent qu'un HUMAIN doit agir
// (transmettre un dossier signé, prendre un contrôle expert payé…). Avant,
// l'équipe devait surveiller les onglets du wizard à la main.

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Bell,
  CheckCheck,
  FileSignature,
  XCircle,
  CreditCard,
  FileCheck2,
  Inbox,
  ExternalLink,
} from "lucide-react";

type AdminNotification = {
  id: string;
  event?: string;
  title?: string;
  content?: string;
  category?: string;
  type?: "success" | "error";
  actionUrl?: string;
  clientUid?: string | null;
  clientName?: string | null;
  institutionName?: string | null;
  planId?: string | null;
  read?: boolean;
  createdAt?: { seconds: number } | null;
};

/** Icône par événement — l'admin identifie la nature de l'alerte sans lire. */
const EVENT_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  NEW_SUBSCRIPTION_REQUEST: Inbox,
  OFFER_SIGNED_BY_CLIENT: FileSignature,
  OFFER_REJECTED_BY_CLIENT: XCircle,
  EXPERT_REVIEW_PAID: CreditCard,
  TRANSFER_LETTER_SIGNED: FileCheck2,
};

type Filter = "unread" | "all";

export default function AdminNotificationsClient() {
  // Le projet n'a PAS de middleware next-intl : les routes vivent réellement sous
  // /[locale]/… et un lien vers "/admin/offres-wizard" tomberait en 404.
  // `actionUrl` est donc stocké sans préfixe, et préfixé ici à l'affichage.
  const locale = useLocale();
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>("unread");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Plafonné à 200 : au-delà, la page n'est plus un outil de travail mais un
    // historique — et le listener coûterait cher pour rien.
    const q = query(
      collection(db, "admin_notifications"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as AdminNotification));
      },
      (err) => {
        console.error("[admin-notifications] listener:", err);
        setItems([]);
      }
    );
    return () => unsub();
  }, []);

  const unreadCount = useMemo(
    () => (items ?? []).filter((n) => !n.read).length,
    [items]
  );

  const visible = useMemo(
    () => (items ?? []).filter((n) => (filter === "unread" ? !n.read : true)),
    [items, filter]
  );

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "admin_notifications", id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("[admin-notifications] markRead:", e);
    }
  };

  /** Marque tout comme lu. Batché : une écriture par document serait ruineuse. */
  const markAllRead = async () => {
    const unread = (items ?? []).filter((n) => !n.read);
    if (unread.length === 0) return;
    setBusy(true);
    try {
      // Firestore plafonne un batch à 500 opérations → on découpe.
      for (let i = 0; i < unread.length; i += 450) {
        const batch = writeBatch(db);
        unread.slice(i, i + 450).forEach((n) => {
          batch.update(doc(db, "admin_notifications", n.id), {
            read: true,
            readAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error("[admin-notifications] markAllRead:", e);
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (createdAt?: { seconds: number } | null) => {
    if (!createdAt?.seconds) return "—";
    return new Date(createdAt.seconds * 1000).toLocaleString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (items === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">
          Chargement des alertes...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-900">
      {/* En-tête collant */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white relative">
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center border-2 border-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Alertes back-office</h1>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["unread", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
                    filter === f
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {f === "unread" ? "Non lues" : "Toutes"}
                </button>
              ))}
            </div>
            <Button
              onClick={markAllRead}
              disabled={busy || unreadCount === 0}
              variant="outline"
              className="rounded-xl h-10 gap-2 font-black text-[11px] uppercase tracking-widest"
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <CheckCheck size={14} />}
              Tout lire
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="p-4 bg-slate-100 rounded-2xl text-slate-400">
              <Inbox size={32} />
            </div>
            <p className="font-black text-slate-500">
              {filter === "unread" ? "Aucune alerte en attente" : "Aucune alerte"}
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              Les demandes de souscription, signatures, refus et paiements apparaissent ici
              dès qu&apos;ils surviennent.
            </p>
          </div>
        ) : (
          visible.map((n) => {
            const Icon = EVENT_ICONS[n.event ?? ""] ?? Bell;
            const isError = n.type === "error";
            return (
              <Card
                key={n.id}
                className={`border transition-all ${
                  n.read
                    ? "border-slate-200 bg-white/60"
                    : "border-blue-200 bg-white shadow-sm"
                }`}
              >
                <CardContent className="p-4 flex items-start gap-4">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      isError ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    <Icon size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-[15px] text-slate-900">{n.title}</span>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{n.content}</p>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                      {formatDate(n.createdAt)}
                      {n.clientName ? ` · ${n.clientName}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {n.actionUrl && (
                      <Link href={`/${locale}${n.actionUrl}`} onClick={() => markRead(n.id)}>
                        <Button
                          size="sm"
                          className="rounded-xl h-9 gap-1.5 font-black text-[11px] uppercase tracking-widest"
                        >
                          Traiter <ExternalLink size={13} />
                        </Button>
                      </Link>
                    )}
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead(n.id)}
                        className="rounded-xl h-9 text-slate-400 hover:text-slate-700"
                        title="Marquer comme lue"
                      >
                        <CheckCheck size={16} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
