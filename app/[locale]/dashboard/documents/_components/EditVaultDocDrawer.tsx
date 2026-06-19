//app/[locale]/dashboard/documents/_components/EditVaultDocDrawer.tsx
"use client";

// Édition du TITRE et des TAGS de n'importe quel document du coffre-fort.
// La sauvegarde est routée selon l'origine du document (docItem.id / .source) :
//  - vault        → clients/{uid}/documents/{id}
//  - _source      → plan.metadata.sourceDocTitle / sourceDocTags
//  - _doc_{i}     → plan.documents[i].name / tags
//  - _legacy      → plan.metadata.legacyDocTitle / legacyDocTags

import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Check, Loader2, Plus, Tag } from "lucide-react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/index";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface EditVaultDocDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientUid: string;
  docItem: any;
}

export default function EditVaultDocDrawer({ isOpen, onClose, clientUid, docItem }: EditVaultDocDrawerProps) {
  const t = useTranslations("ClientDocuments");

  const [title, setTitle] = useState<string>(docItem?.name || "");
  const [tags, setTags] = useState<string[]>(Array.isArray(docItem?.tags) ? docItem.tags : []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = (raw: string) => {
    const clean = raw.trim();
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setNewTag("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((x) => x !== tag));

  // Persiste selon l'origine du document.
  const persist = async (id: string, name: string, finalTags: string[]) => {
    if (docItem.source === "vault" && docItem.vaultDocId) {
      await updateDoc(doc(db, "clients", clientUid, "documents", docItem.vaultDocId), { name, tags: finalTags });
      return;
    }
    if (docItem.planId && id.endsWith("_source")) {
      await updateDoc(doc(db, "clients", clientUid, "plans", docItem.planId), {
        "metadata.sourceDocTitle": name,
        "metadata.sourceDocTags": finalTags,
      });
      return;
    }
    if (docItem.planId && id.includes("_doc_")) {
      const idx = parseInt(id.split("_doc_")[1], 10);
      const planRef = doc(db, "clients", clientUid, "plans", docItem.planId);
      const snap = await getDoc(planRef);
      const arr = [...(((snap.data() as any)?.documents) || [])];
      if (arr[idx]) {
        arr[idx] = { ...arr[idx], name, tags: finalTags };
        await updateDoc(planRef, { documents: arr });
      }
      return;
    }
    if (docItem.planId && id.endsWith("_legacy")) {
      await updateDoc(doc(db, "clients", clientUid, "plans", docItem.planId), {
        "metadata.legacyDocTitle": name,
        "metadata.legacyDocTags": finalTags,
      });
      return;
    }
    throw new Error("not editable");
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await persist(docItem.id || "", title.trim(), tags);
      toast.success(t("toast_doc_updated"));
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(t("toast_doc_update_err"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-[#F8F9FB] rounded-t-[32px] px-6 pb-4 outline-none h-[90vh] flex flex-col">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />
        <div className="flex justify-between items-center mb-6">
          <DrawerTitle className="text-2xl font-black text-slate-900">{t("edit_title")}</DrawerTitle>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 pb-4">
          {/* TITRE */}
          <div className="space-y-2 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t("lbl_doc_title")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("ph_doc_title")}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          {/* TAGS */}
          <div className="space-y-3 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Tag size={14} /> {t("lbl_tags")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag(newTag)}
                placeholder={t("ph_new_tag")}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              />
              <button onClick={() => addTag(newTag)} className="px-4 bg-slate-900 text-white rounded-xl hover:bg-black transition-colors">
                <Plus size={20} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 mt-1 border-t border-slate-100">
                {tags.map((tag) => (
                  <div key={tag} className="flex items-center gap-1 pl-3 pr-1 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="p-1 hover:bg-blue-200 rounded-md transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 -mx-6 px-6 pt-4 bg-white border-t border-slate-100">
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full py-6 rounded-[20px] bg-black text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            {saving ? t("btn_saving") : t("btn_save")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
