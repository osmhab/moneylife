//app/[locale]/dashboard/prevoyance/_components/EditSourceDocDrawer.tsx
"use client";

// Édition de la classification du document SCANNÉ (source) d'un plan :
// titre affiché, type (taxonomie canonique + libre), tags. Écrit dans
// plan.metadata.sourceDocTitle / sourceDocType / sourceDocTags. Présenté au
// client juste après son scan (et à l'admin) depuis PlanDetailsView.

import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Check, Loader2, Plus, Tag } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/index";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { DOCUMENT_TYPES } from "@/lib/core/documentTypes";

interface EditSourceDocDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  adminUid?: string;
  initialTitle: string;
  initialType: string;
  initialTags: string[];
}

export default function EditSourceDocDrawer({
  isOpen,
  onClose,
  planId,
  adminUid,
  initialTitle,
  initialType,
  initialTags,
}: EditSourceDocDrawerProps) {
  const t = useTranslations("EditSourceDocDrawer");

  const [title, setTitle] = useState(initialTitle);
  const [type, setType] = useState(initialType);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = (raw: string) => {
    const clean = raw.trim();
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setNewTag("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((x) => x !== tag));

  const handleSave = async () => {
    const targetUid = adminUid || auth.currentUser?.uid;
    if (!targetUid || !planId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "clients", targetUid, "plans", planId), {
        "metadata.sourceDocTitle": title.trim(),
        "metadata.sourceDocType": (type || "").trim() || t("type_fallback"),
        "metadata.sourceDocTags": tags,
        "metadata.updatedAt": new Date(),
      });
      toast.success(t("toast_saved"));
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(t("toast_err"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-[#F8F9FB] rounded-t-[32px] px-6 pb-12 outline-none h-[90vh]">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />

        <div className="flex justify-between items-center mb-6">
          <DrawerTitle className="text-2xl font-black text-slate-900">{t("title")}</DrawerTitle>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto pr-2 space-y-6 pb-32">
          {/* TITRE */}
          <div className="space-y-2 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t("lbl_title")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("ph_title")}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          {/* TYPE */}
          <div className="space-y-3 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t("lbl_type")}</label>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_TYPES.map((dt) => (
                <button
                  key={dt}
                  onClick={() => setType(dt)}
                  className={`text-[11px] px-3 py-1.5 rounded-md font-bold transition-colors ${
                    type === dt ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {dt}
                </button>
              ))}
            </div>
            {/* Type personnalisé (si l'IA en a créé un hors taxonomie) */}
            <input
              type="text"
              value={DOCUMENT_TYPES.includes(type as any) ? "" : type}
              onChange={(e) => setType(e.target.value)}
              placeholder={t("ph_custom_type")}
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

        <div className="absolute bottom-0 left-0 w-full p-6 bg-white border-t border-slate-100 shrink-0 z-10">
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
