// app/admin/clients/[uid]/documents/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "app/lib/firebase/index";
import { doc, getDoc } from "firebase/firestore";
import ClientDocumentsView from "@/[locale]/dashboard/documents/_components/ClientDocumentsView";
import { ChevronLeft, FolderLock, User } from "lucide-react";

export default function AdminClientDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const uid = params.uid as string;
  
  const [clientName, setClientName] = useState<string>("Chargement...");

  // Récupération du nom du client pour l'en-tête
  useEffect(() => {
    if (!uid) return;
    const fetchClient = async () => {
      try {
        const snap = await getDoc(doc(db, "clients", uid, "DonneePersonnelles", "current"));
        if (snap.exists()) {
          const data = snap.data();
          setClientName(`${data.Enter_prenom || ""} ${data.Enter_nom || ""}`.trim() || "Client sans nom");
        } else {
          setClientName("Client inconnu");
        }
      } catch (err) {
        setClientName("Erreur");
      }
    };
    fetchClient();
  }, [uid]);

  if (!uid) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-32">
      
      {/* HEADER ADMIN */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-8 py-6 flex items-center gap-6 shadow-sm">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-1 flex items-center gap-1.5">
            <User size={12} /> Espace Administration
          </p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Documents : {clientName}
          </h1>
        </div>
      </div>

      {/* CONTENU CENTRAL */}
      <div className="px-8 mt-12">
        <div className="max-w-6xl mx-auto mb-8">
          <h2 className="text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
            <FolderLock size={20} className="text-slate-400"/> Coffre-fort du client
          </h2>
          <p className="text-sm font-bold text-slate-500 mt-1">
            Recherche, filtrage et visualisation de toutes les pièces liées aux contrats de ce client.
          </p>
        </div>

        {/* 👈 L'APPEL MAGIQUE DU COMPOSANT PARTAGÉ */}
        <ClientDocumentsView clientUid={uid} isAdmin={true} />
      </div>

    </div>
  );
}