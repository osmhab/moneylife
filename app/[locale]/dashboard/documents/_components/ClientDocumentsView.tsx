//app/[locale]/dashboard/documents/_components/ClientDocumentsView.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { db, storage } from "@/lib/firebase/index"; // 👈 Modifié pour correspondre à ton alias si besoin (app/lib -> @/lib)
import { buildSourceDocTitle } from "@/lib/core/documentTypes";
import { collection, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { Search, FileText, Download, ExternalLink, Filter, Tag, ShieldCheck, Landmark, Building2, Calendar, FileCheck, Info, Share2, X, Plus, Trash2, Pencil } from "lucide-react";
import AddDocumentDrawer from "./AddDocumentDrawer";
import EditVaultDocDrawer from "./EditVaultDocDrawer";
import { toast } from "sonner";
import { format } from "date-fns";
import { frCH, de } from "date-fns/locale";

import { useSearchParams } from "next/navigation";

// 👈 NOUVEAU : Imports pour la traduction
import { useTranslations, useLocale } from "next-intl";

interface ClientDocumentsViewProps {
  clientUid: string;
  isAdmin?: boolean;
}

// Normalise une chaîne pour la recherche : minuscules + accents retirés.
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function ClientDocumentsView({ clientUid, isAdmin = false }: ClientDocumentsViewProps) {
  const searchParams = useSearchParams();
  
  // 👈 NOUVEAU : Récupération des traductions et de la locale active
  const t = useTranslations("ClientDocuments");
  const locale = useLocale();
  const dateLocale = locale === 'de' ? de : frCH;

  const [documents, setDocuments] = useState<any[]>([]);
  // Documents libres ajoutés par le client (clients/{uid}/documents).
  const [vaultDocs, setVaultDocs] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // État pour les documents sélectionnés
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // 1. Récupération des documents de tous les plans
  useEffect(() => {
    if (!clientUid) return;

    const unsub = onSnapshot(collection(db, "clients", clientUid, "plans"), (snap) => {
      let allDocs: any[] = [];
      
      snap.forEach((docSnap) => {
        const plan = docSnap.data();
        const planData = plan.data || {};
        
        // 1. Les documents standards
        if (plan.documents && Array.isArray(plan.documents)) {
          plan.documents.forEach((doc: any, i: number) => {
            allDocs.push({
              ...doc,
              id: `${docSnap.id}_doc_${i}`,
              planId: docSnap.id,
              planName: plan.institutionName || t("fallback_unnamed_plan"),
              planType: plan.type,
              parsedDate: doc.uploadedAt?.toDate ? doc.uploadedAt.toDate() : (new Date(doc.uploadedAt || Date.now()))
            });
          });
        }
        
        // 2. Le document scan original — enrichi par la classification IA
        //    (metadata.sourceDocType / sourceDocTags), éditable depuis PlanDetailsView.
        if (plan.metadata?.sourceFileUrl) {
          const docType = plan.metadata?.sourceDocType || t("fallback_source_doc");
          const docTags = Array.isArray(plan.metadata?.sourceDocTags) && plan.metadata.sourceDocTags.length
            ? plan.metadata.sourceDocTags
            : [t("fallback_ai_scan")];
          // Titre lisible : valeur éditée si présente, sinon titre déterministe
          // (rétroactif pour les plans scannés avant la classification).
          const title = plan.metadata?.sourceDocTitle
            || buildSourceDocTitle(plan.type, plan.institutionName);
          allDocs.push({
            id: `${docSnap.id}_source`,
            name: title,
            url: plan.metadata.sourceFileUrl,
            origin: plan.origin === "creditx" ? "CreditX" : "Upload",
            types: [docType],
            tags: docTags,
            keywords: Array.isArray(plan.metadata?.sourceDocKeywords) ? plan.metadata.sourceDocKeywords : [],
            isSigned: false,
            isFinalDoc: false,
            planId: docSnap.id,
            planName: plan.institutionName || t("fallback_contract"),
            planType: plan.type,
            parsedDate: plan.metadata?.createdAt?.toDate ? plan.metadata.createdAt.toDate() : new Date()
          });
        }

        // 3. Le document hérité (fileUrl)
        const legacyFileUrl = planData.fileUrl || plan.fileUrl;
        if (legacyFileUrl && (!plan.documents || plan.documents.length === 0) && !plan.metadata?.sourceFileUrl) {
          const isLPP = plan.type === "LPP_BASE" || plan.type === "LPP_COMPL";
          const isBank = plan.type === "PILIER_3A_BANK" || plan.type === "3A_BANQUE";
          const typeName = isLPP ? t("fallback_lpp") : isBank ? t("fallback_bank") : t("fallback_insurance");
          const defaultName = `${typeName} - ${plan.institutionName || t("fallback_external")}`;
          
          const legacyTags = Array.isArray(plan.metadata?.legacyDocTags) && plan.metadata.legacyDocTags.length
            ? plan.metadata.legacyDocTags
            : [t("fallback_imported")];
          allDocs.push({
            id: `${docSnap.id}_legacy`,
            name: plan.metadata?.legacyDocTitle || planData.fileName || plan.fileName || defaultName,
            url: legacyFileUrl,
            origin: t("fallback_external"),
            types: [typeName],
            tags: legacyTags,
            isSigned: false,
            isFinalDoc: true,
            planId: docSnap.id,
            planName: plan.institutionName || t("fallback_contract"),
            planType: plan.type,
            parsedDate: plan.metadata?.updatedAt?.toDate ? plan.metadata.updatedAt.toDate() : new Date()
          });
        }
      });

      // Tri du plus récent au plus ancien (date invalide → 0, jamais de NaN
      // dans le comparateur, sinon l'ordre devient incohérent).
      const ts = (d: any) => {
        const t = d?.parsedDate instanceof Date ? d.parsedDate.getTime() : NaN;
        return Number.isFinite(t) ? t : 0;
      };
      allDocs.sort((a, b) => ts(b) - ts(a));
      setDocuments(allDocs);
      setLoading(false);
    });

    return () => unsub();
  }, [clientUid, t]);

  // 1ter. Documents libres ajoutés par le client dans le coffre.
  useEffect(() => {
    if (!clientUid) return;
    const unsub = onSnapshot(collection(db, "clients", clientUid, "documents"), (snap) => {
      const docs = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          ...data,
          id: `vault_${d.id}`,
          vaultDocId: d.id, // id Firestore réel (pour suppression)
          source: "vault",
          planName: t("vault_own_docs"),
          planType: data.types?.[0] || "",
          parsedDate: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : new Date(data.uploadedAt || Date.now()),
        };
      });
      setVaultDocs(docs);
    });
    return () => unsub();
  }, [clientUid, t]);

  // Suppression d'un document libre (Firestore + fichier Storage).
  const handleDeleteVaultDoc = async (docToDelete: any) => {
    if (!clientUid || !docToDelete?.vaultDocId) return;
    if (!confirm(t("confirm_delete"))) return;
    try {
      await deleteDoc(doc(db, "clients", clientUid, "documents", docToDelete.vaultDocId));
      if (docToDelete.path) {
        await deleteObject(ref(storage, docToDelete.path)).catch(() => {}); // fichier déjà absent : on ignore
      }
      toast.success(t("toast_deleted"));
    } catch (e) {
      console.error(e);
      toast.error(t("toast_delete_err"));
    }
  };

  // Fusion : plans + documents libres du client.
  const allDocuments = useMemo(() => {
    const combined = [...documents, ...vaultDocs];
    const ts = (d: any) => {
      const v = d?.parsedDate instanceof Date ? d.parsedDate.getTime() : NaN;
      return Number.isFinite(v) ? v : 0;
    };
    return combined.sort((a, b) => ts(b) - ts(a));
  }, [documents, vaultDocs]);

  // 2. Extraction dynamique des filtres disponibles
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    allDocuments.forEach(doc => doc.types?.forEach((t: string) => types.add(t)));
    return Array.from(types).sort();
  }, [allDocuments]);

  const availableOrigins = useMemo(() => {
    const origins = new Set<string>();
    allDocuments.forEach(doc => { if (doc.origin) origins.add(doc.origin); });
    return Array.from(origins).sort();
  }, [allDocuments]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    allDocuments.forEach(doc => doc.tags?.forEach((t: string) => tags.add(t)));
    return Array.from(tags).sort();
  }, [allDocuments]);

  // 3. Application des filtres
  const filteredDocuments = useMemo(() => {
    // Tous les termes de la recherche doivent matcher (AND), sur l'ensemble des
    // métadonnées (nom, type, tags, origine, plan), accents/casse ignorés.
    const terms = norm(searchQuery).split(/\s+/).filter(Boolean);
    return allDocuments.filter(doc => {
      const haystack = norm([
        doc.name,
        doc.planName,
        doc.origin,
        ...(doc.types || []),
        ...(doc.tags || []),
        ...(doc.keywords || []), // mots-clés du contenu extraits par l'IA
      ].filter(Boolean).join(" "));
      const searchMatch = terms.every(term => haystack.includes(term));

      // Filtres
      const typeMatch = !selectedType || doc.types?.includes(selectedType);
      const originMatch = !selectedOrigin || doc.origin === selectedOrigin;
      const tagMatch = !selectedTag || doc.tags?.includes(selectedTag);

      return searchMatch && typeMatch && originMatch && tagMatch;
    });
  }, [allDocuments, searchQuery, selectedType, selectedOrigin, selectedTag]);

  // FONCTIONS DE SÉLECTION ET PARTAGE
  const toggleSelection = (id: string) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(docId => docId !== id) : [...prev, id]);
  };

  const getCreditXLink = (docUrl: string, docName: string, docPath?: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    // On joint le chemin Storage quand on l'a : le proxy peut alors régénérer
    // l'accès si le token de l'URL de téléchargement a expiré.
    const pathPart = docPath ? `&path=${encodeURIComponent(docPath)}` : "";
    return `${baseUrl}/api/document?url=${encodeURIComponent(docUrl || "")}&name=${encodeURIComponent(docName)}${pathPart}`;
  };

  const handleShare = async () => {
    const docsToShare = filteredDocuments.filter(d => selectedDocIds.includes(d.id));
    if (docsToShare.length === 0) return;

    const text = docsToShare.map(d => `- ${d.name}\n  ${t("share_link")} ${getCreditXLink(d.url, d.name, d.path)}`).join("\n\n");
    const shareContent = {
      title: t("share_title"),
      text: t("share_intro") + text,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareContent);
      } catch (err) {
        console.log("Partage annulé ou échoué", err);
      }
    } else {
      // Fallback si l'API native n'est pas supportée
      await navigator.clipboard.writeText(shareContent.text);
      toast.success(t("toast_copy_success"));
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center text-slate-400 font-bold uppercase tracking-widest text-sm">{t("loading")}</div>;
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      
      {/* MOTEUR DE RECHERCHE & FILTRES */}
      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 space-y-6">
        <div className="flex items-center gap-3">
          <div className="relative group flex-1">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Search size={24} />
            </div>
            <input
              type="text"
              placeholder={t("search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-full py-5 pl-16 pr-6 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg"
            />
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="shrink-0 flex items-center gap-2 bg-slate-900 hover:bg-black text-white rounded-full px-5 sm:px-6 py-5 font-black text-sm uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">{t("btn_add_doc")}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mr-2">
            <Filter size={16} /> {t("filters_label")}
          </div>

          {/* Sélecteur de Type */}
          {availableTypes.length > 0 && (
            <select 
              className={`bg-slate-50 border rounded-full px-4 py-2 text-sm font-bold outline-none transition-colors ${selectedType ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-600'}`}
              value={selectedType || ""}
              onChange={(e) => setSelectedType(e.target.value || null)}
            >
              <option value="">{t("filter_all_types")}</option>
              {availableTypes.map(tOption => <option key={tOption} value={tOption}>{tOption}</option>)}
            </select>
          )}

          {/* Sélecteur d'Origine */}
          {availableOrigins.length > 0 && (
            <select 
              className={`bg-slate-50 border rounded-full px-4 py-2 text-sm font-bold outline-none transition-colors ${selectedOrigin ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-slate-200 text-slate-600'}`}
              value={selectedOrigin || ""}
              onChange={(e) => setSelectedOrigin(e.target.value || null)}
            >
              <option value="">{t("filter_all_origins")}</option>
              {availableOrigins.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}

          {/* Sélecteur de Tag */}
          {availableTags.length > 0 && (
            <select 
              className={`bg-slate-50 border rounded-full px-4 py-2 text-sm font-bold outline-none transition-colors ${selectedTag ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-600'}`}
              value={selectedTag || ""}
              onChange={(e) => setSelectedTag(e.target.value || null)}
            >
              <option value="">{t("filter_all_tags")}</option>
              {availableTags.map(tOption => <option key={tOption} value={tOption}>{tOption}</option>)}
            </select>
          )}

          {/* Reset Filters */}
          {(selectedType || selectedOrigin || selectedTag) && (
            <button 
              onClick={() => { setSelectedType(null); setSelectedOrigin(null); setSelectedTag(null); }}
              className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 px-3 rounded-full transition-colors"
            >
              {t("btn_reset")}
            </button>
          )}
        </div>
      </div>

      {/* LISTE DES DOCUMENTS */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-white rounded-[32px] p-12 text-center border border-slate-100 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <FileText size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{t("empty_title")}</h3>
            <p className="text-sm font-bold text-slate-500">{t("empty_desc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pb-24">
          {filteredDocuments.map((doc) => {
            const isSelected = selectedDocIds.includes(doc.id);
            return (
            <div 
              key={doc.id} 
              onClick={() => toggleSelection(doc.id)}
              className={`bg-white rounded-[24px] p-5 border hover:shadow-md transition-all flex flex-col md:flex-row gap-5 items-start md:items-center cursor-pointer group ${isSelected ? 'border-blue-500 shadow-blue-500/10 shadow-lg' : 'border-slate-100 hover:border-blue-200'}`}
            >
              
              {/* Checkbox, Icône & Titre */}
              <div className="flex items-center gap-4 flex-1 min-w-0 w-full md:w-auto">
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 text-transparent group-hover:border-blue-300'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${doc.isSigned ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                  {doc.isSigned ? <FileCheck size={24} /> : <FileText size={24} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-900 text-base line-clamp-2 break-all pr-4">{doc.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    <span className="flex items-center gap-1">
                      {doc.planType?.includes('BANK') ? <Landmark size={12}/> : <ShieldCheck size={12}/>}
                      {doc.planName}
                    </span>
                    <span>•</span>
                    {/* 👈 NOUVEAU : Application de la locale au format de date */}
                    <span className="flex items-center gap-1"><Calendar size={12}/> {format(doc.parsedDate, "dd MMM yyyy", { locale: dateLocale })}</span>
                  </div>
                </div>
              </div>

              {/* Badges (Types, Origine, Tags) */}
              <div className="flex flex-wrap gap-2 md:max-w-[300px] justify-end">
                {doc.origin && (
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 border border-purple-100">
                    <Building2 size={12} /> {doc.origin}
                  </span>
                )}
                {doc.types?.map((tType: string) => (
                  <span key={tType} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-slate-200">
                    {tType}
                  </span>
                ))}
                {doc.tags?.slice(0, 2).map((tTag: string) => (
                  <span key={tTag} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 border border-emerald-100">
                    <Tag size={10} /> {tTag}
                  </span>
                ))}
                {(doc.tags?.length || 0) > 2 && (
                  <span className="px-2.5 py-1 bg-slate-50 text-slate-400 text-[10px] font-black rounded-md">+{doc.tags.length - 2}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                <a
                  href={getCreditXLink(doc.url, doc.name, doc.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest transition-colors"
                >
                  {t("btn_open")} <ExternalLink size={16} />
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingDoc(doc); }}
                  aria-label={t("btn_edit")}
                  className="flex items-center justify-center px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                >
                  <Pencil size={16} />
                </button>
                {doc.source === "vault" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteVaultDoc(doc); }}
                    aria-label={t("btn_delete")}
                    className="flex items-center justify-center px-4 py-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

            </div>
          );
        })}
        </div>
      )}

      {isAddOpen && (
        <AddDocumentDrawer
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          clientUid={clientUid}
        />
      )}

      {editingDoc && (
        <EditVaultDocDrawer
          isOpen={!!editingDoc}
          onClose={() => setEditingDoc(null)}
          clientUid={clientUid}
          docItem={editingDoc}
        />
      )}

      {/* Barre d'action flottante de partage */}
      {selectedDocIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 z-50 whitespace-nowrap">
          <span className="text-sm font-bold">{t("selection_count", { count: selectedDocIds.length })}</span>
          
          <div className="w-px h-6 bg-slate-700"></div>

          <button onClick={handleShare} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-colors shadow-lg shadow-blue-500/30">
            <Share2 size={16} /> {t("btn_share")}
          </button>
          
          <button onClick={() => setSelectedDocIds([])} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
      )}

    </div>
  );
}